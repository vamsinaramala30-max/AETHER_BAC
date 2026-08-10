/**
 * AETHER AI — Retriever
 * Top-level retrieval orchestrator: query → embed → vector/keyword/hybrid search → rerank → chunks.
 * Never invents documents or retrieval results.
 */

import type { Result } from '../../ai-types.js';
import { ok, fail } from '../../ai-types.js';
import { RetrievalFailedError } from '../../ai-errors.js';
import type { IEmbeddingEngine } from '../embeddings/embedding-engine.js';
import type {
  RetrievalQuery,
  IVectorStore,
  IKeywordIndex,
  IChunkStore,
  DocumentChunk,
  RerankRequest,
} from '../rag-types.js';
import { HybridSearch } from './hybrid-search.js';
import type { IReranker } from './reranker.js';
import type { RAGConfig } from '../../ai-config.js';

// ─── IRetriever Interface ─────────────────────────────────────────────────────

export interface IRetriever {
  retrieve(query: RetrievalQuery): Promise<Result<readonly DocumentChunk[]>>;
}

// ─── Retriever Implementation ─────────────────────────────────────────────────

export class Retriever implements IRetriever {
  private readonly hybridSearch: HybridSearch;

  constructor(
    private readonly embeddingEngine: IEmbeddingEngine,
    private readonly vectorStore: IVectorStore,
    private readonly keywordIndex: IKeywordIndex,
    private readonly chunkStore: IChunkStore,
    private readonly reranker: IReranker,
    private readonly config: RAGConfig,
  ) {
    this.hybridSearch = new HybridSearch({
      alpha: config.hybridSearchAlpha,
    });
  }

  public async retrieve(query: RetrievalQuery): Promise<Result<readonly DocumentChunk[]>> {
    if (!query.text || query.text.trim().length === 0) {
      return fail(new RetrievalFailedError('Query text is empty'));
    }

    try {
      // Embed the query
      const embeddingResult = await this.embeddingEngine.embed(query.text);

      let retrievedChunks: DocumentChunk[];

      if (!embeddingResult.ok) {
        // Embedding unavailable — fall back to keyword-only search
        const keywordResults = await this.keywordIndex.search(
          query.text,
          query.topK * 2,
          query.collectionIds,
        );

        if (keywordResults.length === 0) return ok([]);

        const chunkIds = keywordResults.map((r) => r.chunkId);
        retrievedChunks = await this.resolveChunks(chunkIds);
      } else {
        // Hybrid search: vector + keyword
        const [vectorResults, keywordResults] = await Promise.all([
          this.vectorStore.search(
            embeddingResult.value,
            query.topK * 2,
            query.scoreThreshold,
            query.collectionIds,
          ),
          this.keywordIndex.search(
            query.text,
            query.topK * 2,
            query.collectionIds,
          ),
        ]);

        const hybridResults = this.hybridSearch.fuse(
          vectorResults,
          keywordResults,
          query.topK * 2,
        );

        if (hybridResults.length === 0) return ok([]);

        const chunkIds = hybridResults.map((r) => r.chunkId);
        retrievedChunks = await this.resolveChunks(chunkIds);
      }

      if (retrievedChunks.length === 0) return ok([]);

      // Apply reranking
      const rerankRequest: RerankRequest = {
        query: query.text,
        candidates: retrievedChunks,
        topK: query.topK,
      };

      const reranked = await this.reranker.rerank(rerankRequest);
      return ok(reranked.map((r) => r.chunk));
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(
        new RetrievalFailedError(
          error instanceof Error ? error.message : String(error),
          cause,
        ),
      );
    }
  }

  private async resolveChunks(chunkIds: readonly string[]): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    for (const id of chunkIds) {
      const chunk = await this.chunkStore.getById(id);
      if (chunk) chunks.push(chunk);
    }
    return chunks;
  }
}
