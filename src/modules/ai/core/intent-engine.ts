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
      const lower = message.toLowerCase();

      const ragScore = this.scoreKeywords(lower, INTENT.RAG_KEYWORDS);
      const memoryScore = this.scoreKeywords(lower, INTENT.MEMORY_KEYWORDS);
      const toolScore = this.scoreKeywords(lower, INTENT.TOOL_KEYWORDS);
      const agentScore = this.scoreKeywords(lower, INTENT.AGENT_KEYWORDS);

      // Determine dominant intent
      let type: IntentType = 'NORMAL_RESPONSE';
      let confidence = 0.6;

      const scores = [
        { type: 'AGENT_REQUIRED' as IntentType, score: agentScore },
        { type: 'TOOL_REQUIRED' as IntentType, score: toolScore },
        { type: 'RAG_REQUIRED' as IntentType, score: ragScore },
        { type: 'MEMORY_REQUIRED' as IntentType, score: memoryScore },
      ];

      // Pick highest-scoring intent above threshold
      const THRESHOLD = 0.1;
      for (const { type: intentType, score } of scores) {
        if (score > THRESHOLD) {
          type = intentType;
          confidence = Math.min(0.95, 0.5 + score * 2);
          break;
        }
      }

      const intent: Intent = {
        type,
        confidence,
        requiresRAG: type === 'RAG_REQUIRED',
        requiresMemory: type === 'MEMORY_REQUIRED',
        requiresTool: type === 'TOOL_REQUIRED',
        requiresAgent: type === 'AGENT_REQUIRED',
      };

      return ok(intent);
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

  private scoreKeywords(text: string, keywords: readonly string[]): number {
    let score = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 1 / keywords.length;
      }
    }
    return Math.min(1, score);
  }
}
