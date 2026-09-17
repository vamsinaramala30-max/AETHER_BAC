/**
 * AETHER AI — Memory Extractor
 * Extracts potential long-term memory candidates from conversation turns.
 * Detects both store and forget directives.
 */

import type { UserId } from '../ai-types.js';
import type { MemoryCandidate } from './memory-classifier.js';

export type MemoryExtractionAction = 'store' | 'forget';

export interface ExtractedMemoryCandidate extends MemoryCandidate {
  readonly action: MemoryExtractionAction;
}

export class MemoryExtractor {
  /**
   * Extracts candidate memories (store or forget) from a user message.
   */
  public extract(userId: UserId, message: string): readonly ExtractedMemoryCandidate[] {
    const text = message.trim();
    if (!text || text.length < 5) return [];

    const candidates: ExtractedMemoryCandidate[] = [];

    // ─── FORGET Directives ──────────────────────────────────────────────
    // "Forget that X", "Don't remember X", "Remove the memory about X", "Stop remembering X"
    const forgetMatch = text.match(
      /(?:please\s+)?(?:forget(?:\s+that)?|don't\s+remember(?:\s+that)?|stop\s+remembering(?:\s+that)?|remove\s+(?:the\s+)?memory(?:\s+about)?|delete\s+(?:the\s+)?memory(?:\s+about)?|erase\s+(?:the\s+)?memory(?:\s+about)?)\s*[:,-]?\s+([^.!?]+)/i,
    );
    if (forgetMatch && forgetMatch[1]) {
      candidates.push({
        userId,
        content: forgetMatch[1].trim(),
        type: 'fact',
        importance: 0,
        source: 'user_explicit',
        action: 'forget',
      });
      return candidates; // Forget is exclusive — don't also try to extract stores
    }

    // ─── STORE Directives ───────────────────────────────────────────────

    // Explicit user-approved memory directives: "Remember that X", "Please remember X", "Note that X"
    const explicitMatch = text.match(
      /(?:please\s+)?(?:remember(?:\s+that)?|note(?:\s+that)?|keep\s+in\s+mind(?:\s+that)?|don't\s+forget(?:\s+that)?|never\s+forget(?:\s+that)?|always\s+remember(?:\s+that)?)\s*[:,-]?\s+([^.!?]+)/i,
    );
    if (explicitMatch && explicitMatch[1]) {
      const statement = explicitMatch[1].trim();
      const isPref = /\b(prefer|like|dislike|always|never|favorite|theme)\b/i.test(statement);
      candidates.push({
        userId,
        content: isPref ? `User preference: ${statement}` : statement,
        type: isPref ? 'preference' : 'fact',
        importance: 0.95,
        source: 'user_explicit',
        action: 'store',
      });
    }

    // Explicit preference patterns: "I prefer X", "I like X", "I always use X", "My favorite is X"
    const prefMatch = text.match(/(?:i prefer|i like|i always use|my favorite|i use)\s+([^.!?]+)/i);
    if (prefMatch && prefMatch[1] && !explicitMatch) {
      candidates.push({
        userId,
        content: `User preference: ${prefMatch[0].trim()}`,
        type: 'preference',
        importance: 0.85,
        source: 'user_statement',
        action: 'store',
      });
    }

    // Explicit project facts: "My project is X", "The current project is X"
    const projMatch = text.match(
      /(?:my current project is|my project is|working on|project name is)\s+([^.!?]+)/i,
    );
    if (projMatch && projMatch[1] && !explicitMatch) {
      candidates.push({
        userId,
        content: `Current project: ${projMatch[1].trim()}`,
        type: 'fact',
        importance: 0.9,
        source: 'user_statement',
        action: 'store',
      });
    }

    // Explicit decision patterns: "We decided X", "Decided to X"
    const decMatch = text.match(/(?:we decided|decided to|agreed to)\s+([^.!?]+)/i);
    if (decMatch && decMatch[1] && !explicitMatch) {
      candidates.push({
        userId,
        content: `Decision: ${decMatch[0].trim()}`,
        type: 'fact',
        importance: 0.9,
        source: 'user_statement',
        action: 'store',
      });
    }

    // Goal patterns: "My goal is X"
    const goalMatch = text.match(/(?:my goal is|our goal is|aiming to)\s+([^.!?]+)/i);
    if (goalMatch && goalMatch[1] && !explicitMatch) {
      candidates.push({
        userId,
        content: `Goal: ${goalMatch[0].trim()}`,
        type: 'fact',
        importance: 0.85,
        source: 'user_statement',
        action: 'store',
      });
    }

    // Workspace/technology facts: "My X uses Y", "My X is built with Y"
    const techMatch = text.match(
      /(?:my\s+\w+\s+(?:uses?|is built with|is written in|runs on))\s+([^.!?]+)/i,
    );
    if (techMatch && techMatch[0] && !explicitMatch && !projMatch) {
      candidates.push({
        userId,
        content: techMatch[0].trim(),
        type: 'fact',
        importance: 0.85,
        source: 'user_statement',
        action: 'store',
      });
    }

    return candidates;
  }
}

export const memoryExtractor = new MemoryExtractor();
