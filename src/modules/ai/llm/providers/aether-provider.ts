/**
 * AETHER AI — Aether Model Provider
 * Implements ILLMProvider wrapping the authoritative AETHER_MODEL Python inference engine.
 */

import type { Result } from '../../ai-types.js';
import { ok, fail } from '../../ai-types.js';
import {
  ProviderUnavailableError,
  TimeoutError,
  CancelledError,
  StreamFailedError,
  GenerationFailedError,
  BlockedByWeightsError,
  RateLimitError,
} from '../../ai-errors.js';
import type {
  GenerationRequest,
  StreamingGenerationRequest,
  GenerationResponse,
  LLMStreamingChunk,
} from '../llm-types.js';
import type { ILLMProvider, ProviderName, ProviderStatus } from './provider-interface.js';
import type { IModelProvider, ModelStatusInfo } from '../../interfaces/core-contracts.js';
import { metrics } from '../../observability/metrics.js';
import { tracer } from '../../observability/tracing.js';
import { logger } from '../../observability/logger.js';
import { performance } from 'perf_hooks';

export class AetherModelProvider implements ILLMProvider, IModelProvider {
  public readonly name: ProviderName = 'aether';

  private readonly baseUrl: string;
  private readonly defaultTimeoutMs: number;

  constructor(
    baseUrl = process.env['AETHER_MODEL_BASE_URL'] ||
      process.env['AETHER_MODEL_URL'] ||
      'http://localhost:5002',
    defaultTimeoutMs = Number(process.env['AETHER_MODEL_TIMEOUT_MS']) ||
      Number(process.env['LOCAL_LLM_TIMEOUT']) ||
      15_000,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  public async healthCheck(): Promise<ProviderStatus> {
    const checkedAt = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2_000);
      const res = await fetch(`${this.baseUrl}/health`, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        if (res.status === 429) {
          return {
            name: this.name,
            status: 'rate_limited',
            message: 'Aether Model server is busy / rate limited [MODEL_BUSY]',
            checkedAt,
          };
        }
        return {
          name: this.name,
          status: 'unavailable',
          message: `Aether Model HTTP ${res.status} [MODEL_UNAVAILABLE]`,
          checkedAt,
        };
      }

      const body = (await res.json()) as any;
      const isExplicitlyBlocked =
        body?.has_trained_weights === false ||
        body?.status === 'BLOCKED_BY_WEIGHTS' ||
        body?.status === 'BLOCKED_BY_MISSING_WEIGHTS';
      const rawStatus = body?.status || body?.state || (isExplicitlyBlocked ? 'BLOCKED_BY_MISSING_WEIGHTS' : 'READY');

      if (isExplicitlyBlocked) {
        return {
          name: this.name,
          status: 'unavailable',
          message: `${rawStatus}: ${body?.message || 'Trained weights missing'}`,
          checkedAt,
        };
      }

      if (rawStatus === 'LOADING') {
        return {
          name: this.name,
          status: 'loading',
          message: `aether: ${body?.model || 'Model'} is loading weights [MODEL_LOADING]`,
          checkedAt,
        };
      }

      if (
        rawStatus === 'READY' ||
        rawStatus === 'NOT_LOADED' ||
        rawStatus === 'UNINITIALIZED' ||
        body?.ok === true
      ) {
        return {
          name: this.name,
          status: 'available',
          message: `aether: ${body?.model || 'Aether Model Authoritative'}`,
          checkedAt,
        };
      }

      return {
        name: this.name,
        status: 'unavailable',
        message: `${rawStatus}: ${body?.message || 'Model not ready'}`,
        checkedAt,
      };
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      return {
        name: this.name,
        status: isTimeout ? 'timeout' : 'unavailable',
        message: isTimeout
          ? 'TIMEOUT: Aether Model health check timed out'
          : `MODEL_UNAVAILABLE: ${err instanceof Error ? err.message : String(err)}`,
        checkedAt,
      };
    }
  }

  public async getModelStatus(): Promise<ModelStatusInfo> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2_000);
      const res = await fetch(`${this.baseUrl}/model/status`, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        return {
          state: res.status === 429 ? 'BUSY' : 'UNAVAILABLE',
          error: `HTTP ${res.status}`,
        };
      }

      const body = (await res.json()) as any;
      const rawState = body?.state || body?.status;
      let state: 'NOT_LOADED' | 'LOADING' | 'READY' | 'ERROR' | 'UNAVAILABLE' | 'BUSY' = 'READY';
      if (rawState === 'NOT_LOADED' || rawState === 'UNINITIALIZED') {
        state = 'NOT_LOADED';
      } else if (rawState === 'LOADING') {
        state = 'LOADING';
      } else if (rawState === 'READY') {
        state = 'READY';
      } else if (rawState === 'BUSY' || rawState === 'RATE_LIMITED') {
        state = 'BUSY';
      } else if (rawState === 'FAILED' || rawState === 'ERROR') {
        state = 'ERROR';
      } else if (
        rawState === 'UNAVAILABLE' ||
        rawState === 'BLOCKED_BY_WEIGHTS' ||
        rawState === 'BLOCKED_BY_MISSING_WEIGHTS'
      ) {
        state = 'UNAVAILABLE';
      }

      return {
        state,
        modelName: body?.model,
        error: body?.error,
        loadDurationSeconds: body?.load_duration_s,
        hasTrainedWeights: body?.has_trained_weights ?? true,
      };
    } catch (err) {
      return {
        state: 'UNAVAILABLE',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  public async generate(request: GenerationRequest): Promise<Result<GenerationResponse>> {
    if (request.signal?.aborted) {
      return fail(new CancelledError('generate'));
    }

    const startNow = performance.now();
    metrics.recordModelRequest('aether', request.modelId);
    const span = tracer.startSpan('model.inference', {
      component: 'AETHER-MODEL',
      attributes: {
        provider: 'aether',
        modelId: request.modelId,
        streaming: false,
      },
    });

    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
    const maxRetries = 2; // Bounded retry: up to 2 retries (total 3 attempts) for safe transient errors
    let attempt = 0;

    while (true) {
      if (request.signal?.aborted) {
        tracer.endSpan(span.spanId, 'cancelled');
        metrics.recordModelFailure('aether', request.modelId, 'CANCELLED');
        return fail(new CancelledError('generate'));
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const signal = this.mergeSignals(request.signal, controller.signal);

      try {
        const lastMsg = request.messages[request.messages.length - 1]?.content || '';
        const CANONICAL_IDENTITY_PROMPT =
          `Aether is an AI Life OS developed by Vamsi. Aether is an intelligent AI platform that helps users think, learn, organize, create, research, plan, manage projects, manage knowledge, remember useful context, and automate work. Aether combines Assistant, Memory, Knowledge, Projects, Workspace, Automation, Agents, RAG, and native neural language inference into one integrated AI platform.`;
        const systemMsg =
          request.messages.find((m) => m.role === 'system')?.content || CANONICAL_IDENTITY_PROMPT;

        // Build full context prompt: system + conversation history + user message
        const contextParts: string[] = [];
        if (systemMsg) contextParts.push(systemMsg);
        for (const m of request.messages) {
          if (m.role !== 'system') {
            contextParts.push(`${m.role}: ${m.content}`);
          }
        }
        const fullPrompt = contextParts.join('\n\n');

        const body = {
          prompt: fullPrompt || lastMsg,
          messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
          temperature: request.temperature,
          max_tokens: request.maxTokens || 256,
          use_rag: false,
          use_memory: false,
          context: {
            system_prompt: systemMsg,
            max_tokens: request.maxTokens || 256,
          },
        };

        const res = await fetch(`${this.baseUrl}/v1/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        });

        clearTimeout(timer);

        if (res.status === 503 || res.status === 502) {
          let errData: any;
          try {
            errData = await res.json();
          } catch {
            errData = null;
          }
          if (
            errData?.error?.code === 'BLOCKED_BY_WEIGHTS' ||
            errData?.status === 'BLOCKED_BY_WEIGHTS'
          ) {
            tracer.endSpan(span.spanId, 'error', { code: 'BLOCKED_BY_WEIGHTS' });
            metrics.recordModelFailure('aether', request.modelId, 'BLOCKED_BY_WEIGHTS');
            return fail(new BlockedByWeightsError());
          }

          // Transient server error: retry if bounded
          if (attempt < maxRetries && !request.signal?.aborted) {
            attempt++;
            const backoffMs = Math.min(100 * Math.pow(2, attempt), 1000);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }

          tracer.endSpan(span.spanId, 'error', { code: 'MODEL_UNAVAILABLE' });
          metrics.recordModelFailure('aether', request.modelId, 'MODEL_UNAVAILABLE');
          return fail(
            new ProviderUnavailableError(
              'aether',
              `Aether Model server unavailable (HTTP ${res.status}): ${errData?.message || errData?.error?.message || 'Service unavailable'}`,
            ),
          );
        }

        if (res.status === 429) {
          if (attempt < maxRetries && !request.signal?.aborted) {
            attempt++;
            const backoffMs = Math.min(200 * Math.pow(2, attempt), 2000);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }
          tracer.endSpan(span.spanId, 'error', { code: 'RATE_LIMIT' });
          metrics.recordModelFailure('aether', request.modelId, 'RATE_LIMIT');
          return fail(new RateLimitError('aether'));
        }

        if (!res.ok) {
          tracer.endSpan(span.spanId, 'error', { code: `HTTP_${res.status}` });
          metrics.recordModelFailure('aether', request.modelId, `HTTP_${res.status}`);
          return fail(new GenerationFailedError(`Aether Model returned HTTP status ${res.status}`));
        }

        let data: any;
        try {
          data = await res.json();
        } catch {
          tracer.endSpan(span.spanId, 'error', { code: 'INVALID_RESPONSE' });
          metrics.recordModelFailure('aether', request.modelId, 'INVALID_RESPONSE');
          return fail(new GenerationFailedError('Aether Model returned malformed non-JSON response'));
        }

        if (data?.error) {
          const errCode = data.error.code || 'GENERATION_FAILED';
          const errMsg = data.error.message || 'Model generation failed';
          tracer.endSpan(span.spanId, 'error', { code: errCode });
          metrics.recordModelFailure('aether', request.modelId, errCode);
          if (errCode === 'BLOCKED_BY_WEIGHTS') {
            return fail(new BlockedByWeightsError(errMsg));
          }
          return fail(new GenerationFailedError(errMsg));
        }

        if (typeof data?.content !== 'string') {
          tracer.endSpan(span.spanId, 'error', { code: 'INVALID_RESPONSE' });
          metrics.recordModelFailure('aether', request.modelId, 'INVALID_RESPONSE');
          return fail(new GenerationFailedError('Invalid response from Aether Model: missing or non-string "content" property'));
        }

        const latencyMs = Number((performance.now() - startNow).toFixed(2));
        metrics.recordModelLatency(latencyMs, 'aether', request.modelId);
        if (data.usage?.prompt_tokens) {
          metrics.recordModelTokens('aether', request.modelId, data.usage.prompt_tokens, 'prompt');
        }
        if (data.usage?.completion_tokens) {
          metrics.recordModelTokens('aether', request.modelId, data.usage.completion_tokens, 'completion');
        }
        tracer.endSpan(span.spanId, 'ok');

        const response: GenerationResponse = {
          requestId: request.requestId,
          modelId: request.modelId,
          content: data.content,
          finishReason: 'stop',
          latencyMs,
          usage: {
            promptTokens: data.usage?.prompt_tokens || 0,
            completionTokens: data.usage?.completion_tokens || 0,
            totalTokens: data.usage?.total_tokens || 0,
          },
        };

        return ok(response);
      } catch (err) {
        clearTimeout(timer);

        if (err instanceof Error && err.name === 'AbortError') {
          if (request.signal?.aborted) {
            tracer.endSpan(span.spanId, 'cancelled');
            metrics.recordModelFailure('aether', request.modelId, 'CANCELLED');
            return fail(new CancelledError('generate'));
          }
          tracer.endSpan(span.spanId, 'error', { code: 'TIMEOUT' });
          metrics.recordModelTimeout('aether', request.modelId);
          return fail(new TimeoutError('generate', timeoutMs));
        }

        const isNetworkOrConnError =
          err instanceof TypeError ||
          (err as any)?.code === 'ECONNRESET' ||
          (err as any)?.code === 'ECONNREFUSED' ||
          (err instanceof Error && (err.message.includes('fetch failed') || err.message.includes('ECONNRESET')));

        if (isNetworkOrConnError && attempt < maxRetries && !request.signal?.aborted) {
          attempt++;
          const backoffMs = Math.min(100 * Math.pow(2, attempt), 1000);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        tracer.endSpan(span.spanId, 'error', { code: 'MODEL_UNAVAILABLE' });
        metrics.recordModelFailure('aether', request.modelId, 'MODEL_UNAVAILABLE');

        return fail(
          new ProviderUnavailableError(
            'aether',
            `Local AI inference model service is unavailable: ${err instanceof Error ? err.message : String(err)}`,
            err instanceof Error ? err : undefined,
          ),
        );
      }
    }
  }

  public async generateStream(
    request: StreamingGenerationRequest,
    onChunk: (chunk: LLMStreamingChunk) => void,
  ): Promise<Result<void>> {
    if (request.signal?.aborted) {
      return fail(new CancelledError('generateStream'));
    }

    const startNow = performance.now();
    let firstTokenRecorded = false;
    metrics.recordModelRequest('aether', request.modelId);

    const span = tracer.startSpan('model.inference.stream', {
      component: 'AETHER-MODEL',
      attributes: {
        provider: 'aether',
        modelId: request.modelId,
        streaming: true,
      },
    });

    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const signal = this.mergeSignals(request.signal, controller.signal);
    let chunkIndex = 0;

    try {
      const lastMsg = request.messages[request.messages.length - 1]?.content || '';
      const CANONICAL_IDENTITY_PROMPT =
        `Aether is an AI Life OS developed by Vamsi. Aether is an intelligent AI platform that helps users think, learn, organize, create, research, plan, manage projects, manage knowledge, remember useful context, and automate work. Aether combines Assistant, Memory, Knowledge, Projects, Workspace, Automation, Agents, RAG, and native neural language inference into one integrated AI platform.`;
      const systemMsg =
        request.messages.find((m) => m.role === 'system')?.content || CANONICAL_IDENTITY_PROMPT;

      // Build full context prompt
      const contextParts: string[] = [];
      if (systemMsg) contextParts.push(systemMsg);
      for (const m of request.messages) {
        if (m.role !== 'system') {
          contextParts.push(`${m.role}: ${m.content}`);
        }
      }
      const fullPrompt = contextParts.join('\n\n');

      const body = {
        prompt: fullPrompt || lastMsg,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: request.temperature,
        max_tokens: request.maxTokens || 256,
        use_rag: false,
        use_memory: false,
        context: {
          system_prompt: systemMsg,
          max_tokens: request.maxTokens || 256,
        },
      };

      const res = await fetch(`${this.baseUrl}/v1/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });

      clearTimeout(timer);

      if (res.status === 503) {
        let errData: any;
        try {
          errData = await res.json();
        } catch {
          errData = null;
        }
        if (errData?.error?.code === 'BLOCKED_BY_WEIGHTS' || errData?.status === 'BLOCKED_BY_WEIGHTS') {
          return fail(new BlockedByWeightsError());
        }
        return fail(new ProviderUnavailableError('aether', 'Aether Model server unavailable (HTTP 503)'));
      }

      if (!res.ok) {
        return fail(new StreamFailedError(`Aether Model SSE returned HTTP status ${res.status}`));
      }

      if (!res.body) {
        return fail(new StreamFailedError('Aether Model returned empty SSE response body'));
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        if (request.signal?.aborted) {
          await reader.cancel().catch(() => {});
          tracer.endSpan(span.spanId, 'cancelled');
          metrics.recordModelFailure('aether', request.modelId, 'CANCELLED');
          return fail(new CancelledError('generateStream'));
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr === '[DONE]') {
            if (!firstTokenRecorded) {
              metrics.recordModelTimeToFirstToken(
                Number((performance.now() - startNow).toFixed(2)),
                'aether',
                request.modelId,
              );
            }
            tracer.endSpan(span.spanId, 'ok');
            onChunk({
              requestId: request.requestId,
              modelId: request.modelId,
              delta: '',
              index: chunkIndex++,
              isLast: true,
              finishReason: 'stop',
            });
            return ok(undefined);
          }

          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.error) {
              tracer.endSpan(span.spanId, 'error', { code: parsed.error.code || 'STREAM_FAILED' });
              return fail(new StreamFailedError(parsed.error.message || 'Stream error from model server'));
            }
            const delta = parsed.delta ?? parsed.token ?? parsed.text;
            if (delta !== undefined && delta !== '') {
              if (!firstTokenRecorded) {
                firstTokenRecorded = true;
                metrics.recordModelTimeToFirstToken(
                  Number((performance.now() - startNow).toFixed(2)),
                  'aether',
                  request.modelId,
                );
              }
              onChunk({
                requestId: request.requestId,
                modelId: request.modelId,
                delta,
                index: chunkIndex++,
                isLast: parsed.done === true || parsed.is_last === true,
              });
            }
            if (parsed.done) {
              tracer.endSpan(span.spanId, 'ok');
              onChunk({
                requestId: request.requestId,
                modelId: request.modelId,
                delta: '',
                index: chunkIndex++,
                isLast: true,
                finishReason: 'stop',
              });
              return ok(undefined);
            }
          } catch {
            // Ignore partial SSE chunk parse error
          }
        }
      }

      tracer.endSpan(span.spanId, 'ok');
      onChunk({
        requestId: request.requestId,
        modelId: request.modelId,
        delta: '',
        index: chunkIndex++,
        isLast: true,
        finishReason: 'stop',
      });
      return ok(undefined);
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === 'AbortError') {
        if (request.signal?.aborted) {
          tracer.endSpan(span.spanId, 'cancelled');
          metrics.recordModelFailure('aether', request.modelId, 'CANCELLED');
          return fail(new CancelledError('generateStream'));
        }
        tracer.endSpan(span.spanId, 'error', { code: 'TIMEOUT' });
        metrics.recordModelTimeout('aether', request.modelId);
        return fail(new TimeoutError('generateStream', timeoutMs));
      }

      tracer.endSpan(span.spanId, 'error', { code: 'STREAM_FAILED' });
      metrics.recordModelFailure('aether', request.modelId, 'STREAM_FAILED');

      const isUnavailable =
        (err as any)?.code === 'ECONNREFUSED' ||
        (err instanceof Error && (err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed')));

      if (isUnavailable) {
        return fail(
          new ProviderUnavailableError(
            'aether',
            `Local AI inference model service is unavailable: ${err instanceof Error ? err.message : String(err)}`,
            err instanceof Error ? err : undefined,
          ),
        );
      }

      return fail(
        new StreamFailedError(
          `Aether Model server stream failed: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err : undefined,
        ),
      );
    }
  }

  private mergeSignals(s1?: AbortSignal, s2?: AbortSignal): AbortSignal {
    if (!s1) return s2!;
    if (!s2) return s1!;
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    s1.addEventListener('abort', onAbort, { once: true });
    s2.addEventListener('abort', onAbort, { once: true });
    return controller.signal;
  }
}
