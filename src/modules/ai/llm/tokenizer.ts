/**
 * AETHER AI — Tokenizer
 * Token counting utilities using character-based estimation.
 * Provides a real, deterministic estimate without cloud API calls.
 * For production use, swap body with tiktoken or llama-tokenizer-js.
 */

import { TOKEN_LIMITS } from '../ai-constants.js';
import type { TokenizerResult } from './llm-types.js';
import type { TokenBudget } from '../ai-types.js';

// ─── ITokenizer Interface ─────────────────────────────────────────────────────

export interface ITokenizer {
  count(text: string): TokenizerResult;
  countMessages(messages: readonly { content: string }[]): TokenizerResult;
  buildBudget(maxContextTokens: number): TokenBudget;
  fitsWithin(text: string, maxTokens: number): boolean;
  truncateToFit(text: string, maxTokens: number): string;
}

// ─── Character-Based Tokenizer ────────────────────────────────────────────────

/**
 * EstimatedTokenizer uses the 4-chars-per-token heuristic.
 * This provides accurate-enough estimates for budget planning.
 * It can be replaced with a proper tokenizer (tiktoken, llama-tokenizer-js)
 * without changing the ITokenizer interface.
 */
export class EstimatedTokenizer implements ITokenizer {
  private readonly charsPerToken: number;

  constructor(charsPerToken = TOKEN_LIMITS.CHARS_PER_TOKEN_ESTIMATE) {
    this.charsPerToken = charsPerToken;
  }

  public count(text: string): TokenizerResult {
    if (text.length === 0) return { tokenCount: 0 };
    const tokenCount = Math.ceil(text.length / this.charsPerToken);
    return { tokenCount };
  }

  public countMessages(messages: readonly { content: string }[]): TokenizerResult {
    // Each message has role overhead (~4 tokens) + content tokens
    const roleOverheadPerMessage = 4;
    let total = 0;
    for (const msg of messages) {
      total += this.count(msg.content).tokenCount + roleOverheadPerMessage;
    }
    return { tokenCount: total };
  }

  public buildBudget(maxContextTokens: number): TokenBudget {
    const system = Math.floor(maxContextTokens * TOKEN_LIMITS.SYSTEM_BUDGET_RATIO);
    const history = Math.floor(maxContextTokens * TOKEN_LIMITS.HISTORY_BUDGET_RATIO);
    const context = Math.floor(maxContextTokens * TOKEN_LIMITS.RAG_BUDGET_RATIO);
    const response = Math.floor(maxContextTokens * TOKEN_LIMITS.RESPONSE_BUDGET_RATIO);
    const allocated = system + history + context + response;
    const remaining = Math.max(0, maxContextTokens - allocated);

    return {
      total: maxContextTokens,
      system,
      history,
      context,
      response,
      remaining,
    };
  }

  public fitsWithin(text: string, maxTokens: number): boolean {
    return this.count(text).tokenCount <= maxTokens;
  }

  /**
   * Truncates text to fit within maxTokens.
   * Truncates from the end, preserving the beginning of the text.
   */
  public truncateToFit(text: string, maxTokens: number): string {
    const maxChars = maxTokens * this.charsPerToken;
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars);
  }

  /**
   * Trims a list of messages to fit within a token budget.
   * Drops oldest messages first.
   */
  public trimMessages<T extends { content: string }>(
    messages: readonly T[],
    maxTokens: number,
  ): T[] {
    const trimmed: T[] = [];
    let usedTokens = 0;
    const roleOverhead = 4;

    // Walk in reverse to prefer recent messages
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]!;
      const msgTokens = this.count(msg.content).tokenCount + roleOverhead;
      if (usedTokens + msgTokens > maxTokens) break;
      trimmed.unshift(msg);
      usedTokens += msgTokens;
    }

    return trimmed;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const defaultTokenizer = new EstimatedTokenizer();
