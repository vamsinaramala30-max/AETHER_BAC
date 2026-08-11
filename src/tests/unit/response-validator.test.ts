import { describe, it, expect } from 'vitest';
import { ResponseValidator } from '../../modules/ai/core/response-validator.js';
import type { AIRequest, AIContext, Intent } from '../../modules/ai/ai-types.js';

describe('ResponseValidator', () => {
  const validator = new ResponseValidator();

  const dummyRequest: AIRequest = {
    requestId: 'r1',
    userId: 'u1',
    sessionId: 's1',
    conversationId: 'c1',
    message: 'delete task 123',
    timestamp: Date.now(),
  };

  const dummyIntent: Intent = {
    type: 'PROJECT_WORKSPACE_TASK',
    confidence: 0.9,
    requiresRAG: false,
    requiresMemory: false,
    requiresTool: true,
    requiresAgent: false,
  };

  const dummyContext: AIContext = {
    userId: 'u1',
    sessionId: 's1',
    conversationId: 'c1',
    tokenBudget: { total: 4096, system: 500, history: 1000, context: 1000, response: 1000, remaining: 596 },
  };

  it('should flag claim of action success when tool execution actually failed', () => {
    const res = validator.validate(
      dummyRequest,
      dummyIntent,
      dummyContext,
      'Task 123 was deleted successfully.',
      true, // tool executed
      false, // tool failed
    );
    expect(res.valid).toBe(false);
    expect(res.correctedContent).toContain('error');
  });

  it('should pass valid text generation responses', () => {
    const res = validator.validate(
      dummyRequest,
      { ...dummyIntent, requiresTool: false },
      dummyContext,
      'Here is the requested explanation.',
    );
    expect(res.valid).toBe(true);
  });
});
