import { describe, it, expect } from 'vitest';
import { ReasoningEngine } from '../../modules/ai/core/reasoning-engine.js';
import type { AIRequest, AIContext, Intent } from '../../modules/ai/ai-types.js';

describe('ReasoningEngine — Complexity, Planning & Strategy Intelligence', () => {
  const reasoningEngine = new ReasoningEngine();

  const createDummyContext = (overrides?: Partial<AIContext>): AIContext => ({
    userId: 'user_1',
    sessionId: 'sess_1',
    conversationId: 'conv_1',
    tokenBudget: {
      total: 8192,
      system: 800,
      history: 2400,
      context: 2800,
      response: 2000,
      remaining: 8192,
    },
    ...overrides,
  });

  describe('Simple vs Complex Request Determination', () => {
    it('should classify simple factual/conceptual questions as SIMPLE and DIRECT_ANSWER', () => {
      const request: AIRequest = {
        requestId: 'req_simple_1',
        userId: 'user_1',
        sessionId: 'sess_1',
        conversationId: 'conv_1',
        message: 'What is HTTP and how does it work?',
        timestamp: Date.now(),
      };
      const intent: Intent = {
        type: 'GENERAL_REASONING',
        confidence: 0.8,
        requiresRAG: false,
        requiresMemory: false,
        requiresTool: false,
        requiresAgent: false,
      };

      const assessment = reasoningEngine.assessRequest(request, intent, createDummyContext());

      expect(assessment.complexity).toBe('SIMPLE');
      expect(assessment.strategy).toBe('DIRECT_ANSWER');
      expect(assessment.isSimple).toBe(true);
      expect(assessment.requiresPlan).toBe(false);
      expect(assessment.informationSufficient).toBe(true);
      expect(assessment.suggestedExecutionMode).toBe('direct');
    });

    it('should classify conversational greetings as SIMPLE without planning overhead', () => {
      const request: AIRequest = {
        requestId: 'req_hello',
        userId: 'user_1',
        sessionId: 'sess_1',
        conversationId: 'conv_1',
        message: 'Hello! How are you today?',
        timestamp: Date.now(),
      };
      const intent: Intent = {
        type: 'CONVERSATIONAL',
        confidence: 0.95,
        requiresRAG: false,
        requiresMemory: false,
        requiresTool: false,
        requiresAgent: false,
      };

      const assessment = reasoningEngine.assessRequest(request, intent, createDummyContext());

      expect(assessment.complexity).toBe('SIMPLE');
      expect(assessment.strategy).toBe('DIRECT_ANSWER');
      expect(assessment.requiresPlan).toBe(false);
    });

    it('should classify complex analytical/comparison inquiries as COMPLEX and ANALYTICAL_BREAKDOWN', () => {
      const request: AIRequest = {
        requestId: 'req_complex_1',
        userId: 'user_1',
        sessionId: 'sess_1',
        conversationId: 'conv_1',
        message: 'Analyze and compare the trade-offs between PostgreSQL and MongoDB for this architecture',
        timestamp: Date.now(),
      };
      const intent: Intent = {
        type: 'ANALYTICAL',
        primaryIntent: 'ANALYSIS',
        confidence: 0.85,
        requiresRAG: false,
        requiresMemory: false,
        requiresTool: false,
        requiresAgent: true,
      };

      const assessment = reasoningEngine.assessRequest(request, intent, createDummyContext());

      expect(assessment.complexity).toBe('COMPLEX');
      expect(assessment.strategy).toBe('ANALYTICAL_BREAKDOWN');
      expect(assessment.isSimple).toBe(false);
      expect(assessment.requiresPlan).toBe(true);
      expect(assessment.suggestedExecutionMode).toBe('sequential');
    });

    it('should classify strategic roadmap requests as MULTI_STEP and STRUCTURED_PLAN', () => {
      const request: AIRequest = {
        requestId: 'req_multi_1',
        userId: 'user_1',
        sessionId: 'sess_1',
        conversationId: 'conv_1',
        message: 'Help me plan this project from start to finish and build a step by step roadmap',
        timestamp: Date.now(),
      };
      const intent: Intent = {
        type: 'ANALYTICAL',
        primaryIntent: 'PLANNING_DECISION',
        confidence: 0.85,
        requiresRAG: false,
        requiresMemory: true,
        requiresTool: true,
        requiresAgent: true,
      };

      const assessment = reasoningEngine.assessRequest(request, intent, createDummyContext());

      expect(assessment.complexity).toBe('MULTI_STEP');
      expect(assessment.strategy).toBe('STRUCTURED_PLAN');
      expect(assessment.requiresPlan).toBe(true);
      expect(assessment.isSimple).toBe(false);
    });

    it('should classify knowledge research inquiries as COMPLEX and RESEARCH_SYNTHESIS', () => {
      const request: AIRequest = {
        requestId: 'req_research_1',
        userId: 'user_1',
        sessionId: 'sess_1',
        conversationId: 'conv_1',
        message: 'Research our internal documentation and compare available deployment strategies',
        timestamp: Date.now(),
      };
      const intent: Intent = {
        type: 'KNOWLEDGE_QUESTION',
        primaryIntent: 'RESEARCH_LOOKUP',
        confidence: 0.9,
        requiresRAG: true,
        requiresMemory: false,
        requiresTool: true,
        requiresAgent: false,
      };

      const assessment = reasoningEngine.assessRequest(request, intent, createDummyContext());

      expect(assessment.complexity).toBe('COMPLEX');
      expect(assessment.strategy).toBe('RESEARCH_SYNTHESIS');
      expect(assessment.requiresPlan).toBe(true);
    });

    it('should classify ambiguous requests as AMBIGUOUS and require CLARIFICATION', () => {
      const request: AIRequest = {
        requestId: 'req_ambig_1',
        userId: 'user_1',
        sessionId: 'sess_1',
        conversationId: 'conv_1',
        message: 'Fix this',
        timestamp: Date.now(),
      };
      const intent: Intent = {
        type: 'AMBIGUOUS',
        primaryIntent: 'CLARIFICATION_REQUIRED',
        confidence: 0.3,
        requiresClarification: true,
        clarificationPrompt: 'Please specify which task or code you would like me to fix.',
        requiresRAG: false,
        requiresMemory: false,
        requiresTool: false,
        requiresAgent: false,
      };

      const assessment = reasoningEngine.assessRequest(request, intent, createDummyContext());

      expect(assessment.complexity).toBe('AMBIGUOUS');
      expect(assessment.strategy).toBe('CLARIFICATION');
      expect(assessment.informationSufficient).toBe(false);
      expect(assessment.requiresPlan).toBe(false);
      expect(assessment.missingInformation).toBeDefined();
    });
  });

  describe('Reasoning Lifecycle State & Privacy Guarantees', () => {
    it('should track state transitions and expose only safe public statuses', () => {
      const reqId = 'req_trace_lifecycle_1';
      reasoningEngine.startReasoning(reqId);

      expect(reasoningEngine.getPublicStatus(reqId)).toBe('thinking');

      reasoningEngine.updateStatus(reqId, 'retrieving', 'Fetching context from sources', 'context_assembled');
      expect(reasoningEngine.getPublicStatus(reqId)).toBe('retrieving');

      reasoningEngine.updateStatus(reqId, 'planning', 'Formulating cognitive plan', 'plan_created');
      expect(reasoningEngine.getPublicStatus(reqId)).toBe('planning');

      reasoningEngine.updateStatus(reqId, 'generating', 'Synthesizing final response', 'plan_executing');
      expect(reasoningEngine.getPublicStatus(reqId)).toBe('generating');

      reasoningEngine.updateStatus(reqId, 'completed', 'Execution verified and completed', 'plan_completed');
      expect(reasoningEngine.getPublicStatus(reqId)).toBe('completed');

      reasoningEngine.endReasoning(reqId);

      const traces = reasoningEngine.getTrace(reqId);
      expect(traces.length).toBe(5);

      // Verify all trace entries use safe public statuses
      for (const t of traces) {
        expect(['thinking', 'retrieving', 'planning', 'generating', 'completed', 'failed']).toContain(
          t.status,
        );
        // Ensure no private CoT leakage
        expect(t.description).not.toContain('chain_of_thought');
        expect(t.description).not.toContain('private_reasoning');
      }
    });

    it('should clean up expired reasoning sessions', () => {
      const reqId = 'req_expired_1';
      reasoningEngine.startReasoning(reqId);
      reasoningEngine.updateStatus(reqId, 'completed', 'Done', 'plan_completed');
      reasoningEngine.endReasoning(reqId);

      expect(reasoningEngine.getPublicStatus(reqId)).toBe('completed');

      // Clear sessions older than 0ms
      reasoningEngine.clearExpired(0);
      expect(reasoningEngine.getPublicStatus(reqId)).toBeUndefined();
    });
  });
});
