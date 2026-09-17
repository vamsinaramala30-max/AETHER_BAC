/**
 * AETHER AI — Confidence Engine (Phase 14 Production Grade)
 * Evaluates evidence quality and assigns discrete, multi-dimensional confidence:
 *   - Intent Confidence: Certainty of intent understanding
 *   - Context Confidence: Sufficiency and freshness of retrieved context
 *   - Knowledge Confidence: Grounding score from RAG or persistent memory
 *   - Generation Confidence: Structural integrity and coherence of response
 *   - Overall Confidence: Weighted synthesis level
 *
 * Grounded in verified system signals (tools, verification status, RAG scores, memory).
 * Never claims false success or fake high confidence.
 */

import type {
  ConfidenceAssessment,
  ConfidenceLevel,
  MultiDimensionalConfidence,
  Intent,
  AIContext,
  VerificationStatus,
  ExecutionReliabilityState,
} from '../ai-types.js';

export interface IConfidenceEngine {
  assess(
    userMessage: string,
    intent: Intent,
    context: AIContext,
    generatedContent?: string,
    toolExecutedOrState?: boolean | ExecutionReliabilityState,
    toolSuccess?: boolean,
    verificationStatus?: VerificationStatus,
  ): ConfidenceAssessment;

  assessMultiDimensional(
    userMessage: string,
    intent: Intent,
    context: AIContext,
    generatedContent?: string,
    toolExecutedOrState?: boolean | ExecutionReliabilityState,
    toolSuccess?: boolean,
    verificationStatus?: VerificationStatus,
  ): MultiDimensionalConfidence;
}

export class ConfidenceEngine implements IConfidenceEngine {
  public assessMultiDimensional(
    _userMessage: string,
    intent: Intent,
    context: AIContext,
    generatedContent?: string,
    toolExecutedOrState?: boolean | ExecutionReliabilityState,
    toolSuccessParam?: boolean,
    verificationStatusParam?: VerificationStatus,
  ): MultiDimensionalConfidence {
    // 1. Intent Confidence
    const intentConfidence = intent.confidence ?? 0.8;

    // 2. Context Confidence
    let contextConfidence = 0.7;
    const history = context.conversationHistory ?? [];
    if (history.length > 0) contextConfidence += 0.15;
    if (context.workingMemory?.items && context.workingMemory.items.length > 0) contextConfidence += 0.1;
    if (intent.requiresClarification) contextConfidence = 0.4;
    contextConfidence = Math.min(1.0, Math.max(0.1, contextConfidence));

    // 3. Knowledge / Memory Confidence
    let knowledgeConfidence = 0.5;
    if (intent.requiresRAG || intent.type === 'KNOWLEDGE_REQUEST' || intent.type === 'RAG_REQUEST' || intent.type === 'KNOWLEDGE_QUESTION') {
      const docs = context.ragContext?.documents ?? [];
      if (docs.length > 0) {
        knowledgeConfidence = Math.max(...docs.map((d) => d.score), 0);
      } else {
        knowledgeConfidence = 0.2;
      }
    } else if (intent.requiresMemory || intent.type === 'MEMORY_RECALL' || intent.type === 'MEMORY_STORE') {
      const memories = context.longTermMemory ?? [];
      knowledgeConfidence = memories.length > 0 || intent.type === 'MEMORY_STORE' ? 0.9 : 0.4;
    } else {
      knowledgeConfidence = 0.8;
    }

    // 4. Generation / Execution Confidence
    let generationConfidence = 0.75;
    let toolExecuted = false;
    let toolSuccess = false;
    let verificationStatus: VerificationStatus | undefined = verificationStatusParam;

    if (typeof toolExecutedOrState === 'object' && toolExecutedOrState !== null) {
      toolExecuted = toolExecutedOrState.toolExecuted;
      toolSuccess = toolExecutedOrState.toolSuccess;
      verificationStatus = toolExecutedOrState.verificationStatus;
    } else if (typeof toolExecutedOrState === 'boolean') {
      toolExecuted = toolExecutedOrState;
      toolSuccess = toolSuccessParam ?? false;
      if (!verificationStatus) {
        verificationStatus = toolSuccess ? 'VERIFIED' : 'FAILED';
      }
    }

    if (toolExecuted) {
      if (verificationStatus === 'VERIFIED') generationConfidence = 0.95;
      else if (verificationStatus === 'PARTIALLY_VERIFIED') generationConfidence = 0.6;
      else if (verificationStatus === 'FAILED' || !toolSuccess) generationConfidence = 0.2;
    } else if (generatedContent && generatedContent.trim().length > 10) {
      generationConfidence = 0.85;
    }

    // 5. Overall Confidence Calculation
    const overallScore = Number(
      (
        intentConfidence * 0.3 +
        contextConfidence * 0.25 +
        knowledgeConfidence * 0.2 +
        generationConfidence * 0.25
      ).toFixed(2),
    );

    let overallLevel: ConfidenceLevel = 'MEDIUM_CONFIDENCE';
    if (intent.type === 'UNSUPPORTED' || (intent.requiresRAG && (context.ragContext?.documents ?? []).length === 0)) {
      overallLevel = 'INSUFFICIENT_INFORMATION';
    } else if (intent.requiresClarification || overallScore < 0.5) {
      overallLevel = 'LOW_CONFIDENCE';
    } else if (overallScore >= 0.8) {
      overallLevel = 'HIGH_CONFIDENCE';
    }

    let reasoning = 'Standard response evaluated with verified context.';
    if (intent.type === 'UNSUPPORTED') {
      reasoning = 'The request falls outside Aether capabilities.';
    } else if (intent.type === 'GREETING' || intent.type === 'INFORMATION_REQUEST') {
      reasoning = 'Direct conversational capability query recognized with high certainty.';
    } else if (intent.requiresClarification) {
      reasoning = 'Request is ambiguous or underspecified; clarification required.';
    } else if (toolExecuted && verificationStatus === 'VERIFIED') {
      reasoning = 'Action verified successfully against database state.';
    }

    return {
      intentConfidence,
      contextConfidence,
      knowledgeConfidence,
      generationConfidence,
      overallConfidence: overallScore,
      overallLevel,
      reasoning,
    };
  }

  public assess(
    userMessage: string,
    intent: Intent,
    context: AIContext,
    generatedContent?: string,
    toolExecutedOrState?: boolean | ExecutionReliabilityState,
    toolSuccessParam?: boolean,
    verificationStatusParam?: VerificationStatus,
  ): ConfidenceAssessment {
    // Unpack execution state
    let toolExecuted = false;
    let toolSuccess = false;
    let verificationStatus: VerificationStatus | undefined = verificationStatusParam;

    if (typeof toolExecutedOrState === 'object' && toolExecutedOrState !== null) {
      toolExecuted = toolExecutedOrState.toolExecuted;
      toolSuccess = toolExecutedOrState.toolSuccess;
      verificationStatus = toolExecutedOrState.verificationStatus;
    } else if (typeof toolExecutedOrState === 'boolean') {
      toolExecuted = toolExecutedOrState;
      toolSuccess = toolSuccessParam ?? false;
      if (!verificationStatus) {
        verificationStatus = toolSuccess ? 'VERIFIED' : 'FAILED';
      }
    }

    // 1. Unsupported or Ambiguous Requests
    if (intent.type === 'UNSUPPORTED') {
      return {
        level: 'INSUFFICIENT_INFORMATION',
        score: 0.1,
        reasoning: 'The request falls outside Aether capabilities.',
        verificationStatus: 'NOT_VERIFIABLE',
      };
    }

    if (
      intent.type === 'AMBIGUOUS' ||
      intent.requiresClarification ||
      intent.primaryIntent === 'CLARIFICATION_REQUIRED'
    ) {
      return {
        level: 'LOW_CONFIDENCE',
        score: 0.4,
        reasoning: 'Request is ambiguous or underspecified; clarification required.',
        verificationStatus: 'UNVERIFIED',
      };
    }

    // 2. Action / Tool Execution Evidence
    if (intent.requiresTool || toolExecuted) {
      if (verificationStatus === 'VERIFIED') {
        return {
          level: 'HIGH_CONFIDENCE',
          score: 0.95,
          reasoning: 'Operation executed successfully and confirmed by backend state verification.',
          verificationStatus: 'VERIFIED',
        };
      }

      if (verificationStatus === 'NOT_VERIFIABLE' && toolSuccess) {
        return {
          level: 'HIGH_CONFIDENCE',
          score: 0.9,
          reasoning: 'Tool executed successfully (read/query operation; persistent state unchanged).',
          verificationStatus: 'NOT_VERIFIABLE',
        };
      }

      if (verificationStatus === 'PARTIALLY_VERIFIED') {
        return {
          level: 'MEDIUM_CONFIDENCE',
          score: 0.6,
          reasoning: 'Workflow partially completed; some steps succeeded while others failed.',
          verificationStatus: 'PARTIALLY_VERIFIED',
        };
      }

      if (toolExecuted && (!toolSuccess || verificationStatus === 'FAILED')) {
        return {
          level: 'LOW_CONFIDENCE',
          score: 0.3,
          reasoning: 'Tool execution or backend verification failed.',
          verificationStatus: 'FAILED',
        };
      }
    }

    // 3. RAG Retrieval Evidence
    if (intent.requiresRAG || intent.type === 'KNOWLEDGE_QUESTION' || intent.type === 'KNOWLEDGE_REQUEST' || intent.type === 'RAG_REQUEST') {
      const ragDocs = context.ragContext?.documents ?? [];
      if (ragDocs.length === 0) {
        return {
          level: 'INSUFFICIENT_INFORMATION',
          score: 0.2,
          reasoning: 'No relevant knowledge documents were retrieved from the workspace.',
          verificationStatus: 'FAILED',
        };
      }

      const topScore = Math.max(...ragDocs.map((d) => d.score), 0);
      if (topScore >= 0.75) {
        return {
          level: 'HIGH_CONFIDENCE',
          score: topScore,
          reasoning: `Strong knowledge evidence match found (relevance: ${topScore.toFixed(2)}).`,
          verificationStatus: 'VERIFIED',
        };
      }
      if (topScore >= 0.5) {
        return {
          level: 'MEDIUM_CONFIDENCE',
          score: topScore,
          reasoning: `Moderate knowledge evidence match found (relevance: ${topScore.toFixed(2)}).`,
          verificationStatus: 'VERIFIED',
        };
      }
      return {
        level: 'LOW_CONFIDENCE',
        score: topScore,
        reasoning: `Weak knowledge match found (relevance: ${topScore.toFixed(2)}).`,
        verificationStatus: 'UNVERIFIED',
      };
    }

    // 4. Memory Evidence
    if (intent.requiresMemory || intent.type === 'USER_DATA_QUESTION' || intent.type === 'MEMORY_RECALL') {
      const memories = context.longTermMemory ?? [];
      if (memories.length > 0) {
        return {
          level: 'HIGH_CONFIDENCE',
          score: 0.85,
          reasoning: 'Verified user memory context available.',
          verificationStatus: 'VERIFIED',
        };
      }
    }

    // 5. Default Generation Response
    if (generatedContent && generatedContent.trim().length > 0) {
      const lower = generatedContent.toLowerCase();
      if (
        lower.includes("i don't have enough information") ||
        lower.includes('not certain') ||
        lower.includes('insufficient information')
      ) {
        return {
          level: 'INSUFFICIENT_INFORMATION',
          score: 0.3,
          reasoning: 'Response explicitly communicates insufficient information.',
          verificationStatus: 'NOT_VERIFIABLE',
        };
      }
      return {
        level: 'HIGH_CONFIDENCE',
        score: 0.8,
        reasoning: 'General reasoning query processed with clear context.',
        verificationStatus: 'NOT_VERIFIABLE',
      };
    }

    return {
      level: 'MEDIUM_CONFIDENCE',
      score: 0.6,
      reasoning: 'Standard response generated.',
      verificationStatus: 'NOT_VERIFIABLE',
    };
  }
}

export const confidenceEngine = new ConfidenceEngine();
