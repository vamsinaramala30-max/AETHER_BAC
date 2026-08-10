/**
 * AETHER AI — Long-Term Memory
 * Persistent, user-scoped semantic memory for facts, preferences, and summaries.
 * In-memory implementation — replace store with a database for production.
 */

import type { MemoryItem, MemoryId, UserId, MemoryType } from '../ai-types.js';
import type { IMemoryStore, MemorySearchResult } from './memory-types.js';
import { cosineSimilarity } from '../rag/embeddings/embedding-engine.js';
import { MEMORY } from '../ai-constants.js';

// ─── In-Memory Long-Term Store ────────────────────────────────────────────────

export class InMemoryLongTermStore implements IMemoryStore {
  // userId → memoryId → MemoryItem
  private readonly userMemories = new Map<UserId, Map<MemoryId, MemoryItem>>();

  public async create(item: MemoryItem): Promise<void> {
    let userMap = this.userMemories.get(item.userId);
    if (!userMap) {
      userMap = new Map();
      this.userMemories.set(item.userId, userMap);
    }

    // Enforce max per-user limit
    if (userMap.size >= MEMORY.LONG_TERM_MAX_ITEMS) {
      this.evictLeastImportant(userMap);
    }

    userMap.set(item.id, item);
  }

  public async getById(id: MemoryId, userId: UserId): Promise<MemoryItem | undefined> {
    const userMap = this.userMemories.get(userId);
    if (!userMap) return undefined;
    const item = userMap.get(id);
    // CRITICAL: Only return if userId matches
    if (!item || item.userId !== userId) return undefined;
    return item;
  }

  public async getByUser(
    userId: UserId,
    types?: readonly MemoryType[],
  ): Promise<readonly MemoryItem[]> {
    const userMap = this.userMemories.get(userId);
    if (!userMap) return [];

    const now = Date.now();
    return Array.from(userMap.values()).filter((item) => {
      // CRITICAL: Enforce user isolation
      if (item.userId !== userId) return false;
      // Filter expired
      if (item.expiresAt && item.expiresAt < now) return false;
      // Filter by type
      if (types && types.length > 0 && !types.includes(item.type)) return false;
      return true;
    });
  }

  public async update(
    id: MemoryId,
    userId: UserId,
    patch: Partial<MemoryItem>,
  ): Promise<void> {
    const userMap = this.userMemories.get(userId);
    if (!userMap) return;

    const existing = userMap.get(id);
    // CRITICAL: Only update if userId matches
    if (!existing || existing.userId !== userId) return;

    const updated: MemoryItem = { ...existing, ...patch };
    userMap.set(id, updated);
  }

  public async delete(id: MemoryId, userId: UserId): Promise<void> {
    const userMap = this.userMemories.get(userId);
    if (!userMap) return;

    const item = userMap.get(id);
    // CRITICAL: Only delete if userId matches
    if (item && item.userId === userId) {
      userMap.delete(id);
    }
  }

  public async deleteByUser(userId: UserId): Promise<void> {
    this.userMemories.delete(userId);
  }

  public async search(
    userId: UserId,
    embedding: readonly number[],
    topK: number,
    scoreThreshold: number,
    types?: readonly MemoryType[],
  ): Promise<readonly MemorySearchResult[]> {
    const items = await this.getByUser(userId, types);
    if (items.length === 0) return [];

    const scored: MemorySearchResult[] = [];

    for (const item of items) {
      if (!item.embedding || item.embedding.length !== embedding.length) continue;

      const score = cosineSimilarity(embedding, item.embedding);
      if (score >= scoreThreshold) {
        scored.push({ item, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  public async count(userId: UserId): Promise<number> {
    return this.userMemories.get(userId)?.size ?? 0;
  }

  private evictLeastImportant(userMap: Map<MemoryId, MemoryItem>): void {
    let minImportance = Infinity;
    let minId: MemoryId | null = null;

    for (const [id, item] of userMap) {
      const score = item.importance - item.accessCount * 0.01;
      if (score < minImportance) {
        minImportance = score;
        minId = id;
      }
    }

    if (minId) userMap.delete(minId);
  }
}
