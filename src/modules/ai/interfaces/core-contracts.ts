/**
 * AETHER AI — Authoritative Core Contracts & Architectural Boundaries
 *
 * Defines the standard interfaces for the 5 fundamental AETHER subsystems:
 * 1. IModelProvider  — Neural model inference, token streaming, and lifecycle status
 * 2. IRAGProvider    — Document ingestion, chunking, indexing, retrieval, and context building
 * 3. IMemoryProvider — Working memory, conversation history, and persistent user memory
 * 4. IToolProvider   — Controlled tool registry, validation, execution, and state verification
 * 5. ICoreOrchestrator — Central AI orchestrator coordinating all subsystems
 */

import type {
  AIRequest,
  AIResponse,
  Result,
  UserId,
  SessionId,
  ConversationId,
  MessageRole,
  ContextMessage,
  WorkingMemoryContext,
  MemoryItem,
  MemoryId,
} from '../ai-types.js';
import type {
  GenerationRequest,
  StreamingGenerationRequest,
  GenerationResponse,
  LLMStreamingChunk,
} from '../llm/llm-types.js';
import type { ProviderStatus } from '../llm/providers/provider-interface.js';
import type {
  DocumentSource,
} from '../rag/ingestion/document-loader.js';
import type {
  IndexedDocument,
  RetrievalQuery,
  BuiltRAGContext,
} from '../rag/rag-types.js';
import type {
  MemoryWriteRequest,
  MemoryUpdateRequest,
  MemoryQuery,
} from '../memory/memory-types.js';
import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionOptions,
  ToolResult,
  ToolValidationResult,
  ToolVerificationResult,
} from '../tools/tool-types.js';
import type { StreamSubscriber } from '../core/streaming-engine.js';
import type { ProviderManager } from '../llm/provider-manager.js';

// ─── 1. Model Provider Interface ──────────────────────────────────────────────

export interface ModelStatusInfo {
  readonly state: 'NOT_LOADED' | 'LOADING' | 'READY' | 'ERROR' | 'UNAVAILABLE';
  readonly modelName?: string;
  readonly error?: string;
  readonly loadDurationSeconds?: number;
  readonly hasTrainedWeights?: boolean;
}

export interface IModelProvider {
  readonly name: string;
  healthCheck(): Promise<ProviderStatus>;
  getModelStatus?(): Promise<ModelStatusInfo>;
  generate(request: GenerationRequest): Promise<Result<GenerationResponse>>;
  generateStream(
    request: StreamingGenerationRequest,
    onChunk: (chunk: LLMStreamingChunk) => void,
  ): Promise<Result<void>>;
}

// ─── 2. RAG Provider Interface ────────────────────────────────────────────────

export interface IRAGProvider {
  ingest(source: DocumentSource, collectionId?: string): Promise<Result<IndexedDocument>>;
  deleteDocument(documentId: string): Promise<Result<void>>;
  query(query: RetrievalQuery): Promise<Result<BuiltRAGContext>>;
  isEmbeddingAvailable(): Promise<boolean>;
}

// ─── 3. Memory Provider Interface ─────────────────────────────────────────────

export interface IMemoryProvider {
  // Conversation Memory
  addConversationMessage(
    userId: UserId,
    sessionId: SessionId,
    conversationId: ConversationId,
    role: MessageRole,
    content: string,
  ): ContextMessage;

  getConversationHistory(
    userId: UserId,
    sessionId: SessionId,
    conversationId: ConversationId,
    maxTokens?: number,
  ): readonly ContextMessage[];

  clearConversation(userId: UserId, sessionId: SessionId, conversationId: ConversationId): void;

  // Working Memory
  setWorkingMemory(
    userId: UserId,
    sessionId: SessionId,
    key: string,
    value: string,
    ttlMs?: number,
  ): void;

  getWorkingMemory(userId: UserId, sessionId: SessionId, key: string): string | undefined;

  getWorkingMemoryContext(userId: UserId, sessionId: SessionId): WorkingMemoryContext;

  clearWorkingMemory(userId: UserId, sessionId: SessionId): void;

  // Persistent Long-Term Memory (PostgreSQL / AIMemory)
  createMemory(request: MemoryWriteRequest): Promise<Result<MemoryItem>>;
  updateMemory(request: MemoryUpdateRequest): Promise<Result<MemoryItem>>;
  deleteMemory(id: MemoryId, userId: UserId): Promise<Result<void>>;
  searchMemory(query: MemoryQuery): Promise<Result<readonly MemoryItem[]>>;
  getAllMemory(userId: UserId): Promise<Result<readonly MemoryItem[]>>;
  getMemoryById(id: MemoryId, userId: UserId): Promise<Result<MemoryItem>>;
  forgetMemoryByContent(userId: UserId, contentQuery: string): Promise<Result<number>>;

  // User Cleanup
  clearUserData(userId: UserId): Promise<void>;
}

// ─── 4. Tool Provider Interface ───────────────────────────────────────────────

export interface IToolProvider {
  execute<TOutput = unknown>(
    toolName: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
    options?: ToolExecutionOptions,
  ): Promise<ToolResult<TOutput>>;

  listTools?(): readonly ToolDefinition[];
  getTool?(toolName: string): ToolDefinition | undefined;
  validateAction?(
    toolName: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): ToolValidationResult;
  verifyAction?(
    toolName: string,
    result: ToolResult,
    context: ToolExecutionContext,
  ): Promise<ToolVerificationResult>;
  clearIdempotencyCache(): void;
}

// ─── 5. Core Orchestrator Interface ───────────────────────────────────────────

export interface ICoreOrchestrator {
  process(request: AIRequest): Promise<Result<AIResponse>>;
  processStream(request: AIRequest, subscriber: StreamSubscriber): Promise<Result<void>>;
  getProviderManager(): ProviderManager;
}
