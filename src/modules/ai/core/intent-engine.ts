/**
 * AETHER AI — Intent Engine
 * Classifies user intent from message text.
 * Uses heuristic keyword matching as primary method.
 * Can be upgraded to use LLM-based classification.
 */

import type { Intent, IntentType } from '../ai-types.js';
import type { Result } from '../ai-types.js';
import { ok, fail } from '../ai-types.js';
import { IntentFailedError } from '../ai-errors.js';
import { INTENT } from '../ai-constants.js';

// ─── IIntentEngine Interface ──────────────────────────────────────────────────

export interface IIntentEngine {
  classify(message: string): Result<Intent>;
}

// ─── Heuristic Intent Engine ──────────────────────────────────────────────────

export class HeuristicIntentEngine implements IIntentEngine {
  public classify(message: string): Result<Intent> {
    if (!message || message.trim().length === 0) {
      return fail(new IntentFailedError('Message is empty'));
    }

    try {
      const lower = message.toLowerCase().trim();

      // Check for Ambiguous or Empty queries
      if (lower.length <= 2 || lower === 'what' || lower === 'help' || lower === 'do it') {
        return ok({
          type: 'AMBIGUOUS',
          confidence: 0.5,
          requiresRAG: false,
          requiresMemory: false,
          requiresTool: false,
          requiresAgent: false,
          reasoning: 'Query is short or ambiguous.',
        });
      }

      // 1. Automation requests
      if (
        lower.includes('automation') ||
        lower.includes('workflow') ||
        lower.includes('remind me') ||
        lower.includes('trigger') ||
        lower.includes('schedule task')
      ) {
        return ok({
          type: 'AUTOMATION_REQUEST',
          confidence: 0.9,
          requiresRAG: false,
          requiresMemory: false,
          requiresTool: true,
          requiresAgent: false,
          reasoning: 'Request involves creating, listing, or triggering automations.',
        });
      }

      // 2. Project / Workspace tasks
      if (
        lower.includes('create task') ||
        lower.includes('create project') ||
        lower.includes('add task') ||
        lower.includes('workspace') ||
        lower.includes('delete task') ||
        lower.includes('delete project') ||
        lower.includes('update task')
      ) {
        return ok({
          type: 'PROJECT_WORKSPACE_TASK',
          confidence: 0.9,
          requiresRAG: false,
          requiresMemory: false,
          requiresTool: true,
          requiresAgent: false,
          reasoning: 'Request performs project or task operations.',
        });
      }

      // 3. Knowledge / Document RAG questions
      if (
        lower.includes('document') ||
        lower.includes('knowledge') ||
        lower.includes('search knowledge') ||
        lower.includes('according to') ||
        lower.includes('pdf') ||
        lower.includes('file content') ||
        lower.includes('find in')
      ) {
        return ok({
          type: 'KNOWLEDGE_QUESTION',
          confidence: 0.85,
          requiresRAG: true,
          requiresMemory: false,
          requiresTool: true,
          requiresAgent: false,
          reasoning: 'Query asks about knowledge base or document content.',
        });
      }

      // 4. User-data / Memory questions
      if (
        lower.includes('my preference') ||
        lower.includes('my memory') ||
        lower.includes('remember') ||
        lower.includes('what did i say') ||
        lower.includes('my settings')
      ) {
        return ok({
          type: 'USER_DATA_QUESTION',
          confidence: 0.85,
          requiresRAG: false,
          requiresMemory: true,
          requiresTool: true,
          requiresAgent: false,
          reasoning: 'Query relates to user memory or saved preferences.',
        });
      }

      // 5. Aether product questions
      if (
        lower.includes('what is aether') ||
        lower.includes('how to use aether') ||
        lower.includes('aether feature') ||
        lower.includes('aether settings')
      ) {
        return ok({
          type: 'AETHER_PRODUCT_QUESTION',
          confidence: 0.9,
          requiresRAG: false,
          requiresMemory: false,
          requiresTool: false,
          requiresAgent: false,
          reasoning: 'Query asks about Aether system features.',
        });
      }

      // 6. Coding / Technical questions
      if (
        lower.includes('function') ||
        lower.includes('code') ||
        lower.includes('typescript') ||
        lower.includes('javascript') ||
        lower.includes('bug') ||
        lower.includes('api') ||
        lower.includes('error') ||
        lower.includes('class')
      ) {
        return ok({
          type: 'CODING_TECHNICAL',
          confidence: 0.85,
          requiresRAG: false,
          requiresMemory: false,
          requiresTool: false,
          requiresAgent: false,
          reasoning: 'Technical or programming related question.',
        });
      }

      // 7. Analytical questions
      if (
        lower.includes('analyze') ||
        lower.includes('compare') ||
        lower.includes('benchmark') ||
        lower.includes('evaluation') ||
        lower.includes('metrics')
      ) {
        return ok({
          type: 'ANALYTICAL',
          confidence: 0.8,
          requiresRAG: false,
          requiresMemory: false,
          requiresTool: false,
          requiresAgent: true,
          reasoning: 'Analytical request requiring structured reasoning.',
        });
      }

      // 8. Writing requests
      if (
        lower.includes('write') ||
        lower.includes('draft') ||
        lower.includes('summarize') ||
        lower.includes('email') ||
        lower.includes('rewrite')
      ) {
        return ok({
          type: 'WRITING',
          confidence: 0.85,
          requiresRAG: false,
          requiresMemory: false,
          requiresTool: false,
          requiresAgent: false,
          reasoning: 'Writing or content creation task.',
        });
      }

      // Fallback: General Reasoning / Normal Response
      return ok({
        type: 'GENERAL_REASONING',
        confidence: 0.7,
        requiresRAG: false,
        requiresMemory: true,
        requiresTool: false,
        requiresAgent: false,
        reasoning: 'General user prompt.',
      });
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(
        new IntentFailedError(
          error instanceof Error ? error.message : String(error),
          cause,
        ),
      );
    }
  }
}
