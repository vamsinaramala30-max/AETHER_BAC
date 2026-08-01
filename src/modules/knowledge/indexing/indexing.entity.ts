import { IndexingState } from '../knowledge.constants';

export interface DocumentChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  embeddingVector?: number[];
  tokenCount: number;
}

export interface IndexJobEntity {
  id: string;
  documentId: string;
  state: IndexingState;
  chunksCount: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}