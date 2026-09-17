/**
 * AETHER AI — Model Runtime
 * Provider-independent LLM runtime abstraction.
 * Supports Ollama and llama.cpp with a clean interface.
 * Never uses cloud AI APIs.
 */

import type { LLMRuntimeConfig } from '../ai-config.js';
import type { Result, AIErrorCode } from '../ai-types.js';
import {
  RuntimeUnavailableError,
  ModelUnavailableError,
  GenerationFailedError,
  StreamFailedError,
  TimeoutError,
  CancelledError,
  NotConfiguredError,
  toAetherAIError,
} from '../ai-errors.js';
import { fail, ok, makeError } from '../ai-types.js';
import type {
  GenerationRequest,
  StreamingGenerationRequest,
  GenerationResponse,
  LLMStreamingChunk,
  ModelInfo,
  RuntimeStatus,
  RuntimeCapabilities,
} from './llm-types.js';

// ─── IModelRuntime Interface ──────────────────────────────────────────────────

export interface IModelRuntime {
  readonly runtimeType: string;
  readonly capabilities: RuntimeCapabilities;

  healthCheck(): Promise<RuntimeStatus>;
  listModels(): Promise<Result<readonly ModelInfo[]>>;
  generate(request: GenerationRequest): Promise<Result<GenerationResponse>>;
  generateStream(
    request: StreamingGenerationRequest,
    onChunk: (chunk: LLMStreamingChunk) => void,
  ): Promise<Result<void>>;
  destroy(): Promise<void>;
}

// ─── Ollama Runtime ───────────────────────────────────────────────────────────

interface OllamaGenerateBody {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
    top_p?: number;
    stop?: string[];
  };
}

interface OllamaGenerateResponse {
  model: string;
  message: { role: string; content: string };
  done: boolean;
  eval_count?: number;
  prompt_eval_count?: number;
  total_duration?: number;
}

interface OllamaStreamChunk {
  model: string;
  message: { role: string; content: string };
  done: boolean;
  eval_count?: number;
  prompt_eval_count?: number;
}

interface OllamaModelListResponse {
  models: Array<{
    name: string;
    model: string;
    size: number;
    digest: string;
    modified_at: string;
    details: {
      family: string;
      parameter_size: string;
      quantization_level: string;
      format: string;
    };
  }>;
}

export class OllamaRuntime implements IModelRuntime {
  public readonly runtimeType = 'ollama';
  public readonly capabilities: RuntimeCapabilities = {
    supportsStreaming: true,
    supportsEmbeddings: true,
    supportsChatMessages: true,
    supportsCompletion: true,
    maxConcurrentRequests: 4,
  };

  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(baseUrl: string = 'http://localhost:11434', timeoutMs: number = 30_000) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
  }

  public async healthCheck(): Promise<RuntimeStatus> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        return {
          runtimeType: this.runtimeType,
          status: 'degraded',
          errorMessage: `Ollama returned HTTP ${res.status}`,
          checkedAt: Date.now(),
        };
      }
      const data = (await res.json()) as OllamaModelListResponse;
      return {
        runtimeType: this.runtimeType,
        status: 'healthy',
        availableModels: data.models.map((m) => m.name),
        checkedAt: Date.now(),
      };
    } catch (error) {
      return {
        runtimeType: this.runtimeType,
        status: 'unavailable',
        errorMessage: error instanceof Error ? error.message : String(error),
        checkedAt: Date.now(),
      };
    }
  }

  public async listModels(): Promise<Result<readonly ModelInfo[]>> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        return fail(new RuntimeUnavailableError(`ollama (HTTP ${res.status})`));
      }
      const data = (await res.json()) as OllamaModelListResponse;
      const models: ModelInfo[] = data.models.map((m) => ({
        id: m.name,
        name: m.name,
        familyName: m.details.family,
        parameterCount: m.details.parameter_size,
        contextLength: 8192,
        quantization: m.details.quantization_level,
        format: m.details.format,
        sizeBytes: m.size,
        digest: m.digest,
        modifiedAt: new Date(m.modified_at).getTime(),
      }));
      return ok(models);
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(new RuntimeUnavailableError('ollama', cause));
    }
  }

  public async generate(request: GenerationRequest): Promise<Result<GenerationResponse>> {
    const start = Date.now();
    const controller = new AbortController();
    const timeoutMs = request.timeoutMs ?? this.timeoutMs;

    const mergedSignal = this.mergeSignals(request.signal, controller.signal);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body: OllamaGenerateBody = {
        model: request.modelId,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        stream: false,
        options: {
          temperature: request.temperature,
          num_predict: request.maxTokens,
          top_p: request.topP,
          stop: request.stop ? [...request.stop] : undefined,
        },
      };

      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: mergedSignal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (res.status === 404) {
          return fail(new ModelUnavailableError(request.modelId));
        }
        return fail(new GenerationFailedError(`HTTP ${res.status}: ${text}`));
      }

      const data = (await res.json()) as OllamaGenerateResponse;
      const latencyMs = Date.now() - start;

      return ok({
        requestId: request.requestId,
        modelId: request.modelId,
        content: data.message.content,
        usage:
          data.eval_count !== undefined
            ? {
                promptTokens: data.prompt_eval_count ?? 0,
                completionTokens: data.eval_count,
                totalTokens: (data.prompt_eval_count ?? 0) + data.eval_count,
              }
            : undefined,
        finishReason: data.done ? 'stop' : 'error',
        latencyMs,
      });
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === 'AbortError') {
        if (request.signal?.aborted) {
          return fail(new CancelledError('generate'));
        }
        return fail(new TimeoutError('generate', timeoutMs));
      }
      return fail(toAetherAIError(error));
    }
  }

  public async generateStream(
    request: StreamingGenerationRequest,
    onChunk: (chunk: LLMStreamingChunk) => void,
  ): Promise<Result<void>> {
    const controller = new AbortController();
    const timeoutMs = request.timeoutMs ?? this.timeoutMs;
    const mergedSignal = this.mergeSignals(request.signal, controller.signal);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body: OllamaGenerateBody = {
        model: request.modelId,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        options: {
          temperature: request.temperature,
          num_predict: request.maxTokens,
          top_p: request.topP,
          stop: request.stop ? [...request.stop] : undefined,
        },
      };

      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: mergedSignal,
      });

      if (!res.ok) {
        clearTimeout(timer);
        if (res.status === 404) {
          return fail(new ModelUnavailableError(request.modelId));
        }
        const text = await res.text().catch(() => '');
        return fail(new StreamFailedError(`HTTP ${res.status}: ${text}`));
      }

      if (!res.body) {
        clearTimeout(timer);
        return fail(new StreamFailedError('Response body is null'));
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let index = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n').filter((l) => l.trim().length > 0);

        for (const line of lines) {
          let parsed: OllamaStreamChunk;
          try {
            parsed = JSON.parse(line) as OllamaStreamChunk;
          } catch {
            continue;
          }

          const chunk: LLMStreamingChunk = {
            requestId: request.requestId,
            modelId: request.modelId,
            delta: parsed.message.content,
            index: index++,
            isLast: parsed.done,
            usage:
              parsed.done && parsed.eval_count !== undefined
                ? {
                    promptTokens: parsed.prompt_eval_count ?? 0,
                    completionTokens: parsed.eval_count,
                    totalTokens: (parsed.prompt_eval_count ?? 0) + parsed.eval_count,
                  }
                : undefined,
            finishReason: parsed.done ? 'stop' : undefined,
          };

          onChunk(chunk);
          if (parsed.done) break;
        }
      }

      clearTimeout(timer);
      return ok(undefined);
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === 'AbortError') {
        if (request.signal?.aborted) {
          return fail(new CancelledError('generateStream'));
        }
        return fail(new TimeoutError('generateStream', timeoutMs));
      }
      return fail(new StreamFailedError(error instanceof Error ? error.message : String(error)));
    }
  }

  public async destroy(): Promise<void> {
    // No persistent connections to clean up for fetch-based Ollama client
  }

  private mergeSignals(external?: AbortSignal, internal?: AbortSignal): AbortSignal {
    if (!external) return internal ?? AbortSignal.timeout(this.timeoutMs);
    const controller = new AbortController();
    const abortHandler = (): void => controller.abort();
    external.addEventListener('abort', abortHandler, { once: true });
    internal?.addEventListener('abort', abortHandler, { once: true });
    return controller.signal;
  }
}

// ─── llama.cpp Runtime ────────────────────────────────────────────────────────

interface LlamaCppChatBody {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  n_predict?: number;
  top_p?: number;
  stop?: string[];
  stream: boolean;
}

interface LlamaCppChatResponse {
  choices: Array<{ message: { content: string }; finish_reason: string }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface LlamaCppStreamChunk {
  choices: Array<{ delta: { content?: string }; finish_reason?: string | null }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export class LlamaCppRuntime implements IModelRuntime {
  public readonly runtimeType = 'llamacpp';
  public readonly capabilities: RuntimeCapabilities = {
    supportsStreaming: true,
    supportsEmbeddings: false,
    supportsChatMessages: true,
    supportsCompletion: true,
    maxConcurrentRequests: 1,
  };

  private readonly serverUrl: string;
  private readonly timeoutMs: number;

  constructor(serverUrl: string, timeoutMs: number) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
  }

  public async healthCheck(): Promise<RuntimeStatus> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      const res = await fetch(`${this.serverUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        return {
          runtimeType: this.runtimeType,
          status: 'healthy',
          checkedAt: Date.now(),
        };
      }
      return {
        runtimeType: this.runtimeType,
        status: 'degraded',
        errorMessage: `llama.cpp returned HTTP ${res.status}`,
        checkedAt: Date.now(),
      };
    } catch (error) {
      return {
        runtimeType: this.runtimeType,
        status: 'unavailable',
        errorMessage: error instanceof Error ? error.message : String(error),
        checkedAt: Date.now(),
      };
    }
  }

  public async listModels(): Promise<Result<readonly ModelInfo[]>> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      const res = await fetch(`${this.serverUrl}/v1/models`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        return fail(new RuntimeUnavailableError(`llamacpp (HTTP ${res.status})`));
      }
      const data = (await res.json()) as { data: Array<{ id: string }> };
      return ok(
        data.data.map((m) => ({
          id: m.id,
          name: m.id,
          familyName: 'llama',
          contextLength: 4096,
        })),
      );
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(new RuntimeUnavailableError('llamacpp', cause));
    }
  }

  public async generate(request: GenerationRequest): Promise<Result<GenerationResponse>> {
    const start = Date.now();
    const controller = new AbortController();
    const timeoutMs = request.timeoutMs ?? this.timeoutMs;
    const mergedSignal = this.mergeSignals(request.signal, controller.signal);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body: LlamaCppChatBody = {
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: request.temperature,
        n_predict: request.maxTokens,
        top_p: request.topP,
        stop: request.stop ? [...request.stop] : undefined,
        stream: false,
      };

      const res = await fetch(`${this.serverUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: mergedSignal,
      });

      clearTimeout(timer);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return fail(new GenerationFailedError(`HTTP ${res.status}: ${text}`));
      }

      const data = (await res.json()) as LlamaCppChatResponse;
      const choice = data.choices[0];
      if (!choice) {
        return fail(new GenerationFailedError('Empty choices array in llama.cpp response'));
      }

      return ok({
        requestId: request.requestId,
        modelId: request.modelId,
        content: choice.message.content,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
        finishReason: (choice.finish_reason === 'stop' ? 'stop' : 'length') as 'stop' | 'length',
        latencyMs: Date.now() - start,
      });
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === 'AbortError') {
        if (request.signal?.aborted) return fail(new CancelledError('generate'));
        return fail(new TimeoutError('generate', timeoutMs));
      }
      return fail(toAetherAIError(error));
    }
  }

  public async generateStream(
    request: StreamingGenerationRequest,
    onChunk: (chunk: LLMStreamingChunk) => void,
  ): Promise<Result<void>> {
    const controller = new AbortController();
    const timeoutMs = request.timeoutMs ?? this.timeoutMs;
    const mergedSignal = this.mergeSignals(request.signal, controller.signal);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body: LlamaCppChatBody = {
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: request.temperature,
        n_predict: request.maxTokens,
        top_p: request.topP,
        stop: request.stop ? [...request.stop] : undefined,
        stream: true,
      };

      const res = await fetch(`${this.serverUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: mergedSignal,
      });

      if (!res.ok) {
        clearTimeout(timer);
        const text = await res.text().catch(() => '');
        return fail(new StreamFailedError(`HTTP ${res.status}: ${text}`));
      }

      if (!res.body) {
        clearTimeout(timer);
        return fail(new StreamFailedError('Response body is null'));
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let index = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n').filter((l) => l.startsWith('data: '));

        for (const line of lines) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') {
            onChunk({
              requestId: request.requestId,
              modelId: request.modelId,
              delta: '',
              index: index++,
              isLast: true,
              finishReason: 'stop',
            });
            break;
          }
          let parsed: LlamaCppStreamChunk;
          try {
            parsed = JSON.parse(jsonStr) as LlamaCppStreamChunk;
          } catch {
            continue;
          }
          const choice = parsed.choices[0];
          if (!choice) continue;
          const isLast = choice.finish_reason != null;
          onChunk({
            requestId: request.requestId,
            modelId: request.modelId,
            delta: choice.delta.content ?? '',
            index: index++,
            isLast,
            finishReason: isLast ? 'stop' : undefined,
          });
        }
      }

      clearTimeout(timer);
      return ok(undefined);
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === 'AbortError') {
        if (request.signal?.aborted) return fail(new CancelledError('generateStream'));
        return fail(new TimeoutError('generateStream', timeoutMs));
      }
      return fail(new StreamFailedError(error instanceof Error ? error.message : String(error)));
    }
  }

  public async destroy(): Promise<void> {
    // No persistent connections to clean up
  }

  private mergeSignals(external?: AbortSignal, internal?: AbortSignal): AbortSignal {
    if (!external) return internal ?? AbortSignal.timeout(this.timeoutMs);
    const controller = new AbortController();
    const abortHandler = (): void => controller.abort();
    external.addEventListener('abort', abortHandler, { once: true });
    internal?.addEventListener('abort', abortHandler, { once: true });
    return controller.signal;
  }
}

// ─── No-Op Runtime ────────────────────────────────────────────────────────────

export class NoOpRuntime implements IModelRuntime {
  public readonly runtimeType = 'none';
  public readonly capabilities: RuntimeCapabilities = {
    supportsStreaming: false,
    supportsEmbeddings: false,
    supportsChatMessages: false,
    supportsCompletion: false,
    maxConcurrentRequests: 0,
  };

  public async healthCheck(): Promise<RuntimeStatus> {
    return {
      runtimeType: 'none',
      status: 'unconfigured',
      errorMessage: 'No LLM runtime is configured.',
      checkedAt: Date.now(),
    };
  }

  public async listModels(): Promise<Result<readonly ModelInfo[]>> {
    return fail(
      makeError('NOT_CONFIGURED' as AIErrorCode, 'No LLM runtime is configured.', undefined, false),
    );
  }

  public async generate(_request: GenerationRequest): Promise<Result<GenerationResponse>> {
    return fail(new ModelUnavailableError());
  }

  public async generateStream(
    _request: StreamingGenerationRequest,
    _onChunk: (chunk: LLMStreamingChunk) => void,
  ): Promise<Result<void>> {
    return fail(new ModelUnavailableError());
  }

  public async destroy(): Promise<void> {
    // nothing to destroy
  }
}

// ─── Runtime Factory ──────────────────────────────────────────────────────────

export function createModelRuntime(config: LLMRuntimeConfig): IModelRuntime {
  switch (config.type) {
    case 'ollama':
      return new OllamaRuntime(config.baseUrl, config.timeoutMs);
    case 'llamacpp':
      return new LlamaCppRuntime(config.serverUrl, config.timeoutMs);
    case 'none':
      return new NoOpRuntime();
    default: {
      const exhaustive: never = config;
      throw new NotConfiguredError(`Unknown runtime type: ${JSON.stringify(exhaustive)}`);
    }
  }
}
