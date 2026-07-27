export type AIModelType = 'gemini-1.5-pro' | 'gemini-1.5-flash' | 'text-embedding-004';

export interface VectorSearchResult {
  documentId: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export type AIChatRole = 'user' | 'assistant' | 'system';

export interface AIChatMessagePayload {
  role: AIChatRole;
  content: string;
}
