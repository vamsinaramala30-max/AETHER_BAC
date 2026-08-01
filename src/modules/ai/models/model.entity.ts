export interface ModelCapability {
  streaming: boolean;
  toolCalling: boolean;
  vision: boolean;
  embeddings: boolean;
  maxContextTokens: number;
}

export interface ModelEntity {
  id: string;
  name: string;
  providerId: string;
  costPer1kPromptTokens: number;
  costPer1kCompletionTokens: number;
  capabilities: ModelCapability;
  isActive: boolean;
  createdAt: Date;
}