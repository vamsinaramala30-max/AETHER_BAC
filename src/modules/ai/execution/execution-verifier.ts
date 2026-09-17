/**
 * AETHER AI - Execution Verifier (Prompt 8)
 * Post-tool-call verification layer.
 * Wraps Prompt 6 ToolResult.verified and enforces the invariant:
 *   tool reported success != verified database state is correct.
 *
 * Verification categories:
 *   VERIFIED           - tool.verify() passed
 *   VERIFICATION_FAILED- tool.verify() returned false
 *   NOT_VERIFIABLE     - tool has no verify() fn (read-ops, non-state-changing)
 *   UNVERIFIED         - verification not yet run
 */

import type { ToolResult } from '../tools/tool-types.js';
import type { VerificationStatus } from '../ai-types.js';
import type { AgentExecutionStep } from './execution-types.js';

export interface StepVerificationResult {
  readonly verified: boolean;
  readonly status: VerificationStatus;
  readonly details: string;
  readonly blockExecution: boolean;
}

export interface IExecutionVerifier {
  verifyStepResult(
    stepResult: ToolResult,
    step: AgentExecutionStep,
  ): StepVerificationResult;
}

export class ExecutionVerifier implements IExecutionVerifier {
  /**
   * Interprets a ToolResult from Prompt 6 ToolExecutor and produces
   * a concrete StepVerificationResult for the execution engine.
   *
   * Key invariant: if verified === false or code === VERIFICATION_FAILED,
   * blockExecution must be true. The engine must never report success.
   */
  public verifyStepResult(
    toolResult: ToolResult,
    step: AgentExecutionStep,
  ): StepVerificationResult {
    // Tool execution failed outright
    if (!toolResult.success) {
      return {
        verified: false,
        status: 'FAILED',
        details: toolResult.error ?? 'Tool execution failed.',
        blockExecution: true,
      };
    }

    // Explicit verification failure from tool.verify()
    if (toolResult.code === 'VERIFICATION_FAILED' || toolResult.verified === false) {
      return {
        verified: false,
        status: 'FAILED',
        details:
          toolResult.verificationDetails ??
          'Backend verification failed: database state does not match expected outcome.',
        blockExecution: true,
      };
    }

    // Tool has no verify() and is not a read-op - NOT_VERIFIABLE
    if (toolResult.verificationStatus === 'NOT_VERIFIABLE') {
      return {
        verified: false,
        status: 'NOT_VERIFIABLE',
        details:
          toolResult.verificationDetails ??
          'Step executed. Backend state verification not configured for this tool.',
        blockExecution: false, // Allow continuation but do not claim verified
      };
    }

    // Fully verified
    if (toolResult.verified === true && toolResult.verificationStatus === 'VERIFIED') {
      return {
        verified: true,
        status: 'VERIFIED',
        details:
          toolResult.verificationDetails ??
          'Action completed and verified against backend state.',
        blockExecution: false,
      };
    }

    // Default: success but unknown verification state
    return {
      verified: false,
      status: 'UNVERIFIED',
      details: toolResult.verificationDetails ?? 'Action completed. Verification state unknown.',
      blockExecution: false,
    };
  }

  /**
   * Determines the overall verification status for a completed execution.
   * An execution is only VERIFIED if every side-effecting step is VERIFIED.
   */
  public aggregateVerificationStatus(
    steps: readonly AgentExecutionStep[],
  ): VerificationStatus {
    const sideEffectingSteps = steps.filter(
      (s) => s.status === 'COMPLETED' && s.toolName,
    );

    if (sideEffectingSteps.length === 0) return 'VERIFIED';

    const allVerified = sideEffectingSteps.every((s) => s.verified === true);
    if (allVerified) return 'VERIFIED';

    const anyFailed = sideEffectingSteps.some((s) => s.verificationStatus === 'FAILED');
    if (anyFailed) return 'FAILED';

    const anyNotVerifiable = sideEffectingSteps.some(
      (s) => s.verificationStatus === 'NOT_VERIFIABLE',
    );
    if (anyNotVerifiable) return 'NOT_VERIFIABLE';

    return 'PARTIALLY_VERIFIED';
  }
}

export const executionVerifier = new ExecutionVerifier();
