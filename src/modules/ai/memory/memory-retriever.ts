/**
 * AETHER AI — Memory Retriever
 * Retrieves memories for a user using semantic search or keyword matching.
 * CRITICAL: Always enforces user isolation — never returns another user's memories.
 * Supports workspace/project scope filtering for strict scope isolation.
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
            query.workspaceId,
            query.projectId,
          );

          // CRITICAL: Double-check user isolation
          const safe = results.filter((r) => r.item.userId === query.userId);

          // Increment access count for retrieved memories (non-blocking)
          for (const r of safe) {
            this.store.incrementAccessCount(r.item.id, query.userId).catch(() => {});
          }

          return ok(safe);
        }
        // Fall through to keyword if embedding fails
      }

      // Keyword fallback — respect scope
      const allItems = query.workspaceId || query.projectId || query.scope
        ? await this.store.getByScope(
            query.userId,
            query.scope,
            query.workspaceId,
            query.projectId,
            query.types,
          )
        : await this.store.getByUser(query.userId, query.types);
      const now = Date.now();

      // Filter expired
      const active = query.includeExpired
        ? allItems
        : allItems.filter((item) => !item.expiresAt || item.expiresAt > now);

      if (!query.text) {
        const results = active.slice(0, topK).map((item) => ({ item, score: item.importance }));
        return ok(results);
      }

      // Stopword-aware keyword scoring with prefix matching
      const STOPWORDS = new Set([
        'what', 'was', 'is', 'are', 'were', 'the', 'a', 'an', 'and', 'or', 'my', 'your',
        'his', 'her', 'their', 'our', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'about',
        'by', 'how', 'why', 'when', 'where', 'who', 'which', 'did', 'do', 'does', 'can',
        'could', 'would', 'should', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'please',
        'tell', 'me', 'give', 'show',
      ]);

      const allQueryTerms = query.text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 1);

      const queryTerms = allQueryTerms.filter((t) => !STOPWORDS.has(t));
      const termsToUse = queryTerms.length > 0 ? queryTerms : allQueryTerms;

      const scored = active
        .map((item) => {
          const contentLower = item.content.toLowerCase();
          const matches = termsToUse.filter((term) => {
            if (contentLower.includes(term)) return true;
            // Prefix stem matching (e.g. "prefer" matches "preferred")
            const stem = term.length > 4 ? term.slice(0, 4) : term;
            return contentLower.includes(stem);
          }).length;

          // Composite score: keyword relevance + importance + confidence bonus
          const keywordScore = termsToUse.length > 0 ? matches / termsToUse.length : 0;
          const confidenceBonus = item.confidence === 'confirmed' ? 0.1 : 0;
          const score = keywordScore * 0.7 + item.importance * 0.2 + confidenceBonus + 0.1;
          return { item, score: keywordScore > 0 ? score : 0 };
        })
        .filter((r) => r.score >= scoreThreshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      // Increment access count for retrieved memories (non-blocking)
      for (const r of scored) {
        this.store.incrementAccessCount(r.item.id, query.userId).catch(() => {});
      }

      return ok(scored);
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(
        new MemoryFailedError(
          'search',
          error instanceof Error ? error.message : String(error),
          cause,
        ),
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
        new MemoryFailedError(
          'getAll',
          error instanceof Error ? error.message : String(error),
          cause,
        ),
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
        new MemoryFailedError(
          'getById',
          error instanceof Error ? error.message : String(error),
          cause,
        ),
      );
    }
  }
}
