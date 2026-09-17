/**
 * AETHER AI — Response Validator (Phase 14 Production Grade)
 * Performs comprehensive post-generation validation before returning final responses.
 *
 * Core Reliability Invariants:
 * 1. Zero CoT Exposure: Eliminate any internal <think>, </think>, or internal reasoning tags.
 * 2. Action Grounding: Never claim an action succeeded unless backend verified it.
 * 3. Partial Success Transparency: Accurately report partial completion without claiming 100% success.
 * 4. Failure Honesty: Explain failures transparently without fabricating success.
 * 5. Evidence Grounding: Ensure knowledge claims reflect actual retrieved documents.
 * 6. Lightweight Fast-Path: Zero unnecessary overhead on simple conversational queries.
 */

import type {
  AIRequest,
  AIContext,
  Intent,
  VerificationStatus,
  ExecutionReliabilityState,
} from '../ai-types.js';

export interface ClaimsAnalysis {
  readonly actionClaims: readonly string[];
  readonly knowledgeClaims: readonly string[];
  readonly supported: boolean;
  readonly unsupportedClaims?: readonly string[];
}

export interface ResponseValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
  readonly correctedContent?: string;
  readonly verificationStatus?: VerificationStatus;
  readonly claimsAnalysis?: ClaimsAnalysis;
}

export interface IResponseValidator {
  validate(
    request: AIRequest,
    intent: Intent,
    context: AIContext,
    content: string,
    toolExecutedOrState?: boolean | ExecutionReliabilityState,
    toolSuccess?: boolean,
    toolVerified?: boolean,
    verificationStatus?: VerificationStatus,
  ): ResponseValidationResult;
}

export class ResponseValidator implements IResponseValidator {
  public validate(
    request: AIRequest,
    intent: Intent,
    context: AIContext,
    content: string,
    toolExecutedOrState?: boolean | ExecutionReliabilityState,
    toolSuccessParam?: boolean,
    toolVerifiedParam?: boolean,
    verificationStatusParam?: VerificationStatus,
  ): ResponseValidationResult {
    // 0. Empty content check
    if (!content || content.trim().length === 0) {
      return {
        valid: false,
        reason: 'Generated content is empty.',
        correctedContent: 'Unable to process the request at this time.',
        verificationStatus: 'FAILED',
      };
    }

    // 0.1 Zero CoT / Internal Reasoning Leakage Enforcement
    let sanitizedContent = content;
    if (
      /<think>|<\/think>|internal reasoning:/i.test(sanitizedContent)
    ) {
      sanitizedContent = sanitizedContent
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<think>[\s\S]*/gi, '')
        .replace(/<\/think>/gi, '')
        .replace(/internal reasoning:[\s\S]*/gi, '')
        .trim();

      if (!sanitizedContent) {
        sanitizedContent = 'I have processed your request. How else can I assist you?';
      }
    }

    // Unpack execution state
    let executionState: ExecutionReliabilityState;
    if (typeof toolExecutedOrState === 'object' && toolExecutedOrState !== null) {
      executionState = toolExecutedOrState;
    } else {
      const toolExecuted = !!toolExecutedOrState;
      const toolSuccess = toolSuccessParam ?? false;
      const toolVerified = toolVerifiedParam ?? true;
      const vStatus =
        verificationStatusParam ??
        (!toolExecuted
          ? 'UNVERIFIED'
          : !toolSuccess
            ? 'FAILED'
            : toolVerified
              ? 'VERIFIED'
              : 'NOT_VERIFIABLE');

      executionState = {
        toolExecuted,
        toolSuccess,
        verificationStatus: vStatus,
        verifiedStepsCount: toolSuccess && toolVerified ? 1 : 0,
        totalStepsCount: toolExecuted ? 1 : 0,
        evidence: [],
      };
    }

    // 1. FAST PATH: Simple conversational or direct reasoning requests without tools/RAG
    const isSimpleConversational =
      intent.type === 'GREETING' ||
      intent.type === 'CONVERSATIONAL' ||
      intent.type === 'CONVERSATION' ||
      intent.type === 'GENERAL_QUESTION' ||
      intent.type === 'NORMAL_RESPONSE';

    if (
      isSimpleConversational &&
      !intent.requiresTool &&
      !intent.requiresRAG &&
      !executionState.toolExecuted
    ) {
      return {
        valid: true,
        correctedContent: sanitizedContent !== content ? sanitizedContent : undefined,
        verificationStatus: 'NOT_VERIFIABLE',
      };
    }

    const lower = sanitizedContent.toLowerCase();
    const actionClaims: string[] = [];
    const knowledgeClaims: string[] = [];
    const unsupportedClaims: string[] = [];

    // 2. ACTION CLAIMS EXTRACTION
    const actionSuccessPatterns = [
      /\b(i (have )?(created|added|inserted|set up|configured))\b/i,
      /\b(i (have )?(updated|modified|changed|edited|renamed))\b/i,
      /\b(i (have )?(deleted|removed|cleared|purged|cancelled))\b/i,
      /\b(i (have )?(completed|marked|executed|ran))\b/i,
      /\b(has been|have been|was|were|is) (created|updated|deleted|completed|executed|scheduled|saved|removed|cleared)\b/i,
      /\b(successfully (created|updated|deleted|completed|executed|saved|scheduled|removed))\b/i,
      /\b(created|updated|deleted|completed|executed|saved|scheduled|removed) successfully\b/i,
      /\b(task|project|goal|automation|item|record)\b[^\n.!?]*(was|were|is|has been)\s+(created|completed|deleted|updated|executed|saved)\b/i,
      /\b(marked (as )?(done|completed|resolved|cancelled))\b/i,
    ];

    for (const pattern of actionSuccessPatterns) {
      const match = sanitizedContent.match(pattern);
      if (match) {
        actionClaims.push(match[0]);
      }
    }

    const claimsActionSuccess = actionClaims.length > 0;

    // 3. ACTION INTEGRITY CHECK: Did model claim action occurred without tool running?
    if (claimsActionSuccess && intent.requiresTool && !executionState.toolExecuted) {
      unsupportedClaims.push(...actionClaims);
      return {
        valid: false,
        reason: 'Response claimed action was performed, but no backend tool was executed.',
        correctedContent:
          'The requested action was not executed. Please try again or verify permissions.',
        verificationStatus: 'FAILED',
        claimsAnalysis: {
          actionClaims,
          knowledgeClaims,
          supported: false,
          unsupportedClaims,
        },
      };
    }

    // 4. ACTION INTEGRITY CHECK: Did model claim action succeeded when tool failed or state check failed?
    if (
      claimsActionSuccess &&
      executionState.toolExecuted &&
      (!executionState.toolSuccess || executionState.verificationStatus === 'FAILED')
    ) {
      unsupportedClaims.push(...actionClaims);
      const specificError = executionState.errors?.join('; ') || 'Backend execution failed.';
      return {
        valid: false,
        reason:
          'Response claimed action succeeded, but backend tool execution or verification failed.',
        correctedContent: `The requested action encountered an error on the backend and could not be completed: ${specificError}`,
        verificationStatus: 'FAILED',
        claimsAnalysis: {
          actionClaims,
          knowledgeClaims,
          supported: false,
          unsupportedClaims,
        },
      };
    }

    // 5. PARTIAL SUCCESS INTEGRITY: If plan had failures, ensure response doesn't claim 100% completion
    const isPartialSuccess =
      executionState.verificationStatus === 'PARTIALLY_VERIFIED' ||
      (executionState.plan &&
        executionState.verifiedStepsCount > 0 &&
        executionState.verifiedStepsCount < executionState.totalStepsCount);

    if (isPartialSuccess) {
      const claimsAllCompleted =
        lower.includes('all steps completed') ||
        lower.includes('everything is complete') ||
        lower.includes('all actions were successful') ||
        lower.includes('all tasks have been completed');

      if (claimsAllCompleted) {
        unsupportedClaims.push('Claimed complete success despite partial step failure.');
        const planSummary =
          executionState.plan?.summary ||
          `Completed ${executionState.verifiedStepsCount} of ${executionState.totalStepsCount} actions. Some operations encountered errors.`;
        return {
          valid: false,
          reason: 'Response claimed complete success when workflow was only partially completed.',
          correctedContent: `Partially Completed: ${planSummary}`,
          verificationStatus: 'PARTIALLY_VERIFIED',
          claimsAnalysis: {
            actionClaims,
            knowledgeClaims,
            supported: false,
            unsupportedClaims,
          },
        };
      }
    }

    // 6. KNOWLEDGE & EVIDENCE INTEGRITY (RAG)
    if (intent.requiresRAG || intent.type === 'KNOWLEDGE_QUESTION' || intent.type === 'KNOWLEDGE_REQUEST') {
      const ragDocs = context.ragContext?.documents ?? [];
      const hasRetrievedDocs = ragDocs.length > 0;

      const claimsDocumentCitations =
        lower.includes('according to your document') ||
        lower.includes('the document states') ||
        lower.includes('in your workspace documentation') ||
        lower.includes('based on the uploaded file') ||
        lower.includes('as stated in the knowledge base');

      if (claimsDocumentCitations) {
        knowledgeClaims.push('Claimed document knowledge source');
      }

      if (!hasRetrievedDocs && claimsDocumentCitations) {
        unsupportedClaims.push('Claimed document source when 0 knowledge documents were found.');
        return {
          valid: false,
          reason: 'Response claimed document knowledge source, but no documents were retrieved.',
          correctedContent:
            'No matching documents or knowledge records were found in the workspace to answer this question.',
          verificationStatus: 'FAILED',
          claimsAnalysis: {
            actionClaims,
            knowledgeClaims,
            supported: false,
            unsupportedClaims,
          },
        };
      }
    }

    return {
      valid: true,
      correctedContent: sanitizedContent !== content ? sanitizedContent : undefined,
      verificationStatus: executionState.verificationStatus,
      claimsAnalysis: {
        actionClaims,
        knowledgeClaims,
        supported: unsupportedClaims.length === 0,
        unsupportedClaims: unsupportedClaims.length > 0 ? unsupportedClaims : undefined,
      },
    };
  }
}

export const responseValidator = new ResponseValidator();
