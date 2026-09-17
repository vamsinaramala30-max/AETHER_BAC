/**
 * AETHER AI — OpenAI Fallback Provider
 * Implements ILLMProvider using OpenAI Chat Completions API (gpt-4o-mini / gpt-4o).
 */

import type { Result } from '../../ai-types.js';
import { ok, fail } from '../../ai-types.js';
import {
  AuthError,
  RateLimitError,
  QuotaExceededError,
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

export class OpenAIProvider implements ILLMProvider {
  public readonly name: ProviderName = 'openai';

  private readonly apiKey: string | undefined;
  private readonly defaultModel: string;
  private readonly defaultTimeoutMs: number;

  constructor(apiKey?: string, defaultModel = 'gpt-4o-mini', defaultTimeoutMs = 60_000) {
    this.apiKey = apiKey || process.env['OPENAI_API_KEY'];
    this.defaultModel = defaultModel;
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  public async healthCheck(): Promise<ProviderStatus> {
    const checkedAt = Date.now();
    if (!this.apiKey || this.apiKey.trim().length === 0) {
      return {
        name: this.name,
        status: 'config_error',
        message: 'OPENAI_API_KEY is not configured',
        checkedAt,
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 401 || res.status === 403) {
        return {
          name: this.name,
          status: 'config_error',
          message: `Invalid OpenAI Key (HTTP ${res.status})`,
          checkedAt,
        };
      }
      if (res.status === 429) {
        return {
          name: this.name,
          status: 'rate_limited',
          message: 'OpenAI Rate Limited',
          checkedAt,
        };
      }
      if (!res.ok) {
        return {
          name: this.name,
          status: 'unavailable',
          message: `OpenAI HTTP ${res.status}`,
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
    if (!this.apiKey) {
      return fail(new AuthError('openai', 'OPENAI_API_KEY is missing'));
    }
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
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2048,
        top_p: request.topP ?? 0.9,
        stream: false,
      };

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        return fail(await this.handleHttpError(res));
      }

      const data = (await res.json()) as any;
      const content = data.choices?.[0]?.message?.content ?? '';
      const finishReason = data.choices?.[0]?.finish_reason ?? 'stop';

      return ok({
        requestId: request.requestId,
        modelId: model,
        content,
        finishReason,
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
          totalTokens: data.usage?.total_tokens ?? 0,
        },
        latencyMs: Date.now() - start,
        rawResponse: data,
      });
    } catch (err) {
      clearTimeout(timer);
      if (request.signal?.aborted) return fail(new CancelledError('generate'));
      if (err instanceof Error && err.name === 'AbortError') {
        return fail(new TimeoutError('openai.generate', timeoutMs));
      }
      return fail(
        new NetworkError(
          'openai',
          err instanceof Error ? err.message : String(err),
          err instanceof Error ? err : undefined,
        ),
      );
    }
  }

  public async generateStream(
    request: StreamingGenerationRequest,
    onChunk: (chunk: LLMStreamingChunk) => void,
  ): Promise<Result<void>> {
    if (!this.apiKey) {
      return fail(new AuthError('openai', 'OPENAI_API_KEY is missing'));
    }
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
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2048,
        top_p: request.topP ?? 0.9,
        stream: true,
      };

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok) {
        clearTimeout(timer);
        return fail(await this.handleHttpError(res));
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
          if (trimmed.startsWith('data: ')) {
            const rawJson = trimmed.slice(6);
            if (rawJson === '[DONE]') continue;
            try {
              const parsed = JSON.parse(rawJson);
              const textDelta = parsed.choices?.[0]?.delta?.content;
              if (textDelta) {
                onChunk({
                  requestId: request.requestId,
                  modelId: model,
                  delta: textDelta,
                  index: chunkIndex++,
                  isLast: false,
                });
              }
            } catch {
              // Ignore partial line decode
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
        return fail(new TimeoutError('openai.generateStream', timeoutMs));
      }
      return fail(
        new NetworkError(
          'openai',
          err instanceof Error ? err.message : String(err),
          err instanceof Error ? err : undefined,
        ),
      );
    }
  }

  private resolveModelId(requested?: string): string {
    if (
      !requested ||
      requested === 'auto' ||
      requested === 'default' ||
      requested.includes('gemini') ||
      requested.includes('llama')
    ) {
      return this.defaultModel;
    }
    return requested;
  }

  private async handleHttpError(res: Response) {
    let text = '';
    try {
      text = await res.text();
    } catch {
      // ignore
    }

    if (res.status === 401 || res.status === 403) {
      return new AuthError('openai', `API key error: ${text}`);
    }
    if (res.status === 429) {
      if (text.toLowerCase().includes('quota') || text.toLowerCase().includes('exceeded')) {
        return new QuotaExceededError('openai');
      }
      return new RateLimitError('openai');
    }
    if (res.status >= 500) {
      return new ProviderUnavailableError('openai', `HTTP ${res.status}: ${text}`);
    }
    return new GenerationFailedError(`OpenAI HTTP ${res.status}: ${text}`);
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
