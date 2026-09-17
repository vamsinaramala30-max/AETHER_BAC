/**
 * AETHER AI — Shared AI Types
 * Central type definitions for the entire AI module.
 * All sub-systems reference these types.
 */

import type { ActionPlan, AgentPlan } from './planning/planning-types.js';
import type { AuthenticationContext } from './tools/tool-types.js';

export type { AuthenticationContext };

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
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly scope?: MemoryScope;
  readonly message: string;
  readonly attachments?: readonly Attachment[];
  readonly options?: AIRequestOptions;
  readonly signal?: AbortSignal;
  readonly auth?: AuthenticationContext;
  readonly timestamp: number;
}

export interface AIRequestOptions {
  readonly streaming?: boolean;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly topP?: number;
  readonly timeout?: number;
  readonly modelId?: ModelId;
  readonly providerMode?: 'auto' | 'aether' | 'gemini' | 'openai' | 'ollama';
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
  readonly plan?: ActionPlan;
  readonly agentPlan?: AgentPlan;
  readonly task?: AgentTask;
  readonly assessment?: ReasoningAssessment;
  readonly verificationStatus?: VerificationStatus;
  readonly evidence?: readonly EvidenceItem[];
  readonly multiConfidence?: MultiDimensionalConfidence;
  readonly turnPayload?: StructuredConversationTurnPayload;
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
  | 'ready'
  | 'handed_off'
  | 'blocked'
  | 'clarification_required'
  | 'confirmation_required'
  | 'insufficient_information'
  | 'unsupported'
  | 'permission_denied'
  | 'action_completed'
  | 'action_failed'
  | 'internal_error';

// ─── Verification & Reliability (Prompt 25) ──────────────────────────────────

export type VerificationStatus =
  | 'UNVERIFIED'
  | 'PENDING'
  | 'VERIFIED'
  | 'FAILED'
  | 'PARTIALLY_VERIFIED'
  | 'NOT_VERIFIABLE';

export type VerificationType =
  | 'TOOL_ACTION'
  | 'KNOWLEDGE_EVIDENCE'
  | 'STATE_CHANGE'
  | 'OUTPUT_INTEGRITY';

export type EvidenceSourceType =
  | 'user_input'
  | 'conversation_context'
  | 'approved_memory'
  | 'retrieved_knowledge'
  | 'tool_result'
  | 'model_knowledge';

export interface EvidenceItem {
  readonly sourceType: EvidenceSourceType;
  readonly sourceId?: string;
  readonly content: string;
  readonly relevance: number;
  readonly verified: boolean;
  readonly verificationStatus?: VerificationStatus;
  readonly metadata?: Record<string, unknown>;
}

export interface ExecutionReliabilityState {
  readonly plan?: ActionPlan;
  readonly toolResults?: readonly unknown[];
  readonly evidence?: readonly EvidenceItem[];
  readonly verificationStatus: VerificationStatus;
  readonly errors?: readonly string[];
  readonly toolExecuted: boolean;
  readonly toolSuccess: boolean;
  readonly verifiedStepsCount: number;
  readonly totalStepsCount: number;
}

// ─── Confidence ───────────────────────────────────────────────────────────────

export type ConfidenceLevel =
  'HIGH_CONFIDENCE' | 'MEDIUM_CONFIDENCE' | 'LOW_CONFIDENCE' | 'INSUFFICIENT_INFORMATION';

export interface ConfidenceAssessment {
  readonly level: ConfidenceLevel;
  readonly score: number;
  readonly reasoning: string;
  readonly verificationStatus?: VerificationStatus;
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

export type StreamingStatus = 'streaming' | 'completed' | 'cancelled' | 'failed';

// ─── Intent ───────────────────────────────────────────────────────────────────

export type IntentType =
  // ─── Phase 14 Core Taxonomy (20 Standard Intents) ───────────────────────────
  | 'GREETING'
  | 'GENERAL_QUESTION'
  | 'INFORMATION_REQUEST'
  | 'TASK_MANAGEMENT'
  | 'TASK_CREATION'
  | 'TASK_PRIORITIZATION'
  | 'WEEKLY_PLANNING'
  | 'PROJECT_PLANNING'
  | 'PROJECT_MANAGEMENT'
  | 'PRODUCTIVITY'
  | 'EXPLANATION'
  | 'SUMMARIZATION'
  | 'MEMORY_STORE'
  | 'MEMORY_RECALL'
  | 'MEMORY_FORGET'
  | 'KNOWLEDGE_REQUEST'
  | 'TOOL_REQUEST'
  | 'RAG_REQUEST'
  | 'FOLLOW_UP'
  | 'CLARIFICATION'
  | 'UNKNOWN'
  // ─── Backward-Compatible Intent Aliases & Extensions ───────────────────────
  | 'CONVERSATION'
  | 'QUESTION'
  | 'KNOWLEDGE_SEARCH'
  | 'REASONING'
  | 'PLANNING'
  | 'TASK_EXECUTION'
  | 'AUTOMATION'
  | 'CODING'
  | 'RESEARCH_LOOKUP'
  | 'WRITING_CREATION'
  | 'ANALYSIS'
  | 'PLANNING_DECISION'
  | 'TASK_ACTION'
  | 'WORKSPACE_PROJECT'
  | 'MEMORY_REQUEST'
  | 'AUTOMATION_REQUEST'
  | 'CONVERSATIONAL'
  | 'CLARIFICATION_REQUIRED'
  | 'UNSUPPORTED'
  | 'NORMAL_RESPONSE'
  | 'RAG_REQUIRED'
  | 'MEMORY_REQUIRED'
  | 'TOOL_REQUIRED'
  | 'AGENT_REQUIRED'
  | 'AETHER_PRODUCT_QUESTION'
  | 'USER_DATA_QUESTION'
  | 'KNOWLEDGE_QUESTION'
  | 'PROJECT_WORKSPACE_TASK'
  | 'GENERAL_REASONING'
  | 'WRITING'
  | 'CODING_TECHNICAL'
  | 'ANALYTICAL'
  | 'AMBIGUOUS';

// ─── Phase 14 Conversation State & Turns ──────────────────────────────────────

export type ConversationState =
  | 'IDLE'
  | 'ACTIVE_CONVERSATION'
  | 'ACTIVE_PLANNING'
  | 'AWAITING_CLARIFICATION'
  | 'EXECUTING_TASKS'
  | 'FOLLOW_UP';

export interface ConversationTurn {
  readonly turnId: string;
  readonly conversationId: string;
  readonly turnNumber: number;
  readonly userMessage: string;
  readonly role?: 'user' | 'assistant';
  readonly assistantMessage?: string;
  readonly assistantResponse?: string;
  readonly intent: Intent;
  readonly goal?: string | null;
  readonly state: ConversationState;
  readonly entities: readonly Entity[];
  readonly contextSummary?: Record<string, unknown>;
  readonly timestamp: number;
}

export interface StructuredConversationTurnPayload {
  readonly conversation_id: string;
  readonly turn_id: string;
  readonly turnId?: string;
  readonly user_message: string;
  readonly conversation_history: Array<{ role: string; content: string; turn_id?: string }>;
  readonly current_goal: string | null;
  readonly userGoal?: string | null;
  readonly state?: ConversationState;
  readonly intent: string;
  readonly entities: Record<string, unknown>;
  readonly context: Record<string, unknown>;
  readonly requires_clarification: boolean;
  readonly clarification_question: string | null;
}

// ─── Phase 14 Multi-Dimensional Confidence ───────────────────────────────────

export interface MultiDimensionalConfidence {
  readonly intentConfidence: number;
  readonly contextConfidence: number;
  readonly knowledgeConfidence: number;
  readonly generationConfidence: number;
  readonly overallConfidence: number;
  readonly overallLevel: ConfidenceLevel;
  readonly reasoning: string;
}

export type AgentTaskType =
  | 'SIMPLE'
  | 'CONTEXTUAL'
  | 'MULTI_STEP'
  | 'TOOL_REQUIRED'
  | 'LONG_RUNNING';

export interface RequiredContext {
  readonly conversation: boolean;
  readonly memory: boolean;
  readonly rag: boolean;
  readonly project: boolean;
  readonly workspace: boolean;
  readonly tools: boolean;
  readonly system: boolean;
}

export interface Intent {
  readonly type: IntentType;
  readonly primaryIntent?: IntentType;
  readonly secondaryIntent?: IntentType;
  readonly confidence: number;
  readonly confidenceLevel?: ConfidenceLevel;
  readonly reasoning?: string;
  readonly requiresRAG: boolean;
  readonly requiresMemory: boolean;
  readonly requiresTool: boolean;
  readonly requiresAgent: boolean;
  readonly requiredContext?: RequiredContext;
  readonly requestedAction?: string;
  readonly requiresClarification?: boolean;
  readonly clarificationPrompt?: string;
  readonly entities?: readonly Entity[];
}

export interface Entity {
  readonly type: string;
  readonly value: string;
  readonly confidence: number;
}

// ─── Agent Task Decision Object ──────────────────────────────────────────────

export interface AgentTask {
  readonly id: string;
  readonly userRequest: string;
  readonly intent: Intent;
  readonly taskType: AgentTaskType;
  readonly contextRequirements: RequiredContext;
  readonly memoryRequired: boolean;
  readonly knowledgeRequired: boolean;
  readonly toolsRequired: boolean;
  readonly planningRequired: boolean;
  readonly clarificationRequired: boolean;
  readonly status:
  | 'pending'
  | 'planning'
  | 'running'
  | 'waiting'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled';
  readonly createdAt: number;
}

// ─── Reasoning ───────────────────────────────────────────────────────────────

export type ReasoningComplexity =
  | 'SIMPLE'
  | 'COMPLEX'
  | 'MULTI_STEP'
  | 'AMBIGUOUS'
  | 'UNSUPPORTED';

export type ResponseStrategy =
  | 'DIRECT_ANSWER'
  | 'STRUCTURED_PLAN'
  | 'ANALYTICAL_BREAKDOWN'
  | 'RESEARCH_SYNTHESIS'
  | 'CLARIFICATION'
  | 'CONFIRMATION'
  | 'UNSUPPORTED'
  | 'FAILURE';

export interface ReasoningAssessment {
  readonly complexity: ReasoningComplexity;
  readonly strategy: ResponseStrategy;
  readonly isSimple: boolean;
  readonly requiresPlan: boolean;
  readonly informationSufficient: boolean;
  readonly missingInformation?: readonly string[];
  readonly clarificationReason?: string;
  readonly requiredCapabilities?: readonly string[];
  readonly suggestedExecutionMode?: 'sequential' | 'parallel' | 'conditional' | 'direct';
  readonly rationale: string;
}

export type ReasoningState =
  | 'request_received'
  | 'intent_identified'
  | 'context_assembled'
  | 'reasoning_in_progress'
  | 'plan_created'
  | 'plan_executing'
  | 'plan_completed'
  | 'plan_failed'
  | 'clarification_required'
  | 'confirmation_required';

export type ReasoningStatus =
  | 'thinking'
  | 'retrieving'
  | 'generating'
  | 'planning'
  | 'completed'
  | 'failed';

export interface ReasoningTrace {
  readonly status: ReasoningStatus;
  readonly state?: ReasoningState;
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

export type ContextSourceType =
  | 'request'
  | 'conversation_history'
  | 'working_memory'
  | 'long_term_memory'
  | 'rag_knowledge'
  | 'project_intelligence'
  | 'workspace'
  | 'system';

export interface ContextSourceMetadata {
  readonly id?: string;
  readonly source: ContextSourceType;
  readonly relevanceScore: number;
  readonly priority: number;
  readonly tokenCount: number;
  readonly scope: string;
  readonly timestamp?: number;
  readonly description?: string;
}

export interface ProjectContextSummary {
  readonly projectId: string;
  readonly projectName: string;
  readonly status: string;
  readonly progress: number;
  readonly activeTasks: readonly { title: string; status: string; priority: string }[];
  readonly upcomingMilestones: readonly { title: string; dueDate?: Date | null }[];
  readonly goals: readonly { title: string; progress: number }[];
  readonly recentNotes: readonly { title: string; content?: string | null }[];
  readonly summaryText: string;
}

export interface WorkspaceContextSummary {
  readonly workspaceId: string;
  readonly name: string;
  readonly role?: string;
  readonly activeModuleName?: string;
  readonly summaryText?: string;
}

export interface AIContext {
  readonly userId: UserId;
  readonly sessionId: SessionId;
  readonly conversationId: ConversationId;
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly conversationHistory?: readonly ContextMessage[];
  readonly ragContext?: RAGContext;
  readonly workingMemory?: WorkingMemoryContext;
  readonly longTermMemory?: readonly MemoryItem[];
  readonly systemInstructions?: string;
  readonly tokenBudget: TokenBudget;
  readonly projectContext?: ProjectContextSummary;
  readonly workspaceContext?: WorkspaceContextSummary;
  readonly activeEntities?: readonly Entity[];
  readonly sourcesMetadata?: readonly ContextSourceMetadata[];
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

export type MemoryScope = 'GLOBAL_USER' | 'CONVERSATION' | 'WORKSPACE' | 'PROJECT';

export type MemoryConfidence = 'confirmed' | 'user_provided' | 'inferred' | 'temporary';

export interface MemoryItem {
  readonly id: MemoryId;
  readonly userId: UserId;
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly type: MemoryType;
  readonly scope?: MemoryScope;
  readonly content: string;
  readonly embedding?: readonly number[];
  readonly importance: number;
  readonly confidence?: MemoryConfidence;
  readonly version?: number;
  readonly accessCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly lastAccessedAt?: number;
  readonly expiresAt?: number;
  readonly metadata?: MemoryMetadata;
}

export type MemoryType = 'conversation' | 'fact' | 'preference' | 'summary' | 'working' | 'workspace' | 'project';

export interface MemoryMetadata {
  readonly conversationId?: ConversationId;
  readonly sessionId?: SessionId;
  readonly source?: string;
  readonly status?: 'active' | 'superseded' | 'deleted';
  readonly confidence?: MemoryConfidence;
  readonly supersededBy?: string;
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
  'system' | 'rag' | 'reasoning' | 'agent' | 'safety' | 'summarization' | 'classification';

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
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: AIError<E> };

export type AIErrorCode =
  | 'BLOCKED_BY_WEIGHTS'
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

// ─── Future-Compatible Agent Interfaces (Section 10) ──────────────────────────

export interface IIntentAnalyzer {
  classify(message: string, context?: unknown): Result<Intent>;
  classifyTaskType?(intent: Intent, message?: string): AgentTaskType;
}

export interface IMemoryProvider {
  store?(userId: string, key: string, value: string, category?: string): Promise<boolean>;
  recall?(userId: string, query: string): Promise<string | undefined>;
}

export interface IKnowledgeProvider {
  search?(query: string, limit?: number): Promise<readonly EvidenceItem[]>;
}

export interface IPlannerProvider {
  createPlan?(task: AgentTask, context: unknown): Promise<Result<ActionPlan>>;
}

export interface IToolRegistryProvider {
  hasTool(name: string): boolean;
  executeTool(name: string, args: Record<string, unknown>, auth?: AuthenticationContext): Promise<unknown>;
}

export interface IResponseGenerator {
  generate(input: unknown): Promise<AIResponse>;
}

// ─── Canonical Prompt 7 Planning Re-exports ──────────────────────────────────
export type {
  AgentPlan,
  AgentPlanStep,
  PlanStatus,
  PlanStepType,
  PlanStepStatus,
  PlanGoal,
  PlanConstraint,
  PlanConstraintType,
  PlanAssumption,
  PlanDependency,
  ClarificationRequest,
  ClarificationOption,
  PlanValidationError,
  PlanValidationWarning,
  PlanComplexityLimits,
} from './planning/planning-types.js';


