/**
 * AETHER AI — Confidence Engine
 * Evaluates evidence quality and assigns discrete confidence levels:
 * HIGH_CONFIDENCE | MEDIUM_CONFIDENCE | LOW_CONFIDENCE | INSUFFICIENT_INFORMATION
 * Never displays arbitrary percentages.
 */

import type {
  ConfidenceAssessment,
  ConfidenceLevel,
  Intent,
  AIContext,
} from '../ai-types.js';

export interface IConfidenceEngine {
  assess(
    userMessage: string,
    intent: Intent,
    context: AIContext,
    generatedContent?: string,
    toolExecuted?: boolean,
    toolSuccess?: boolean,
  ): ConfidenceAssessment;
}

export class ConfidenceEngine implements IConfidenceEngine {
  public assess(
    userMessage: string,
    intent: Intent,
    context: AIContext,
    generatedContent?: string,
    toolExecuted?: boolean,
    toolSuccess?: boolean,
  ): ConfidenceAssessment {
    // 1. Check if intent is unsupported or ambiguous
    if (intent.type === 'UNSUPPORTED') {
      return {
        level: 'INSUFFICIENT_INFORMATION',
        score: 0.1,
        reasoning: 'The request falls outside Aether capabilities.',
      };
    }

    if (intent.type === 'AMBIGUOUS') {
      return {
        level: 'LOW_CONFIDENCE',
        score: 0.4,
        reasoning: 'Request is ambiguous; clarification may be needed.',
      };
    }

    // 2. Tool execution evidence
    if (intent.requiresTool || toolExecuted) {
      if (toolSuccess) {
        return {
          level: 'HIGH_CONFIDENCE',
          score: 0.95,
          reasoning: 'Tool executed successfully with verified backend data.',
        };
      }
      if (toolExecuted && !toolSuccess) {
        return {
          level: 'LOW_CONFIDENCE',
          score: 0.3,
          reasoning: 'Tool execution failed or returned incomplete results.',
        };
      }
    }

    // 3. RAG retrieval evidence
    if (intent.requiresRAG || intent.type === 'KNOWLEDGE_QUESTION') {
      const ragDocs = context.ragContext?.documents ?? [];
      if (ragDocs.length === 0) {
        return {
          level: 'INSUFFICIENT_INFORMATION',
          score: 0.2,
          reasoning: 'No relevant knowledge documents were retrieved.',
        };
      }

      const topScore = Math.max(...ragDocs.map((d) => d.score), 0);
      if (topScore >= 0.75) {
        return {
          level: 'HIGH_CONFIDENCE',
          score: topScore,
          reasoning: `Strong knowledge match found (relevance: ${topScore.toFixed(2)}).`,
        };
      }
      if (topScore >= 0.5) {
        return {
          level: 'MEDIUM_CONFIDENCE',
          score: topScore,
          reasoning: `Moderate knowledge match found (relevance: ${topScore.toFixed(2)}).`,
        };
      }
      return {
        level: 'LOW_CONFIDENCE',
        score: topScore,
        reasoning: `Weak knowledge match found (relevance: ${topScore.toFixed(2)}).`,
      };
    }

    // 4. Memory / User data evidence
    if (intent.requiresMemory || intent.type === 'USER_DATA_QUESTION') {
      const memories = context.longTermMemory ?? [];
      if (memories.length > 0) {
        return {
          level: 'HIGH_CONFIDENCE',
          score: 0.85,
          reasoning: 'Verified user memory context available.',
        };
      }
    }

    // 5. Default generation response
    if (generatedContent && generatedContent.trim().length > 0) {
      if (generatedContent.toLowerCase().includes("i don't have enough information") ||
          generatedContent.toLowerCase().includes("not certain")) {
        return {
          level: 'INSUFFICIENT_INFORMATION',
          score: 0.3,
          reasoning: 'Response explicitly states insufficient information.',
        };
      }
      return {
        level: 'HIGH_CONFIDENCE',
        score: 0.8,
        reasoning: 'General reasoning query processed with clear context.',
      };
    }

    return {
      level: 'MEDIUM_CONFIDENCE',
      score: 0.6,
      reasoning: 'Standard response generated.',
    };
  }
}

export const confidenceEngine = new ConfidenceEngine();
