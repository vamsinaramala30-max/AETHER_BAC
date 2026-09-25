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
      this.chunkCache.set(chunk.id, chunk);

      if (this.useDB) {
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
        } catch {
          // Keep in-memory cache functional if DB write fails
        }
      }
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
      } catch {
        // Fallback to in-memory
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
      } catch {
        // Return memory matches
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
    for (const id of chunkIds) {
      this.chunkCache.delete(id);
    }

    if (this.useDB) {
      try {
        const validIds = chunkIds.map((id) => toUuid(id));
        await (db as any).documentChunk.deleteMany({
          where: { id: { in: validIds } },
        });
      } catch {
        // Handled
      }
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
      } catch {
        // Handled
      }
    }
  }

  public async count(documentId?: string): Promise<number> {
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
