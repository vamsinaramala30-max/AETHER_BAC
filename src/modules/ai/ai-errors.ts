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

export class BlockedByWeightsError extends AetherAIError {
  constructor(message = 'NATIVE AETHER AI IS BLOCKED BY TRAINED MODEL WEIGHTS', cause?: Error) {
    super('BLOCKED_BY_WEIGHTS', message, {
      retryable: false,
      details: { has_trained_weights: false },
      cause,
    });
    this.name = 'BlockedByWeightsError';
  }
}

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
    super('MODEL_LOAD_FAILED', `Failed to load model "${modelId}": ${reason}`, {
      retryable: true,
      details: { modelId, reason },
      cause,
    });
    this.name = 'ModelLoadFailedError';
  }
}

export class GenerationFailedError extends AetherAIError {
  constructor(reason: string, cause?: Error) {
    super('GENERATION_FAILED', `Text generation failed: ${reason}`, {
      retryable: true,
      details: { reason },
      cause,
    });
    this.name = 'GenerationFailedError';
  }
}

export class StreamFailedError extends AetherAIError {
  constructor(reason: string, cause?: Error) {
    super('STREAM_FAILED', `Streaming failed: ${reason}`, {
      retryable: true,
      details: { reason },
      cause,
    });
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
    super('INVALID_REQUEST', `Invalid request: ${reason}`, { retryable: false, details });
    this.name = 'InvalidRequestError';
  }
}

export class UnauthorizedError extends AetherAIError {
  constructor(userId?: string) {
    super('UNAUTHORIZED', 'Unauthorized: valid authentication is required to use the AI service.', {
      retryable: false,
      details: { userId },
    });
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
    super('RAG_FAILED', `RAG pipeline failed at stage "${stage}": ${reason}`, {
      retryable: true,
      details: { stage, reason },
      cause,
    });
    this.name = 'RAGFailedError';
  }
}

export class EmbeddingFailedError extends AetherAIError {
  constructor(reason: string, cause?: Error) {
    super('EMBEDDING_FAILED', `Embedding generation failed: ${reason}`, {
      retryable: true,
      details: { reason },
      cause,
    });
    this.name = 'EmbeddingFailedError';
  }
}

export class IndexingFailedError extends AetherAIError {
  constructor(documentId: string, reason: string, cause?: Error) {
    super('INDEXING_FAILED', `Failed to index document "${documentId}": ${reason}`, {
      retryable: true,
      details: { documentId, reason },
      cause,
    });
    this.name = 'IndexingFailedError';
  }
}

export class RetrievalFailedError extends AetherAIError {
  constructor(reason: string, cause?: Error) {
    super('RETRIEVAL_FAILED', `Document retrieval failed: ${reason}`, {
      retryable: true,
      details: { reason },
      cause,
    });
    this.name = 'RetrievalFailedError';
  }
}

// ─── Memory Errors ────────────────────────────────────────────────────────────

export class MemoryFailedError extends AetherAIError {
  constructor(operation: string, reason: string, cause?: Error) {
    super('MEMORY_FAILED', `Memory operation "${operation}" failed: ${reason}`, {
      retryable: true,
      details: { operation, reason },
      cause,
    });
    this.name = 'MemoryFailedError';
  }
}

// ─── Safety Errors ────────────────────────────────────────────────────────────

export class SafetyCheckFailedError extends AetherAIError {
  constructor(reason: string) {
    super('SAFETY_CHECK_FAILED', `Safety check failed: ${reason}`, {
      retryable: false,
      details: { reason },
    });
    this.name = 'SafetyCheckFailedError';
  }
}

// ─── Timeout / Cancellation ───────────────────────────────────────────────────

export class TimeoutError extends AetherAIError {
  constructor(operation: string, timeoutMs: number) {
    super('TIMEOUT', `Operation "${operation}" timed out after ${timeoutMs}ms.`, {
      retryable: true,
      details: { operation, timeoutMs },
    });
    this.name = 'TimeoutError';
  }
}

export class CancelledError extends AetherAIError {
  constructor(operation: string) {
    super('CANCELLED', `Operation "${operation}" was cancelled by the client.`, {
      retryable: false,
      details: { operation },
    });
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
    super('INTERNAL_ERROR', `Internal AI error: ${reason}`, {
      retryable: false,
      details: { reason },
      cause,
    });
    this.name = 'InternalError';
  }
}

export class IntentFailedError extends AetherAIError {
  constructor(reason: string, cause?: Error) {
    super('INTENT_FAILED', `Intent classification failed: ${reason}`, {
      retryable: true,
      details: { reason },
      cause,
    });
    this.name = 'IntentFailedError';
  }
}

export class PromptBuildFailedError extends AetherAIError {
  constructor(reason: string, cause?: Error) {
    super('PROMPT_BUILD_FAILED', `Prompt construction failed: ${reason}`, {
      retryable: false,
      details: { reason },
      cause,
    });
    this.name = 'PromptBuildFailedError';
  }
}

// ─── Provider & Fallback Errors ───────────────────────────────────────────────

export class RateLimitError extends AetherAIError {
  constructor(provider: string, cause?: Error) {
    super('RATE_LIMIT', `Rate limit exceeded for provider "${provider}".`, {
      retryable: true,
      details: { provider },
      cause,
    });
    this.name = 'RateLimitError';
  }
}

export class QuotaExceededError extends AetherAIError {
  constructor(provider: string, cause?: Error) {
    super('QUOTA_EXCEEDED', `Quota or credit limit exceeded for provider "${provider}".`, {
      retryable: true,
      details: { provider },
      cause,
    });
    this.name = 'QuotaExceededError';
  }
}

export class ProviderUnavailableError extends AetherAIError {
  constructor(provider: string, reason?: string, cause?: Error) {
    super(
      'PROVIDER_UNAVAILABLE',
      `AI Provider "${provider}" is unavailable${reason ? `: ${reason}` : ''}.`,
      { retryable: true, details: { provider, reason }, cause },
    );
    this.name = 'ProviderUnavailableError';
  }
}

export class NetworkError extends AetherAIError {
  constructor(provider: string, reason: string, cause?: Error) {
    super('NETWORK_ERROR', `Network failure connecting to AI provider "${provider}": ${reason}`, {
      retryable: true,
      details: { provider, reason },
      cause,
    });
    this.name = 'NetworkError';
  }
}

export class AuthError extends AetherAIError {
  constructor(provider: string, reason?: string) {
    super(
      'AUTH_ERROR',
      `Authentication/API key invalid for provider "${provider}"${reason ? `: ${reason}` : ''}.`,
      { retryable: false, details: { provider, reason } },
    );
    this.name = 'AuthError';
  }
}

// ─── Error Guard & Fallback Helper ─────────────────────────────────────────────

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

/**
 * Determines whether an error is a recoverable provider-level error
 * that warrants fallback to a secondary AI provider.
 */
export function isRecoverableProviderError(error: unknown): boolean {
  let code: string | undefined;
  if (isAetherAIError(error)) {
    code = error.code;
  } else if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as any).code === 'string'
  ) {
    code = (error as any).code;
  } else {
    code = toAetherAIError(error).code;
  }
  const recoverableCodes: string[] = [
    'BLOCKED_BY_WEIGHTS',
    'RATE_LIMIT',
    'QUOTA_EXCEEDED',
    'PROVIDER_UNAVAILABLE',
    'RUNTIME_UNAVAILABLE',
    'MODEL_UNAVAILABLE',
    'NETWORK_ERROR',
    'TIMEOUT',
    'STREAM_FAILED',
    'GENERATION_FAILED',
    'AUTH_ERROR',
  ];
  return !!code && recoverableCodes.includes(code);
}
