/**
 * AETHER AI — Phase 14 Conversation Manager & Agent Foundation Test Suite
 *
 * Validates:
 * 1. Conversation Manager turn tracking, states, user goals, and structured payloads.
 * 2. 20-Intent classification matrix.
 * 3. 5-Tier context assembly, budgeting, and reference resolution.
 * 4. Multi-dimensional confidence scoring (intent, context, knowledge, generation, overall).
 * 5. Minimal clarification workflow for underspecified requests.
 * 6. End-to-end processing across all 12 standard Phase 14 user scenarios.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { conversationManager } from '../../modules/ai/conversations/conversation-manager.js';
import { intentEngine } from '../../modules/ai/core/intent-engine.js';
import { contextEngine } from '../../modules/ai/core/context-engine.js';
import { confidenceEngine } from '../../modules/ai/core/confidence-engine.js';
import { responseSynthesizer } from '../../modules/ai/core/response-synthesizer.js';
import { responseValidator } from '../../modules/ai/core/response-validator.js';
import type { AIRequest, AIContext, Intent } from '../../modules/ai/ai-types.js';

describe('Phase 14: Conversation Manager & Agent Foundation', () => {
  const conversationId = 'conv_phase14_test';
  const userId = 'user_p14_1';
  const sessionId = 'session_p14_1';

  const getValidIntent = (msg: string, ctx?: { conversationId?: string; recentTurns?: readonly any[] }): Intent => {
    const res = intentEngine.classify(msg, ctx);
    if (!res.ok) {
      throw new Error(`Intent classification failed: ${res.error.message}`);
    }
    return res.value;
  };

  const createMockContext = (overrides?: Partial<AIContext>): AIContext => ({
    userId,
    sessionId,
    conversationId,
    tokenBudget: {
      total: 4096,
      system: 512,
      history: 1024,
      context: 1536,
      response: 1024,
      remaining: 1024,
    },
    ...overrides,
  });

  const dummyReq = (msg: string): AIRequest => ({
    requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId,
    sessionId,
    conversationId,
    message: msg,
    timestamp: Date.now(),
  });

  beforeEach(() => {
    conversationManager.resetConversationState(conversationId);
  });

  describe('1. ConversationManager Turn & State Tracking', () => {
    it('records turns, tracks state transitions, and completes turns', () => {
      expect(conversationManager.getState(conversationId)).toBe('IDLE');

      const intent = getValidIntent('I have a website project. Help me create a project plan.');
      const turn = conversationManager.recordTurn(conversationId, 'I have a website project. Help me create a project plan.', intent);

      expect(turn.turnId).toBeDefined();
      expect(turn.role).toBe('user');
      expect(conversationManager.getState(conversationId)).toBe('ACTIVE_PLANNING');
      expect(conversationManager.getCurrentGoal(conversationId)).toBe('Website Project');

      const payload = conversationManager.buildStructuredTurnPayload(
        conversationId,
        turn.turnId,
        turn.userMessage,
        intent,
        [{ role: 'user', content: turn.userMessage }],
        {},
        {},
        false,
        null,
      );

      expect(payload.turnId).toBe(turn.turnId);
      expect(payload.userGoal).toBe('Website Project');
      expect(payload.state).toBe('ACTIVE_PLANNING');

      conversationManager.completeTurn(conversationId, turn.turnId, 'Here is your website project plan...');
      const turns = conversationManager.getTurns(conversationId);
      expect(turns.length).toBe(1);
      expect(turns[0].assistantResponse).toContain('website project plan');
    });

    it('accurately identifies contextual follow-up requests', () => {
      // First turn sets state
      const intent1 = getValidIntent('Help me plan my website project');
      const turn1 = conversationManager.recordTurn(conversationId, 'Help me plan my website project', intent1);
      conversationManager.completeTurn(conversationId, turn1.turnId, 'Planning website project...');

      // Follow-up check
      expect(conversationManager.isFollowUp(conversationId, 'Actually, the deadline changed to Friday.')).toBe(true);
      expect(conversationManager.isFollowUp(conversationId, 'Next Friday')).toBe(true);
      expect(conversationManager.isFollowUp(conversationId, 'What should I do next?')).toBe(true);
    });
  });

  describe('2. 20-Intent Matrix Classification', () => {
    const testCases: { message: string; expectedIntent: string }[] = [
      { message: 'Hello! How are you?', expectedIntent: 'GREETING' },
      { message: 'What is Aether?', expectedIntent: 'GENERAL_QUESTION' },
      { message: 'What can you help me with?', expectedIntent: 'INFORMATION_REQUEST' },
      { message: 'What information do you need from me to plan my week?', expectedIntent: 'INFORMATION_REQUEST' },
      { message: 'I need help organizing my tasks.', expectedIntent: 'TASK_MANAGEMENT' },
      { message: 'Create a task: Review Q3 financials', expectedIntent: 'TASK_CREATION' },
      { message: 'I have three tasks to finish this week. Help me prioritize them.', expectedIntent: 'TASK_PRIORITIZATION' },
      { message: 'Plan my week.', expectedIntent: 'WEEKLY_PLANNING' },
      { message: 'I have a website project. Help me create a project plan.', expectedIntent: 'PROJECT_PLANNING' },
      { message: 'Show my active projects in the workspace', expectedIntent: 'PROJECT_MANAGEMENT' },
      { message: 'How can I improve my daily productivity?', expectedIntent: 'PRODUCTIVITY' },
      { message: 'Explain how automations work in Aether', expectedIntent: 'EXPLANATION' },
      { message: 'Summarize the meeting notes from yesterday', expectedIntent: 'SUMMARIZATION' },
      { message: 'Remember that my website project is my highest priority.', expectedIntent: 'MEMORY_STORE' },
      { message: 'What is my highest priority?', expectedIntent: 'MEMORY_RECALL' },
      { message: 'Search my documents for the Q2 roadmap', expectedIntent: 'KNOWLEDGE_REQUEST' },
      { message: 'What is 15 * 42?', expectedIntent: 'TOOL_REQUEST' },
      { message: 'Query the knowledge base for deployment docs', expectedIntent: 'RAG_REQUEST' },
      { message: 'Do it', expectedIntent: 'CLARIFICATION' },
    ];

    for (const tc of testCases) {
      it(`classifies "${tc.message}" as ${tc.expectedIntent}`, () => {
        const res = intentEngine.classify(tc.message);
        expect(res.ok).toBe(true);
        if (res.ok) {
          expect(res.value.type).toBe(tc.expectedIntent);
        }
      });
    }
  });

  describe('3. Multi-Dimensional Confidence Scoring', () => {
    it('computes fine-grained scores across intent, context, knowledge, and generation', () => {
      const intent = getValidIntent('Hello');
      const context = createMockContext({
        conversationHistory: [],
      });

      const multi = confidenceEngine.assessMultiDimensional('Hello', intent, context, 'Hello! How can I help you?');
      expect(multi.intentConfidence).toBeGreaterThanOrEqual(0.8);
      expect(multi.overallConfidence).toBeGreaterThanOrEqual(0.7);
      expect(multi.overallLevel).toBe('HIGH_CONFIDENCE');
      expect(multi.reasoning).toBeDefined();
    });

    it('assigns LOW_CONFIDENCE or INSUFFICIENT_INFORMATION when clarification is required', () => {
      const intent = getValidIntent('Do it');
      const context = createMockContext();
      const multi = confidenceEngine.assessMultiDimensional('Do it', intent, context);
      expect(multi.overallLevel).toBe('LOW_CONFIDENCE');
    });
  });

  describe('4. Minimal Clarification System', () => {
    it('flags bare "Plan my week" for clarification when required parameters are missing', () => {
      const res = intentEngine.classify('Plan my week.');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.requiresClarification).toBe(true);
        expect(res.value.clarificationPrompt).toContain('What tasks');
        expect(res.value.clarificationPrompt).toContain('deadlines');
      }
    });
  });

  describe('5. End-to-End Execution of 12 Phase 14 Scenarios', () => {
    it('Test 1: Hello', () => {
      const req = dummyReq('Hello');
      const intent = getValidIntent(req.message);
      const res = responseSynthesizer.synthesize({
        request: req,
        intent,
        context: createMockContext(),
        assessment: {
          strategy: 'DIRECT_ANSWER',
          complexity: 'SIMPLE',
          isSimple: true,
          requiresPlan: false,
          informationSufficient: true,
          rationale: 'Direct conversational greeting.',
        },
      });
      expect(res.content).toContain("Hello! I'm Aether");
      expect(res.content).toContain('What would you like to work on?');
    });

    it('Test 2: What is Aether?', () => {
      const req = dummyReq('What is Aether?');
      const intent = getValidIntent(req.message);
      const res = responseSynthesizer.synthesize({
        request: req,
        intent,
        context: createMockContext(),
        assessment: {
          strategy: 'DIRECT_ANSWER',
          complexity: 'SIMPLE',
          isSimple: true,
          requiresPlan: false,
          informationSufficient: true,
          rationale: 'Product knowledge query.',
        },
      });
      expect(res.content).toContain('Aether');
      expect(res.content).toContain('workspace');
    });

    it('Test 3: What can you help me with?', () => {
      const req = dummyReq('What can you help me with?');
      const intent = getValidIntent(req.message);
      const res = responseSynthesizer.synthesize({
        request: req,
        intent,
        context: createMockContext(),
        assessment: {
          strategy: 'DIRECT_ANSWER',
          complexity: 'SIMPLE',
          isSimple: true,
          requiresPlan: false,
          informationSufficient: true,
          rationale: 'Capabilities inquiry.',
        },
      });
      expect(res.content).toContain('Task & Project Management');
      expect(res.content).toContain('Weekly & Goal Planning');
    });

    it('Test 4: I need help organizing my tasks.', () => {
      const req = dummyReq('I need help organizing my tasks.');
      const intent = getValidIntent(req.message);
      const res = responseSynthesizer.synthesize({
        request: req,
        intent,
        context: createMockContext(),
        assessment: {
          strategy: 'DIRECT_ANSWER',
          complexity: 'SIMPLE',
          isSimple: true,
          requiresPlan: false,
          informationSufficient: true,
          rationale: 'Task management guidance.',
        },
      });
      expect(res.content).toContain('organize your tasks');
      expect(res.content).toContain('Capture Everything');
    });

    it('Test 5: Plan my week. (Clarification Request)', () => {
      const req = dummyReq('Plan my week.');
      const intent = getValidIntent(req.message);
      expect(intent.requiresClarification).toBe(true);
      expect(intent.clarificationPrompt).toContain('What tasks');
      expect(intent.clarificationPrompt).toContain('deadlines');
    });

    it('Test 6: I have a website project. Help me create a project plan.', () => {
      const req = dummyReq('I have a website project. Help me create a project plan.');
      const intent = getValidIntent(req.message);
      const res = responseSynthesizer.synthesize({
        request: req,
        intent,
        context: createMockContext(),
        assessment: {
          strategy: 'DIRECT_ANSWER',
          complexity: 'MULTI_STEP',
          isSimple: false,
          requiresPlan: true,
          informationSufficient: true,
          rationale: 'Structured project plan decomposition.',
        },
      });
      expect(res.content).toContain('Website Project');
      expect(res.content).toContain('Discovery & Architecture');
      expect(res.content).toContain('Core Development');
    });

    it('Test 7: I have three tasks to finish this week. Help me prioritize them.', () => {
      const req = dummyReq('I have three tasks to finish this week. Help me prioritize them.');
      const intent = getValidIntent(req.message);
      const res = responseSynthesizer.synthesize({
        request: req,
        intent,
        context: createMockContext(),
        assessment: {
          strategy: 'DIRECT_ANSWER',
          complexity: 'SIMPLE',
          isSimple: true,
          requiresPlan: false,
          informationSufficient: true,
          rationale: 'Task prioritization framework.',
        },
      });
      expect(res.content).toContain('three tasks');
      expect(res.content).toContain('Eisenhower Matrix');
    });

    it('Test 8: What information do you need from me to plan my week?', () => {
      const req = dummyReq('What information do you need from me to plan my week?');
      const intent = getValidIntent(req.message);
      const res = responseSynthesizer.synthesize({
        request: req,
        intent,
        context: createMockContext(),
        assessment: {
          strategy: 'DIRECT_ANSWER',
          complexity: 'SIMPLE',
          isSimple: true,
          requiresPlan: false,
          informationSufficient: true,
          rationale: 'Planning prerequisites inquiry.',
        },
      });
      expect(res.content).toContain('Tasks & Deliverables');
      expect(res.content).toContain('Deadlines & Fixed Commitments');
      expect(res.content).toContain('Available Time');
    });

    it('Test 9: Remember that my website project is my highest priority.', () => {
      const req = dummyReq('Remember that my website project is my highest priority.');
      const intent = getValidIntent(req.message);
      const res = responseSynthesizer.synthesize({
        request: req,
        intent,
        context: createMockContext(),
        assessment: {
          strategy: 'DIRECT_ANSWER',
          complexity: 'SIMPLE',
          isSimple: true,
          requiresPlan: false,
          informationSufficient: true,
          rationale: 'Store memory item.',
        },
      });
      expect(res.content).toContain('website project is your highest priority');
      expect(res.content).toContain('persistent memory');
    });

    it('Test 10: What is my highest priority?', () => {
      const req = dummyReq('What is my highest priority?');
      const intent = getValidIntent(req.message);
      const context = createMockContext({
        longTermMemory: [
          {
            id: 'mem_1',
            userId,
            type: 'preference',
            content: 'Website project is highest priority',
            importance: 0.9,
            accessCount: 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      });
      const res = responseSynthesizer.synthesize({
        request: req,
        intent,
        context,
        assessment: {
          strategy: 'DIRECT_ANSWER',
          complexity: 'SIMPLE',
          isSimple: true,
          requiresPlan: false,
          informationSufficient: true,
          rationale: 'Recall memory item.',
        },
      });
      expect(res.content).toContain('Website Project');
    });

    it('Test 11: What should I do next?', () => {
      const req = dummyReq('What should I do next?');
      const intent = getValidIntent(req.message, { conversationId });
      const context = createMockContext({
        conversationHistory: [
          {
            role: 'user',
            content: 'Remember that my website project is my highest priority.',
            timestamp: Date.now() - 1000,
            messageId: 'msg_1',
          },
          {
            role: 'assistant',
            content: "I've noted that your website project is your highest priority.",
            timestamp: Date.now() - 500,
            messageId: 'msg_2',
          },
        ],
      });
      const res = responseSynthesizer.synthesize({
        request: req,
        intent,
        context,
        assessment: {
          strategy: 'DIRECT_ANSWER',
          complexity: 'SIMPLE',
          isSimple: true,
          requiresPlan: false,
          informationSufficient: true,
          rationale: 'Contextual follow-up next action recommendation.',
        },
      });
      expect(res.content).toContain('Website Project');
    });

    it('Test 12: Actually, the deadline changed to Friday.', () => {
      const req = dummyReq('Actually, the deadline changed to Friday.');
      const intent = getValidIntent(req.message, { conversationId });
      const context = createMockContext({
        conversationHistory: [
          {
            role: 'user',
            content: 'Help me plan my website project.',
            timestamp: Date.now() - 1000,
            messageId: 'msg_1',
          },
          {
            role: 'assistant',
            content: 'Here is your website project plan.',
            timestamp: Date.now() - 500,
            messageId: 'msg_2',
          },
        ],
      });
      const res = responseSynthesizer.synthesize({
        request: req,
        intent,
        context,
        assessment: {
          strategy: 'DIRECT_ANSWER',
          complexity: 'SIMPLE',
          isSimple: true,
          requiresPlan: false,
          informationSufficient: true,
          rationale: 'Follow-up constraint adjustment.',
        },
      });
      expect(res.content).toContain('Friday');
      expect(res.content).toContain('Website Project');
    });

    it('Ensures responseValidator strictly prevents CoT exposure', () => {
      const req = dummyReq('Hello');
      const intent = getValidIntent('Hello');
      const leakyOutput = '<think>User said hello. Reply politely.</think>Hello! How can I help?';
      const val = responseValidator.validate(req, intent, createMockContext(), leakyOutput);
      expect(val.valid).toBe(true);
      expect(val.correctedContent).toBe('Hello! How can I help?');
      expect(val.correctedContent).not.toContain('<think>');
    });

    it('Verifies contextEngine assembly integration', async () => {
      const req = dummyReq('Hello');
      const intent = getValidIntent('Hello');
      const ctxRes = await contextEngine.assemble(req, intent);
      expect(ctxRes.ok).toBe(true);
      if (ctxRes.ok) {
        expect(ctxRes.value.userId).toBe(userId);
        expect(ctxRes.value.conversationId).toBe(conversationId);
        expect(ctxRes.value.tokenBudget).toBeDefined();
      }
    });
  });
});
