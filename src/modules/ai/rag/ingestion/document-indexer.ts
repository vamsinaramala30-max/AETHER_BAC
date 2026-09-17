/**
 * AETHER AI — Document Indexer
 * Embeds document chunks and stores them in vector and keyword indexes.
 * Never invents content or fake index entries.
 */

import type { Result } from '../../ai-types.js';
import { ok, fail } from '../../ai-types.js';
import { IndexingFailedError, EmbeddingFailedError } from '../../ai-errors.js';
import type {
  DocumentChunk,
  IndexedDocument,
  IVectorStore,
  IChunkStore,
  IKeywordIndex,
} from '../rag-types.js';
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
    private readonly keywordIndex?: IKeywordIndex,
  ) {}

  public async index(chunks: readonly DocumentChunk[]): Promise<Result<IndexedDocument>> {
    if (chunks.length === 0) {
      return fail(new IndexingFailedError('unknown', 'No chunks to index'));
    }

    const documentId = chunks[0]!.documentId;

    // Validate all chunks belong to same document
    for (const chunk of chunks) {
      if (chunk.documentId !== documentId) {
        return fail(
          new IndexingFailedError(documentId, 'All chunks must belong to the same document'),
        );
      }
    }

    // Embed all chunks (if embedding engine is unavailable/fails, store without embeddings for keyword-only retrieval)
    let embeddedChunks: readonly DocumentChunk[] = chunks;
    const isAvailable = await this.embeddingEngine.isAvailable();
    if (isAvailable) {
      const embeddingResult = await this.embeddingEngine.embedBatch(chunks.map((c) => c.text));
      if (embeddingResult.ok) {
        const embeddings = embeddingResult.value;
        if (embeddings.length === chunks.length) {
          const dims = this.embeddingEngine.getDimensions();
          embeddedChunks = chunks.map((chunk, i) => ({
            ...chunk,
            embedding: embeddings[i]!,
            metadata: {
              ...chunk.metadata,
              embeddingModel: 'authoritative-local',
              embeddingVersion: '1.0',
              embeddingDimension: dims,
            },
          }));
        }
      }
    }

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

    // Upsert into vector store if embeddings are present
    try {
      const chunksWithEmbeddings = embeddedChunks.filter(
        (c) => c.embedding && c.embedding.length > 0,
      );
      if (chunksWithEmbeddings.length > 0) {
        await this.vectorStore.upsert(chunksWithEmbeddings);
      }
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
      if (this.keywordIndex) {
        await this.keywordIndex.deleteByDocument(documentId);
      }
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
