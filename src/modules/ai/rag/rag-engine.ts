/**
 * AETHER AI — RAG Engine
 * Top-level RAG orchestrator: ingestion pipeline + retrieval pipeline.
 * Coordinates: load → parse → clean → chunk → embed → index → retrieve → context.
 */

import crypto from 'node:crypto';
import type { Result } from '../ai-types.js';
import { ok, fail } from '../ai-types.js';
import { RAGFailedError, NotConfiguredError } from '../ai-errors.js';
import { buildDefaultAIConfig, type AIConfig } from '../ai-config.js';
import type { DocumentSource } from './ingestion/document-loader.js';
import { knowledgeChunkRepository } from '../storage/repositories/knowledge-chunk-repository.js';
import { DocumentLoader } from './ingestion/document-loader.js';
import { DocumentParser } from './ingestion/document-parser.js';
import { DocumentCleaner } from './ingestion/document-cleaner.js';
import { DocumentChunker } from './ingestion/document-chunker.js';
import { DocumentIndexer } from './ingestion/document-indexer.js';
import { Retriever } from './retrieval/retriever.js';
import { HeuristicReranker, PassThroughReranker } from './retrieval/reranker.js';
import { InMemoryVectorStore } from './retrieval/vector-search.js';
import { InMemoryKeywordIndex } from './retrieval/keyword-search.js';
import { ContextBuilder } from './context/context-builder.js';
import { ExtractiveContextCompressor } from './context/context-compressor.js';
import { CitationBuilder } from './context/citation-builder.js';
import { EmbeddingEngine, UnavailableEmbeddingEngine } from './embeddings/embedding-engine.js';
import type { IEmbeddingEngine } from './embeddings/embedding-engine.js';
import { createEmbeddingModel } from './embeddings/embedding-model.js';
import type {
  IndexedDocument,
  IngestionProgress,
  RetrievalQuery,
  IChunkStore,
  DocumentChunk,
  IVectorStore,
  IKeywordIndex,
} from './rag-types.js';
import type { BuiltRAGContext } from './rag-types.js';
import type { IRAGProvider } from '../interfaces/core-contracts.js';
import { metrics } from '../observability/metrics.js';
import { tracer } from '../observability/tracing.js';
import { logger } from '../observability/logger.js';
import { performance } from 'perf_hooks';

// ─── In-Memory Chunk Store ────────────────────────────────────────────────────

class InMemoryChunkStore implements IChunkStore {
  private readonly chunks = new Map<string, DocumentChunk>();

  public async save(chunks: readonly DocumentChunk[]): Promise<void> {
    for (const chunk of chunks) {
      this.chunks.set(chunk.id, chunk);
    }
  }

  public async getById(chunkId: string): Promise<DocumentChunk | undefined> {
    return this.chunks.get(chunkId);
  }

  public async getByDocumentId(documentId: string): Promise<readonly DocumentChunk[]> {
    return Array.from(this.chunks.values()).filter((c) => c.documentId === documentId);
  }

  public async delete(chunkIds: readonly string[]): Promise<void> {
    for (const id of chunkIds) this.chunks.delete(id);
  }

  public async deleteByDocument(documentId: string): Promise<void> {
    for (const [id, chunk] of this.chunks) {
      if (chunk.documentId === documentId) this.chunks.delete(id);
    }
  }
}

// ─── RAG Engine Interface ─────────────────────────────────────────────────────

export interface RAGEngineOptions {
  readonly vectorStore?: IVectorStore;
  readonly keywordIndex?: IKeywordIndex;
  readonly chunkStore?: IChunkStore;
}

export interface IRAGEngine extends IRAGProvider {
  ingest(source: DocumentSource, collectionId?: string): Promise<Result<IndexedDocument>>;
  deleteDocument(documentId: string): Promise<Result<void>>;
  query(query: RetrievalQuery): Promise<Result<BuiltRAGContext>>;
  isEmbeddingAvailable(): Promise<boolean>;
}

// ─── RAG Engine Implementation ────────────────────────────────────────────────

export class RAGEngine implements IRAGEngine, IRAGProvider {
  private readonly loader: DocumentLoader;
  private readonly parser: DocumentParser;
  private readonly cleaner: DocumentCleaner;
  private readonly chunker: DocumentChunker;
  private readonly indexer: DocumentIndexer;
  private readonly retriever: Retriever;
  private readonly contextBuilder: ContextBuilder;
  private readonly contextCompressor: ExtractiveContextCompressor;
  private readonly citationBuilder: CitationBuilder;
  private readonly embeddingEngine: IEmbeddingEngine;
  private readonly vectorStore: IVectorStore;
  private readonly keywordIndex: IKeywordIndex;
  private readonly chunkStore: IChunkStore;
  private readonly config: AIConfig;
  private readonly ingestedHashes = new Map<string, IndexedDocument>();

  constructor(config: AIConfig, options?: RAGEngineOptions) {
    this.config = config;

    this.vectorStore = options?.vectorStore ?? new InMemoryVectorStore();
    this.keywordIndex = options?.keywordIndex ?? new InMemoryKeywordIndex();
    this.chunkStore = options?.chunkStore ?? knowledgeChunkRepository;

    // Resolve embedding engine based on config
    const runtimeBaseUrl =
      config.runtime.type !== 'none'
        ? config.runtime.type === 'ollama'
          ? config.runtime.baseUrl
          : (config.runtime as { serverUrl: string }).serverUrl
        : '';

    const embeddingModel = runtimeBaseUrl
      ? createEmbeddingModel(config.embedding, runtimeBaseUrl)
      : null;

    this.embeddingEngine = embeddingModel
      ? new EmbeddingEngine(embeddingModel, config.embedding)
      : new UnavailableEmbeddingEngine();

    this.loader = new DocumentLoader();
    this.parser = new DocumentParser();
    this.cleaner = new DocumentCleaner();
    this.chunker = new DocumentChunker({
      chunkSize: config.rag.maxChunkSizeTokens * 4,
      chunkOverlap: config.rag.chunkOverlapTokens * 4,
    });
    this.indexer = new DocumentIndexer(
      this.embeddingEngine,
      this.vectorStore,
      this.chunkStore,
      this.keywordIndex,
    );
    this.retriever = new Retriever(
      this.embeddingEngine,
      this.vectorStore,
      this.keywordIndex,
      this.chunkStore,
      config.rag.rerankEnabled ? new HeuristicReranker() : new PassThroughReranker(),
      config.rag,
    );
    this.contextBuilder = new ContextBuilder();
    this.contextCompressor = new ExtractiveContextCompressor();
    this.citationBuilder = new CitationBuilder();
  }

  public async ingest(
    source: DocumentSource,
    collectionId?: string,
  ): Promise<Result<IndexedDocument>> {
    if (!this.config.rag.enabled) {
      return fail(new NotConfiguredError('RAG is disabled in configuration'));
    }

    // Load
    const loadResult = await this.loader.load(source);
    if (!loadResult.ok) return loadResult;
    const raw = loadResult.value;

    // Parse
    const parseResult = await this.parser.parse(raw);
    if (!parseResult.ok) return parseResult;
    const parsed = parseResult.value;

    // Clean
    const cleanResult = this.cleaner.clean(parsed);
    if (!cleanResult.ok) return cleanResult;
    const cleaned = cleanResult.value;

    // Chunk
    const chunkResult = this.chunker.chunk(cleaned);
    if (!chunkResult.ok) return chunkResult;

    // Attach collectionId and multi-tenant scopes to chunk metadata and properties
    const userId = (source as any).metadata?.userId as string | undefined;
    const workspaceId = (source as any).metadata?.workspaceId as string | undefined;
    const projectId = (source as any).metadata?.projectId as string | undefined;

    // Deduplication check using SHA-256 content fingerprint
    const contentStr = typeof raw.content === 'string' ? raw.content : raw.content.toString('utf-8');
    const contentHash = crypto.createHash('sha256').update(contentStr).digest('hex');
    const dedupKey = `${userId || 'global'}:${raw.id}:${contentHash}`;

    if (this.ingestedHashes.has(dedupKey)) {
      return ok(this.ingestedHashes.get(dedupKey)!);
    }

    // Remove any previous chunks for this documentId before re-indexing
    await this.indexer.deleteDocument(raw.id);

    const chunks = chunkResult.value.map((c) => ({
      ...c,
      userId: c.userId || userId,
      workspaceId: c.workspaceId || workspaceId,
      projectId: c.projectId || projectId,
      metadata: {
        ...c.metadata,
        contentHash,
        ...(collectionId ? { collectionId } : {}),
        ...(userId ? { userId } : {}),
        ...(workspaceId ? { workspaceId } : {}),
        ...(projectId ? { projectId } : {}),
      },
    }));

    // Index into keyword store
    await this.keywordIndex.index(chunks);

    // Index into vector store (embeds internally)
    const indexResult = await this.indexer.index(chunks);
    if (indexResult.ok) {
      this.ingestedHashes.set(dedupKey, indexResult.value);
    }
    return indexResult;
  }

  public async deleteDocument(documentId: string): Promise<Result<void>> {
    for (const [key, val] of Array.from(this.ingestedHashes.entries())) {
      if (val.documentId === documentId) {
        this.ingestedHashes.delete(key);
      }
    }
    return this.indexer.deleteDocument(documentId);
  }

  public async query(query: RetrievalQuery): Promise<Result<BuiltRAGContext>> {
    if (!this.config.rag.enabled) {
      return fail(new NotConfiguredError('RAG is disabled in configuration'));
    }

    const startNow = performance.now();
    metrics.recordRAGRequest('retrieval');
    const span = tracer.startSpan('rag.retrieval', {
      component: 'RAG',
      attributes: {
        queryLength: query.text.length,
        filterCount: Object.keys(query.filters || {}).length,
      },
    });

    try {
      const retrieveResult = await this.retriever.retrieve(query);
      if (!retrieveResult.ok) {
        tracer.endSpan(span.spanId, 'error', { code: 'RETRIEVAL_FAILED' });
        metrics.recordRAGFailure('retrieval', 'RETRIEVAL_FAILED');
        return retrieveResult;
      }

      const chunks = retrieveResult.value;

      let ragContext = this.contextBuilder.build(
        query.text,
        chunks,
        this.config.rag.maxContextTokens,
      );

      if (
        this.config.rag.contextCompressionEnabled &&
        ragContext.estimatedTokens > this.config.rag.maxContextTokens
      ) {
        ragContext = this.contextCompressor.compress(
          ragContext,
          this.config.rag.maxContextTokens,
          query.text,
        );
      }

      const durationMs = Number((performance.now() - startNow).toFixed(2));
      metrics.recordRAGLatency(durationMs, 'retrieval');
      metrics.recordCitations(ragContext.citations.length);
      tracer.endSpan(span.spanId, 'ok');

      logger.debug('RAG retrieval completed', {
        candidateCount: chunks.length,
        citationCount: ragContext.citations.length,
        durationMs,
      });

      return ok(ragContext);
    } catch (err) {
      const durationMs = Number((performance.now() - startNow).toFixed(2));
      tracer.endSpan(span.spanId, 'error', { code: 'RAG_FAILED' });
      metrics.recordRAGFailure('pipeline', 'RAG_FAILED');
      logger.error('RAG retrieval failed', { durationMs }, err instanceof Error ? err : undefined);
      return fail(new RAGFailedError('pipeline', err instanceof Error ? err.message : String(err)));
    }
  }

  public async isEmbeddingAvailable(): Promise<boolean> {
    return this.embeddingEngine.isAvailable();
  }
}

export const defaultRAGEngine = new RAGEngine(buildDefaultAIConfig());

