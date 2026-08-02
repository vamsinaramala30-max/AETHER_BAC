export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: Date;
  tokenCount?: number;
}

export interface ConversationEntity {
  id: string;
  userId: string;
  workspaceId?: string;
  title: string;
  messages: ConversationMessage[];
  isPinned: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}
