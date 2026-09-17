/**
 * AETHER AI — Memory Writer
 * Creates and updates memory items in the store.
 * All memory is strictly user-scoped.
 * Never allows cross-user contamination.
 */

import { randomUUID } from 'crypto';
import type { Result } from '../ai-types.js';
import { ok, fail } from '../ai-types.js';
import { MemoryFailedError } from '../ai-errors.js';
import type { MemoryItem, MemoryId, UserId } from '../ai-types.js';
import type { IMemoryStore, MemoryWriteRequest, MemoryUpdateRequest } from './memory-types.js';
import { MEMORY } from '../ai-constants.js';
import type { IEmbeddingEngine } from '../rag/embeddings/embedding-engine.js';

// ─── IMemoryWriter Interface ──────────────────────────────────────────────────

export interface IMemoryWriter {
  write(request: MemoryWriteRequest): Promise<Result<MemoryItem>>;
  update(request: MemoryUpdateRequest): Promise<Result<MemoryItem>>;
  delete(id: MemoryId, userId: UserId): Promise<Result<void>>;
  deleteByUser(userId: UserId): Promise<Result<void>>;
}

// ─── Memory Writer Implementation ─────────────────────────────────────────────

export class MemoryWriter implements IMemoryWriter {
  constructor(
    private readonly store: IMemoryStore,
    private readonly embeddingEngine: IEmbeddingEngine | null,
  ) {}

  public async write(request: MemoryWriteRequest): Promise<Result<MemoryItem>> {
    try {
      if (!request.content || request.content.trim().length === 0) {
        return fail(new MemoryFailedError('write', 'Memory content cannot be empty'));
      }
      if (!request.userId || request.userId.trim().length === 0) {
        return fail(new MemoryFailedError('write', 'userId is required'));
      }

      const importance = this.clampImportance(request.importance ?? MEMORY.MIN_IMPORTANCE_SCORE);
      const now = Date.now();
      const expiresAt = request.ttlMs ? now + request.ttlMs : undefined;

      // Generate embedding if available
      let embedding: readonly number[] | undefined;
      if (this.embeddingEngine) {
        const embResult = await this.embeddingEngine.embed(request.content);
        if (embResult.ok) {
          embedding = embResult.value;
        }
        // Embedding failure is non-fatal — memory is stored without vector
      }

      const item: MemoryItem = {
        id: randomUUID(),
        userId: request.userId,
        workspaceId: request.workspaceId,
        projectId: request.projectId,
        type: request.type,
        scope: request.scope ?? (request.projectId ? 'PROJECT' : request.workspaceId ? 'WORKSPACE' : 'GLOBAL_USER'),
        content: request.content,
        embedding,
        importance,
        confidence:
          request.confidence ??
          (request.metadata?.confidence as any) ??
          (request.metadata?.source === 'user_explicit' ? 'confirmed' : 'user_provided'),
        version: 1,
        accessCount: 0,
        createdAt: now,
        updatedAt: now,
        expiresAt,
        metadata: {
          status: 'active',
          confidence:
            (request.metadata?.confidence as any) ||
            (request.metadata?.source === 'user_explicit' ? 'confirmed' : 'user_provided'),
          ...request.metadata,
        },
      };

      await this.store.create(item);
      return ok(item);
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(
        new MemoryFailedError(
          'write',
          error instanceof Error ? error.message : String(error),
          cause,
        ),
      );
    }
  }

  public async update(request: MemoryUpdateRequest): Promise<Result<MemoryItem>> {
    try {
      if (!request.userId || request.userId.trim().length === 0) {
        return fail(new MemoryFailedError('update', 'userId is required'));
      }

      // Verify ownership before updating
      const existing = await this.store.getById(request.id, request.userId);
      if (!existing) {
        return fail(
          new MemoryFailedError(
            'update',
            `Memory item "${request.id}" not found for user "${request.userId}"`,
          ),
        );
      }

      // CRITICAL: Enforce user-scope — must belong to requesting user
      if (existing.userId !== request.userId) {
        return fail(
          new MemoryFailedError('update', 'Access denied: memory belongs to a different user'),
        );
      }

      const newContent = request.content !== undefined ? request.content : undefined;
      let newEmbedding: readonly number[] | undefined = undefined;
      if (request.content !== undefined && this.embeddingEngine) {
        const embResult = await this.embeddingEngine.embed(request.content);
        if (embResult.ok) newEmbedding = embResult.value;
      }
      const newImportance =
        request.importance !== undefined ? this.clampImportance(request.importance) : undefined;
      const newMetadata = request.metadata !== undefined ? request.metadata : undefined;

      const patch: Partial<MemoryItem> = {
        ...(newContent !== undefined && { content: newContent }),
        ...(newEmbedding !== undefined && { embedding: newEmbedding }),
        ...(newImportance !== undefined && { importance: newImportance }),
        ...(request.workspaceId !== undefined && { workspaceId: request.workspaceId }),
        ...(request.projectId !== undefined && { projectId: request.projectId }),
        ...(newMetadata !== undefined && { metadata: newMetadata }),
        updatedAt: Date.now(),
      };

      await this.store.update(request.id, request.userId, patch);

      const updated = await this.store.getById(request.id, request.userId);
      if (!updated) {
        return fail(new MemoryFailedError('update', 'Memory item not found after update'));
      }
      return ok(updated);
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(
        new MemoryFailedError(
          'update',
          error instanceof Error ? error.message : String(error),
          cause,
        ),
      );
    }
  }

  public async delete(id: MemoryId, userId: UserId): Promise<Result<void>> {
    try {
      if (!userId || userId.trim().length === 0) {
        return fail(new MemoryFailedError('delete', 'userId is required'));
      }

      // Verify ownership
      const existing = await this.store.getById(id, userId);
      if (!existing) {
        return fail(
          new MemoryFailedError('delete', `Memory "${id}" not found for user "${userId}"`),
        );
      }

      if (existing.userId !== userId) {
        return fail(
          new MemoryFailedError('delete', 'Access denied: memory belongs to a different user'),
        );
      }

      await this.store.delete(id, userId);
      return ok(undefined);
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(
        new MemoryFailedError(
          'delete',
          error instanceof Error ? error.message : String(error),
          cause,
        ),
      );
    }
  }

  public async deleteByUser(userId: UserId): Promise<Result<void>> {
    try {
      if (!userId || userId.trim().length === 0) {
        return fail(new MemoryFailedError('deleteByUser', 'userId is required'));
      }
      await this.store.deleteByUser(userId);
      return ok(undefined);
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(
        new MemoryFailedError(
          'deleteByUser',
          error instanceof Error ? error.message : String(error),
          cause,
        ),
      );
    }
  }

  private clampImportance(value: number): number {
    return Math.max(MEMORY.MIN_IMPORTANCE_SCORE, Math.min(MEMORY.MAX_IMPORTANCE_SCORE, value));
  }
}
