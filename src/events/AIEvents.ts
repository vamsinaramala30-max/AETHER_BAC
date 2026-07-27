export enum AIEventType {
  CHAT_STARTED = 'ai.chat_started',
  RESPONSE_GENERATED = 'ai.response_generated',
  EMBEDDING_GENERATED = 'ai.embedding_generated',
  RAG_CONTEXT_RETRIEVED = 'ai.rag_context_retrieved',
}

export interface AIChatStartedPayload {
  conversationId: string;
  userId: string;
  workspaceId: string;
  timestamp: Date;
}

export interface AIResponseGeneratedPayload {
  conversationId: string;
  messageId: string;
  promptLength: number;
  responseLength: number;
  durationMs: number;
}
