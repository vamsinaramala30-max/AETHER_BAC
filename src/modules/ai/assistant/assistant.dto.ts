export interface ChatAssistantDto {
  conversationId?: string;
  userId: string;
  message: string;
  modelId?: string;
  useRag?: boolean;
}
