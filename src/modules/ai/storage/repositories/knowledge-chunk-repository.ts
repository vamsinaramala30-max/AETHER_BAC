/**
 * AETHER AI — Knowledge Chunk Repository
 * Authoritative persistence layer for document chunks using Prisma (db.documentChunk)
 * with in-memory caching and graceful fallback.
 * Strictly scope-aware and tenant-isolated.
 */

import type { DocumentChunk, IChunkStore } from '../../rag/rag-types.js';
import type { ChunkId, DocumentId } from '../../ai-types.js';
import { db } from '../../../../database/client.js';
import { toUuid } from './memory-repository.js';
import { AppError } from '../../../../middleware/error.middleware.js';
import { logger } from '../../../../config/index.js';

export interface IKnowledgeChunkRepository extends IChunkStore {
  findByScope(scope: {
    userId?: string;
    workspaceId?: string;
    projectId?: string;
    documentId?: string;
  }): Promise<readonly DocumentChunk[]>;
  count(documentId?: string): Promise<number>;
  clear(): Promise<void>;
}

export class KnowledgeChunkRepository implements IKnowledgeChunkRepository {
  private readonly chunkCache = new Map<string, DocumentChunk>();

  private get useDB(): boolean {
    return process.env.MEMORY_MODE !== 'in-memory' && Boolean((db as any).documentChunk);
  }

  public async save(chunks: readonly DocumentChunk[]): Promise<void> {
    for (const chunk of chunks) {
      if (this.useDB) {
        let lastError: unknown;
        let success = false;

        // Bounded retry (up to 2 attempts) for transient failures
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const validId = toUuid(chunk.id);
            const validDocId = chunk.documentId ? toUuid(chunk.documentId) : null;
            const validUserId = chunk.userId ? toUuid(chunk.userId) : toUuid('00000000-0000-0000-0000-000000000001');
            const validWorkspaceId = chunk.workspaceId ? toUuid(chunk.workspaceId) : null;
            const validProjectId = chunk.projectId ? toUuid(chunk.projectId) : null;

            const metadata = {
              ...(chunk.metadata as any),
              originalId: chunk.id,
              originalDocId: chunk.documentId,
              startOffset: chunk.startOffset,
              endOffset: chunk.endOffset,
              totalChunks: chunk.totalChunks,
              embedding: chunk.embedding,
            };

            await (db as any).documentChunk.upsert({
              where: { id: validId },
              update: {
                documentId: validDocId,
                workspaceId: validWorkspaceId,
                projectId: validProjectId,
                userId: validUserId,
                content: chunk.text,
                tokenCount: (chunk as any).tokenCount ?? Math.ceil(chunk.text.length / 4),
                chunkIndex: chunk.chunkIndex,
                metadata,
              },
              create: {
                id: validId,
                documentId: validDocId,
                workspaceId: validWorkspaceId,
                projectId: validProjectId,
                userId: validUserId,
                content: chunk.text,
                tokenCount: (chunk as any).tokenCount ?? Math.ceil(chunk.text.length / 4),
                chunkIndex: chunk.chunkIndex,
                metadata,
              },
            });

            // Write native vector to PostgreSQL pgvector column if available
            if (chunk.embedding && Array.isArray(chunk.embedding) && chunk.embedding.length === 768) {
              try {
                const vecStr = `[${chunk.embedding.join(',')}]`;
                await (db as any).$executeRawUnsafe(
                  `UPDATE "document_chunks" SET "embedding" = $1::vector WHERE id = $2::uuid`,
                  vecStr,
                  validId,
                );
              } catch {
                // Vector update graceful fallback (metadata still holds embedding)
              }
            }
            success = true;
            break;
          } catch (err) {
            lastError = err;
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 50));
            }
          }
        }

        if (!success) {
          logger.error(`[KnowledgeChunkRepository] Durable persistence failed for chunk ${chunk.id}: ${(lastError as Error)?.message}`);
          throw new AppError(
            `Database persistence failure: unable to durably store document chunk ${chunk.id}`,
            503,
            'DATABASE_PERSISTENCE_ERROR',
          );
        }
      }

      // Populate memory cache ONLY upon successful DB persistence or explicit in-memory mode
      this.chunkCache.set(chunk.id, chunk);
    }
  }

  public async getByIds(chunkIds: readonly ChunkId[]): Promise<readonly DocumentChunk[]> {
    if (!chunkIds || chunkIds.length === 0) return [];
    const result: DocumentChunk[] = [];
    const missingIds: string[] = [];

    for (const id of chunkIds) {
      const cached = this.chunkCache.get(id);
      if (cached) {
        result.push(cached);
      } else {
        missingIds.push(id);
      }
    }

    if (missingIds.length > 0 && this.useDB) {
      try {
        const validIds = missingIds.map(toUuid);
        const records = await (db as any).documentChunk.findMany({
          where: { id: { in: validIds } },
        });
        for (const record of records) {
          const chunk = this.recordToChunk(record);
          this.chunkCache.set(chunk.id, chunk);
          result.push(chunk);
        }
      } catch (err) {
        logger.error(`[KnowledgeChunkRepository] Database query error reading chunks: ${(err as Error)?.message}`);
        throw new AppError('Database error: unable to read document chunks', 503, 'DATABASE_READ_ERROR');
      }
    }

    return result;
  }

  public async searchNativeVector(
    queryEmbedding: readonly number[],
    topK: number,
    scoreThreshold: number,
    scope?: {
      userId?: string;
      workspaceId?: string;
      projectId?: string;
      collectionIds?: readonly string[];
    },
  ): Promise<Array<{ chunkId: string; documentId: string; score: number }>> {
    if (!this.useDB || !queryEmbedding || queryEmbedding.length !== 768) {
      return [];
    }

    try {
      const vecStr = `[${queryEmbedding.join(',')}]`;
      const validUserId = scope?.userId ? toUuid(scope.userId) : null;
      const validWorkspaceId = scope?.workspaceId ? toUuid(scope.workspaceId) : null;
      const validProjectId = scope?.projectId ? toUuid(scope.projectId) : null;

      const rows: any[] = await (db as any).$queryRawUnsafe(`
        SELECT 
          id, 
          "documentId", 
          1 - ("embedding" <=> $1::vector) AS score
        FROM "document_chunks"
        WHERE "embedding" IS NOT NULL
          AND ($2::uuid IS NULL OR "workspaceId" = $2::uuid)
          AND ($3::uuid IS NULL OR "userId" = $3::uuid)
          AND ($4::uuid IS NULL OR "projectId" = $4::uuid)
        ORDER BY "embedding" <=> $1::vector ASC
        LIMIT $5;
      `, vecStr, validWorkspaceId, validUserId, validProjectId, topK);

      if (!rows || rows.length === 0) return [];

      return rows
        .map((r) => ({
          chunkId: String(r.id),
          documentId: String(r.documentId || ''),
          score: Number(r.score),
        }))
        .filter((r) => r.score >= scoreThreshold);
    } catch {
      return [];
    }
  }

  public async getById(chunkId: ChunkId): Promise<DocumentChunk | undefined> {
    const cached = this.chunkCache.get(chunkId);
    if (cached) return cached;

    if (this.useDB) {
      try {
        const validId = toUuid(chunkId);
        const record = await (db as any).documentChunk.findUnique({
          where: { id: validId },
        });
        if (record) {
          const chunk = this.recordToChunk(record);
          this.chunkCache.set(chunk.id, chunk);
          return chunk;
        }
      } catch (err) {
        logger.error(`[KnowledgeChunkRepository] Database query error reading chunk ${chunkId}: ${(err as Error)?.message}`);
        throw new AppError('Database error: unable to read document chunk', 503, 'DATABASE_READ_ERROR');
      }
    }

    return undefined;
  }

  public async getByDocumentId(documentId: DocumentId): Promise<readonly DocumentChunk[]> {
    const memoryMatches = Array.from(this.chunkCache.values()).filter(
      (c) => c.documentId === documentId,
    );
    if (memoryMatches.length > 0) {
      return memoryMatches.sort((a, b) => a.chunkIndex - b.chunkIndex);
    }

    if (this.useDB) {
      try {
        const validDocId = toUuid(documentId);
        const records = await (db as any).documentChunk.findMany({
          where: { documentId: validDocId },
          orderBy: { chunkIndex: 'asc' },
        });
        const chunks = records.map((r: any) => this.recordToChunk(r));
        for (const c of chunks) {
          this.chunkCache.set(c.id, c);
        }
        return chunks;
      } catch (err) {
        logger.error(`[KnowledgeChunkRepository] Database query error reading chunks for doc ${documentId}: ${(err as Error)?.message}`);
        throw new AppError('Database error: unable to read document chunks for document', 503, 'DATABASE_READ_ERROR');
      }
    }

    return memoryMatches;
  }

  public async findByScope(scope: {
    userId?: string;
    workspaceId?: string;
    projectId?: string;
    documentId?: string;
  }): Promise<readonly DocumentChunk[]> {
    if (this.useDB) {
      try {
        const where: any = {};
        if (scope.documentId) {
          where.documentId = toUuid(scope.documentId);
        }
        if (scope.workspaceId) {
          where.workspaceId = toUuid(scope.workspaceId);
        } else if (scope.userId) {
          where.userId = toUuid(scope.userId);
        }
        if (scope.projectId) {
          where.projectId = toUuid(scope.projectId);
        }

        const records = await (db as any).documentChunk.findMany({
          where,
          orderBy: { chunkIndex: 'asc' },
        });

        if (records && records.length > 0) {
          const chunks = records.map((r: any) => this.recordToChunk(r));
          for (const c of chunks) {
            this.chunkCache.set(c.id, c);
          }
          return chunks;
        }
        return [];
      } catch (err) {
        logger.error(`[KnowledgeChunkRepository] Database query error in findByScope: ${(err as Error)?.message}`);
        throw new AppError('Database error: unable to query document chunks by scope', 503, 'DATABASE_READ_ERROR');
      }
    }

    return Array.from(this.chunkCache.values()).filter((c) => {
      if (scope.workspaceId) {
        if (c.workspaceId !== scope.workspaceId) return false;
      } else if (c.workspaceId) {
        if (!scope.userId || c.userId !== scope.userId) return false;
      }

      if (scope.userId) {
        if (c.userId && c.userId !== scope.userId) {
          if (!scope.workspaceId || c.workspaceId !== scope.workspaceId) return false;
        }
      } else if (c.userId) {
        if (!scope.workspaceId) return false;
      }

      if (scope.projectId && c.projectId && c.projectId !== scope.projectId) return false;
      if (scope.documentId && c.documentId !== scope.documentId) return false;
      return true;
    });
  }

  public async delete(chunkIds: readonly ChunkId[]): Promise<void> {
    if (this.useDB) {
      try {
        const validIds = chunkIds.map((id) => toUuid(id));
        await (db as any).documentChunk.deleteMany({
          where: { id: { in: validIds } },
        });
      } catch (err) {
        logger.error(`[KnowledgeChunkRepository] Database delete error: ${(err as Error)?.message}`);
        throw new AppError('Database error: unable to delete document chunks', 503, 'DATABASE_DELETE_ERROR');
      }
    }

    for (const id of chunkIds) {
      this.chunkCache.delete(id);
    }
  }

  public async deleteByDocument(documentId: DocumentId): Promise<void> {
    for (const [id, chunk] of Array.from(this.chunkCache.entries())) {
      if (chunk.documentId === documentId) {
        this.chunkCache.delete(id);
      }
    }

    if (this.useDB) {
      try {
        const validDocId = toUuid(documentId);
        await (db as any).documentChunk.deleteMany({
          where: { documentId: validDocId },
        });
      } catch (err) {
        logger.error(`[KnowledgeChunkRepository] Database delete error for doc ${documentId}: ${(err as Error)?.message}`);
        throw new AppError('Database error: unable to delete document chunks', 503, 'DATABASE_DELETE_ERROR');
      }
    }
  }

  public async count(documentId?: string): Promise<number> {
    if (this.useDB) {
      try {
        const where = documentId ? { documentId: toUuid(documentId) } : undefined;
        return await (db as any).documentChunk.count({ where });
      } catch {
        // Fallback to cache count
      }
    }
    if (documentId) {
      return Array.from(this.chunkCache.values()).filter((c) => c.documentId === documentId).length;
    }
    return this.chunkCache.size;
  }

  public async clear(): Promise<void> {
    this.chunkCache.clear();
  }

  private recordToChunk(record: any): DocumentChunk {
    const meta = (record.metadata as any) || {};
    return {
      id: meta.originalId || record.id,
      documentId: meta.originalDocId || record.documentId,
      text: record.content,
      chunkIndex: record.chunkIndex ?? 0,
      totalChunks: meta.totalChunks ?? 1,
      startOffset: meta.startOffset ?? 0,
      endOffset: meta.endOffset ?? record.content.length,
      metadata: {
        ...meta,
        chunkIndex: record.chunkIndex,
      },
      embedding: meta.embedding,
      userId: record.userId,
      workspaceId: record.workspaceId ?? undefined,
      projectId: record.projectId ?? undefined,
    };
  }
}

export const knowledgeChunkRepository = new KnowledgeChunkRepository();
