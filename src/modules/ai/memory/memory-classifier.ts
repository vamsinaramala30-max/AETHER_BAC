/**
 * AETHER AI — Memory Classifier & Quality Engine
 * Evaluates memory candidates using strict production rules:
 * 1. Privacy/Security Check (Filter sensitive items like keys, credentials)
 * 2. Usefulness/Stability Check (Filter generic chatter, non-reusable statements)
 * 3. Duplicate/Contradiction Check (Identify superseding vs identical memories)
 * 4. User Scope Validation
 */

import type { MemoryItem, UserId, MemoryType } from '../ai-types.js';

export interface MemoryCandidate {
  readonly userId: UserId;
  readonly content: string;
  readonly type: MemoryType;
  readonly importance?: number;
  readonly source?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ClassificationResult {
  readonly accepted: boolean;
  readonly reason?: string;
  readonly category: MemoryType;
  readonly confidence: 'confirmed' | 'user_provided' | 'inferred' | 'temporary';
  readonly importance: number;
  readonly action: 'create' | 'supersede' | 'reject';
  readonly targetMemoryIdToSupersede?: string;
  readonly sanitizedContent: string;
}

export class MemoryClassifier {
  /**
   * Evaluates whether a memory candidate is safe, useful, stable, and permitted to store.
   */
  public classify(
    candidate: MemoryCandidate,
    existingMemories: readonly MemoryItem[] = [],
  ): ClassificationResult {
    const rawContent = candidate.content.trim();

    // 1. Privacy / Security Check
    const sensitivePattern =
      /(api[_-]?key|password|secret|bearer\s+[a-z0-9._-]+|ssn|\b\d{3}-\d{2}-\d{4}\b|\b\d{16}\b|private[_-]?key|auth[_-]?token)/i;
    if (sensitivePattern.test(rawContent)) {
      return {
        accepted: false,
        reason: 'Candidate contains sensitive security credentials or PII',
        category: candidate.type,
        confidence: 'inferred',
        importance: 0,
        action: 'reject',
        sanitizedContent: '',
      };
    }

    // 2. Usefulness / Stability Check
    const lowValuePatterns = [
      /^(hi|hello|hey|greetings|thanks|thank you|ok|okay|cool|sure|bye|goodbye)$/i,
      /^(what is|who is|tell me about|how do I|can you)\b/i,
      /^(yes|no|maybe|idk|i don't know)$/i,
    ];
    if (rawContent.length < 5 || lowValuePatterns.some((pattern) => pattern.test(rawContent))) {
      return {
        accepted: false,
        reason: 'Candidate lacks long-term utility or stability',
        category: candidate.type,
        confidence: 'inferred',
        importance: 0,
        action: 'reject',
        sanitizedContent: rawContent,
      };
    }

    // 3. User Scope & Category Normalization & Confidence
    let category: MemoryType = candidate.type;
    let importance = candidate.importance ?? 0.5;
    let confidence: 'confirmed' | 'user_provided' | 'inferred' | 'temporary' = 'user_provided';

    if (candidate.source === 'user_explicit') {
      confidence = 'confirmed';
      importance = Math.max(importance, 0.95);
    } else if (candidate.source === 'inferred') {
      confidence = 'inferred';
    } else {
      confidence = 'user_provided';
    }

    if (/\b(prefer|like|dislike|always|never|theme|favorite)\b/i.test(rawContent)) {
      category = 'preference';
      importance = Math.max(importance, 0.8);
    } else {
      category = candidate.type || 'fact';
      importance = Math.max(importance, 0.7);
    }

    // 4. Duplicate / Contradiction Check
    const normalizedNew = rawContent.toLowerCase();
    for (const existing of existingMemories) {
      if (existing.userId !== candidate.userId) continue;

      // Skip already deleted or superseded items
      if (existing.metadata?.status === 'deleted' || existing.metadata?.status === 'superseded') {
        continue;
      }

      const normalizedExisting = existing.content.toLowerCase();

      // Duplicate Check
      if (normalizedExisting === normalizedNew) {
        return {
          accepted: false,
          reason: 'Identical memory already exists',
          category,
          confidence,
          importance: existing.importance,
          action: 'reject',
          sanitizedContent: rawContent,
        };
      }

      // Contradiction / Preference or Fact Update Check
      const keySubjectNew = this.extractSubjectKey(normalizedNew);
      const keySubjectExisting = this.extractSubjectKey(normalizedExisting);

      if (keySubjectNew && keySubjectExisting && keySubjectNew === keySubjectExisting) {
        return {
          accepted: true,
          reason: `Supersedes contradictory ${category} "${existing.content}" on topic "${keySubjectNew}"`,
          category,
          confidence,
          importance,
          action: 'supersede',
          targetMemoryIdToSupersede: existing.id,
          sanitizedContent: rawContent,
        };
      }
    }

    return {
      accepted: true,
      category,
      confidence,
      importance,
      action: 'create',
      sanitizedContent: rawContent,
    };
  }

  private extractSubjectKey(text: string): string | null {
    if (text.includes('theme') || text.includes('dark mode') || text.includes('light mode')) return 'theme';
    if (text.includes('language') || text.includes('locale')) return 'language';
    if (text.includes('framework') || text.includes('react') || text.includes('vue') || text.includes('angular') || text.includes('next')) return 'framework';
    if (text.includes('model') || text.includes('provider') || text.includes('gemini') || text.includes('openai') || text.includes('claude')) return 'model';
    if (text.includes('database') || text.includes('db') || text.includes('postgres') || text.includes('sqlite') || text.includes('mysql') || text.includes('mongo')) return 'database';
    if (text.includes('tab') || text.includes('space') || text.includes('indent')) return 'indentation';
    if (text.includes('editor') || text.includes('ide') || text.includes('vscode') || text.includes('vim') || text.includes('neovim')) return 'editor';
    if (text.startsWith('current project:') || text.includes('project is')) return 'current_project';
    if (text.startsWith('goal:') || text.includes('goal is')) return 'current_goal';
    if (text.startsWith('decision:') || text.includes('decided')) return 'decision';
    if (text.includes('backend') && (text.includes('uses') || text.includes('built') || text.includes('written'))) return 'backend_language';
    if (text.includes('frontend') && (text.includes('uses') || text.includes('built') || text.includes('written'))) return 'frontend_language';
    if (text.includes('typescript') || text.includes('javascript') || text.includes('python') || text.includes('rust') || text.includes('golang') || text.includes('java')) return 'primary_language';
    if (text.includes('os') || text.includes('operating system') || text.includes('windows') || text.includes('linux') || text.includes('macos')) return 'operating_system';
    if (text.includes('deploy') || text.includes('hosting') || text.includes('vercel') || text.includes('aws') || text.includes('docker')) return 'deployment';
    if (text.includes('timezone') || text.includes('time zone')) return 'timezone';
    if (text.includes('name is') || text.includes('call me')) return 'user_name';
    return null;
  }
}

export const memoryClassifier = new MemoryClassifier();
