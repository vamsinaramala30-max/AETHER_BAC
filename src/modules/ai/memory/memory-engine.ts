/**
 * AETHER AI — Memory Engine
 * Central coordinator for all memory subsystems:
 *   ConversationMemory (windowed, in-memory)
 *   WorkingMemory (TTL-based, in-memory)
 *   PersistentLongTermStore (PostgreSQL via MemoryRepository)
 *
 * This is the single authoritative entry point for all memory operations.
 * Implements IMemoryEngine and IMemoryProvider contracts.
 */

import type {
  MemoryItem,
  MemoryId,
  UserId,
  SessionId,
  ConversationId,
  MemoryType,
  MemoryScope,
  ContextMessage,
  MessageRole,
  WorkingMemoryContext,
  Result,
} from '../ai-types.js';
import { ok, fail } from '../ai-types.js';
import { MemoryFailedError } from '../ai-errors.js';
import type { MemoryQuery, MemoryWriteRequest, MemoryUpdateRequest, IMemoryStore } from './memory-types.js';
import type { AIConfig } from '../ai-config.js';
import { ConversationMemory, type IConversationMemory } from './conversation-memory.js';
import { WorkingMemory, type IWorkingMemory } from './working-memory.js';
import { PersistentLongTermStore } from './long-term-memory.js';
import { MemoryRetriever } from './memory-retriever.js';
import { MemoryWriter } from './memory-writer.js';
import { memoryRepository } from '../storage/repositories/memory-repository.js';
import { metrics } from '../observability/metrics.js';
import { tracer } from '../observability/tracing.js';
import { logger } from '../observability/logger.js';
import { performance } from 'perf_hooks';

// ─── IMemoryEngine Interface ──────────────────────────────────────────────────

export interface IMemoryEngine {
  // Conversation Memory
  addConversationMessage(
    userId: UserId,
    sessionId: SessionId,
    conversationId: ConversationId,
    role: MessageRole,
    content: string,
  ): ContextMessage;

  getConversationHistory(
    userId: UserId,
    sessionId: SessionId,
    conversationId: ConversationId,
    maxTokens?: number,
  ): readonly ContextMessage[];

  clearConversation(userId: UserId, sessionId: SessionId, conversationId: ConversationId): void;

  // Working Memory
  setWorkingMemory(
    userId: UserId,
    sessionId: SessionId,
    key: string,
    value: string,
    ttlMs?: number,
  ): void;

  getWorkingMemory(userId: UserId, sessionId: SessionId, key: string): string | undefined;

  getWorkingMemoryContext(userId: UserId, sessionId: SessionId): WorkingMemoryContext;

  clearWorkingMemory(userId: UserId, sessionId: SessionId): void;

  // Persistent Long-Term Memory
  createMemory(request: MemoryWriteRequest): Promise<Result<MemoryItem>>;
  updateMemory(request: MemoryUpdateRequest): Promise<Result<MemoryItem>>;
  deleteMemory(id: MemoryId, userId: UserId): Promise<Result<void>>;
  searchMemory(query: MemoryQuery): Promise<Result<readonly MemoryItem[]>>;
  getAllMemory(userId: UserId): Promise<Result<readonly MemoryItem[]>>;
  getMemoryById(id: MemoryId, userId: UserId): Promise<Result<MemoryItem>>;
  forgetMemoryByContent(userId: UserId, contentQuery: string): Promise<Result<number>>;

  // User Cleanup
  clearUserData(userId: UserId): Promise<void>;
  clearUserMemory(userId: UserId): Promise<void>;
}

// ─── Memory Engine Implementation ────────────────────────────────────────────

export class MemoryEngine implements IMemoryEngine {
  private readonly conversationMemory: IConversationMemory;
  private readonly workingMemory: IWorkingMemory;
  private readonly longTermStore: IMemoryStore;
  private readonly retriever: MemoryRetriever | null;
  private readonly writer: MemoryWriter | null;

  constructor(config?: AIConfig) {
    const windowSize = config?.memory?.conversationWindowSize ?? 20;
    const workingMemoryTTL = config?.memory?.workingMemoryTTLMs ?? 3_600_000;

    this.conversationMemory = new ConversationMemory(windowSize);
    this.workingMemory = new WorkingMemory(workingMemoryTTL);
    this.longTermStore = new PersistentLongTermStore(memoryRepository);
    this.retriever = new MemoryRetriever(this.longTermStore, null);
    this.writer = new MemoryWriter(this.longTermStore, null);
  }

  // ─── Conversation Memory ──────────────────────────────────────────────────

  public addConversationMessage(
    userId: UserId,
    sessionId: SessionId,
    conversationId: ConversationId,
    role: MessageRole,
    content: string,
  ): ContextMessage {
    return this.conversationMemory.addMessage(userId, sessionId, conversationId, role, content);
  }

  public getConversationHistory(
    userId: UserId,
    sessionId: SessionId,
    conversationId: ConversationId,
    maxTokens?: number,
  ): readonly ContextMessage[] {
    return this.conversationMemory.getHistory(userId, sessionId, conversationId, maxTokens);
  }

  public clearConversation(
    userId: UserId,
    sessionId: SessionId,
    conversationId: ConversationId,
  ): void {
    this.conversationMemory.clearSession(userId, sessionId, conversationId);
  }

  // ─── Working Memory ───────────────────────────────────────────────────────

  public setWorkingMemory(
    userId: UserId,
    sessionId: SessionId,
    key: string,
    value: string,
    ttlMs?: number,
  ): void {
    this.workingMemory.set(userId, sessionId, key, value, ttlMs);
  }

  public getWorkingMemory(
    userId: UserId,
    sessionId: SessionId,
    key: string,
  ): string | undefined {
    return this.workingMemory.get(userId, sessionId, key);
  }

  public getWorkingMemoryContext(userId: UserId, sessionId: SessionId): WorkingMemoryContext {
    return this.workingMemory.getAll(userId, sessionId);
  }

  public clearWorkingMemory(userId: UserId, sessionId: SessionId): void {
    this.workingMemory.clearSession(userId, sessionId);
  }

  // ─── Persistent Long-Term Memory ─────────────────────────────────────────

  public async createMemory(request: MemoryWriteRequest): Promise<Result<MemoryItem>> {
    if (!request.userId || request.userId.trim().length === 0) {
      return fail(new MemoryFailedError('create', 'userId is required'));
    }
    if (!request.content || request.content.trim().length === 0) {
      return fail(new MemoryFailedError('create', 'content is required'));
    }

    try {
      const now = Date.now();
      const id = `mem_${now}_${Math.random().toString(36).slice(2, 8)}`;

      const startNow = performance.now();
      const span = tracer.startSpan('memory.write', {
        component: 'MemoryEngine',
        attributes: { operation: 'create', scope: request.scope ?? 'GLOBAL_USER' },
      });

      const item: MemoryItem = {
        id,
        userId: request.userId,
        workspaceId: request.workspaceId,
        projectId: request.projectId,
        type: request.type ?? 'fact',
        scope: request.scope ?? (request.projectId ? 'PROJECT' : request.workspaceId ? 'WORKSPACE' : 'GLOBAL_USER'),
        content: request.content.trim(),
        importance: request.importance ?? 0.7,
        confidence: request.confidence ?? 'user_provided',
        version: 1,
        accessCount: 0,
        createdAt: now,
        updatedAt: now,
        expiresAt: request.ttlMs ? now + request.ttlMs : undefined,
        metadata: {
          ...request.metadata,
          status: 'active',
          source: request.metadata?.source ?? 'user_explicit',
        },
      };

      await this.longTermStore.create(item);
      const durationMs = Number((performance.now() - startNow).toFixed(2));
      metrics.recordMemoryWrite(item.scope ?? 'GLOBAL_USER', true);
      metrics.recordMemoryLatency(durationMs, 'create');
      tracer.endSpan(span.spanId, 'ok');

      return ok(item);
    } catch (error) {
      metrics.recordMemoryWrite(request.scope ?? 'GLOBAL_USER', false);
      metrics.recordMemoryFailure('create', 'MEMORY_FAILED');
      return fail(
        new MemoryFailedError(
          'create',
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  public async updateMemory(request: MemoryUpdateRequest): Promise<Result<MemoryItem>> {
    if (!request.userId || request.userId.trim().length === 0) {
      return fail(new MemoryFailedError('update', 'userId is required'));
    }
    if (!request.id || request.id.trim().length === 0) {
      return fail(new MemoryFailedError('update', 'id is required'));
    }

    try {
      const existing = await this.longTermStore.getById(request.id, request.userId);
      if (!existing) {
        return fail(new MemoryFailedError('update', 'Memory not found'));
      }

      // CRITICAL: Enforce user isolation
      if (existing.userId !== request.userId) {
        return fail(new MemoryFailedError('update', 'Access denied'));
      }

      const patch: Partial<MemoryItem> = {
        ...(request.content != null && { content: request.content.trim() }),
        ...(request.importance != null && { importance: request.importance }),
        ...(request.confidence != null && { confidence: request.confidence }),
        ...(request.metadata && { metadata: { ...existing.metadata, ...request.metadata } }),
        updatedAt: Date.now(),
      };

      await this.longTermStore.update(request.id, request.userId, patch);

      const updated: MemoryItem = { ...existing, ...patch, version: (existing.version ?? 1) + 1 };
      metrics.recordMemoryWrite(updated.scope ?? 'GLOBAL_USER', true);
      return ok(updated);
    } catch (error) {
      metrics.recordMemoryFailure('update', 'MEMORY_FAILED');
      return fail(
        new MemoryFailedError(
          'update',
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  public async deleteMemory(id: MemoryId, userId: UserId): Promise<Result<void>> {
    if (!userId || userId.trim().length === 0) {
      return fail(new MemoryFailedError('delete', 'userId is required'));
    }

    try {
      await this.longTermStore.delete(id, userId);
      metrics.recordMemoryDelete('unknown', true);
      return ok(undefined);
    } catch (error) {
      metrics.recordMemoryDelete('unknown', false);
      metrics.recordMemoryFailure('delete', 'MEMORY_FAILED');
      return fail(
        new MemoryFailedError(
          'delete',
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  public async searchMemory(query: MemoryQuery): Promise<Result<readonly MemoryItem[]>> {
    if (!query.userId || query.userId.trim().length === 0) {
      return fail(new MemoryFailedError('search', 'userId is required'));
    }

    const startNow = performance.now();
    const span = tracer.startSpan('memory.search', {
      component: 'MemoryEngine',
      attributes: { operation: 'search', scope: query.scope ?? 'ALL' },
    });

    try {
      // If retriever is available, use full semantic + keyword search
      if (this.retriever) {
        const result = await this.retriever.search(query);
        if (result.ok) {
          const durationMs = Number((performance.now() - startNow).toFixed(2));
          metrics.recordMemoryRead(query.scope ?? 'ALL', true);
          metrics.recordMemoryLatency(durationMs, 'search');
          tracer.endSpan(span.spanId, 'ok');
          return ok(result.value.map((r) => r.item));
        }
      }

      // Fallback: keyword-based from store
      const items = query.workspaceId || query.projectId || query.scope
        ? await this.longTermStore.getByScope(
            query.userId,
            query.scope,
            query.workspaceId,
            query.projectId,
            query.types,
          )
        : await this.longTermStore.getByUser(query.userId, query.types);

      if (!query.text) {
        const topK = query.topK ?? 10;
        return ok(items.slice(0, topK));
      }

      // Tokenized keyword search fallback with stopword filtering
      const STOPWORDS = new Set([
        'what', 'was', 'is', 'are', 'were', 'the', 'a', 'an', 'and', 'or', 'my', 'your',
        'in', 'on', 'at', 'to', 'for', 'of', 'with', 'about', 'by', 'how', 'why', 'when',
        'where', 'who', 'which', 'did', 'do', 'does', 'can', 'could', 'would', 'should',
        'i', 'you', 'he', 'she', 'it', 'we', 'they', 'please', 'tell', 'me',
      ]);
      const terms = query.text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 1 && !STOPWORDS.has(t));
      const searchTerms = terms.length > 0 ? terms : [query.text.toLowerCase().trim()];

      const scored = items
        .map((item) => {
          const contentLower = item.content.toLowerCase();
          const matches = searchTerms.filter((term) => {
            if (contentLower.includes(term)) return true;
            const stem = term.length > 4 ? term.slice(0, 4) : term;
            return contentLower.includes(stem);
          }).length;
          const score = searchTerms.length > 0 ? matches / searchTerms.length : 0;
          return { item, score: matches > 0 ? score * 0.7 + (item.importance ?? 0.5) * 0.3 : 0 };
        })
        .filter((r) => r.score >= (query.scoreThreshold ?? 0.1))
        .sort((a, b) => b.score - a.score)
        .slice(0, query.topK ?? 10)
      const durationMs = Number((performance.now() - startNow).toFixed(2));
      metrics.recordMemoryRead(query.scope ?? 'ALL', true);
      metrics.recordMemoryLatency(durationMs, 'search');
      tracer.endSpan(span.spanId, 'ok');

      return ok(scored.map((r) => r.item));
    } catch (error) {
      metrics.recordMemoryRead(query.scope ?? 'ALL', false);
      metrics.recordMemoryFailure('search', 'MEMORY_FAILED');
      tracer.endSpan(span.spanId, 'error');
      return fail(
        new MemoryFailedError(
          'search',
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  public async getAllMemory(userId: UserId): Promise<Result<readonly MemoryItem[]>> {
    if (!userId || userId.trim().length === 0) {
      return fail(new MemoryFailedError('getAll', 'userId is required'));
    }

    try {
      const items = await this.longTermStore.getByUser(userId);
      // Enforce isolation
      const safe = items.filter((item) => item.userId === userId);
      return ok(safe);
    } catch (error) {
      return fail(
        new MemoryFailedError(
          'getAll',
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  public async getMemoryById(id: MemoryId, userId: UserId): Promise<Result<MemoryItem>> {
    if (!userId || userId.trim().length === 0) {
      return fail(new MemoryFailedError('getById', 'userId is required'));
    }

    try {
      const item = await this.longTermStore.getById(id, userId);
      if (!item) {
        return fail(new MemoryFailedError('getById', 'Memory not found'));
      }

      // CRITICAL: Enforce user isolation
      if (item.userId !== userId) {
        return fail(new MemoryFailedError('getById', 'Access denied'));
      }

      return ok(item);
    } catch (error) {
      return fail(
        new MemoryFailedError(
          'getById',
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  public async forgetMemoryByContent(userId: UserId, contentQuery: string): Promise<Result<number>> {
    if (!userId || userId.trim().length === 0) {
      return fail(new MemoryFailedError('forget', 'userId is required'));
    }
    if (!contentQuery || contentQuery.trim().length === 0) {
      return fail(new MemoryFailedError('forget', 'contentQuery is required'));
    }

    try {
      const matches = await this.longTermStore.findByContent(userId, contentQuery);

      // CRITICAL: Double-check user isolation
      const userMatches = matches.filter((item) => item.userId === userId);

      let deletedCount = 0;
      for (const item of userMatches) {
        await this.longTermStore.delete(item.id, userId);
        deletedCount++;
      }

      return ok(deletedCount);
    } catch (error) {
      return fail(
        new MemoryFailedError(
          'forget',
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  // ─── User Cleanup ────────────────────────────────────────────────────────

  public async clearUserData(userId: UserId): Promise<void> {
    this.conversationMemory.clearUser(userId);
    this.workingMemory.clearUser(userId);
    await this.longTermStore.deleteByUser(userId);
  }

  public async clearUserMemory(userId: UserId): Promise<void> {
    return this.clearUserData(userId);
  }
}

export const memoryEngine = new MemoryEngine();
