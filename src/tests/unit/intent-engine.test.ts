import { describe, it, expect } from 'vitest';
import { HeuristicIntentEngine } from '../../modules/ai/core/intent-engine.js';

describe('HeuristicIntentEngine', () => {
  const intentEngine = new HeuristicIntentEngine();

  it('should classify automation requests', () => {
    const res = intentEngine.classify('Create an automation to remind me about tasks');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.type).toBe('AUTOMATION_REQUEST');
      expect(res.value.requiresTool).toBe(true);
    }
  });

  it('should classify project and workspace tasks', () => {
    const res = intentEngine.classify('create task Review quarterly report');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.type).toBe('PROJECT_WORKSPACE_TASK');
      expect(res.value.requiresTool).toBe(true);
    }
  });

  it('should classify knowledge questions', () => {
    const res = intentEngine.classify('according to document find in knowledge');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.type).toBe('KNOWLEDGE_QUESTION');
      expect(res.value.requiresRAG).toBe(true);
    }
  });

  it('should classify user data and memory questions', () => {
    const res = intentEngine.classify('what is my preference for notifications');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.type).toBe('USER_DATA_QUESTION');
      expect(res.value.requiresMemory).toBe(true);
    }
  });

  it('should classify Aether product questions', () => {
    const res = intentEngine.classify('what is aether AI');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.type).toBe('AETHER_PRODUCT_QUESTION');
    }
  });

  it('should classify coding questions', () => {
    const res = intentEngine.classify('Write a typescript function to parse json');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.type).toBe('CODING_TECHNICAL');
    }
  });

  it('should classify ambiguous prompts', () => {
    const res = intentEngine.classify('help');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.type).toBe('AMBIGUOUS');
    }
  });
});
