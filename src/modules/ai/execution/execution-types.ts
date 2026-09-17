/**
 * AETHER AI -- Execution Types (Prompt 8)
 * Canonical contract definitions for the Autonomous Agent Execution Loop.
 *
 * Architectural invariants:
 * - ExecutionStatus covers the full 14-state lifecycle.
 * - ExecutionContext is built server-side only; never from client body.
 * - Plans are immutable after handoff; only new versions are created for replanning.
 * - No arbitrary code/shell/subprocess execution is represented here.
 */

import type { PlanHandoffPayload } from '../planning/plan-handoff.js';
import type { AuthenticationContext } from '../tools/tool-types.js';
import type { VerificationStatus } from '../ai-types.js';

// --- Execution Status Lifecycle ---

export type ExecutionStatus =
  | 'PENDING'
  | 'VALIDATING'
  | 'AUTHORIZED'
  | 'RUNNING'
  | 'WAITING_FOR_INPUT'
  | 'WAITING_FOR_APPROVAL'
  | 'VERIFYING'
  | 'RECOVERING'
  | 'COMPLETED'
  | 'PARTIALLY_COMPLETED'
  | 'FAILED'
  | 'TIMED_OUT'
  | 'CANCELLED'
  | 'BLOCKED';

export type ExecutionStepStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'WAITING_FOR_INPUT'
  | 'WAITING_FOR_APPROVAL'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'TIMED_OUT'
  | 'CANCELLED'
  | 'BLOCKED'
  | 'SKIPPED';

// --- Failure Category Taxonomy ---

export type FailureCategory =
  | 'TRANSIENT'
  | 'AUTHORIZATION'
  | 'VALIDATION'
  | 'TENANT_VIOLATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'TIMEOUT'
  | 'VERIFICATION_FAILURE'
  | 'SYSTEM_FAILURE'
  | 'USER_INPUT_REQUIRED'
  | 'APPROVAL_REQUIRED'
  | 'UNKNOWN';

// --- Server-Side Execution Context ---

export interface ExecutionContext {
  readonly userId: string;
  readonly sessionId: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly conversationId?: string;
  readonly correlationId: string;
  readonly requestId: string;
  readonly auth: AuthenticationContext;
  readonly signal?: AbortSignal;
}

// --- Execution Domain Models ---

export interface AgentExecution {
  readonly id: string;
  readonly planId: string;
  readonly planVersion: number;
  readonly planHash: string;
  readonly correlationId: string;
  readonly handoffId?: string;
  readonly userId: string;
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly conversationId?: string;
  status: ExecutionStatus;
  currentStepId?: string;
  readonly completedStepIds: string[];
  readonly failedStepIds: string[];
  readonly blockedStepIds: string[];
  failureReason?: string;
  failureCategory?: FailureCategory;
  replanningRequired: boolean;
  readonly previousExecutionId?: string;
  readonly idempotencyKey?: string;
  readonly totalSteps: number;
  completedStepsCount: number;
  failedStepsCount: number;
  readonly metadata?: Record<string, unknown>;
  readonly startedAt: string;
  updatedAt: string;
  completedAt?: string;
  steps?: AgentExecutionStep[];
}

export interface AgentExecutionStep {
  readonly id: string;
  readonly executionId: string;
  readonly stepId: string;
  readonly planStepOrder: number;
  readonly title: string;
  readonly description: string;
  readonly toolName?: string;
  readonly toolVersion?: string;
  readonly idempotencyKey?: string;
  status: ExecutionStepStatus;
  attemptCount: number;
  readonly maxAttempts: number;
  readonly input?: Record<string, unknown>;
  toolResult?: Record<string, unknown>;
  verified?: boolean;
  verificationStatus?: VerificationStatus;
  verificationDetails?: string;
  failureReason?: string;
  failureCategory?: FailureCategory;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  readonly attempts?: AgentExecutionAttempt[];
}

export interface AgentExecutionAttempt {
  readonly id: string;
  readonly stepId: string;
  readonly attempt: number;
  readonly status: string;
  readonly toolResult?: Record<string, unknown>;
  readonly error?: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
}

// --- Execution Result ---

export interface ExecutionStepResult {
  readonly stepId: string;
  readonly title: string;
  readonly toolName?: string;
  readonly status: ExecutionStepStatus;
  readonly verified: boolean;
  readonly verificationStatus?: VerificationStatus;
  readonly toolResult?: unknown;
  readonly error?: string;
  readonly durationMs?: number;
  readonly attemptCount: number;
}

export interface ExecutionResult {
  readonly executionId: string;
  readonly planId: string;
  readonly planVersion: number;
  readonly correlationId: string;
  readonly status: ExecutionStatus;
  readonly steps: readonly ExecutionStepResult[];
  readonly completedStepsCount: number;
  readonly failedStepsCount: number;
  readonly totalSteps: number;
  readonly summary: string;
  readonly verified: boolean;
  readonly durationMs: number;
  readonly failureReason?: string;
  readonly failureCategory?: FailureCategory;
  readonly replanningRequired: boolean;
  readonly requiresUserInput?: boolean;
  readonly userInputRequest?: UserInputRequest;
  readonly requiresApproval?: boolean;
  readonly approvalRequest?: ApprovalRequest;
}

// --- Approval & User Input Contracts ---

export interface ApprovalRequest {
  readonly approvalId: string;
  readonly executionId: string;
  readonly stepId: string;
  readonly toolName?: string;
  readonly riskLevel: string;
  readonly action: string;
  readonly reason: string;
  readonly requestedAt: string;
}

export interface UserInputRequest {
  readonly inputId: string;
  readonly executionId: string;
  readonly stepId: string;
  readonly question: string;
  readonly reason: string;
  readonly requiredFields: readonly string[];
  readonly options?: readonly { label: string; value: string }[];
  readonly requestedAt: string;
}

// --- Streaming Event Contract ---

export type ExecutionEventType =
  | 'execution.started'
  | 'plan.validated'
  | 'step.started'
  | 'tool.started'
  | 'tool.completed'
  | 'step.verified'
  | 'step.failed'
  | 'approval.required'
  | 'input.required'
  | 'execution.recovering'
  | 'execution.completed'
  | 'execution.failed'
  | 'execution.cancelled'
  | 'execution.status';

export interface ExecutionEvent {
  readonly type: ExecutionEventType;
  readonly executionId: string;
  readonly planId: string;
  readonly correlationId: string;
  readonly timestamp: string;
  readonly status: ExecutionStatus;
  readonly stepId?: string;
  readonly toolName?: string;
  readonly attempt?: number;
  readonly message?: string;
  readonly data?: Record<string, unknown>;
}

// --- Execution Options ---

export interface ExecutionOptions {
  readonly executionTimeoutMs?: number;
  readonly stepTimeoutMs?: number;
  readonly maxRetries?: number;
  readonly signal?: AbortSignal;
  readonly idempotencyKey?: string;
}

// --- Start Execution Request ---

export interface StartExecutionRequest {
  readonly handoffPayload: PlanHandoffPayload;
  readonly executionContext: ExecutionContext;
  readonly options?: ExecutionOptions;
}

// --- Recovery Decision ---

export interface RecoveryDecision {
  readonly shouldRetry: boolean;
  readonly shouldBlock: boolean;
  readonly requiresReplanning: boolean;
  readonly requiresUserInput: boolean;
  readonly requiresApproval: boolean;
  readonly category: FailureCategory;
  readonly reason: string;
  readonly delayMs?: number;
}
