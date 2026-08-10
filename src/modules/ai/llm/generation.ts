/**
 * AETHER AI — Generation
 * Core generation logic: builds LLM requests, handles streaming/non-streaming,
 * implements timeout and cancellation.
 */

import type { Result } from '../ai-types.js';
import { ok, fail } from '../ai-types.js';
import { CancelledError, GenerationFailedError, ModelUnavailableError } from '../ai-errors.js';
import type { IModelRuntime } from './model-runtime.js';
import type {
  GenerationRequest,
  GenerationResponse,
  LLMMessage,
  LLMStreamingChunk,
  StreamingGenerationRequest,
} from './llm-types.js';
import { defaultTokenizer } from './tokenizer.js';

// ─── Generation Options ───────────────────────────────────────────────────────

export interface GenerationOptions {
  readonly modelId: string;
  readonly messages: readonly LLMMessage[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly topP?: number;
  readonly stop?: readonly string[];
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

// ─── IGeneration Interface ────────────────────────────────────────────────────

export interface IGeneration {
  generate(
    requestId: string,
    options: GenerationOptions,
  ): Promise<Result<GenerationResponse>>;

  generateStream(
    requestId: string,
    options: GenerationOptions,
    onChunk: (chunk: LLMStreamingChunk) => void,
  ): Promise<Result<void>>;
}

// ─── Generation Implementation ────────────────────────────────────────────────

export class Generation implements IGeneration {
  constructor(private readonly runtime: IModelRuntime) {}

  public async generate(
    requestId: string,
    options: GenerationOptions,
  ): Promise<Result<GenerationResponse>> {
    if (options.signal?.aborted) {
      return fail(new CancelledError('generate'));
    }

    const runtimeStatus = await this.runtime.healthCheck();
    if (runtimeStatus.status === 'unavailable' || runtimeStatus.status === 'unconfigured') {
      return fail(new ModelUnavailableError(options.modelId));
    }

    const validation = this.validateOptions(options);
    if (!validation.ok) return validation;

    const request: GenerationRequest = {
      requestId,
      modelId: options.modelId,
      messages: options.messages,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
      stop: options.stop,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      stream: false,
    };

    return this.runtime.generate(request);
  }

  public async generateStream(
    requestId: string,
    options: GenerationOptions,
    onChunk: (chunk: LLMStreamingChunk) => void,
  ): Promise<Result<void>> {
    if (options.signal?.aborted) {
      return fail(new CancelledError('generateStream'));
    }

    const runtimeStatus = await this.runtime.healthCheck();
    if (runtimeStatus.status === 'unavailable' || runtimeStatus.status === 'unconfigured') {
      return fail(new ModelUnavailableError(options.modelId));
    }

    if (!this.runtime.capabilities.supportsStreaming) {
      return fail(new GenerationFailedError('Runtime does not support streaming'));
    }

    const validation = this.validateOptions(options);
    if (!validation.ok) return validation;

    const request: StreamingGenerationRequest = {
      requestId,
      modelId: options.modelId,
      messages: options.messages,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
      stop: options.stop,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      stream: true,
    };

    return this.runtime.generateStream(request, onChunk);
  }

  /**
   * Estimates total tokens in a message list and checks against a budget.
   */
  public estimateTokenUsage(messages: readonly LLMMessage[]): number {
    return defaultTokenizer.countMessages(messages).tokenCount;
  }

  private validateOptions(options: GenerationOptions): Result<void> {
    if (!options.modelId || options.modelId.trim().length === 0) {
      return fail(new GenerationFailedError('modelId is required'));
    }
    if (!options.messages || options.messages.length === 0) {
      return fail(new GenerationFailedError('At least one message is required'));
    }
    for (const msg of options.messages) {
      if (msg.content.trim().length === 0) {
        return fail(new GenerationFailedError('Message content cannot be empty'));
      }
    }
    if (options.temperature !== undefined && (options.temperature < 0 || options.temperature > 2)) {
      return fail(new GenerationFailedError('temperature must be between 0 and 2'));
    }
    if (options.maxTokens !== undefined && options.maxTokens < 1) {
      return fail(new GenerationFailedError('maxTokens must be at least 1'));
    }
    return ok(undefined);
  }
}
