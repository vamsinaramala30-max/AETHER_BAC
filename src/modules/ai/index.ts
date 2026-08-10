/**
 * AETHER AI — Module Index
 * Public exports for the AETHER AI module (Part 1 & Part 2).
 */

// ─── Shared Types ─────────────────────────────────────────────────────────────

export type {
  // Identifiers
  UserId,
  SessionId,
  MessageId,
  ConversationId,
  ModelId,
  DocumentId,
  MemoryId,
  EmbeddingId,
  ChunkId,
  // Requests/Responses
  AIRequest,
  AIRequestOptions,
  AIResponse,
  AIResponseStatus,
  // Streaming
  StreamingChunk,
  StreamingStatus,
  // Intent
  Intent,
  IntentType,
  Entity,
  // Reasoning
  ReasoningStatus,
  ReasoningTrace,
  // Safety
  SafetyResult,
  SafetySeverity,
  // Context
  AIContext,
  ContextMessage,
  MessageRole,
  RAGContext,
  WorkingMemoryContext,
  WorkingMemoryItem,
  // Documents
  Attachment,
  AttachmentType,
  RetrievedDocument,
  Citation,
  DocumentMetadata,
  // Memory
  MemoryItem,
  MemoryType,
  MemoryMetadata,
  // Tokens
  TokenUsage,
  TokenBudget,
  // Prompts
  PromptTemplate,
  PromptType,
  BuiltPrompt,
  PromptMessage,
  // Errors
  Result,
  AIErrorCode,
  AIError,
} from './ai-types.js';

export { makeError, ok, fail } from './ai-types.js';

// ─── Configuration ────────────────────────────────────────────────────────────

export type {
  AIConfig,
  LLMRuntimeConfig,
  OllamaRuntimeConfig,
  LlamaCppRuntimeConfig,
  NoRuntimeConfig,
  ModelConfig,
  EmbeddingConfig,
  RAGConfig,
  MemoryConfig,
  SafetyConfig,
  StreamingConfig,
  ConfigValidationResult,
} from './ai-config.js';

export {
  buildDefaultAIConfig,
  validateAIConfig,
} from './ai-config.js';

// ─── Constants ────────────────────────────────────────────────────────────────

export {
  AETHER_AI_VERSION,
  AETHER_AI_MODULE,
  TOKEN_LIMITS,
  CHUNKING,
  RETRIEVAL,
  MEMORY,
  SAFETY,
  TIMEOUTS,
  STREAMING,
  INTENT,
  REASONING,
  EMBEDDING,
} from './ai-constants.js';

// ─── Errors ───────────────────────────────────────────────────────────────────

export {
  AetherAIError,
  ModelUnavailableError,
  ModelLoadFailedError,
  GenerationFailedError,
  StreamFailedError,
  RuntimeUnavailableError,
  InvalidRequestError,
  UnauthorizedError,
  ForbiddenError,
  ContextTooLargeError,
  RAGFailedError,
  EmbeddingFailedError,
  IndexingFailedError,
  RetrievalFailedError,
  MemoryFailedError,
  SafetyCheckFailedError,
  TimeoutError,
  CancelledError,
  NotConfiguredError,
  InternalError,
  IntentFailedError,
  PromptBuildFailedError,
  isAetherAIError,
  toAetherAIError,
} from './ai-errors.js';

// ─── Core ─────────────────────────────────────────────────────────────────────

export type { IAIEngine } from './core/ai-engine.js';
export { AIEngine } from './core/ai-engine.js';

export type { IAIOrchestrator } from './core/ai-orchestrator.js';
export { AIOrchestrator } from './core/ai-orchestrator.js';

export type { IIntentEngine } from './core/intent-engine.js';
export { HeuristicIntentEngine } from './core/intent-engine.js';

export type { IContextEngine } from './core/context-engine.js';
export { ContextEngine } from './core/context-engine.js';

export type { IReasoningEngine } from './core/reasoning-engine.js';
export { ReasoningEngine } from './core/reasoning-engine.js';

export type { ISafetyEngine } from './core/safety-engine.js';
export { SafetyEngine } from './core/safety-engine.js';

export type { IResponseEngine } from './core/response-engine.js';
export { ResponseEngine } from './core/response-engine.js';

export type { IStreamingEngine, StreamHandle, StreamSubscriber } from './core/streaming-engine.js';
export { StreamingEngine } from './core/streaming-engine.js';

// ─── LLM ─────────────────────────────────────────────────────────────────────

export type { ILLMEngine } from './llm/llm-engine.js';
export { LLMEngine } from './llm/llm-engine.js';

export type { IModelManager as ILLMModelManager } from './llm/model-manager.js';
export { ModelManager as LLMModelManager } from './llm/model-manager.js';

export type { IModelRegistry } from './llm/model-registry.js';
export { InMemoryModelRegistry } from './llm/model-registry.js';

export type { IModelLoader } from './llm/model-loader.js';
export { ModelLoader } from './llm/model-loader.js';

export type { IModelRuntime } from './llm/model-runtime.js';
export {
  OllamaRuntime,
  LlamaCppRuntime,
  NoOpRuntime,
  createModelRuntime,
} from './llm/model-runtime.js';

export type { ITokenizer } from './llm/tokenizer.js';
export { EstimatedTokenizer, defaultTokenizer } from './llm/tokenizer.js';

export type { IGeneration, GenerationOptions } from './llm/generation.js';
export { Generation } from './llm/generation.js';

export type {
  ModelInfo,
  ModelStatus,
  ModelStatusCode,
  RuntimeStatus,
  RuntimeStatusCode,
  GenerationRequest,
  StreamingGenerationRequest,
  GenerationResponse,
  LLMStreamingChunk,
  LLMMessage,
  FinishReason,
  TokenizerResult,
  RuntimeCapabilities,
} from './llm/llm-types.js';

// ─── RAG ─────────────────────────────────────────────────────────────────────

export type { IRAGEngine } from './rag/rag-engine.js';
export { RAGEngine } from './rag/rag-engine.js';

export type { IEmbeddingEngine } from './rag/embeddings/embedding-engine.js';
export {
  EmbeddingEngine,
  UnavailableEmbeddingEngine,
  cosineSimilarity,
} from './rag/embeddings/embedding-engine.js';

export type { IEmbeddingModel } from './rag/embeddings/embedding-model.js';
export {
  OllamaEmbeddingModel,
  LlamaCppEmbeddingModel,
  createEmbeddingModel,
} from './rag/embeddings/embedding-model.js';

export { EmbeddingCache } from './rag/embeddings/embedding-cache.js';

export type { IDocumentLoader, DocumentSource } from './rag/ingestion/document-loader.js';
export { DocumentLoader } from './rag/ingestion/document-loader.js';

export type { IDocumentParser } from './rag/ingestion/document-parser.js';
export { DocumentParser } from './rag/ingestion/document-parser.js';

export type { IDocumentCleaner } from './rag/ingestion/document-cleaner.js';
export { DocumentCleaner } from './rag/ingestion/document-cleaner.js';

export type { IDocumentChunker, ChunkingOptions } from './rag/ingestion/document-chunker.js';
export { DocumentChunker } from './rag/ingestion/document-chunker.js';

export type { IDocumentIndexer } from './rag/ingestion/document-indexer.js';
export { DocumentIndexer } from './rag/ingestion/document-indexer.js';

export type { IRetriever } from './rag/retrieval/retriever.js';
export { Retriever } from './rag/retrieval/retriever.js';

export { InMemoryVectorStore } from './rag/retrieval/vector-search.js';
export { InMemoryKeywordIndex } from './rag/retrieval/keyword-search.js';
export { HybridSearch } from './rag/retrieval/hybrid-search.js';

export type { IReranker } from './rag/retrieval/reranker.js';
export { HeuristicReranker, PassThroughReranker } from './rag/retrieval/reranker.js';

export type { IContextBuilder } from './rag/context/context-builder.js';
export { ContextBuilder } from './rag/context/context-builder.js';

export type { IContextCompressor } from './rag/context/context-compressor.js';
export { ExtractiveContextCompressor } from './rag/context/context-compressor.js';

export type { ICitationBuilder } from './rag/context/citation-builder.js';
export { CitationBuilder } from './rag/context/citation-builder.js';

export type {
  RawDocument,
  ParsedDocument,
  CleanedDocument,
  DocumentChunk,
  IndexedDocument,
  VectorSearchResult,
  KeywordSearchResult,
  HybridSearchResult,
  RetrievalQuery,
  RetrievalFilters,
  RerankRequest,
  RerankResult,
  BuiltRAGContext,
  IngestionStatus,
  IngestionProgress,
  IVectorStore,
  IKeywordIndex,
  IChunkStore,
} from './rag/rag-types.js';

// ─── Memory ───────────────────────────────────────────────────────────────────

export type { IMemoryEngine } from './memory/memory-engine.js';
export { MemoryEngine } from './memory/memory-engine.js';

export type { IConversationMemory } from './memory/conversation-memory.js';
export { ConversationMemory } from './memory/conversation-memory.js';

export type { IWorkingMemory } from './memory/working-memory.js';
export { WorkingMemory } from './memory/working-memory.js';

export { InMemoryLongTermStore } from './memory/long-term-memory.js';

export type { IMemoryWriter } from './memory/memory-writer.js';
export { MemoryWriter } from './memory/memory-writer.js';

export type { IMemoryRetriever } from './memory/memory-retriever.js';
export { MemoryRetriever } from './memory/memory-retriever.js';

export type { IMemorySummarizer, SummarizationResult } from './memory/memory-summarizer.js';
export { MemorySummarizer } from './memory/memory-summarizer.js';

export type {
  MemoryQuery,
  MemoryWriteRequest,
  MemoryUpdateRequest,
  MemoryDeleteRequest,
  MemorySearchResult,
  IMemoryStore,
} from './memory/memory-types.js';

// ─── Prompts ──────────────────────────────────────────────────────────────────

export type { IPromptEngine, PromptEngineOptions } from './prompts/prompt-engine.js';
export { PromptEngine } from './prompts/prompt-engine.js';

export type { IPromptBuilder, PromptBuildOptions } from './prompts/prompt-builder.js';
export { PromptBuilder } from './prompts/prompt-builder.js';

export {
  AETHER_BASE_SYSTEM_PROMPT,
  AETHER_SAFETY_SYSTEM_PROMPT,
  AETHER_RAG_SYSTEM_INSTRUCTION,
  AETHER_MEMORY_SYSTEM_INSTRUCTION,
  AETHER_NO_KNOWLEDGE_INSTRUCTION,
  buildSystemPrompt,
} from './prompts/system-prompts.js';

export {
  buildRAGContextBlock,
  buildRAGQueryPrompt,
  RAG_CITATION_INSTRUCTION,
  buildNoRAGResultsPrompt,
} from './prompts/rag-prompts.js';

export {
  REASONING_STATUS_LABELS,
  CHAIN_OF_THOUGHT_INSTRUCTION,
  buildIntentClassificationPrompt,
  isSafeReasoningStatus,
} from './prompts/reasoning-prompts.js';

export {
  AGENT_BASE_SYSTEM_PROMPT,
  buildTaskPlanningPrompt,
  buildStepExecutionPrompt,
  buildAgentCompletionPrompt,
} from './prompts/agent-prompts.js';

// ─── Tools (Part 2) ───────────────────────────────────────────────────────────

export type {
  ToolDefinition,
  ToolDescriptor,
  ToolInputSchema,
  ToolResult,
  ToolExecutionContext,
  AuthenticationContext,
} from './tools/tool-types.js';
export { ToolRegistry, toolRegistry } from './tools/tool-registry.js';
export { ToolRouter, toolRouter } from './tools/tool-router.js';
export { ToolExecutor, toolExecutor } from './tools/tool-executor.js';
export { ToolValidator, toolValidator } from './tools/tool-validator.js';
export { ToolPermissions, toolPermissions } from './tools/tool-permissions.js';

// ─── Agents (Part 2) ──────────────────────────────────────────────────────────

export type {
  AgentConfig,
  AgentStatus,
  ExecutionPlan,
  PlanStep,
  AgentObservation,
  AgentRunResult,
} from './agents/agent-types.js';
export { AgentEngine } from './agents/agent-engine.js';
export { AgentRegistry, agentRegistry } from './agents/agent-registry.js';
export { AgentPlanner, agentPlanner } from './agents/planner.js';
export { AgentStepExecutor } from './agents/executor.js';
export { AgentExecutionLoop } from './agents/agent-loop.js';
export { AgentShortTermMemory } from './agents/agent-memory.js';
export { AgentStateTracker } from './agents/agent-state.js';

// ─── Conversations (Part 2) ───────────────────────────────────────────────────

export type {
  Conversation,
  ConversationMessage,
  Role,
} from './conversations/conversation-types.js';
export { ConversationService, conversationService } from './conversations/conversation-service.js';
export { ConversationManager, conversationManager } from './conversations/conversation-manager.js';
export { MessageService, messageService } from './conversations/message-service.js';
export { HistoryManager, historyManager } from './conversations/history-manager.js';

// ─── Knowledge (Part 2) ───────────────────────────────────────────────────────

export type {
  KnowledgeCollection,
  KnowledgeDocument,
  KnowledgeSearchResult,
} from './knowledge/knowledge-types.js';
export { KnowledgeService, knowledgeService } from './knowledge/knowledge-service.js';
export { KnowledgeManager, knowledgeManager } from './knowledge/knowledge-manager.js';
export { DocumentService, documentService } from './knowledge/document-service.js';

// ─── Models (Part 2) ──────────────────────────────────────────────────────────

export type {
  ModelMetadata,
  ModelHealthReport,
} from './models/model-types.js';
export { ModelService, modelService } from './models/model-service.js';
export { ModelManager as ModelServiceManager, modelManager as modelServiceManager } from './models/model-manager.js';
export { ModelStorage, modelStorage } from './models/model-storage.js';
export { ModelHealthChecker, modelHealthChecker } from './models/model-health.js';

// ─── Storage (Part 2) ─────────────────────────────────────────────────────────

export { globalDatabase, InMemoryDatabase } from './storage/database.js';
export { globalVectorDatabase, InMemoryVectorDatabase } from './storage/vector-database.js';
export { globalCache, InMemoryCache } from './storage/cache.js';
export { conversationRepository } from './storage/repositories/conversation-repository.js';
export { messageRepository } from './storage/repositories/message-repository.js';
export { memoryRepository } from './storage/repositories/memory-repository.js';
export { documentRepository } from './storage/repositories/document-repository.js';
export { embeddingRepository } from './storage/repositories/embedding-repository.js';
export { modelRepository } from './storage/repositories/model-repository.js';
export { agentRepository } from './storage/repositories/agent-repository.js';

// ─── API (Part 2) ─────────────────────────────────────────────────────────────

export { aiController } from './api/controllers/ai-controller.js';
export { chatController } from './api/controllers/chat-controller.js';
export { conversationController } from './api/controllers/conversation-controller.js';
export { memoryController } from './api/controllers/memory-controller.js';
export { knowledgeController } from './api/controllers/knowledge-controller.js';
export { modelController } from './api/controllers/model-controller.js';
export { agentController } from './api/controllers/agent-controller.js';
export { authProvider } from './api/middleware/auth.js';
export { validateInput } from './api/middleware/validation.js';
export { rateLimiter } from './api/middleware/rate-limit.js';
export { handleAPIError } from './api/middleware/error-handler.js';

// ─── Workers (Part 2) ─────────────────────────────────────────────────────────

export { documentWorker, DocumentWorker } from './workers/document-worker.js';
export { embeddingWorker, EmbeddingWorker } from './workers/embedding-worker.js';
export { memoryWorker, MemoryWorker } from './workers/memory-worker.js';
export { modelWorker, ModelWorker } from './workers/model-worker.js';
export { agentWorker, AgentWorker } from './workers/agent-worker.js';

// ─── Observability (Part 2) ───────────────────────────────────────────────────

export { logger, Logger } from './observability/logger.js';
export { metrics, MetricsRegistry } from './observability/metrics.js';
export { tracer, Tracer } from './observability/tracing.js';
export { healthChecker, HealthChecker } from './observability/health.js';

// ─── Module Export ────────────────────────────────────────────────────────────

export { AiModule, AiExpressController, ModelsExpressController } from './ai.module.js';

