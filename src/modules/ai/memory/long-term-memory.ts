/**
 * AETHER AI — Long-Term Memory
 * Authoritative persistent memory store with strict user security isolation.
 * Uses MemoryRepository (Prisma DB + memory cache) to ensure database persistence.
 */

import type { MemoryItem, MemoryId, UserId, MemoryType, MemoryScope } from '../ai-types.js';
import type { IMemoryStore, MemorySearchResult } from './memory-types.js';
import { cosineSimilarity } from '../rag/embeddings/embedding-engine.js';
import { MEMORY } from '../ai-constants.js';
import {
  memoryRepository,
  type IMemoryRepository,
} from '../storage/repositories/memory-repository.js';

// ─── Persistent Long-Term Store ────────────────────────────────────────────────

export class PersistentLongTermStore implements IMemoryStore {
  constructor(private readonly repo: IMemoryRepository = memoryRepository) {}

  public async create(item: MemoryItem): Promise<void> {
    // Authoritative persist via repository (throws on DB write failure)
    await this.repo.save(item);
  }

  public async getById(id: MemoryId, userId: UserId): Promise<MemoryItem | undefined> {
    const item = await this.repo.getById(id, userId);
    if (!item) return undefined;
    if (item.userId !== userId) return undefined;
    if (
      (item.metadata as any)?.status === 'deleted' ||
      (item.metadata as any)?.status === 'superseded'
    ) {
      return undefined;
    }
    if (item.expiresAt && item.expiresAt < Date.now()) return undefined;
    return item;
  }

  public async getByUser(
    userId: UserId,
    types?: readonly MemoryType[],
  ): Promise<readonly MemoryItem[]> {
    const items = await this.repo.getByUser(userId, types);
    const now = Date.now();
    return items.filter((item) => {
      if (item.userId !== userId) return false;
      if (
        (item.metadata as any)?.status === 'deleted' ||
        (item.metadata as any)?.status === 'superseded'
      ) {
        return false;
      }
      if (item.expiresAt && item.expiresAt < now) return false;
      return true;
    });
  }

  public async getByScope(
    userId: UserId,
    scope?: MemoryScope,
    workspaceId?: string,
    projectId?: string,
    types?: readonly MemoryType[],
  ): Promise<readonly MemoryItem[]> {
    const items = await this.repo.getByScope(userId, scope, workspaceId, projectId, types);
    const now = Date.now();
    return items.filter((item) => {
      if (item.userId !== userId) return false;
      if (
        (item.metadata as any)?.status === 'deleted' ||
        (item.metadata as any)?.status === 'superseded'
      ) {
        return false;
      }
      if (item.expiresAt && item.expiresAt < now) return false;
      return true;
    });
  }

  public async update(id: MemoryId, userId: UserId, patch: Partial<MemoryItem>): Promise<void> {
    await this.repo.update(id, userId, patch);
  }

  public async delete(id: MemoryId, userId: UserId): Promise<void> {
    await this.repo.delete(id, userId);
  }

  public async deleteByUser(userId: UserId): Promise<void> {
    await this.repo.deleteByUser(userId);
  }

  public async findByContent(userId: UserId, contentQuery: string): Promise<readonly MemoryItem[]> {
    return this.repo.findByContent(userId, contentQuery);
  }

  public async incrementAccessCount(id: MemoryId, userId: UserId): Promise<void> {
    await this.repo.incrementAccessCount(id, userId);
  }

  public async search(
    userId: UserId,
    embedding: readonly number[],
    topK: number,
    scoreThreshold: number,
    types?: readonly MemoryType[],
    workspaceId?: string,
    projectId?: string,
  ): Promise<readonly MemorySearchResult[]> {
    // Get items filtered by scope
    const items = workspaceId || projectId
      ? await this.getByScope(userId, undefined, workspaceId, projectId, types)
      : await this.getByUser(userId, types);
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
    const items = await this.getByUser(userId);
    return items.length;
  }
}

// ─── In-Memory Long-Term Store (Fallback / Development Cache) ─────────────────

export class InMemoryLongTermStore implements IMemoryStore {
  private readonly userMemories = new Map<UserId, Map<MemoryId, MemoryItem>>();

  public async create(item: MemoryItem): Promise<void> {
    let userMap = this.userMemories.get(item.userId);
    if (!userMap) {
      userMap = new Map();
      this.userMemories.set(item.userId, userMap);
    }

    if (userMap.size >= MEMORY.LONG_TERM_MAX_ITEMS) {
      this.evictLeastImportant(userMap);
    }

    userMap.set(item.id, item);
  }

  public async getById(id: MemoryId, userId: UserId): Promise<MemoryItem | undefined> {
    const userMap = this.userMemories.get(userId);
    if (!userMap) return undefined;
    const item = userMap.get(id);
    if (!item || item.userId !== userId) return undefined;
    if (
      (item.metadata as any)?.status === 'deleted' ||
      (item.metadata as any)?.status === 'superseded'
    ) {
      return undefined;
    }
    if (item.expiresAt && item.expiresAt < Date.now()) return undefined;
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
      if (item.userId !== userId) return false;
      if (
        (item.metadata as any)?.status === 'deleted' ||
        (item.metadata as any)?.status === 'superseded'
      ) {
        return false;
      }
      if (item.expiresAt && item.expiresAt < now) return false;
      if (types && types.length > 0 && !types.includes(item.type)) return false;
      return true;
    });
  }

  public async getByScope(
    userId: UserId,
    scope?: MemoryScope,
    workspaceId?: string,
    projectId?: string,
    types?: readonly MemoryType[],
  ): Promise<readonly MemoryItem[]> {
    const all = await this.getByUser(userId, types);
    return all.filter((item) => {
      if (scope && item.scope !== scope) return false;
      if (workspaceId && item.workspaceId !== workspaceId) return false;
      if (projectId && item.projectId !== projectId) return false;
      return true;
    });
  }

  public async update(id: MemoryId, userId: UserId, patch: Partial<MemoryItem>): Promise<void> {
    const userMap = this.userMemories.get(userId);
    if (!userMap) return;

    const existing = userMap.get(id);
    if (!existing || existing.userId !== userId) return;

    const updated: MemoryItem = {
      ...existing,
      ...patch,
      version: (existing.version ?? 1) + 1,
    };
    userMap.set(id, updated);
  }

  public async delete(id: MemoryId, userId: UserId): Promise<void> {
    const userMap = this.userMemories.get(userId);
    if (!userMap) return;

    const item = userMap.get(id);
    if (item && item.userId === userId) {
      userMap.delete(id);
    }
  }

  public async deleteByUser(userId: UserId): Promise<void> {
    this.userMemories.delete(userId);
  }

  public async findByContent(userId: UserId, contentQuery: string): Promise<readonly MemoryItem[]> {
    const normalizedQuery = contentQuery.toLowerCase().trim();
    const all = await this.getByUser(userId);
    return all.filter((item) => item.content.toLowerCase().includes(normalizedQuery));
  }

  public async incrementAccessCount(id: MemoryId, userId: UserId): Promise<void> {
    const userMap = this.userMemories.get(userId);
    if (!userMap) return;
    const item = userMap.get(id);
    if (item && item.userId === userId) {
      const updated: MemoryItem = {
        ...item,
        accessCount: item.accessCount + 1,
        lastAccessedAt: Date.now(),
      };
      userMap.set(id, updated);
    }
  }

  public async search(
    userId: UserId,
    embedding: readonly number[],
    topK: number,
    scoreThreshold: number,
    types?: readonly MemoryType[],
    workspaceId?: string,
    projectId?: string,
  ): Promise<readonly MemorySearchResult[]> {
    const items = workspaceId || projectId
      ? await this.getByScope(userId, undefined, workspaceId, projectId, types)
      : await this.getByUser(userId, types);
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
