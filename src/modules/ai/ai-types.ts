/**
 * AETHER AI — Shared AI Types
 * Central type definitions for the entire AI module.
 * All sub-systems reference these types.
 */

// ─── Identifiers ─────────────────────────────────────────────────────────────

export type UserId = string;
export type SessionId = string;
export type MessageId = string;
export type ConversationId = string;
export type ModelId = string;
export type DocumentId = string;
export type MemoryId = string;
export type EmbeddingId = string;
export type ChunkId = string;

// ─── AI Request / Response ────────────────────────────────────────────────────

export interface AIRequest {
  readonly requestId: string;
  readonly userId: UserId;
  readonly sessionId: SessionId;
  readonly conversationId: ConversationId;
  readonly message: string;
  readonly attachments?: readonly Attachment[];
  readonly options?: AIRequestOptions;
  readonly signal?: AbortSignal;
  readonly timestamp: number;
}

export interface AIRequestOptions {
  readonly streaming?: boolean;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly topP?: number;
  readonly timeout?: number;
  readonly modelId?: ModelId;
  readonly providerMode?: 'auto' | 'gemini' | 'openai' | 'ollama';
  readonly enableMemory?: boolean;
  readonly enableRAG?: boolean;
  readonly ragCollectionIds?: readonly string[];
}

export interface AIResponse {
  readonly requestId: string;
  readonly userId: UserId;
  readonly sessionId: SessionId;
  readonly conversationId: ConversationId;
  readonly message: string;
  readonly reasoning?: ReasoningStatus;
  readonly citations?: readonly Citation[];
  readonly memoryIds?: readonly MemoryId[];
  readonly intent: Intent;
  readonly status: AIResponseStatus;
  readonly confidence?: ConfidenceLevel;
  readonly confirmationRequest?: ConfirmationRequest;
  readonly activeProvider?: string;
  readonly usedFallback?: boolean;
  readonly fallbackReason?: string;
  readonly usage?: TokenUsage;
  readonly latencyMs: number;
  readonly timestamp: number;
}

export type AIResponseStatus =
  | 'success'
  | 'partial'
  | 'model_unavailable'
  | 'generation_failed'
  | 'safety_blocked'
  | 'context_too_large'
  | 'timeout'
  | 'cancelled'
  | 'internal_error'
  | 'clarification_required'
  | 'confirmation_required'
  | 'insufficient_information'
  | 'unsupported'
  | 'permission_denied'
  | 'action_completed'
  | 'action_failed';

// ─── Confidence ───────────────────────────────────────────────────────────────

export type ConfidenceLevel =
  | 'HIGH_CONFIDENCE'
  | 'MEDIUM_CONFIDENCE'
  | 'LOW_CONFIDENCE'
  | 'INSUFFICIENT_INFORMATION';

export interface ConfidenceAssessment {
  readonly level: ConfidenceLevel;
  readonly score: number;
  readonly reasoning: string;
}

// ─── Confirmation Request ────────────────────────────────────────────────────

export interface ConfirmationRequest {
  readonly actionId: string;
  readonly toolName: string;
  readonly description: string;
  readonly riskLevel: 'READ' | 'LOW_RISK_WRITE' | 'HIGH_RISK_WRITE' | 'DESTRUCTIVE';
  readonly args: Record<string, unknown>;
}

// ─── Streaming ────────────────────────────────────────────────────────────────

export interface StreamingChunk {
  readonly requestId: string;
  readonly delta: string;
  readonly index: number;
  readonly isLast: boolean;
  readonly status: StreamingStatus;
  readonly timestamp: number;
}

export type StreamingStatus =
  | 'streaming'
  | 'completed'
  | 'cancelled'
  | 'failed';

// ─── Intent ───────────────────────────────────────────────────────────────────

export type IntentType =
  | 'NORMAL_RESPONSE'
  | 'RAG_REQUIRED'
  | 'MEMORY_REQUIRED'
  | 'TOOL_REQUIRED'
  | 'AGENT_REQUIRED'
  | 'AETHER_PRODUCT_QUESTION'
  | 'USER_DATA_QUESTION'
  | 'KNOWLEDGE_QUESTION'
  | 'AUTOMATION_REQUEST'
  | 'PROJECT_WORKSPACE_TASK'
  | 'GENERAL_REASONING'
  | 'WRITING'
  | 'CODING_TECHNICAL'
  | 'ANALYTICAL'
  | 'AMBIGUOUS'
  | 'UNSUPPORTED';

export interface Intent {
  readonly type: IntentType;
  readonly confidence: number;
  readonly reasoning?: string;
  readonly requiresRAG: boolean;
  readonly requiresMemory: boolean;
  readonly requiresTool: boolean;
  readonly requiresAgent: boolean;
  readonly entities?: readonly Entity[];
}

export interface Entity {
  readonly type: string;
  readonly value: string;
  readonly confidence: number;
}

// ─── Reasoning ───────────────────────────────────────────────────────────────

export type ReasoningStatus =
  | 'thinking'
  | 'retrieving'
  | 'generating'
  | 'planning'
  | 'completed'
  | 'failed';

export interface ReasoningTrace {
  readonly status: ReasoningStatus;
  readonly step: number;
  readonly description: string;
  readonly timestamp: number;
}

// ─── Safety ───────────────────────────────────────────────────────────────────

export interface SafetyResult {
  readonly safe: boolean;
  readonly blocked: boolean;
  readonly reasons?: readonly string[];
  readonly severity?: SafetySeverity;
}

export type SafetySeverity = 'low' | 'medium' | 'high' | 'critical';

// ─── Context ──────────────────────────────────────────────────────────────────

export interface AIContext {
  readonly userId: UserId;
  readonly sessionId: SessionId;
  readonly conversationId: ConversationId;
  readonly conversationHistory?: readonly ContextMessage[];
  readonly ragContext?: RAGContext;
  readonly workingMemory?: WorkingMemoryContext;
  readonly longTermMemory?: readonly MemoryItem[];
  readonly systemInstructions?: string;
  readonly tokenBudget: TokenBudget;
}

export interface ContextMessage {
  readonly role: MessageRole;
  readonly content: string;
  readonly timestamp: number;
  readonly messageId: MessageId;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface RAGContext {
  readonly documents: readonly RetrievedDocument[];
  readonly totalRetrieved: number;
  readonly searchQuery: string;
}

export interface WorkingMemoryContext {
  readonly items: readonly WorkingMemoryItem[];
  readonly sessionId: SessionId;
}

export interface WorkingMemoryItem {
  readonly key: string;
  readonly value: string;
  readonly updatedAt: number;
}

// ─── Attachments ──────────────────────────────────────────────────────────────

export interface Attachment {
  readonly id: string;
  readonly type: AttachmentType;
  readonly name: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly content?: Buffer;
  readonly url?: string;
}

export type AttachmentType = 'document' | 'image' | 'audio' | 'video' | 'data';

// ─── Documents / RAG ─────────────────────────────────────────────────────────

export interface RetrievedDocument {
  readonly documentId: DocumentId;
  readonly chunkId: ChunkId;
  readonly content: string;
  readonly score: number;
  readonly metadata: DocumentMetadata;
  readonly citation: Citation;
}

export interface Citation {
  readonly id: string;
  readonly documentId: DocumentId;
  readonly chunkId: ChunkId;
  readonly title: string;
  readonly source: string;
  readonly pageNumber?: number;
  readonly excerpt: string;
  readonly relevanceScore: number;
}

export interface DocumentMetadata {
  readonly title?: string;
  readonly source?: string;
  readonly author?: string;
  readonly createdAt?: number;
  readonly pageNumber?: number;
  readonly collectionId?: string;
  readonly tags?: readonly string[];
  readonly [key: string]: unknown;
}

// ─── Memory ───────────────────────────────────────────────────────────────────

export interface MemoryItem {
  readonly id: MemoryId;
  readonly userId: UserId;
  readonly type: MemoryType;
  readonly content: string;
  readonly embedding?: readonly number[];
  readonly importance: number;
  readonly accessCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly expiresAt?: number;
  readonly metadata?: MemoryMetadata;
}

export type MemoryType =
  | 'conversation'
  | 'fact'
  | 'preference'
  | 'summary'
  | 'working';

export interface MemoryMetadata {
  readonly conversationId?: ConversationId;
  readonly sessionId?: SessionId;
  readonly source?: string;
  readonly tags?: readonly string[];
  readonly [key: string]: unknown;
}

// ─── Token Usage ──────────────────────────────────────────────────────────────

export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface TokenBudget {
  readonly total: number;
  readonly system: number;
  readonly history: number;
  readonly context: number;
  readonly response: number;
  readonly remaining: number;
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

export interface PromptTemplate {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly template: string;
  readonly variables: readonly string[];
  readonly type: PromptType;
}

export type PromptType =
  | 'system'
  | 'rag'
  | 'reasoning'
  | 'agent'
  | 'safety'
  | 'summarization'
  | 'classification';

export interface BuiltPrompt {
  readonly system: string;
  readonly messages: readonly PromptMessage[];
  readonly estimatedTokens: number;
}

export interface PromptMessage {
  readonly role: MessageRole;
  readonly content: string;
}

// ─── Result Type ──────────────────────────────────────────────────────────────

export type Result<T, E extends AIErrorCode = AIErrorCode> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AIError<E> };

export type AIErrorCode =
  | 'MODEL_UNAVAILABLE'
  | 'MODEL_LOAD_FAILED'
  | 'GENERATION_FAILED'
  | 'STREAM_FAILED'
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONTEXT_TOO_LARGE'
  | 'RAG_FAILED'
  | 'MEMORY_FAILED'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'INTERNAL_ERROR'
  | 'EMBEDDING_FAILED'
  | 'INDEXING_FAILED'
  | 'RETRIEVAL_FAILED'
  | 'SAFETY_CHECK_FAILED'
  | 'INTENT_FAILED'
  | 'PROMPT_BUILD_FAILED'
  | 'RUNTIME_UNAVAILABLE'
  | 'NOT_CONFIGURED'
  | 'RATE_LIMIT'
  | 'QUOTA_EXCEEDED'
  | 'AUTH_ERROR'
  | 'NETWORK_ERROR'
  | 'PROVIDER_UNAVAILABLE'
  | 'MODEL_ERROR'
  | 'STREAM_ERROR'
  | 'UNKNOWN_ERROR';

export interface AIError<E extends AIErrorCode = AIErrorCode> {
  readonly code: E;
  readonly message: string;
  readonly details?: unknown;
  readonly retryable: boolean;
  readonly timestamp: number;
}

export function makeError<E extends AIErrorCode>(
  code: E,
  message: string,
  details?: unknown,
  retryable = false,
): AIError<E> {
  return { code, message, details, retryable, timestamp: Date.now() };
}

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<E extends AIErrorCode>(error: AIError<E>): Result<never, E> {
  return { ok: false, error };
}
