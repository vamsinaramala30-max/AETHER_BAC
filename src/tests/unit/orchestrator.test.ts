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
import type { AIRequest, StreamingChunk } from '../../modules/ai/ai-types.js';

describe('AIOrchestrator Integration — Context & Intent Hardening', () => {
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

  // Mock ProviderManager generation to prevent network timeouts
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

  orchestrator.getProviderManager().generateStream = async (_req, onChunk) => {
    onChunk({
      requestId: 'req_stream_test',
      modelId: 'mock-model',
      delta: 'Streaming response test',
      index: 0,
      isLast: true,
    });
    return {
      result: { ok: true, value: undefined },
      activeProvider: 'ollama',
      usedFallback: false,
    };
  };

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

  it('should return clarification request for ambiguous "Fix this" query without crashing', async () => {
    const request: AIRequest = {
      requestId: 'req_clarify_1',
      userId: 'user_1',
      sessionId: 'sess_1',
      conversationId: 'conv_1',
      message: 'Fix this',
      timestamp: Date.now(),
    };

    const res = await orchestrator.process(request);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.status).toBe('clarification_required');
      expect(res.value.confidence).toBe('LOW_CONFIDENCE');
      expect(res.value.message).toContain('specify which');
    }
  });

  it('should return clarification request for ambiguous "Do it" query', async () => {
    const request: AIRequest = {
      requestId: 'req_clarify_2',
      userId: 'user_1',
      sessionId: 'sess_1',
      conversationId: 'conv_1',
      message: 'Do it',
      timestamp: Date.now(),
    };

    const res = await orchestrator.process(request);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.status).toBe('clarification_required');
      expect(res.value.message).toContain('action');
    }
  });

  it('should stream clarification chunk for ambiguous streaming requests', async () => {
    const request: AIRequest = {
      requestId: 'req_stream_clarify',
      userId: 'user_1',
      sessionId: 'sess_1',
      conversationId: 'conv_1',
      message: 'Fix this',
      timestamp: Date.now(),
    };

    const chunks: StreamingChunk[] = [];
    const res = await orchestrator.processStream(request, (chunk) => {
      chunks.push(chunk);
    });

    expect(res.ok).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
    const content = chunks.map((c) => c.delta).join('');
    expect(content).toContain('specify which');
  });

  it('should process a simple request directly without unnecessary planning overhead', async () => {
    const request: AIRequest = {
      requestId: 'req_simple_test_1',
      userId: 'user_1',
      sessionId: 'sess_1',
      conversationId: 'conv_1',
      message: 'What is HTTP?',
      timestamp: Date.now(),
    };

    const res = await orchestrator.process(request);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.status).toBe('success');
      expect(res.value.assessment?.complexity).toBe('SIMPLE');
      expect(res.value.assessment?.strategy).toBe('DIRECT_ANSWER');
      expect(res.value.assessment?.requiresPlan).toBe(false);
      expect(res.value.plan).toBeUndefined();
    }
  });

  it('should process complex analytical requests with cognitive plan and strategy guidance', async () => {
    const request: AIRequest = {
      requestId: 'req_complex_ana_1',
      userId: 'user_1',
      sessionId: 'sess_1',
      conversationId: 'conv_1',
      message: 'Analyze and compare the trade-offs between SQL and NoSQL for scalable systems',
      timestamp: Date.now(),
    };

    const res = await orchestrator.process(request);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.status).toBe('success');
      expect(res.value.assessment?.complexity).toBe('COMPLEX');
      expect(res.value.assessment?.strategy).toBe('ANALYTICAL_BREAKDOWN');
      expect(res.value.assessment?.requiresPlan).toBe(true);
      expect(res.value.plan).toBeDefined();
      expect(res.value.plan?.steps.length).toBeGreaterThan(0);
    }
  });

  it('should process multi-step planning actions with action plan and step verification', async () => {
    const request: AIRequest = {
      requestId: 'req_plan_action_1',
      userId: 'user_1',
      sessionId: 'sess_1',
      conversationId: 'conv_1',
      message: "Prepare everything I need for tomorrow's project review",
      timestamp: Date.now(),
    };

    const res = await orchestrator.process(request);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.status).toBe('success');
      expect(res.value.plan).toBeDefined();
      expect(res.value.plan?.steps.length).toBeGreaterThanOrEqual(2);
      expect(res.value.assessment?.complexity).toBe('MULTI_STEP');
    }
  });

  it('should handle provider failure gracefully and return accurate error status', async () => {
    const originalGenerate = orchestrator.getProviderManager().generate;
    orchestrator.getProviderManager().generate = async () => ({
      result: {
        ok: false,
        error: {
          code: 'GENERATION_FAILED',
          message: 'Model execution failed',
          retryable: false,
          timestamp: Date.now(),
        },
      },
      activeProvider: 'ollama',
      usedFallback: false,
    });

    const request: AIRequest = {
      requestId: 'req_fail_1',
      userId: 'user_1',
      sessionId: 'sess_1',
      conversationId: 'conv_1',
      message: 'Explain quantum computing',
      timestamp: Date.now(),
    };

    const res = await orchestrator.process(request);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.status).toBe('generation_failed');
      expect(res.value.reasoning).toBe('failed');
    }

    // Restore original generate
    orchestrator.getProviderManager().generate = originalGenerate;
  });

  it('should isolate session history between different session IDs', async () => {
    const historyA = memoryEngine.getConversationHistory('user_1', 'sess_A', 'conv_A');
    const historyB = memoryEngine.getConversationHistory('user_1', 'sess_B', 'conv_B');

    expect(historyA.length).toBe(0);
    expect(historyB.length).toBe(0);
  });
});

