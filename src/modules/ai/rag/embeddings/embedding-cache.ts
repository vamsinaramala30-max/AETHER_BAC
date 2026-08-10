/**
 * AETHER AI — Embedding Cache
 * LRU cache for embeddings to avoid recomputing.
 * No cloud API calls — purely in-memory.
 */

// ─── Cache Entry ──────────────────────────────────────────────────────────────

interface CacheEntry {
  readonly embedding: readonly number[];
  readonly createdAt: number;
  lastAccessedAt: number;
}

// ─── Embedding Cache ──────────────────────────────────────────────────────────

export class EmbeddingCache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize: number, ttlMs: number) {
    this.maxSize = Math.max(1, maxSize);
    this.ttlMs = ttlMs;
  }

  public get(key: string): readonly number[] | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.createdAt > this.ttlMs) {
      this.store.delete(key);
      return null;
    }

    entry.lastAccessedAt = now;
    return entry.embedding;
  }

  public set(key: string, embedding: readonly number[]): void {
    // Evict expired entries first
    this.evictExpired();

    // Evict LRU entries if at capacity
    if (this.store.size >= this.maxSize) {
      this.evictLRU();
    }

    const now = Date.now();
    this.store.set(key, {
      embedding,
      createdAt: now,
      lastAccessedAt: now,
    });
  }

  public has(key: string): boolean {
    return this.get(key) !== null;
  }

  public delete(key: string): void {
    this.store.delete(key);
  }

  public clear(): void {
    this.store.clear();
  }

  public get size(): number {
    return this.store.size;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now - entry.createdAt > this.ttlMs) {
        this.store.delete(key);
      }
    }
  }

  private evictLRU(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.store) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldest = key;
      }
    }

    if (oldest) this.store.delete(oldest);
  }
}
