import { describe, it, expect } from 'vitest';
import { ConfidenceEngine } from '../../modules/ai/core/confidence-engine.js';
import type { Intent, AIContext } from '../../modules/ai/ai-types.js';

describe('ConfidenceEngine', () => {
  const engine = new ConfidenceEngine();

  const dummyContext: AIContext = {
    userId: 'u1',
    sessionId: 's1',
    conversationId: 'c1',
    tokenBudget: { total: 4096, system: 500, history: 1000, context: 1000, response: 1000, remaining: 596 },
  };

  it('should return HIGH_CONFIDENCE when tool execution succeeds', () => {
    const intent: Intent = {
      type: 'AUTOMATION_REQUEST',
      confidence: 0.9,
      requiresRAG: false,
      requiresMemory: false,
      requiresTool: true,
      requiresAgent: false,
    };
    const res = engine.assess('list automations', intent, dummyContext, 'Automations list', true, true);
    expect(res.level).toBe('HIGH_CONFIDENCE');
    expect(res.score).toBeGreaterThan(0.9);
  });

  it('should return LOW_CONFIDENCE when tool execution fails', () => {
    const intent: Intent = {
      type: 'AUTOMATION_REQUEST',
      confidence: 0.9,
      requiresRAG: false,
      requiresMemory: false,
      requiresTool: true,
      requiresAgent: false,
    };
    const res = engine.assess('list automations', intent, dummyContext, 'Error', true, false);
    expect(res.level).toBe('LOW_CONFIDENCE');
  });

  it('should return INSUFFICIENT_INFORMATION when no RAG documents found for knowledge query', () => {
    const intent: Intent = {
      type: 'KNOWLEDGE_QUESTION',
      confidence: 0.85,
      requiresRAG: true,
      requiresMemory: false,
      requiresTool: false,
      requiresAgent: false,
    };
    const res = engine.assess('find doc', intent, dummyContext, 'No doc found', false, false);
    expect(res.level).toBe('INSUFFICIENT_INFORMATION');
  });
});
