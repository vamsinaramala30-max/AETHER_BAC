import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AetherModelProvider } from '../../modules/ai/llm/providers/aether-provider.js';
import { AIOrchestrator } from '../../modules/ai/core/ai-orchestrator.js';
import { StreamingEngine } from '../../modules/ai/core/streaming-engine.js';
import { ResponseEngine } from '../../modules/ai/core/response-engine.js';
import { HeuristicIntentEngine } from '../../modules/ai/core/intent-engine.js';
import { ContextEngine } from '../../modules/ai/core/context-engine.js';
import { PromptEngine } from '../../modules/ai/prompts/prompt-engine.js';
import { ReasoningEngine } from '../../modules/ai/core/reasoning-engine.js';
import { SafetyEngine } from '../../modules/ai/core/safety-engine.js';
import { MemoryEngine } from '../../modules/ai/memory/memory-engine.js';
import { buildDefaultAIConfig } from '../../modules/ai/ai-config.js';
import {
  ProviderUnavailableError,
  TimeoutError,
  CancelledError,
  GenerationFailedError,
} from '../../modules/ai/ai-errors.js';
import { ErrorTaxonomy } from '../../modules/ai/observability/error-taxonomy.js';
import type { GenerationRequest, LLMStreamingChunk } from '../../modules/ai/llm/llm-types.js';
import type { AIRequest, StreamingChunk } from '../../modules/ai/ai-types.js';

describe('Batch 2 — AI & Model Reliability Suite', () => {
  const mockBaseUrl = 'http://127.0.0.1:5002';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. MODEL AVAILABILITY & STATUS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Model Availability & Health Probing', () => {
    it('should report available and READY when model server is healthy and model is loaded', async () => {
      const provider = new AetherModelProvider(mockBaseUrl, 5000);
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('/health') || urlStr.includes('/model/status')) {
          return new Response(JSON.stringify({ status: 'READY', model: 'aether-local', model_loaded: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('Not Found', { status: 404 });
      });

      const health = await provider.healthCheck();
      expect(health.status).toBe('available');
      expect(health.name).toBe('aether');

      const modelStatus = await provider.getModelStatus();
      expect(modelStatus.state).toBe('READY');
      expect(modelStatus.modelName).toBe('aether-local');
    });

    it('should report loading when server returns LOADING status', async () => {
      const provider = new AetherModelProvider(mockBaseUrl, 5000);
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('/health') || urlStr.includes('/model/status')) {
          return new Response(JSON.stringify({ status: 'LOADING', model_loaded: false }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('Not Found', { status: 404 });
      });

      const health = await provider.healthCheck();
      expect(health.status).toBe('loading');

      const modelStatus = await provider.getModelStatus();
      expect(modelStatus.state).toBe('LOADING');
    });

    it('should report busy when server returns 429 Rate Limit / Overloaded', async () => {
      const provider = new AetherModelProvider(mockBaseUrl, 5000);
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('/health') || urlStr.includes('/model/status')) {
          return new Response(JSON.stringify({ detail: 'Busy' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('Not Found', { status: 404 });
      });

      const health = await provider.healthCheck();
      expect(health.status).toBe('rate_limited');

      const modelStatus = await provider.getModelStatus();
      expect(modelStatus.state).toBe('BUSY');
    });

    it('should report unavailable when server is unreachable', async () => {
      const provider = new AetherModelProvider(mockBaseUrl, 5000);
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

      const health = await provider.healthCheck();
      expect(health.status).toBe('unavailable');

      const modelStatus = await provider.getModelStatus();
      expect(modelStatus.state).toBe('UNAVAILABLE');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. NON-STREAMING GENERATION RELIABILITY
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Non-Streaming Generation', () => {
    it('should return real model completion when inference succeeds', async () => {
      const provider = new AetherModelProvider(mockBaseUrl, 5000);
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: 'Hello, this is a genuine neural output from the local model.',
            finish_reason: 'stop',
            usage: { prompt_tokens: 15, completion_tokens: 12, total_tokens: 27 },
            model: 'aether-local',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const request: GenerationRequest = {
        requestId: 'req-real-1',
        modelId: 'default',
        messages: [{ role: 'user', content: 'Say hello' }],
        stream: false,
      };

      const result = await provider.generate(request);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe('Hello, this is a genuine neural output from the local model.');
        expect(result.value.usage?.promptTokens).toBe(15);
        expect(result.value.usage?.completionTokens).toBe(12);
      }
    });

    it('should fail truthfully with ProviderUnavailableError when server is offline (no fake ok)', async () => {
      const provider = new AetherModelProvider(mockBaseUrl, 5000);
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5002'));

      const request: GenerationRequest = {
        requestId: 'req-offline-1',
        modelId: 'default',
        messages: [{ role: 'user', content: 'Are you there?' }],
        stream: false,
      };

      const result = await provider.generate(request);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ProviderUnavailableError);
        expect(result.error.code).toBe('PROVIDER_UNAVAILABLE');
      }
    });

    it('should fail truthfully with TimeoutError when request exceeds timeout (no fake ok)', async () => {
      const provider = new AetherModelProvider(mockBaseUrl, 100);
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options: any) => {
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        });
      });

      const request: GenerationRequest = {
        requestId: 'req-timeout-1',
        modelId: 'default',
        messages: [{ role: 'user', content: 'Slow prompt' }],
        timeoutMs: 100,
        stream: false,
      };

      const result = await provider.generate(request);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(TimeoutError);
        expect(result.error.code).toBe('TIMEOUT');
      }
    });

    it('should fail truthfully with CancelledError when signal is pre-aborted', async () => {
      const provider = new AetherModelProvider(mockBaseUrl, 5000);
      const controller = new AbortController();
      controller.abort();

      const request: GenerationRequest = {
        requestId: 'req-cancelled-1',
        modelId: 'default',
        messages: [{ role: 'user', content: 'Cancelled prompt' }],
        signal: controller.signal,
        stream: false,
      };

      const result = await provider.generate(request);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(CancelledError);
        expect(result.error.code).toBe('CANCELLED');
      }
    });

    it('should fail truthfully when model returns malformed JSON', async () => {
      const provider = new AetherModelProvider(mockBaseUrl, 5000);
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('<!DOCTYPE html><html><body>Error</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      );

      const request: GenerationRequest = {
        requestId: 'req-malformed-1',
        modelId: 'default',
        messages: [{ role: 'user', content: 'Prompt' }],
        stream: false,
      };

      const result = await provider.generate(request);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('GENERATION_FAILED');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. STREAMING GENERATION RELIABILITY (NO SYNTHETIC TOKENS)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Streaming Generation & Zero Synthetic Tokens', () => {
    it('should forward genuine SSE chunks directly to handler without modification', async () => {
      const provider = new AetherModelProvider(mockBaseUrl, 5000);

      const sseBody = [
        'data: {"token": "The", "index": 0, "is_last": false}\n\n',
        'data: {"token": " answer", "index": 1, "is_last": false}\n\n',
        'data: {"token": " is 42.", "index": 2, "is_last": true}\n\n',
      ].join('');

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sseBody));
          controller.close();
        },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const chunksReceived: LLMStreamingChunk[] = [];
      const result = await provider.generateStream(
        {
          requestId: 'req-stream-genuine',
          modelId: 'default',
          messages: [{ role: 'user', content: 'What is 6x7?' }],
          stream: true,
        },
        (chunk) => {
          chunksReceived.push(chunk);
        },
      );

      expect(result.ok).toBe(true);
      const content = chunksReceived.map((c) => c.delta).join('');
      expect(content).toBe('The answer is 42.');
      const lastChunk = chunksReceived[chunksReceived.length - 1];
      expect(lastChunk.isLast).toBe(true);
    });

    it('should fail truthfully when stream endpoint returns HTTP 503', async () => {
      const provider = new AetherModelProvider(mockBaseUrl, 5000);
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Model server loading weights' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const chunksReceived: LLMStreamingChunk[] = [];
      const result = await provider.generateStream(
        {
          requestId: 'req-stream-fail',
          modelId: 'default',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true,
        },
        (chunk) => chunksReceived.push(chunk),
      );

      expect(result.ok).toBe(false);
      expect(chunksReceived.length).toBe(0);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ProviderUnavailableError);
      }
    });

    it('should abort streaming and return CancelledError when signal aborts mid-stream', async () => {
      const provider = new AetherModelProvider(mockBaseUrl, 5000);
      const controller = new AbortController();

      const stream = new ReadableStream({
        async start(ctrl) {
          ctrl.enqueue(new TextEncoder().encode('data: {"token": "First", "index": 0}\n\n'));
          // Trigger cancellation
          controller.abort();
          ctrl.enqueue(new TextEncoder().encode('data: {"token": "Second", "index": 1}\n\n'));
          ctrl.close();
        },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const chunksReceived: LLMStreamingChunk[] = [];
      const result = await provider.generateStream(
        {
          requestId: 'req-stream-abort',
          modelId: 'default',
          messages: [{ role: 'user', content: 'Stream' }],
          signal: controller.signal,
          stream: true,
        },
        (chunk) => chunksReceived.push(chunk),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(CancelledError);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. RETRY POLICY
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Retry Policy for Transient Failures', () => {
    it('should retry on transient HTTP 503 and succeed when subsequent attempt passes', async () => {
      const provider = new AetherModelProvider(mockBaseUrl, 5000);

      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ detail: 'Service temporarily unavailable' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              content: 'Recovered after transient error.',
              finish_reason: 'stop',
              usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );

      const request: GenerationRequest = {
        requestId: 'req-retry-success',
        modelId: 'default',
        messages: [{ role: 'user', content: 'Test retry' }],
        stream: false,
      };

      const result = await provider.generate(request);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe('Recovered after transient error.');
      }
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('should stop and fail after reaching maximum bounded retry attempts (3 attempts)', async () => {
      const provider = new AetherModelProvider(mockBaseUrl, 5000);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ detail: 'Service persistently 503' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const request: GenerationRequest = {
        requestId: 'req-retry-exhaust',
        modelId: 'default',
        messages: [{ role: 'user', content: 'Test exhaust' }],
        stream: false,
      };

      const result = await provider.generate(request);
      expect(result.ok).toBe(false);
      expect(fetchSpy).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
      if (!result.ok) {
        expect(result.error.code).toBe('PROVIDER_UNAVAILABLE');
      }
    });

    it('should NOT retry on permanent client errors (HTTP 400)', async () => {
      const provider = new AetherModelProvider(mockBaseUrl, 5000);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Invalid prompt format' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const request: GenerationRequest = {
        requestId: 'req-no-retry-400',
        modelId: 'default',
        messages: [{ role: 'user', content: 'Bad request' }],
        stream: false,
      };

      const result = await provider.generate(request);
      expect(result.ok).toBe(false);
      expect(fetchSpy).toHaveBeenCalledTimes(1); // Never retried
    });

    it('should NOT retry when aborted or cancelled by client', async () => {
      const provider = new AetherModelProvider(mockBaseUrl, 5000);
      const controller = new AbortController();

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        controller.abort();
        const err = new Error('Aborted');
        err.name = 'AbortError';
        throw err;
      });

      const request: GenerationRequest = {
        requestId: 'req-no-retry-abort',
        modelId: 'default',
        messages: [{ role: 'user', content: 'Abort prompt' }],
        signal: controller.signal,
        stream: false,
      };

      const result = await provider.generate(request);
      expect(result.ok).toBe(false);
      expect(fetchSpy).toHaveBeenCalledTimes(1); // Never retried
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(CancelledError);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. ERROR TAXONOMY MAPPING
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Canonical Error Taxonomy Consistency', () => {
    it('should classify ProviderUnavailableError into CanonicalError MODEL_UNAVAILABLE with status 503', () => {
      const err = new ProviderUnavailableError('aether', 'Connection refused on port 5002');
      const canonical = ErrorTaxonomy.classify(err);

      expect(canonical.code).toBe('MODEL_UNAVAILABLE');
      expect(canonical.statusCode).toBe(503);
      expect(canonical.retryable).toBe(true);
    });

    it('should classify TimeoutError into CanonicalError TIMEOUT with status 504', () => {
      const err = new TimeoutError('Inference', 15000);
      const canonical = ErrorTaxonomy.classify(err);

      expect(canonical.code).toBe('TIMEOUT');
      expect(canonical.statusCode).toBe(504);
      expect(canonical.retryable).toBe(true);
    });

    it('should classify CancelledError into CanonicalError CANCELLED with status 499', () => {
      const err = new CancelledError('User cancelled inference');
      const canonical = ErrorTaxonomy.classify(err);

      expect(canonical.code).toBe('CANCELLED');
      expect(canonical.statusCode).toBe(499);
      expect(canonical.retryable).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. ORCHESTRATOR TRUTHFULNESS & ZERO FAKE STREAMING
  // ═══════════════════════════════════════════════════════════════════════════
  describe('AIOrchestrator Truthfulness End-to-End', () => {
    function createTestOrchestrator() {
      const config = buildDefaultAIConfig();
      const mockLLM = {
        initialize: async () => {},
        generate: async () => ({ ok: true, value: { content: 'test', finishReason: 'stop', usage: {}, latencyMs: 5 } }),
        generateStream: async () => ({ ok: true, value: undefined }),
        getRuntimeStatus: async () => ({ code: 'READY', name: 'Ollama' }),
        listModels: async () => ({ ok: true, value: [] }),
        getModelStatus: async () => ({ code: 'LOADED', name: 'default' }),
        destroy: async () => {},
      } as any;

      const intentEngine = new HeuristicIntentEngine();
      const memoryEngine = new MemoryEngine(config);
      const contextEngine = new ContextEngine(
        memoryEngine,
        { isEmbeddingAvailable: async () => false } as any,
        config,
      );
      const promptEngine = new PromptEngine();
      const reasoningEngine = new ReasoningEngine();
      const safetyEngine = new SafetyEngine(config.safety);
      const responseEngine = new ResponseEngine();
      const streamingEngine = new StreamingEngine();

      return new AIOrchestrator(
        mockLLM,
        intentEngine,
        contextEngine,
        promptEngine,
        reasoningEngine,
        safetyEngine,
        responseEngine,
        streamingEngine,
        memoryEngine,
        config,
      );
    }

    it('process() should return model_unavailable error response when provider fails (no fake synthesis)', async () => {
      const orchestrator = createTestOrchestrator();

      // Mock ProviderManager to return failure (e.g. model offline)
      orchestrator.getProviderManager().generate = async () => ({
        result: {
          ok: false,
          error: new ProviderUnavailableError('aether', 'Model server offline on port 5002'),
        },
        activeProvider: 'aether',
        usedFallback: false,
      });

      const request: AIRequest = {
        requestId: 'req-orch-fail',
        userId: 'user_1',
        sessionId: 'sess_1',
        conversationId: 'conv_1',
        message: 'Tell me a story',
        timestamp: Date.now(),
      };

      const result = await orchestrator.process(request);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('model_unavailable');
        expect(result.value.message).toContain('unavailable');
        expect(result.value.verificationStatus).toBe('FAILED');
      }
    });

    it('process() should return generation_failed when model outputs empty content and no tool executed', async () => {
      const orchestrator = createTestOrchestrator();

      orchestrator.getProviderManager().generate = async () => ({
        result: {
          ok: true,
          value: {
            requestId: 'req-empty',
            modelId: 'default',
            content: '',
            finishReason: 'stop',
            latencyMs: 10,
          },
        },
        activeProvider: 'aether',
        usedFallback: false,
      });

      const request: AIRequest = {
        requestId: 'req-orch-empty',
        userId: 'user_1',
        sessionId: 'sess_1',
        conversationId: 'conv_1',
        message: 'What is Aether?',
        timestamp: Date.now(),
      };

      const result = await orchestrator.process(request);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('generation_failed');
      }
    });

    it('processStream() should fail stream truthfully without emitting synthetic token chunks when model fails', async () => {
      const orchestrator = createTestOrchestrator();

      orchestrator.getProviderManager().generateStream = async () => ({
        result: {
          ok: false,
          error: new ProviderUnavailableError('aether', 'Local model server unreachable'),
        },
        activeProvider: 'aether',
        usedFallback: false,
      });

      const receivedChunks: StreamingChunk[] = [];
      const subscriber = (chunk: StreamingChunk) => {
        receivedChunks.push(chunk);
      };

      const request: AIRequest = {
        requestId: 'req-stream-orch-fail',
        userId: 'user_1',
        sessionId: 'sess_1',
        conversationId: 'conv_1',
        message: 'Stream me a response',
        timestamp: Date.now(),
      };

      const result = await orchestrator.processStream(request, subscriber);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ProviderUnavailableError);
      }

      // Crucial: No fake word tokens were emitted!
      const contentTokens = receivedChunks.filter((c) => c.delta && c.delta.trim().length > 0);
      expect(contentTokens.length).toBe(0);

      // Final status event emitted to subscriber must be 'failed'
      const lastChunk = receivedChunks[receivedChunks.length - 1];
      expect(lastChunk).toBeDefined();
      expect(lastChunk.status).toBe('failed');
      expect(lastChunk.isLast).toBe(true);
    });

    it('processStream() should cancel stream truthfully when signal is aborted', async () => {
      const orchestrator = createTestOrchestrator();
      const controller = new AbortController();

      orchestrator.getProviderManager().generateStream = async (_req, onChunk) => {
        onChunk({
          requestId: 'req-abort',
          modelId: 'default',
          delta: 'Starting...',
          index: 0,
          isLast: false,
        });
        controller.abort();
        return {
          result: {
            ok: false,
            error: new CancelledError('Stream cancelled mid-flight'),
          },
          activeProvider: 'aether',
          usedFallback: false,
        };
      };

      const receivedChunks: StreamingChunk[] = [];
      const subscriber = (chunk: StreamingChunk) => {
        receivedChunks.push(chunk);
      };

      const request: AIRequest = {
        requestId: 'req-stream-orch-cancel',
        userId: 'user_1',
        sessionId: 'sess_1',
        conversationId: 'conv_1',
        message: 'Cancel me',
        signal: controller.signal,
        timestamp: Date.now(),
      };

      const result = await orchestrator.processStream(request, subscriber);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(CancelledError);
      }

      const lastChunk = receivedChunks[receivedChunks.length - 1];
      expect(lastChunk).toBeDefined();
      expect(lastChunk.status).toBe('cancelled');
    });
  });
});
