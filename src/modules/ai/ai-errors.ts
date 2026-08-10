/**
 * AETHER AI — Typed Errors
 * Strongly-typed error classes for all AI sub-systems.
 * No fake errors — all represent real failure states.
 */

import type { AIErrorCode } from './ai-types.js';

// ─── Base AI Error ────────────────────────────────────────────────────────────

export class AetherAIError extends Error {
  public readonly code: AIErrorCode;
  public readonly retryable: boolean;
  public readonly details?: unknown;
  public readonly timestamp: number;

  constructor(
    code: AIErrorCode,
    message: string,
    options?: { retryable?: boolean; details?: unknown; cause?: Error },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'AetherAIError';
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.details = options?.details;
    this.timestamp = Date.now();
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

// ─── LLM Errors ──────────────────────────────────────────────────────────────

export class ModelUnavailableError extends AetherAIError {
  constructor(modelId?: string, cause?: Error) {
    super(
      'MODEL_UNAVAILABLE',
      modelId
        ? `Model "${modelId}" is unavailable. Ensure your local runtime is running and the model is loaded.`
        : 'No local LLM model is available. Start your local runtime (e.g., Ollama) and configure a model.',
      { retryable: true, details: { modelId }, cause },
    );
    this.name = 'ModelUnavailableError';
  }
}

export class ModelLoadFailedError extends AetherAIError {
  constructor(modelId: string, reason: string, cause?: Error) {
    super(
      'MODEL_LOAD_FAILED',
      `Failed to load model "${modelId}": ${reason}`,
      { retryable: true, details: { modelId, reason }, cause },
    );
    this.name = 'ModelLoadFailedError';
  }
}

export class GenerationFailedError extends AetherAIError {
  constructor(reason: string, cause?: Error) {
    super(
      'GENERATION_FAILED',
      `Text generation failed: ${reason}`,
      { retryable: true, details: { reason }, cause },
    );
    this.name = 'GenerationFailedError';
  }
}

export class StreamFailedError extends AetherAIError {
  constructor(reason: string, cause?: Error) {
    super(
      'STREAM_FAILED',
      `Streaming failed: ${reason}`,
      { retryable: true, details: { reason }, cause },
    );
    this.name = 'StreamFailedError';
  }
}

export class RuntimeUnavailableError extends AetherAIError {
  constructor(runtimeType: string, cause?: Error) {
    super(
      'RUNTIME_UNAVAILABLE',
      `LLM runtime "${runtimeType}" is not reachable. Verify it is running and configured correctly.`,
      { retryable: true, details: { runtimeType }, cause },
    );
    this.name = 'RuntimeUnavailableError';
  }
}

// ─── Request Errors ───────────────────────────────────────────────────────────

export class InvalidRequestError extends AetherAIError {
  constructor(reason: string, details?: unknown) {
    super(
      'INVALID_REQUEST',
      `Invalid request: ${reason}`,
      { retryable: false, details },
    );
    this.name = 'InvalidRequestError';
  }
}

export class UnauthorizedError extends AetherAIError {
  constructor(userId?: string) {
    super(
      'UNAUTHORIZED',
      'Unauthorized: valid authentication is required to use the AI service.',
      { retryable: false, details: { userId } },
    );
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AetherAIError {
  constructor(resource?: string) {
    super(
      'FORBIDDEN',
      `Forbidden: you do not have permission to access this resource${resource ? `: ${resource}` : ''}.`,
      { retryable: false, details: { resource } },
    );
    this.name = 'ForbiddenError';
  }
}

export class ContextTooLargeError extends AetherAIError {
  constructor(tokenCount: number, limit: number) {
    super(
      'CONTEXT_TOO_LARGE',
      `Context is too large: ${tokenCount} tokens exceeds the limit of ${limit} tokens.`,
      { retryable: false, details: { tokenCount, limit } },
    );
    this.name = 'ContextTooLargeError';
  }
}

// ─── RAG Errors ───────────────────────────────────────────────────────────────

export class RAGFailedError extends AetherAIError {
  constructor(stage: string, reason: string, cause?: Error) {
    super(
      'RAG_FAILED',
      `RAG pipeline failed at stage "${stage}": ${reason}`,
      { retryable: true, details: { stage, reason }, cause },
    );
    this.name = 'RAGFailedError';
  }
}

export class EmbeddingFailedError extends AetherAIError {
  constructor(reason: string, cause?: Error) {
    super(
      'EMBEDDING_FAILED',
      `Embedding generation failed: ${reason}`,
      { retryable: true, details: { reason }, cause },
    );
    this.name = 'EmbeddingFailedError';
  }
}

export class IndexingFailedError extends AetherAIError {
  constructor(documentId: string, reason: string, cause?: Error) {
    super(
      'INDEXING_FAILED',
      `Failed to index document "${documentId}": ${reason}`,
      { retryable: true, details: { documentId, reason }, cause },
    );
    this.name = 'IndexingFailedError';
  }
}

export class RetrievalFailedError extends AetherAIError {
  constructor(reason: string, cause?: Error) {
    super(
      'RETRIEVAL_FAILED',
      `Document retrieval failed: ${reason}`,
      { retryable: true, details: { reason }, cause },
    );
    this.name = 'RetrievalFailedError';
  }
}

// ─── Memory Errors ────────────────────────────────────────────────────────────

export class MemoryFailedError extends AetherAIError {
  constructor(operation: string, reason: string, cause?: Error) {
    super(
      'MEMORY_FAILED',
      `Memory operation "${operation}" failed: ${reason}`,
      { retryable: true, details: { operation, reason }, cause },
    );
    this.name = 'MemoryFailedError';
  }
}

// ─── Safety Errors ────────────────────────────────────────────────────────────

export class SafetyCheckFailedError extends AetherAIError {
  constructor(reason: string) {
    super(
      'SAFETY_CHECK_FAILED',
      `Safety check failed: ${reason}`,
      { retryable: false, details: { reason } },
    );
    this.name = 'SafetyCheckFailedError';
  }
}

// ─── Timeout / Cancellation ───────────────────────────────────────────────────

export class TimeoutError extends AetherAIError {
  constructor(operation: string, timeoutMs: number) {
    super(
      'TIMEOUT',
      `Operation "${operation}" timed out after ${timeoutMs}ms.`,
      { retryable: true, details: { operation, timeoutMs } },
    );
    this.name = 'TimeoutError';
  }
}

export class CancelledError extends AetherAIError {
  constructor(operation: string) {
    super(
      'CANCELLED',
      `Operation "${operation}" was cancelled by the client.`,
      { retryable: false, details: { operation } },
    );
    this.name = 'CancelledError';
  }
}

// ─── Other Errors ─────────────────────────────────────────────────────────────

export class NotConfiguredError extends AetherAIError {
  constructor(component: string) {
    super(
      'NOT_CONFIGURED',
      `Component "${component}" is not configured. Review your AI configuration.`,
      { retryable: false, details: { component } },
    );
    this.name = 'NotConfiguredError';
  }
}

export class InternalError extends AetherAIError {
  constructor(reason: string, cause?: Error) {
    super(
      'INTERNAL_ERROR',
      `Internal AI error: ${reason}`,
      { retryable: false, details: { reason }, cause },
    );
    this.name = 'InternalError';
  }
}

export class IntentFailedError extends AetherAIError {
  constructor(reason: string, cause?: Error) {
    super(
      'INTENT_FAILED',
      `Intent classification failed: ${reason}`,
      { retryable: true, details: { reason }, cause },
    );
    this.name = 'IntentFailedError';
  }
}

export class PromptBuildFailedError extends AetherAIError {
  constructor(reason: string, cause?: Error) {
    super(
      'PROMPT_BUILD_FAILED',
      `Prompt construction failed: ${reason}`,
      { retryable: false, details: { reason }, cause },
    );
    this.name = 'PromptBuildFailedError';
  }
}

// ─── Error Guard ──────────────────────────────────────────────────────────────

export function isAetherAIError(error: unknown): error is AetherAIError {
  return error instanceof AetherAIError;
}

export function toAetherAIError(error: unknown): AetherAIError {
  if (isAetherAIError(error)) return error;
  if (error instanceof Error) {
    return new InternalError(error.message, error);
  }
  return new InternalError(String(error));
}
