/**
 * AETHER AI — Cache Provider Abstraction
 * Supports: get, set, delete, has, clear, and TTL.
 */

export interface CacheItem<T> {
  readonly value: T;
  readonly expiresAt?: number;
}

export interface CacheProvider {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
}

export class InMemoryCache implements CacheProvider {
  private readonly store = new Map<string, CacheItem<unknown>>();

  public async get<T>(key: string): Promise<T | undefined> {
    const item = this.store.get(key);
    if (!item) return undefined;

    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return item.value as T;
  }

  public async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
  }

  public async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  public async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== undefined;
  }

  public async clear(): Promise<void> {
    this.store.clear();
  }
}

export const globalCache = new InMemoryCache();
