export interface ChatRequestPayload {
  message: string;
  conversationId?: string;
  workspaceId: string;
}

export interface ChatResponse {
  conversationId: string;
  reply: string;
}