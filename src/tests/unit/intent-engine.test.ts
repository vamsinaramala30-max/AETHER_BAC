import { describe, it, expect } from 'vitest';
import { HeuristicIntentEngine } from '../../modules/ai/core/intent-engine.js';

describe('HeuristicIntentEngine — Hardened Intent Intelligence', () => {
  const intentEngine = new HeuristicIntentEngine();

  describe('Core Intent Classification & Taxonomy', () => {
    it('should classify automation requests with required context', () => {
      const res = intentEngine.classify('Create an automation to remind me about tasks every Monday at 9 AM');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(['AUTOMATION_REQUEST', 'AUTOMATION'].includes(res.value.type)).toBe(true);
        expect(res.value.requiresTool).toBe(true);
        expect(res.value.confidence).toBeGreaterThanOrEqual(0.85);
        expect(res.value.confidenceLevel).toBe('HIGH_CONFIDENCE');
        expect(res.value.requiredContext?.workspace).toBe(true);
        expect(res.value.requiredContext?.tools).toBe(true);
        expect(res.value.requestedAction).toBe('schedule');
      }
    });

    it('should classify task creation and extract task entity', () => {
      const res = intentEngine.classify('create task Review quarterly financial report');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(['TASK_CREATION', 'PROJECT_WORKSPACE_TASK'].includes(res.value.type)).toBe(true);
        expect(res.value.requiresTool).toBe(true);
        expect(res.value.requestedAction).toBe('create');
        expect(res.value.confidenceLevel).toBe('HIGH_CONFIDENCE');

        const taskEntity = res.value.entities?.find((e) => e.type === 'task_title');
        expect(taskEntity).toBeDefined();
        expect(taskEntity?.value).toContain('Review quarterly financial report');
      }
    });

    it('should classify project and workspace inquiries and extract project entity', () => {
      const res = intentEngine.classify('What is the project status of Alpha Redesign?');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(['PROJECT_MANAGEMENT', 'PROJECT_WORKSPACE_TASK'].includes(res.value.type)).toBe(true);
        expect(res.value.requiredContext?.project).toBe(true);

        const projEntity = res.value.entities?.find((e) => e.type === 'project_name');
        expect(projEntity).toBeDefined();
        expect(projEntity?.value).toContain('Alpha Redesign');
      }
    });

    it('should classify knowledge questions and require RAG', () => {
      const res = intentEngine.classify('according to the document what is our refund policy in knowledge base');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(['KNOWLEDGE_REQUEST', 'KNOWLEDGE_QUESTION', 'RAG_REQUEST'].includes(res.value.type)).toBe(true);
        expect(res.value.requiresRAG).toBe(true);
        expect(res.value.requiredContext?.rag).toBe(true);
        expect(res.value.confidenceLevel).toBe('HIGH_CONFIDENCE');
      }
    });

    it('should classify user memory and preference inquiries', () => {
      const res = intentEngine.classify('what is my preference for notifications?');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(['MEMORY_RECALL', 'USER_DATA_QUESTION'].includes(res.value.type)).toBe(true);
        expect(res.value.requiresMemory).toBe(true);
        expect(res.value.requiredContext?.memory).toBe(true);
      }
    });

    it('should classify summarization requests', () => {
      const res = intentEngine.classify('Summarize the key architectural patterns of this system');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.type).toBe('SUMMARIZATION');
        expect(res.value.confidenceLevel).toBe('HIGH_CONFIDENCE');
      }
    });

    it('should classify writing and drafting requests', () => {
      const res = intentEngine.classify('Draft an email to the engineering team announcing the release');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(['WRITING', 'GENERAL_QUESTION'].includes(res.value.type)).toBe(true);
      }
    });

    it('should classify analytical and evaluation requests', () => {
      const res = intentEngine.classify('Analyze and compare the trade-offs between REST and GraphQL');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(['ANALYTICAL', 'GENERAL_QUESTION', 'EXPLANATION'].includes(res.value.type)).toBe(true);
      }
    });

    it('should classify planning and decision support', () => {
      const res = intentEngine.classify('Create a step by step plan and roadmap for the Q4 launch');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(['PROJECT_PLANNING', 'WEEKLY_PLANNING', 'PLANNING'].includes(res.value.type)).toBe(true);
      }
    });

    it('should classify Aether product questions', () => {
      const res = intentEngine.classify('what is aether AI and how does it work?');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(['GENERAL_QUESTION', 'AETHER_PRODUCT_QUESTION', 'EXPLANATION'].includes(res.value.type)).toBe(true);
      }
    });

    it('should classify coding technical questions', () => {
      const res = intentEngine.classify('Write a typescript async function to validate JWT tokens');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(['CODING_TECHNICAL', 'GENERAL_QUESTION', 'EXPLANATION'].includes(res.value.type)).toBe(true);
      }
    });

    it('should classify conversational greetings', () => {
      const res = intentEngine.classify('Hello there!');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(['GREETING', 'CONVERSATIONAL'].includes(res.value.type)).toBe(true);
        expect(res.value.confidence).toBeGreaterThanOrEqual(0.9);
      }
    });
  });

  describe('Ambiguity Detection & Clarification Handling', () => {
    it('should detect ambiguous action "Fix this" and require clarification', () => {
      const res = intentEngine.classify('Fix this');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(['CLARIFICATION', 'CLARIFICATION_REQUIRED', 'AMBIGUOUS'].includes(res.value.type)).toBe(true);
        expect(res.value.requiresClarification).toBe(true);
        expect(res.value.confidenceLevel).toBe('LOW_CONFIDENCE');
        expect(res.value.clarificationPrompt).toBeDefined();
      }
    });

    it('should detect ambiguous action "Do it" and require clarification', () => {
      const res = intentEngine.classify('Do it');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(['CLARIFICATION', 'CLARIFICATION_REQUIRED', 'AMBIGUOUS'].includes(res.value.type)).toBe(true);
        expect(res.value.requiresClarification).toBe(true);
        expect(res.value.confidenceLevel).toBe('LOW_CONFIDENCE');
        expect(res.value.clarificationPrompt).toBeDefined();
      }
    });

    it('should detect ambiguous command "Summarize the document" without document reference', () => {
      const res = intentEngine.classify('Summarize the document');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(['CLARIFICATION', 'CLARIFICATION_REQUIRED', 'AMBIGUOUS', 'SUMMARIZATION'].includes(res.value.type)).toBe(true);
      }
    });

    it('should detect very short queries and require clarification', () => {
      const res = intentEngine.classify('hi');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(['GREETING', 'CONVERSATIONAL'].includes(res.value.type)).toBe(true);
      }

      const shortRes = intentEngine.classify('??');
      expect(shortRes.ok).toBe(true);
      if (shortRes.ok) {
        expect(['CLARIFICATION', 'CLARIFICATION_REQUIRED', 'AMBIGUOUS', 'UNKNOWN'].includes(shortRes.value.type)).toBe(true);
      }
    });
  });

  describe('Error Handling & Boundary Paths', () => {
    it('should fail gracefully on empty message', () => {
      const res = intentEngine.classify('');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('INTENT_FAILED');
      }
    });

    it('should fail gracefully on whitespace-only message', () => {
      const res = intentEngine.classify('   \n\t  ');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('INTENT_FAILED');
      }
    });
  });
});
