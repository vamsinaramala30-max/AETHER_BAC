/**
 * AETHER AI — RAG Types
 * Types specific to the Retrieval-Augmented Generation subsystem.
 */

import type {
  DocumentId,
  ChunkId,
  DocumentMetadata,
  RetrievedDocument,
  Citation,
} from '../ai-types.js';

// ─── Raw Document ─────────────────────────────────────────────────────────────

export interface RawDocument {
  readonly id: DocumentId;
  readonly content: string | Buffer;
  readonly mimeType: string;
  readonly filename?: string;
  readonly metadata: DocumentMetadata;
  readonly loadedAt: number;
}

// ─── Parsed Document ──────────────────────────────────────────────────────────

export interface ParsedDocument {
  readonly id: DocumentId;
  readonly text: string;
  readonly metadata: DocumentMetadata;
  readonly parsedAt: number;
  readonly language?: string;
  readonly pageCount?: number;
}

// ─── Cleaned Document ─────────────────────────────────────────────────────────

export interface CleanedDocument {
  readonly id: DocumentId;
  readonly text: string;
  readonly metadata: DocumentMetadata;
  readonly cleanedAt: number;
}

// ─── Document Chunk ───────────────────────────────────────────────────────────

export interface DocumentChunk {
  readonly id: ChunkId;
  readonly documentId: DocumentId;
  readonly text: string;
  readonly chunkIndex: number;
  readonly totalChunks: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly metadata: DocumentMetadata;
  readonly embedding?: readonly number[];
}

// ─── Indexed Document ─────────────────────────────────────────────────────────

export interface IndexedDocument {
  readonly documentId: DocumentId;
  readonly chunkIds: readonly ChunkId[];
  readonly totalChunks: number;
  readonly collectionId?: string;
  readonly indexedAt: number;
}

// ─── Search Results ───────────────────────────────────────────────────────────

export interface VectorSearchResult {
  readonly chunkId: ChunkId;
  readonly documentId: DocumentId;
  readonly score: number;
  readonly embedding?: readonly number[];
}

export interface KeywordSearchResult {
  readonly chunkId: ChunkId;
  readonly documentId: DocumentId;
  readonly score: number;
  readonly matchedTerms: readonly string[];
}

export interface HybridSearchResult {
  readonly chunkId: ChunkId;
  readonly documentId: DocumentId;
  readonly vectorScore: number;
  readonly keywordScore: number;
  readonly combinedScore: number;
}

// ─── Retrieval Query ──────────────────────────────────────────────────────────

export interface RetrievalQuery {
  readonly text: string;
  readonly embedding?: readonly number[];
  readonly topK: number;
  readonly scoreThreshold: number;
  readonly collectionIds?: readonly string[];
  readonly filters?: RetrievalFilters;
}

export interface RetrievalFilters {
  readonly tags?: readonly string[];
  readonly author?: string;
  readonly dateFrom?: number;
  readonly dateTo?: number;
  readonly mimeTypes?: readonly string[];
}

// ─── Reranking ────────────────────────────────────────────────────────────────

export interface RerankRequest {
  readonly query: string;
  readonly candidates: readonly DocumentChunk[];
  readonly topK: number;
}

export interface RerankResult {
  readonly chunk: DocumentChunk;
  readonly score: number;
  readonly rank: number;
}

// ─── Context Building ─────────────────────────────────────────────────────────

export interface BuiltRAGContext {
  readonly documents: readonly RetrievedDocument[];
  readonly citations: readonly Citation[];
  readonly totalRetrieved: number;
  readonly searchQuery: string;
  readonly estimatedTokens: number;
}

// ─── Ingestion Status ─────────────────────────────────────────────────────────

export type IngestionStatus =
  | 'queued'
  | 'loading'
  | 'parsing'
  | 'cleaning'
  | 'chunking'
  | 'embedding'
  | 'indexing'
  | 'indexed'
  | 'failed';

export interface IngestionProgress {
  readonly documentId: DocumentId;
  readonly status: IngestionStatus;
  readonly errorMessage?: string;
  readonly chunksProcessed?: number;
  readonly totalChunks?: number;
  readonly startedAt: number;
  readonly completedAt?: number;
}

// ─── Vector Store Interface ───────────────────────────────────────────────────

export interface IVectorStore {
  upsert(chunks: readonly DocumentChunk[]): Promise<void>;
  search(
    embedding: readonly number[],
    topK: number,
    scoreThreshold: number,
    collectionIds?: readonly string[],
  ): Promise<readonly VectorSearchResult[]>;
  delete(chunkIds: readonly ChunkId[]): Promise<void>;
  deleteByDocument(documentId: DocumentId): Promise<void>;
  count(collectionId?: string): Promise<number>;
}

// ─── Keyword Index Interface ──────────────────────────────────────────────────

export interface IKeywordIndex {
  index(chunks: readonly DocumentChunk[]): Promise<void>;
  search(
    query: string,
    topK: number,
    collectionIds?: readonly string[],
  ): Promise<readonly KeywordSearchResult[]>;
  delete(chunkIds: readonly ChunkId[]): Promise<void>;
  deleteByDocument(documentId: DocumentId): Promise<void>;
}

// ─── Chunk Store Interface ────────────────────────────────────────────────────

export interface IChunkStore {
  save(chunks: readonly DocumentChunk[]): Promise<void>;
  getById(chunkId: ChunkId): Promise<DocumentChunk | undefined>;
  getByDocumentId(documentId: DocumentId): Promise<readonly DocumentChunk[]>;
  delete(chunkIds: readonly ChunkId[]): Promise<void>;
  deleteByDocument(documentId: DocumentId): Promise<void>;
}
