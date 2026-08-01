export interface KnowledgeChunk {
  id: string;
  documentId: string;
  content: string;
  score: number;
  metadata?: Record<string, any>;
}

export interface Citation {
  chunkId: string;
  documentId: string;
  snippet: string;
}