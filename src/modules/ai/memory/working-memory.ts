/**
 * AETHER AI — Working Memory
 * Short-lived, session-scoped key-value store.
 * Used for intermediate reasoning state within a single session.
 * User-scoped. TTL-based expiry. Never leaks between sessions.
 */

import type { UserId, SessionId } from '../ai-types.js';
import type { WorkingMemoryContext, WorkingMemoryItem } from '../ai-types.js';
import { MEMORY } from '../ai-constants.js';

// ─── Working Memory Entry ─────────────────────────────────────────────────────

interface WorkingEntry {
  readonly key: string;
  readonly value: string;
  readonly userId: UserId;
  readonly sessionId: SessionId;
  updatedAt: number;
  expiresAt: number;
}

// ─── IWorkingMemory Interface ─────────────────────────────────────────────────

export interface IWorkingMemory {
  set(userId: UserId, sessionId: SessionId, key: string, value: string, ttlMs?: number): void;
  get(userId: UserId, sessionId: SessionId, key: string): string | undefined;
  delete(userId: UserId, sessionId: SessionId, key: string): void;
  getAll(userId: UserId, sessionId: SessionId): WorkingMemoryContext;
  clearSession(userId: UserId, sessionId: SessionId): void;
  clearUser(userId: UserId): void;
  evictExpired(): void;
}

// ─── Working Memory Implementation ───────────────────────────────────────────

export class WorkingMemory implements IWorkingMemory {
  private readonly store = new Map<string, WorkingEntry>();
  private readonly defaultTTLMs: number;

  constructor(defaultTTLMs: number = MEMORY.WORKING_MEMORY_TTL_MS) {
    this.defaultTTLMs = defaultTTLMs;
  }

  public set(
    userId: UserId,
    sessionId: SessionId,
    key: string,
    value: string,
    ttlMs?: number,
  ): void {
    const storeKey = this.buildKey(userId, sessionId, key);
    const now = Date.now();
    const ttl = ttlMs ?? this.defaultTTLMs;

    const existing = this.store.get(storeKey);
    if (existing) {
      existing.updatedAt = now;
      existing.expiresAt = now + ttl;
      (existing as { value: string }).value = value;
    } else {
      this.store.set(storeKey, {
        key,
        value,
        userId,
        sessionId,
        updatedAt: now,
        expiresAt: now + ttl,
      });
    }
  }

  public get(userId: UserId, sessionId: SessionId, key: string): string | undefined {
    const storeKey = this.buildKey(userId, sessionId, key);
    const entry = this.store.get(storeKey);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(storeKey);
      return undefined;
    }

    // Verify isolation
    if (entry.userId !== userId || entry.sessionId !== sessionId) {
      return undefined;
    }

    return entry.value;
  }

  public delete(userId: UserId, sessionId: SessionId, key: string): void {
    const storeKey = this.buildKey(userId, sessionId, key);
    const entry = this.store.get(storeKey);
    // Only delete if it belongs to this user/session
    if (entry && entry.userId === userId && entry.sessionId === sessionId) {
      this.store.delete(storeKey);
    }
  }

  public getAll(userId: UserId, sessionId: SessionId): WorkingMemoryContext {
    const now = Date.now();
    const items: WorkingMemoryItem[] = [];

    for (const [, entry] of this.store) {
      if (entry.userId !== userId || entry.sessionId !== sessionId) continue;
      if (now > entry.expiresAt) continue;
      items.push({ key: entry.key, value: entry.value, updatedAt: entry.updatedAt });
    }

    return { items, sessionId };
  }

  public clearSession(userId: UserId, sessionId: SessionId): void {
    const prefix = `${userId}:${sessionId}:`;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  public clearUser(userId: UserId): void {
    const prefix = `${userId}:`;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  public evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }

  private buildKey(userId: UserId, sessionId: SessionId, key: string): string {
    return `${userId}:${sessionId}:${key}`;
  }
}
