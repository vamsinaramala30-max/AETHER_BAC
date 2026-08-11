import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderManager } from '../../modules/ai/llm/provider-manager.js';
import { buildDefaultAIConfig } from '../../modules/ai/ai-config.js';
import type { GenerationRequest } from '../../modules/ai/llm/llm-types.js';

describe('ProviderManager Multi-Provider AI Fallback', () => {
  let providerManager: ProviderManager;

  beforeEach(() => {
    const config = buildDefaultAIConfig({
      providers: {
        primaryProvider: 'gemini',
        fallbackProvider: 'openai',
        geminiApiKey: 'test-gemini-key',
        openaiApiKey: 'test-openai-key',
        localLlmBaseUrl: 'http://localhost:11434',
        localLlmModel: 'llama3.2',
        localLlmTimeoutMs: 120000,
      },
    });
    providerManager = new ProviderManager(config);
  });

  it('should execute Gemini as primary provider and return response on success', async () => {
    const geminiProvider = providerManager.getProvider('gemini');
    vi.spyOn(geminiProvider, 'generate').mockResolvedValueOnce({
      ok: true,
      value: {
        requestId: 'req_1',
        modelId: 'gemini-1.5-flash',
        content: 'Hello from Gemini!',
        finishReason: 'stop',
        latencyMs: 100,
      },
    });

    const request: GenerationRequest = {
      requestId: 'req_1',
      modelId: 'default',
      messages: [{ role: 'user', content: 'What is Aether?' }],
      stream: false,
    };

    const res = await providerManager.generate(request, 'auto');

    expect(res.result.ok).toBe(true);
    if (res.result.ok) {
      expect(res.result.value.content).toBe('Hello from Gemini!');
    }
    expect(res.activeProvider).toBe('gemini');
    expect(res.usedFallback).toBe(false);
  });

  it('should fallback to OpenAI when Gemini returns a recoverable error', async () => {
    const geminiProvider = providerManager.getProvider('gemini');
    const openAIProvider = providerManager.getProvider('openai');

    vi.spyOn(geminiProvider, 'generate').mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'RATE_LIMIT',
        message: 'Gemini Rate Limit Exceeded',
        retryable: true,
        timestamp: Date.now(),
      },
    });

    vi.spyOn(openAIProvider, 'generate').mockResolvedValueOnce({
      ok: true,
      value: {
        requestId: 'req_2',
        modelId: 'gpt-4o-mini',
        content: 'Hello from OpenAI Fallback!',
        finishReason: 'stop',
        latencyMs: 120,
      },
    });

    const request: GenerationRequest = {
      requestId: 'req_2',
      modelId: 'default',
      messages: [{ role: 'user', content: 'What is Aether?' }],
      stream: false,
    };

    const res = await providerManager.generate(request, 'auto');

    expect(res.result.ok).toBe(true);
    if (res.result.ok) {
      expect(res.result.value.content).toBe('Hello from OpenAI Fallback!');
    }
    expect(res.activeProvider).toBe('openai');
    expect(res.usedFallback).toBe(true);
    expect(res.fallbackReason).toContain('gemini failed');
  });

  it('should return a single clear error when both Gemini and OpenAI fail', async () => {
    const geminiProvider = providerManager.getProvider('gemini');
    const openAIProvider = providerManager.getProvider('openai');
    const ollamaProvider = providerManager.getProvider('ollama');

    vi.spyOn(geminiProvider, 'generate').mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'PROVIDER_UNAVAILABLE',
        message: 'Gemini Down',
        retryable: true,
        timestamp: Date.now(),
      },
    });

    vi.spyOn(openAIProvider, 'generate').mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'PROVIDER_UNAVAILABLE',
        message: 'OpenAI Down',
        retryable: true,
        timestamp: Date.now(),
      },
    });

    vi.spyOn(ollamaProvider, 'healthCheck').mockResolvedValueOnce({
      name: 'ollama',
      status: 'unavailable',
      checkedAt: Date.now(),
    });

    const request: GenerationRequest = {
      requestId: 'req_3',
      modelId: 'default',
      messages: [{ role: 'user', content: 'What is Aether?' }],
      stream: false,
    };

    const res = await providerManager.generate(request, 'auto');

    expect(res.result.ok).toBe(false);
    if (!res.result.ok) {
      expect(res.result.error.code).toBe('PROVIDER_UNAVAILABLE');
    }
  });

  it('should execute explicitly selected provider directly without fallback', async () => {
    const openAIProvider = providerManager.getProvider('openai');
    vi.spyOn(openAIProvider, 'generate').mockResolvedValueOnce({
      ok: true,
      value: {
        requestId: 'req_4',
        modelId: 'gpt-4o-mini',
        content: 'Direct OpenAI Response',
        finishReason: 'stop',
        latencyMs: 90,
      },
    });

    const request: GenerationRequest = {
      requestId: 'req_4',
      modelId: 'default',
      messages: [{ role: 'user', content: 'Test' }],
      stream: false,
    };

    const res = await providerManager.generate(request, 'openai');

    expect(res.result.ok).toBe(true);
    expect(res.activeProvider).toBe('openai');
    expect(res.usedFallback).toBe(false);
  });
});
