import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AetherModelProvider } from '../../modules/ai/llm/providers/aether-provider.js';
import { ProviderManager } from '../../modules/ai/llm/provider-manager.js';
import { buildDefaultAIConfig } from '../../modules/ai/ai-config.js';
import type {
  GenerationRequest,
  StreamingGenerationRequest,
} from '../../modules/ai/llm/llm-types.js';

describe('AETHER_MODEL Native Integration & BLOCKED_BY_WEIGHTS Verification', () => {
  let aetherProvider: AetherModelProvider;

  beforeEach(() => {
    aetherProvider = new AetherModelProvider('http://localhost:5002', 5000);
    vi.restoreAllMocks();
  });

  it('healthCheck should report status BLOCKED_BY_WEIGHTS when trained weights are missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'BLOCKED_BY_WEIGHTS',
        model: 'aether-v1-authoritative',
        loaded: false,
        has_trained_weights: false,
        weights_hash: 'missing_weights_sha256',
        timestamp: Date.now(),
      }),
    } as Response);

    const status = await aetherProvider.healthCheck();
    expect(status.name).toBe('aether');
    expect(status.status).toBe('unavailable');
    expect(status.message).toContain('BLOCKED_BY_WEIGHTS');
  });

  it('generate should return BLOCKED_BY_WEIGHTS error when server returns 503 HTTP status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({
        error: {
          code: 'BLOCKED_BY_WEIGHTS',
          message: 'NATIVE AETHER AI IS BLOCKED BY TRAINED MODEL WEIGHTS',
          has_trained_weights: false,
        },
        has_trained_weights: false,
        status: 'BLOCKED_BY_WEIGHTS',
      }),
    } as Response);

    const req: GenerationRequest = {
      requestId: 'req_test_1',
      modelId: 'default',
      messages: [{ role: 'user', content: 'What is Aether?' }],
      stream: false,
    };

    const res = await aetherProvider.generate(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('BLOCKED_BY_WEIGHTS');
      expect(res.error.message).toContain('BLOCKED BY TRAINED MODEL WEIGHTS');
    }
  });

  it('generateStream should return BLOCKED_BY_WEIGHTS error when trained weights are missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({
        error: {
          code: 'BLOCKED_BY_WEIGHTS',
          message: 'NATIVE AETHER AI IS BLOCKED BY TRAINED MODEL WEIGHTS',
          has_trained_weights: false,
        },
        has_trained_weights: false,
        status: 'BLOCKED_BY_WEIGHTS',
      }),
    } as Response);

    const req: StreamingGenerationRequest = {
      requestId: 'req_test_stream_1',
      modelId: 'default',
      messages: [{ role: 'user', content: 'What is Aether?' }],
      stream: true,
    };

    const chunks: any[] = [];
    const res = await aetherProvider.generateStream(req, (chunk) => chunks.push(chunk));

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('BLOCKED_BY_WEIGHTS');
    }
    expect(chunks.length).toBe(0);
  });

  it('ProviderManager in explicit "aether" mode MUST NEVER silently fallback to another provider', async () => {
    const config = buildDefaultAIConfig({
      providers: {
        primaryProvider: 'aether',
        fallbackProvider: 'gemini',
        geminiApiKey: 'test-key',
        localLlmBaseUrl: 'http://localhost:5002',
        localLlmModel: 'aether-v1-authoritative',
        localLlmTimeoutMs: 120000,
      },
    });
    const manager = new ProviderManager(config);
    const nativeProv = manager.getProvider('aether');

    vi.spyOn(nativeProv, 'generate').mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'BLOCKED_BY_WEIGHTS',
        message: 'NATIVE AETHER AI IS BLOCKED BY TRAINED MODEL WEIGHTS',
        retryable: false,
        timestamp: Date.now(),
      },
    });

    const req: GenerationRequest = {
      requestId: 'req_explicit_aether',
      modelId: 'default',
      messages: [{ role: 'user', content: 'Explain Aether architecture.' }],
      stream: false,
    };

    const result = await manager.generate(req, 'aether');

    expect(result.result.ok).toBe(false);
    if (!result.result.ok) {
      expect(result.result.error.code).toBe('BLOCKED_BY_WEIGHTS');
    }
    expect(result.activeProvider).toBe('aether');
    expect(result.usedFallback).toBe(false);
  });

  it('ProviderManager in "auto" mode should record explicit fallback reason when primary "aether" is BLOCKED_BY_WEIGHTS', async () => {
    const config = buildDefaultAIConfig({
      providers: {
        primaryProvider: 'aether',
        fallbackProvider: 'gemini',
        geminiApiKey: 'test-key',
        localLlmBaseUrl: 'http://localhost:5002',
        localLlmModel: 'aether-v1-authoritative',
        localLlmTimeoutMs: 120000,
      },
    });
    const manager = new ProviderManager(config);
    const nativeProv = manager.getProvider('aether');
    const geminiProv = manager.getProvider('gemini');

    vi.spyOn(nativeProv, 'generate').mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'BLOCKED_BY_WEIGHTS',
        message: 'NATIVE AETHER AI IS BLOCKED BY TRAINED MODEL WEIGHTS',
        retryable: false,
        timestamp: Date.now(),
      },
    });

    vi.spyOn(geminiProv, 'generate').mockResolvedValueOnce({
      ok: true,
      value: {
        requestId: 'req_auto_fallback',
        modelId: 'gemini-1.5-flash',
        content: 'Fallback response from Gemini temporary dev fallback',
        finishReason: 'stop',
        latencyMs: 150,
      },
    });

    const req: GenerationRequest = {
      requestId: 'req_auto_fallback',
      modelId: 'default',
      messages: [{ role: 'user', content: 'Help me plan a project' }],
      stream: false,
    };

    const result = await manager.generate(req, 'auto');

    expect(result.result.ok).toBe(true);
    expect(result.activeProvider).toBe('gemini');
    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toContain('aether failed');
  });

  it('live health check against running AETHER_MODEL server on port 5002', async () => {
    const liveProvider = new AetherModelProvider('http://localhost:5002', 5000);
    const status = await liveProvider.healthCheck();
    expect(status.name).toBe('aether');
    expect(status.status).toBe('available');
    expect(status.message).toContain('aether');
  });

  it('live non-streaming generate against running AETHER_MODEL server', async () => {
    const liveProvider = new AetherModelProvider('http://localhost:5002', 60000);
    const req: GenerationRequest = {
      requestId: 'req_live_test_1',
      modelId: 'aether-v1-authoritative',
      messages: [{ role: 'user', content: 'What is Aether AI?' }],
      maxTokens: 20,
      stream: false,
    };
    const res = await liveProvider.generate(req);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.content.length).toBeGreaterThan(0);
      expect(res.value.modelId).toBe('aether-v1-authoritative');
      expect(res.value.usage?.completionTokens).toBeGreaterThan(0);
    }
  }, 60000);

  it('live streaming generateStream against running AETHER_MODEL server', async () => {
    const liveProvider = new AetherModelProvider('http://localhost:5002', 60000);
    const req: StreamingGenerationRequest = {
      requestId: 'req_live_stream_1',
      modelId: 'aether-v1-authoritative',
      messages: [{ role: 'user', content: 'Summarize system capabilities.' }],
      maxTokens: 20,
      stream: true,
    };
    const chunks: any[] = [];
    const res = await liveProvider.generateStream(req, (chunk) => {
      chunks.push(chunk);
    });
    expect(res.ok).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk.isLast).toBe(true);
  }, 60000);
});
