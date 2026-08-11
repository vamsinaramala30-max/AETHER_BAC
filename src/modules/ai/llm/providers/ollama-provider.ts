/**
 * AETHER AI — Ollama Provider
 * Implements ILLMProvider wrapping local Ollama service.
 */

import type { Result } from '../../ai-types.js';
import { ok, fail } from '../../ai-types.js';
import {
  ProviderUnavailableError,
  NetworkError,
  TimeoutError,
  CancelledError,
  StreamFailedError,
  GenerationFailedError,
} from '../../ai-errors.js';
import type {
  GenerationRequest,
  StreamingGenerationRequest,
  GenerationResponse,
  LLMStreamingChunk,
} from '../llm-types.js';
import type { ILLMProvider, ProviderName, ProviderStatus } from './provider-interface.js';

export class OllamaProvider implements ILLMProvider {
  public readonly name: ProviderName = 'ollama';

  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly defaultTimeoutMs: number;

  constructor(
    baseUrl = 'http://localhost:11434',
    defaultModel = 'llama3.2',
    defaultTimeoutMs = 120_000,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.defaultModel = defaultModel;
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  public async healthCheck(): Promise<ProviderStatus> {
    const checkedAt = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        return {
          name: this.name,
          status: 'unavailable',
          message: `Ollama HTTP ${res.status}`,
          checkedAt,
        };
      }

      return {
        name: this.name,
        status: 'available',
        checkedAt,
      };
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      return {
        name: this.name,
        status: isTimeout ? 'timeout' : 'unavailable',
        message: err instanceof Error ? err.message : String(err),
        checkedAt,
      };
    }
  }

  public async generate(request: GenerationRequest): Promise<Result<GenerationResponse>> {
    if (request.signal?.aborted) {
      return fail(new CancelledError('generate'));
    }

    const start = Date.now();
    const model = this.resolveModelId(request.modelId);
    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const signal = this.mergeSignals(request.signal, controller.signal);

    try {
      const body = {
        model,
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
        signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        return fail(new ProviderUnavailableError('ollama', `HTTP ${res.status}`));
      }

      const data = (await res.json()) as any;
      const content = data.message?.content ?? '';

      return ok({
        requestId: request.requestId,
        modelId: model,
        content,
        finishReason: 'stop',
        usage: {
          promptTokens: data.prompt_eval_count ?? 0,
          completionTokens: data.eval_count ?? 0,
          totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
        },
        latencyMs: Date.now() - start,
        rawResponse: data,
      });
    } catch (err) {
      clearTimeout(timer);
      if (request.signal?.aborted) return fail(new CancelledError('generate'));
      if (err instanceof Error && err.name === 'AbortError') {
        return fail(new TimeoutError('ollama.generate', timeoutMs));
      }
      return fail(new NetworkError('ollama', err instanceof Error ? err.message : String(err), err instanceof Error ? err : undefined));
    }
  }

  public async generateStream(
    request: StreamingGenerationRequest,
    onChunk: (chunk: LLMStreamingChunk) => void,
  ): Promise<Result<void>> {
    if (request.signal?.aborted) {
      return fail(new CancelledError('generateStream'));
    }

    const model = this.resolveModelId(request.modelId);
    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const signal = this.mergeSignals(request.signal, controller.signal);

    try {
      const body = {
        model,
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
        signal,
      });

      if (!res.ok) {
        clearTimeout(timer);
        return fail(new ProviderUnavailableError('ollama', `HTTP ${res.status}`));
      }

      if (!res.body) {
        clearTimeout(timer);
        return fail(new StreamFailedError('Response body is null'));
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let chunkIndex = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            try {
              const parsed = JSON.parse(trimmed);
              const textDelta = parsed.message?.content;
              if (textDelta) {
                onChunk({
                  requestId: request.requestId,
                  modelId: model,
                  delta: textDelta,
                  index: chunkIndex++,
                  isLast: parsed.done ?? false,
                });
              }
            } catch {
              // Ignore partial JSON line
            }
          }
        }
      }

      clearTimeout(timer);

      onChunk({
        requestId: request.requestId,
        modelId: model,
        delta: '',
        index: chunkIndex,
        isLast: true,
        finishReason: 'stop',
      });

      return ok(undefined);
    } catch (err) {
      clearTimeout(timer);
      if (request.signal?.aborted) return fail(new CancelledError('generateStream'));
      if (err instanceof Error && err.name === 'AbortError') {
        return fail(new TimeoutError('ollama.generateStream', timeoutMs));
      }
      return fail(new NetworkError('ollama', err instanceof Error ? err.message : String(err), err instanceof Error ? err : undefined));
    }
  }

  private resolveModelId(requested?: string): string {
    if (!requested || requested === 'auto' || requested === 'default' || requested.includes('gemini') || requested.includes('gpt')) {
      return this.defaultModel;
    }
    return requested;
  }

  private mergeSignals(sig1?: AbortSignal, sig2?: AbortSignal): AbortSignal {
    if (!sig1) return sig2!;
    if (!sig2) return sig1;
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (sig1.aborted || sig2.aborted) {
      controller.abort();
      return controller.signal;
    }
    sig1.addEventListener('abort', onAbort, { once: true });
    sig2.addEventListener('abort', onAbort, { once: true });
    return controller.signal;
  }
}
