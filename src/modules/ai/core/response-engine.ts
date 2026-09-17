/**
 * AETHER AI — Response Engine
 * Assembles the final AIResponse from generation output.
 * Handles citations, memory IDs, usage, and status mapping.
 */

import type {
  AIResponse,
  AIRequest,
  Intent,
  ReasoningStatus,
  Citation,
  MemoryId,
  TokenUsage,
  AIResponseStatus,
  VerificationStatus,
  EvidenceItem,
} from '../ai-types.js';
import type { GenerationResponse } from '../llm/llm-types.js';
import type { AIErrorCode } from '../ai-types.js';

// ─── IResponseEngine Interface ────────────────────────────────────────────────

export interface IResponseEngine {
  buildSuccess(
    request: AIRequest,
    generation: GenerationResponse,
    intent: Intent,
    citations?: readonly Citation[],
    memoryIds?: readonly MemoryId[],
    reasoningStatus?: ReasoningStatus,
    startTime?: number,
    verificationStatus?: VerificationStatus,
    evidence?: readonly EvidenceItem[],
  ): AIResponse;

  buildError(
    request: AIRequest,
    intent: Intent,
    errorCode: AIErrorCode,
    startTime?: number,
    verificationStatus?: VerificationStatus,
  ): AIResponse;
}

// ─── Error Code to Status Mapping ────────────────────────────────────────────

function errorCodeToStatus(code: AIErrorCode): AIResponseStatus {
  switch (code) {
    case 'MODEL_UNAVAILABLE':
    case 'MODEL_LOAD_FAILED':
    case 'RUNTIME_UNAVAILABLE':
    case 'NOT_CONFIGURED':
      return 'model_unavailable';
    case 'GENERATION_FAILED':
    case 'STREAM_FAILED':
      return 'generation_failed';
    case 'SAFETY_CHECK_FAILED':
      return 'safety_blocked';
    case 'CONTEXT_TOO_LARGE':
      return 'context_too_large';
    case 'TIMEOUT':
      return 'timeout';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'internal_error';
  }
}

// ─── Response Engine Implementation ──────────────────────────────────────────

export class ResponseEngine implements IResponseEngine {
  public buildSuccess(
    request: AIRequest,
    generation: GenerationResponse,
    intent: Intent,
    citations?: readonly Citation[],
    memoryIds?: readonly MemoryId[],
    reasoningStatus?: ReasoningStatus,
    startTime?: number,
    verificationStatus?: VerificationStatus,
    evidence?: readonly EvidenceItem[],
  ): AIResponse {
    const now = Date.now();
    const latencyMs = startTime ? now - startTime : generation.latencyMs;

    return {
      requestId: request.requestId,
      userId: request.userId,
      sessionId: request.sessionId,
      conversationId: request.conversationId,
      message: generation.content,
      reasoning: reasoningStatus ?? 'completed',
      citations: citations && citations.length > 0 ? citations : undefined,
      memoryIds: memoryIds && memoryIds.length > 0 ? memoryIds : undefined,
      intent,
      status: 'success',
      verificationStatus,
      evidence: evidence && evidence.length > 0 ? evidence : undefined,
      usage: generation.usage,
      latencyMs,
      timestamp: now,
    };
  }

  public buildError(
    request: AIRequest,
    intent: Intent,
    errorCode: AIErrorCode,
    startTime?: number,
    verificationStatus?: VerificationStatus,
  ): AIResponse {
    const now = Date.now();
    const latencyMs = startTime ? now - startTime : 0;
    const status = errorCodeToStatus(errorCode);

    return {
      requestId: request.requestId,
      userId: request.userId,
      sessionId: request.sessionId,
      conversationId: request.conversationId,
      message: this.buildErrorMessage(status),
      reasoning: 'failed',
      intent,
      status,
      verificationStatus: verificationStatus ?? 'FAILED',
      latencyMs,
      timestamp: now,
    };
  }

  private buildErrorMessage(status: AIResponseStatus): string {
    switch (status) {
      case 'model_unavailable':
        return 'The AI model is currently unavailable. Please ensure your local runtime is running and a model is loaded.';
      case 'generation_failed':
        return 'Failed to generate a response. Please try again.';
      case 'safety_blocked':
        return 'Your request could not be processed due to safety guidelines.';
      case 'context_too_large':
        return 'Your request is too long to process. Please shorten your message or clear the conversation history.';
      case 'timeout':
        return 'The request timed out. Please try again.';
      case 'cancelled':
        return 'The request was cancelled.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  }
}
