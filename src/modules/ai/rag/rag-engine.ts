/**
 * AETHER AI — RAG Engine
 * Top-level RAG orchestrator: ingestion pipeline + retrieval pipeline.
 * Coordinates: load → parse → clean → chunk → embed → index → retrieve → context.
 */

import type { Result } from '../ai-types.js';
import { ok, fail } from '../ai-types.js';
import { RAGFailedError, NotConfiguredError } from '../ai-errors.js';
import type { AIConfig } from '../ai-config.js';
import type { DocumentSource } from './ingestion/document-loader.js';
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

export interface IRAGEngine {
  ingest(
    source: DocumentSource,
    collectionId?: string,
  ): Promise<Result<IndexedDocument>>;
  deleteDocument(documentId: string): Promise<Result<void>>;
  query(query: RetrievalQuery): Promise<Result<BuiltRAGContext>>;
  isEmbeddingAvailable(): Promise<boolean>;
}

// ─── RAG Engine Implementation ────────────────────────────────────────────────

export class RAGEngine implements IRAGEngine {
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

  constructor(config: AIConfig) {
    this.config = config;

    this.vectorStore = new InMemoryVectorStore();
    this.keywordIndex = new InMemoryKeywordIndex();
    this.chunkStore = new InMemoryChunkStore();

    // Resolve embedding engine based on config
    const runtimeBaseUrl = config.runtime.type !== 'none'
      ? (config.runtime.type === 'ollama' ? config.runtime.baseUrl : (config.runtime as { serverUrl: string }).serverUrl)
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

    // Attach collectionId to chunk metadata
    const chunks = collectionId
      ? chunkResult.value.map((c) => ({
          ...c,
          metadata: { ...c.metadata, collectionId },
        }))
      : chunkResult.value;

    // Index into keyword store
    await this.keywordIndex.index(chunks);

    // Index into vector store (embeds internally)
    const indexResult = await this.indexer.index(chunks);
    return indexResult;
  }

  public async deleteDocument(documentId: string): Promise<Result<void>> {
    return this.indexer.deleteDocument(documentId);
  }

  public async query(query: RetrievalQuery): Promise<Result<BuiltRAGContext>> {
    if (!this.config.rag.enabled) {
      return fail(new NotConfiguredError('RAG is disabled in configuration'));
    }

    const retrieveResult = await this.retriever.retrieve(query);
    if (!retrieveResult.ok) return retrieveResult;

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

    return ok(ragContext);
  }

  public async isEmbeddingAvailable(): Promise<boolean> {
    return this.embeddingEngine.isAvailable();
  }
}
