/**
 * AETHER AI — Safety Engine
 * Input and output safety checks.
 * Blocks prompt injection, harmful content, and oversized inputs.
 * Never generates fake safety results.
 */

import type { SafetyResult } from '../ai-types.js';
import type { SafetyConfig } from '../ai-config.js';
import { SAFETY } from '../ai-constants.js';

// ─── ISafetyEngine Interface ──────────────────────────────────────────────────

export interface ISafetyEngine {
  checkInput(text: string, userId?: string): SafetyResult;
  checkOutput(text: string): SafetyResult;
}

// ─── Safety Engine Implementation ────────────────────────────────────────────

export class SafetyEngine implements ISafetyEngine {
  constructor(private readonly config: SafetyConfig) {}

  public checkInput(text: string, _userId?: string): SafetyResult {
    if (!this.config.enabled) {
      return { safe: true, blocked: false };
    }

    const reasons: string[] = [];

    // Length check
    if (text.length > this.config.maxInputLength) {
      reasons.push(
        `Input exceeds maximum length of ${this.config.maxInputLength} characters (received ${text.length})`,
      );
    }

    // Empty check
    if (!text || text.trim().length === 0) {
      reasons.push('Input is empty');
    }

    // Prompt injection check
    if (this.config.blockPromptInjection) {
      for (const pattern of SAFETY.PROMPT_INJECTION_PATTERNS) {
        if (pattern.test(text)) {
          reasons.push(`Potential prompt injection detected: pattern "${pattern.source}"`);
          break;
        }
      }
    }

    // Harmful content check (basic keyword patterns)
    if (this.config.blockHarmfulContent) {
      const harmfulPatterns = this.getHarmfulPatterns();
      for (const { pattern, category } of harmfulPatterns) {
        if (pattern.test(text)) {
          reasons.push(`Potentially harmful content detected: ${category}`);
          break;
        }
      }
    }

    if (reasons.length > 0) {
      return {
        safe: false,
        blocked: true,
        reasons,
        severity: this.classifySeverity(reasons),
      };
    }

    return { safe: true, blocked: false };
  }

  public checkOutput(text: string): SafetyResult {
    if (!this.config.enabled) {
      return { safe: true, blocked: false };
    }

    const reasons: string[] = [];

    if (text.length > this.config.maxOutputLength) {
      reasons.push(`Output exceeds maximum length of ${this.config.maxOutputLength} characters`);
    }

    if (reasons.length > 0) {
      return {
        safe: false,
        blocked: false, // Output is not blocked — just flagged
        reasons,
        severity: 'low',
      };
    }

    return { safe: true, blocked: false };
  }

  private getHarmfulPatterns(): Array<{ pattern: RegExp; category: string }> {
    return [
      { pattern: /how to (make|build|create) (a )?(bomb|explosive|weapon)/i, category: 'weapons' },
      {
        pattern: /how to (kill|murder|harm|attack) (a )?(person|human|people)/i,
        category: 'violence',
      },
      { pattern: /\b(child|minor).{0,20}(sexual|nude|naked|porn)/i, category: 'csam' },
      {
        pattern: /\b(synthesize|produce|manufacture).{0,20}(drug|meth|fentanyl|heroin)/i,
        category: 'drugs',
      },
    ];
  }

  private classifySeverity(reasons: string[]): 'low' | 'medium' | 'high' | 'critical' {
    const text = reasons.join(' ').toLowerCase();
    if (text.includes('csam') || text.includes('weapons') || text.includes('explosive')) {
      return 'critical';
    }
    if (text.includes('violence') || text.includes('harmful')) return 'high';
    if (text.includes('injection')) return 'medium';
    return 'low';
  }
}
