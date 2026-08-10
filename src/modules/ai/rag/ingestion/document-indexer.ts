/**
 * AETHER AI — Document Indexer
 * Embeds document chunks and stores them in vector and keyword indexes.
 * Never invents content or fake index entries.
 */

import type { Result } from '../../ai-types.js';
import { ok, fail } from '../../ai-types.js';
import { IndexingFailedError, EmbeddingFailedError } from '../../ai-errors.js';
import type { DocumentChunk, IndexedDocument, IVectorStore, IChunkStore } from '../rag-types.js';
import type { IEmbeddingEngine } from '../embeddings/embedding-engine.js';

// ─── IDocumentIndexer Interface ───────────────────────────────────────────────

export interface IDocumentIndexer {
  index(chunks: readonly DocumentChunk[]): Promise<Result<IndexedDocument>>;
  deleteDocument(documentId: string): Promise<Result<void>>;
}

// ─── Document Indexer Implementation ─────────────────────────────────────────

export class DocumentIndexer implements IDocumentIndexer {
  constructor(
    private readonly embeddingEngine: IEmbeddingEngine,
    private readonly vectorStore: IVectorStore,
    private readonly chunkStore: IChunkStore,
  ) {}

  public async index(
    chunks: readonly DocumentChunk[],
  ): Promise<Result<IndexedDocument>> {
    if (chunks.length === 0) {
      return fail(new IndexingFailedError('unknown', 'No chunks to index'));
    }

    const documentId = chunks[0]!.documentId;

    // Validate all chunks belong to same document
    for (const chunk of chunks) {
      if (chunk.documentId !== documentId) {
        return fail(
          new IndexingFailedError(
            documentId,
            'All chunks must belong to the same document',
          ),
        );
      }
    }

    // Embed all chunks
    const embeddingResult = await this.embeddingEngine.embedBatch(
      chunks.map((c) => c.text),
    );
    if (!embeddingResult.ok) {
      return fail(
        new IndexingFailedError(
          documentId,
          `Embedding failed: ${embeddingResult.error.message}`,
        ),
      );
    }

    const embeddings = embeddingResult.value;
    if (embeddings.length !== chunks.length) {
      return fail(
        new IndexingFailedError(
          documentId,
          `Embedding count mismatch: expected ${chunks.length}, got ${embeddings.length}`,
        ),
      );
    }

    // Attach embeddings to chunks
    const embeddedChunks: DocumentChunk[] = chunks.map((chunk, i) => ({
      ...chunk,
      embedding: embeddings[i]!,
    }));

    // Save raw chunks to chunk store
    try {
      await this.chunkStore.save(embeddedChunks);
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(
        new IndexingFailedError(
          documentId,
          `Chunk store save failed: ${error instanceof Error ? error.message : String(error)}`,
          cause,
        ),
      );
    }

    // Upsert into vector store
    try {
      await this.vectorStore.upsert(embeddedChunks);
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(
        new IndexingFailedError(
          documentId,
          `Vector store upsert failed: ${error instanceof Error ? error.message : String(error)}`,
          cause,
        ),
      );
    }

    return ok({
      documentId,
      chunkIds: embeddedChunks.map((c) => c.id),
      totalChunks: embeddedChunks.length,
      collectionId: chunks[0]?.metadata.collectionId,
      indexedAt: Date.now(),
    });
  }

  public async deleteDocument(documentId: string): Promise<Result<void>> {
    try {
      await this.vectorStore.deleteByDocument(documentId);
      await this.chunkStore.deleteByDocument(documentId);
      return ok(undefined);
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(
        new IndexingFailedError(
          documentId,
          `Delete failed: ${error instanceof Error ? error.message : String(error)}`,
          cause,
        ),
      );
    }
  }
}
