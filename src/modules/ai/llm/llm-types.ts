/**
 * AETHER AI — LLM Types
 * Types specific to the local LLM subsystem.
 */

import type { ModelId, TokenUsage } from '../ai-types.js';

// ─── Model Info ───────────────────────────────────────────────────────────────

export interface ModelInfo {
  readonly id: ModelId;
  readonly name: string;
  readonly familyName: string;
  readonly parameterCount?: string;
  readonly contextLength: number;
  readonly quantization?: string;
  readonly format?: string;
  readonly sizeBytes?: number;
  readonly digest?: string;
  readonly modifiedAt?: number;
}

// ─── Model Status ─────────────────────────────────────────────────────────────

export type ModelStatusCode =
  | 'available'
  | 'loading'
  | 'loaded'
  | 'unloading'
  | 'unavailable'
  | 'error';

export interface ModelStatus {
  readonly modelId: ModelId;
  readonly status: ModelStatusCode;
  readonly info?: ModelInfo;
  readonly errorMessage?: string;
  readonly checkedAt: number;
}

// ─── Runtime Status ───────────────────────────────────────────────────────────

export type RuntimeStatusCode =
  | 'healthy'
  | 'degraded'
  | 'unavailable'
  | 'unconfigured';

export interface RuntimeStatus {
  readonly runtimeType: string;
  readonly status: RuntimeStatusCode;
  readonly version?: string;
  readonly availableModels?: readonly ModelId[];
  readonly errorMessage?: string;
  readonly checkedAt: number;
}

// ─── Generation Request ───────────────────────────────────────────────────────

export interface GenerationRequest {
  readonly requestId: string;
  readonly modelId: ModelId;
  readonly messages: readonly LLMMessage[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly topP?: number;
  readonly stop?: readonly string[];
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly stream: false;
}

export interface StreamingGenerationRequest {
  readonly requestId: string;
  readonly modelId: ModelId;
  readonly messages: readonly LLMMessage[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly topP?: number;
  readonly stop?: readonly string[];
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly stream: true;
}

export interface LLMMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

// ─── Generation Response ──────────────────────────────────────────────────────

export interface GenerationResponse {
  readonly requestId: string;
  readonly modelId: ModelId;
  readonly content: string;
  readonly usage?: TokenUsage;
  readonly finishReason: FinishReason;
  readonly latencyMs: number;
}

export type FinishReason =
  | 'stop'
  | 'length'
  | 'cancelled'
  | 'error';

// ─── Streaming Chunk ──────────────────────────────────────────────────────────

export interface LLMStreamingChunk {
  readonly requestId: string;
  readonly modelId: ModelId;
  readonly delta: string;
  readonly index: number;
  readonly isLast: boolean;
  readonly usage?: TokenUsage;
  readonly finishReason?: FinishReason;
}

// ─── Tokenizer ────────────────────────────────────────────────────────────────

export interface TokenizerResult {
  readonly tokenCount: number;
  readonly tokens?: readonly number[];
}

// ─── Runtime Capabilities ─────────────────────────────────────────────────────

export interface RuntimeCapabilities {
  readonly supportsStreaming: boolean;
  readonly supportsEmbeddings: boolean;
  readonly supportsChatMessages: boolean;
  readonly supportsCompletion: boolean;
  readonly maxConcurrentRequests: number;
}
