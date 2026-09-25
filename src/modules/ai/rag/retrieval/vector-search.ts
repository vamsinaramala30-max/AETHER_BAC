/**
 * AETHER AI — Vector Search
 * In-memory vector store with cosine similarity search.
 * Production deployments should replace this with a dedicated vector DB
 * (e.g., Qdrant, Weaviate, Chroma) by implementing IVectorStore.
 */

import type { IVectorStore, VectorSearchResult, DocumentChunk } from '../rag-types.js';
import type { ChunkId } from '../../ai-types.js';
import { cosineSimilarity } from '../embeddings/embedding-engine.js';

// ─── In-Memory Vector Store ───────────────────────────────────────────────────

interface StoredVector {
  readonly chunkId: ChunkId;
  readonly documentId: string;
  readonly embedding: readonly number[];
  readonly collectionId?: string;
  readonly userId?: string;
  readonly workspaceId?: string;
  readonly projectId?: string;
}

export class InMemoryVectorStore implements IVectorStore {
  private readonly vectors = new Map<ChunkId, StoredVector>();

  public async upsert(chunks: readonly DocumentChunk[]): Promise<void> {
    for (const chunk of chunks) {
      if (!chunk.embedding || chunk.embedding.length === 0) {
        throw new Error(`Chunk "${chunk.id}" has no embedding to index`);
      }
      this.vectors.set(chunk.id, {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        embedding: chunk.embedding,
        collectionId: chunk.metadata.collectionId,
        userId: chunk.userId || (chunk.metadata?.userId as string | undefined),
        workspaceId: chunk.workspaceId || (chunk.metadata?.workspaceId as string | undefined),
        projectId: chunk.projectId || (chunk.metadata?.projectId as string | undefined),
      });
    }
  }

  public async search(
    queryEmbedding: readonly number[],
    topK: number,
    scoreThreshold: number,
    collectionIds?: readonly string[],
    scope?: {
      userId?: string;
      workspaceId?: string;
      projectId?: string;
      collectionIds?: readonly string[];
    },
  ): Promise<readonly VectorSearchResult[]> {
    if (this.vectors.size === 0) return [];
    if (queryEmbedding.length === 0) return [];

    const effectiveCollectionIds = scope?.collectionIds ?? collectionIds;
    const results: Array<{ chunkId: ChunkId; documentId: string; score: number }> = [];

    for (const stored of this.vectors.values()) {
      // Scope filters: strict user isolation, workspace isolation, project isolation
      if (scope?.workspaceId) {
        if (stored.workspaceId !== scope.workspaceId) {
          continue;
        }
      } else if (stored.workspaceId) {
        if (!scope?.userId || stored.userId !== scope.userId) {
          continue;
        }
      }

      if (scope?.userId) {
        if (stored.userId && stored.userId !== scope.userId) {
          if (!scope.workspaceId || stored.workspaceId !== scope.workspaceId) {
            continue;
          }
        }
      } else if (stored.userId) {
        if (!scope?.workspaceId) {
          continue;
        }
      }

      if (scope?.projectId && stored.projectId && stored.projectId !== scope.projectId) {
        continue;
      }

      // Filter by collection if specified
      if (effectiveCollectionIds && effectiveCollectionIds.length > 0) {
        if (!stored.collectionId || !effectiveCollectionIds.includes(stored.collectionId)) {
          continue;
        }
      }

      if (stored.embedding.length !== queryEmbedding.length) continue;

      const score = cosineSimilarity(queryEmbedding, stored.embedding);
      if (score >= scoreThreshold) {
        results.push({ chunkId: stored.chunkId, documentId: stored.documentId, score });
      }
    }

    // Sort descending by score, take topK
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, topK);

    return topResults.map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      score: r.score,
    }));
  }

  public async delete(chunkIds: readonly ChunkId[]): Promise<void> {
    for (const id of chunkIds) {
      this.vectors.delete(id);
    }
  }

  public async deleteByDocument(documentId: string): Promise<void> {
    for (const [id, stored] of this.vectors) {
      if (stored.documentId === documentId) {
        this.vectors.delete(id);
      }
    }
  }

  public async count(collectionId?: string): Promise<number> {
    if (!collectionId) return this.vectors.size;
    let count = 0;
    for (const stored of this.vectors.values()) {
      if (stored.collectionId === collectionId) count++;
    }
    return count;
  }
}
