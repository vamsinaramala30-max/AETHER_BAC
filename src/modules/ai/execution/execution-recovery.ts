/**
 * AETHER AI - Execution Recovery (Prompt 8)
 * Bounded failure classification and recovery decision engine.
 *
 * Invariants:
 * - Maximum 3 retry attempts per step (configurable).
 * - Only TRANSIENT, TIMEOUT, SYSTEM_FAILURE categories are retried.
 * - AUTHORIZATION, VALIDATION, TENANT_VIOLATION are never retried.
 * - Replanning never mutates the frozen plan; it signals the need for a new version.
 * - No while(true) or unbounded retry loops anywhere in this module.
 */

import type { ToolResult } from '../tools/tool-types.js';
import type { RecoveryDecision, FailureCategory } from './execution-types.js';

const DEFAULT_MAX_ATTEMPTS = 3;
const MIN_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;

// Categories that may be retried
const RETRYABLE_CATEGORIES: ReadonlySet<FailureCategory> = new Set([
  'TRANSIENT',
  'TIMEOUT',
  'SYSTEM_FAILURE',
]);

// Categories that require replanning (not just a retry)
const REPLANNING_CATEGORIES: ReadonlySet<FailureCategory> = new Set([
  'NOT_FOUND',
  'CONFLICT',
]);

export interface IExecutionRecovery {
  classifyFailure(error: unknown, toolResult?: ToolResult): FailureCategory;
  decideRecovery(
    category: FailureCategory,
    attemptCount: number,
    maxAttempts?: number,
  ): RecoveryDecision;
  computeBackoffMs(attempt: number): number;
}

export class ExecutionRecovery implements IExecutionRecovery {
  /**
   * Classifies a failure into a FailureCategory based on error message/code.
   * This classification drives retry/block/replanning decisions.
   */
  public classifyFailure(error: unknown, toolResult?: ToolResult): FailureCategory {
    // Explicit approval required gate
    if (toolResult?.code === 'FORBIDDEN' && this.messageContains(error, 'approval')) {
      return 'APPROVAL_REQUIRED';
    }

    // Tenant violations are never retriable
    if (
      this.messageContains(error, 'belongs to another tenant') ||
      this.messageContains(error, 'tenant') ||
      toolResult?.code === 'UNAUTHORIZED_RESOURCE'
    ) {
      return 'TENANT_VIOLATION';
    }

    // Authorization failure
    if (
      toolResult?.code === 'FORBIDDEN' ||
      toolResult?.code === 'PERMISSION_DENIED' ||
      this.messageContains(error, 'unauthorized') ||
      this.messageContains(error, 'forbidden') ||
      this.messageContains(error, 'access denied')
    ) {
      return 'AUTHORIZATION';
    }

    // Input validation failure
    if (
      toolResult?.code === 'INVALID_INPUT' ||
      this.messageContains(error, 'invalid input') ||
      this.messageContains(error, 'validation') ||
      this.messageContains(error, 'schema')
    ) {
      return 'VALIDATION';
    }

    // Timeout
    if (
      toolResult?.code === 'TIMEOUT' ||
      this.messageContains(error, 'timed out') ||
      this.messageContains(error, 'timeout')
    ) {
      return 'TIMEOUT';
    }

    // Verification failure
    if (
      toolResult?.code === 'VERIFICATION_FAILED' ||
      this.messageContains(error, 'verification failed') ||
      this.messageContains(error, 'state mismatch')
    ) {
      return 'VERIFICATION_FAILURE';
    }

    // Not found
    if (
      toolResult?.code === 'NOT_FOUND' ||
      this.messageContains(error, 'not found') ||
      this.messageContains(error, 'does not exist')
    ) {
      return 'NOT_FOUND';
    }

    // Conflict
    if (
      toolResult?.code === 'CONFLICT' ||
      this.messageContains(error, 'conflict') ||
      this.messageContains(error, 'already exists')
    ) {
      return 'CONFLICT';
    }

    // User input required
    if (this.messageContains(error, 'user input') || this.messageContains(error, 'clarification')) {
      return 'USER_INPUT_REQUIRED';
    }

    // Transient / network / system
    if (
      this.messageContains(error, 'network') ||
      this.messageContains(error, 'connection') ||
      this.messageContains(error, 'temporarily unavailable') ||
      this.messageContains(error, 'service unavailable') ||
      this.messageContains(error, 'internal error')
    ) {
      return 'TRANSIENT';
    }

    return 'SYSTEM_FAILURE';
  }

  /**
   * Given a failure category and attempt count, decide what to do next.
   * This is the authoritative decision point - no ad-hoc retry logic elsewhere.
   */
  public decideRecovery(
    category: FailureCategory,
    attemptCount: number,
    maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
  ): RecoveryDecision {
    // Special gates that suspend execution rather than retry
    if (category === 'USER_INPUT_REQUIRED') {
      return {
        shouldRetry: false,
        shouldBlock: false,
        requiresReplanning: false,
        requiresUserInput: true,
        requiresApproval: false,
        category,
        reason: 'Step requires user input before it can proceed.',
      };
    }

    if (category === 'APPROVAL_REQUIRED') {
      return {
        shouldRetry: false,
        shouldBlock: false,
        requiresReplanning: false,
        requiresUserInput: false,
        requiresApproval: true,
        category,
        reason: 'Step requires explicit approval before execution.',
      };
    }

    // Hard blocks - never retry
    if (category === 'TENANT_VIOLATION' || category === 'AUTHORIZATION' || category === 'VALIDATION') {
      return {
        shouldRetry: false,
        shouldBlock: true,
        requiresReplanning: false,
        requiresUserInput: false,
        requiresApproval: false,
        category,
        reason: 'Non-recoverable failure: ' + category + '. Cannot retry.',
      };
    }

    // Verification failures require replanning if not transient
    if (category === 'VERIFICATION_FAILURE') {
      return {
        shouldRetry: false,
        shouldBlock: true,
        requiresReplanning: false,
        requiresUserInput: false,
        requiresApproval: false,
        category,
        reason: 'Backend verification failed. State is inconsistent. Execution blocked.',
      };
    }

    // Replanning candidates
    if (REPLANNING_CATEGORIES.has(category)) {
      return {
        shouldRetry: false,
        shouldBlock: false,
        requiresReplanning: true,
        requiresUserInput: false,
        requiresApproval: false,
        category,
        reason: 'Execution requires a new plan version due to: ' + category,
      };
    }

    // Retryable categories
    if (RETRYABLE_CATEGORIES.has(category) && attemptCount < maxAttempts) {
      const delay = this.computeBackoffMs(attemptCount);
      return {
        shouldRetry: true,
        shouldBlock: false,
        requiresReplanning: false,
        requiresUserInput: false,
        requiresApproval: false,
        category,
        reason: 'Transient failure. Retrying (attempt ' + (attemptCount + 1) + '/' + maxAttempts + ').',
        delayMs: delay,
      };
    }

    // Exceeded max retries
    return {
      shouldRetry: false,
      shouldBlock: true,
      requiresReplanning: false,
      requiresUserInput: false,
      requiresApproval: false,
      category,
      reason: 'Max retry attempts (' + maxAttempts + ') exhausted for category: ' + category,
    };
  }

  /**
   * Computes bounded exponential backoff.
   * Min: 500ms, Max: 30s.
   */
  public computeBackoffMs(attempt: number): number {
    const base = MIN_BACKOFF_MS * Math.pow(2, attempt);
    return Math.min(base, MAX_BACKOFF_MS);
  }

  private messageContains(error: unknown, keyword: string): boolean {
    if (!error) return false;
    const msg = error instanceof Error ? error.message : String(error);
    return msg.toLowerCase().includes(keyword.toLowerCase());
  }
}

export const executionRecovery = new ExecutionRecovery();
