/**
 * AETHER AI — Memory Retriever
 * Retrieves memories for a user using semantic search or keyword matching.
 * CRITICAL: Always enforces user isolation — never returns another user's memories.
 */

import type { Result } from '../ai-types.js';
import { ok, fail } from '../ai-types.js';
import { MemoryFailedError } from '../ai-errors.js';
import type { MemoryItem, UserId } from '../ai-types.js';
import type { IMemoryStore, MemoryQuery, MemorySearchResult } from './memory-types.js';
import type { IEmbeddingEngine } from '../rag/embeddings/embedding-engine.js';
import { MEMORY } from '../ai-constants.js';

// ─── IMemoryRetriever Interface ───────────────────────────────────────────────

export interface IMemoryRetriever {
  search(query: MemoryQuery): Promise<Result<readonly MemorySearchResult[]>>;
  getAll(userId: UserId): Promise<Result<readonly MemoryItem[]>>;
  getById(id: string, userId: UserId): Promise<Result<MemoryItem>>;
}

// ─── Memory Retriever Implementation ─────────────────────────────────────────

export class MemoryRetriever implements IMemoryRetriever {
  constructor(
    private readonly store: IMemoryStore,
    private readonly embeddingEngine: IEmbeddingEngine | null,
  ) {}

  public async search(query: MemoryQuery): Promise<Result<readonly MemorySearchResult[]>> {
    if (!query.userId || query.userId.trim().length === 0) {
      return fail(new MemoryFailedError('search', 'userId is required for memory search'));
    }

    try {
      const topK = query.topK ?? 5;
      const scoreThreshold = query.scoreThreshold ?? MEMORY.MIN_IMPORTANCE_SCORE;

      // Semantic search path
      if (query.text && this.embeddingEngine) {
        const embResult = await this.embeddingEngine.embed(query.text);
        if (embResult.ok) {
          const results = await this.store.search(
            query.userId,
            embResult.value,
            topK,
            scoreThreshold,
            query.types,
          );

          // CRITICAL: Double-check user isolation
          const safe = results.filter((r) => r.item.userId === query.userId);
          return ok(safe);
        }
        // Fall through to keyword if embedding fails
      }

      // Keyword fallback
      const allItems = await this.store.getByUser(query.userId, query.types);
      const now = Date.now();

      // Filter expired
      const active = query.includeExpired
        ? allItems
        : allItems.filter((item) => !item.expiresAt || item.expiresAt > now);

      if (!query.text) {
        return ok(
          active
            .slice(0, topK)
            .map((item) => ({ item, score: item.importance })),
        );
      }

      // Simple keyword scoring
      const queryTerms = query.text.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
      const scored = active
        .map((item) => {
          const contentLower = item.content.toLowerCase();
          const matches = queryTerms.filter((t) => contentLower.includes(t)).length;
          const score = queryTerms.length > 0 ? matches / queryTerms.length : 0;
          return { item, score };
        })
        .filter((r) => r.score >= scoreThreshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      return ok(scored);
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(
        new MemoryFailedError('search', error instanceof Error ? error.message : String(error), cause),
      );
    }
  }

  public async getAll(userId: UserId): Promise<Result<readonly MemoryItem[]>> {
    if (!userId || userId.trim().length === 0) {
      return fail(new MemoryFailedError('getAll', 'userId is required'));
    }

    try {
      const items = await this.store.getByUser(userId);
      // Enforce isolation
      const safe = items.filter((item) => item.userId === userId);
      return ok(safe);
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(
        new MemoryFailedError('getAll', error instanceof Error ? error.message : String(error), cause),
      );
    }
  }

  public async getById(id: string, userId: UserId): Promise<Result<MemoryItem>> {
    if (!userId || userId.trim().length === 0) {
      return fail(new MemoryFailedError('getById', 'userId is required'));
    }

    try {
      const item = await this.store.getById(id, userId);
      if (!item) {
        return fail(
          new MemoryFailedError('getById', `Memory "${id}" not found for user "${userId}"`),
        );
      }

      // CRITICAL: Enforce user isolation
      if (item.userId !== userId) {
        return fail(
          new MemoryFailedError('getById', 'Access denied: memory belongs to a different user'),
        );
      }

      return ok(item);
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(
        new MemoryFailedError('getById', error instanceof Error ? error.message : String(error), cause),
      );
    }
  }
}
