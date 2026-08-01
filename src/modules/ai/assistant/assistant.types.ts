export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export enum MessageStatus {
  PENDING = 'pending',
  STREAMING = 'streaming',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface AttachmentMetadata {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  checksum?: string;
  uploadedAt: Date;
}

export interface MessageMetadata {
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  finishReason?: string;
  latencyMs?: number;
  error?: string;
  editedFromId?: string;
  regeneratedFromId?: string;
  customData?: Record<string, unknown>;
}

export interface Message {
  id: string;
  conversationId: string;
  userId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  attachments: AttachmentMetadata[];
  metadata: MessageMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationMetadata {
  workspaceId?: string;
  projectId?: string;
  tags?: string[];
  systemPromptOverride?: string;
  modelOverride?: string;
  temperature?: number;
  pinStatus?: boolean;
  isArchived?: boolean;
}

export interface ConversationSummary {
  summary: string;
  keyPoints: string[];
  lastSummarizedMessageId: string;
  updatedAt: Date;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  summary?: ConversationSummary;
  metadata: ConversationMetadata;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
}

export interface MemoryChunk {
  id: string;
  sourceId: string;
  sourceType: 'conversation' | 'document' | 'user_preference' | 'workspace';
  userId: string;
  workspaceId?: string;
  content: string;
  embedding?: number[];
  score?: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ConversationSearchParams extends PaginationParams {
  query: string;
  userId: string;
  workspaceId?: string;
  archived?: boolean;
}

export interface CreateConversationDto {
  userId: string;
  title?: string;
  metadata?: ConversationMetadata;
  initialMessage?: {
    content: string;
    attachments?: AttachmentMetadata[];
  };
}

export interface UpdateConversationDto {
  title?: string;
  metadata?: Partial<ConversationMetadata>;
}

export interface CreateMessageDto {
  conversationId: string;
  userId: string;
  role: MessageRole;
  content: string;
  attachments?: AttachmentMetadata[];
  metadata?: MessageMetadata;
}

export interface EditMessageDto {
  messageId: string;
  userId: string;
  newContent: string;
}

export interface ChatRequestDto {
  conversationId?: string;
  userId: string;
  workspaceId?: string;
  projectId?: string;
  content: string;
  attachments?: AttachmentMetadata[];
  model?: string;
  temperature?: number;
  systemPrompt?: string;
  stream?: boolean;
}

export interface RegenerateRequestDto {
  conversationId: string;
  userId: string;
  parentMessageId?: string;
  model?: string;
  temperature?: number;
}

export interface SSEEvent {
  event: 'connected' | 'typing' | 'token' | 'metadata' | 'error' | 'heartbeat' | 'done';
  data: Record<string, unknown> | string;
  id?: string;
  retry?: number;
}

export interface AnalyticsSummary {
  totalConversations: number;
  totalMessages: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  avgResponseTimeMs: number;
  activeUsers24h: number;
}

export interface AIProviderAdapter {
  generateCompletion(params: {
    messages: { role: MessageRole; content: string }[];
    model?: string;
    temperature?: number;
    signal?: AbortSignal;
  }): Promise<{ content: string; metadata: MessageMetadata }>;

  streamCompletion(params: {
    messages: { role: MessageRole; content: string }[];
    model?: string;
    temperature?: number;
    signal?: AbortSignal;
    onToken: (token: string) => Promise<void> | void;
  }): Promise<{ content: string; metadata: MessageMetadata }>;
}