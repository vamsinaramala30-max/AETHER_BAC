/**
 * AETHER AI — Provider-Independent Database Abstraction
 * Supports initialization, health check, transactions, and closing/cleanup.
 */

export interface TransactionContext {
  readonly id: string;
  readonly createdAt: number;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface DatabaseConnection {
  initialize(): Promise<void>;
  isHealthy(): Promise<boolean>;
  beginTransaction(): Promise<TransactionContext>;
  close(): Promise<void>;
}

export class InMemoryDatabase implements DatabaseConnection {
  private initialized = false;
  private readonly store = new Map<string, Map<string, unknown>>();

  public async initialize(): Promise<void> {
    this.initialized = true;
  }

  public async isHealthy(): Promise<boolean> {
    return this.initialized;
  }

  public async beginTransaction(): Promise<TransactionContext> {
    const id = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      id,
      createdAt: Date.now(),
      commit: async () => {},
      rollback: async () => {},
    };
  }

  public async close(): Promise<void> {
    this.store.clear();
    this.initialized = false;
  }

  public getCollection<T>(name: string): Map<string, T> {
    if (!this.store.has(name)) {
      this.store.set(name, new Map());
    }
    return this.store.get(name) as Map<string, T>;
  }
}

export const globalDatabase = new InMemoryDatabase();
