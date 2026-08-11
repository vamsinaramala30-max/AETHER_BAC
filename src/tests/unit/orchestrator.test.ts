import { describe, it, expect } from 'vitest';
import { AIOrchestrator } from '../../modules/ai/core/ai-orchestrator.js';
import { HeuristicIntentEngine } from '../../modules/ai/core/intent-engine.js';
import { ContextEngine } from '../../modules/ai/core/context-engine.js';
import { PromptEngine } from '../../modules/ai/prompts/prompt-engine.js';
import { ReasoningEngine } from '../../modules/ai/core/reasoning-engine.js';
import { SafetyEngine } from '../../modules/ai/core/safety-engine.js';
import { ResponseEngine } from '../../modules/ai/core/response-engine.js';
import { StreamingEngine } from '../../modules/ai/core/streaming-engine.js';
import { MemoryEngine } from '../../modules/ai/memory/memory-engine.js';
import { buildDefaultAIConfig } from '../../modules/ai/ai-config.js';
import type { ILLMEngine } from '../../modules/ai/llm/llm-engine.js';
import type { AIRequest } from '../../modules/ai/ai-types.js';

describe('AIOrchestrator Integration', () => {
  const config = buildDefaultAIConfig();

  // Mock LLM Engine
  const mockLLMEngine: ILLMEngine = {
    initialize: async () => {},
    generate: async () => ({
      ok: true,
      value: {
        content: 'This is a test AI response.',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        latencyMs: 50,
      },
    }),
    generateStream: async () => ({ ok: true, value: undefined }),
    getRuntimeStatus: async () => ({ code: 'READY', name: 'Ollama' }),
    listModels: async () => ({ ok: true, value: [] }),
    getModelStatus: async () => ({ code: 'LOADED', name: 'llama3.2' }),
    destroy: async () => {},
  } as unknown as ILLMEngine;

  const intentEngine = new HeuristicIntentEngine();
  const memoryEngine = new MemoryEngine(config);
  const contextEngine = new ContextEngine(memoryEngine, { isEmbeddingAvailable: async () => false } as any, config);
  const promptEngine = new PromptEngine();
  const reasoningEngine = new ReasoningEngine();
  const safetyEngine = new SafetyEngine(config.safety);
  const responseEngine = new ResponseEngine();
  const streamingEngine = new StreamingEngine();

  const orchestrator = new AIOrchestrator(
    mockLLMEngine,
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

  // Mock ProviderManager generation to prevent network timeouts to local LLM/Ollama
  orchestrator.getProviderManager().generate = async () => ({
    result: {
      ok: true,
      value: {
        requestId: 'req_test_1',
        modelId: 'mock-model',
        content: 'This is a test AI response.',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        latencyMs: 15,
      },
    },
    activeProvider: 'ollama',
    usedFallback: false,
  });

  it('should process a valid user request through full pipeline', async () => {
    const request: AIRequest = {
      requestId: 'req_test_1',
      userId: 'user_1',
      sessionId: 'sess_1',
      conversationId: 'conv_1',
      message: 'Explain how to write clean code',
      timestamp: Date.now(),
    };

    const res = await orchestrator.process(request);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.status).toBe('success');
      expect(res.value.message).toBe('This is a test AI response.');
      expect(res.value.confidence).toBeDefined();
    }
  });

  it('should isolate session history between different session IDs', async () => {
    const historyA = memoryEngine.getConversationHistory('user_1', 'sess_A', 'conv_A');
    const historyB = memoryEngine.getConversationHistory('user_1', 'sess_B', 'conv_B');

    expect(historyA.length).toBe(0);
    expect(historyB.length).toBe(0);
  });
});
