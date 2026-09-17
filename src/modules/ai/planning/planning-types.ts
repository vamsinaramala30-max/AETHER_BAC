/**
 * AETHER AI — Planning Types
 * Canonical contract definitions for Reasoning + Agent Planning.
 * Supports deterministic DAG plans, cycle detection, tool registry validation,
 * permission checking, plan hashing, and versioning.
 */

import type { ActionRiskLevel } from '../tools/tool-types.js';
import type { VerificationStatus, EvidenceItem } from '../ai-types.js';

// ─── Canonical Plan Status Lifecycle (Prompt 7) ──────────────────────────────
export type PlanStatus =
  | 'DRAFT'
  | 'VALIDATING'
  | 'VALID'
  | 'READY'
  | 'HANDED_OFF'
  | 'NEEDS_CLARIFICATION'
  | 'BLOCKED'
  | 'INVALID'
  | 'CANCELLED';

// ─── Plan Execution Status (Prompt 6 Backwards-Compatibility) ─────────────────
export type PlanExecutionStatus =
  | 'PENDING'
  | 'PLANNING'
  | 'PENDING_CONFIRMATION'
  | 'EXECUTING'
  | 'SUCCESS'
  | 'PARTIAL_SUCCESS'
  | 'FAILED'
  | 'CANCELLED';

export type PlanExecutionMode = 'sequential' | 'parallel' | 'conditional' | 'direct';

// ─── Plan Step Types ─────────────────────────────────────────────────────────
export type PlanStepType =
  | 'REASON'
  | 'RETRIEVE'
  | 'TOOL'
  | 'DECISION'
  | 'USER_INPUT'
  | 'FINAL_RESPONSE';

export type PlanStepStatus =
  | 'PENDING'
  | 'VALIDATED'
  | 'READY'
  | 'BLOCKED'
  | 'SKIPPED'
  | 'CANCELLED';

// ─── Canonical Plan Sub-Components ───────────────────────────────────────────
export interface PlanGoal {
  readonly description: string;
  readonly successCriteria?: readonly string[];
  readonly targetEntity?: string;
}

export type PlanConstraintType =
  | 'TIME'
  | 'DEADLINE'
  | 'PRIORITY'
  | 'PERMISSION'
  | 'TOOL_AVAILABILITY'
  | 'RESOURCE'
  | 'POLICY'
  | 'USER_PREFERENCE'
  | 'WORKSPACE';

export interface PlanConstraint {
  readonly type: PlanConstraintType | string;
  readonly description: string;
  readonly source: 'USER' | 'SYSTEM' | 'WORKSPACE' | 'POLICY';
  readonly value?: unknown;
}

export interface PlanAssumption {
  readonly description: string;
  readonly confidence: number;
  readonly isCritical: boolean;
  readonly requiresValidation: boolean;
}

export interface PlanDependency {
  readonly stepId: string;
  readonly dependsOnStepId: string;
  readonly type?: 'BLOCKS' | 'PROVIDES_DATA' | 'CONDITIONAL';
}

export interface ClarificationOption {
  readonly label: string;
  readonly value: string;
}

export interface ClarificationRequest {
  readonly question: string;
  readonly reason: string;
  readonly requiredFields: readonly string[];
  readonly options?: readonly ClarificationOption[];
}

export interface PlanCondition {
  readonly expression: string;
  readonly parameterName?: string;
  readonly expectedValue?: unknown;
  readonly fallbackStepId?: string;
}

// ─── Canonical Plan Step Contract (Prompt 7) ─────────────────────────────────
export interface AgentPlanStep {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly description: string;
  readonly type: PlanStepType;
  readonly dependencies: readonly string[];
  readonly toolName?: string;
  readonly toolVersion?: string;
  readonly input?: Record<string, unknown>;
  readonly expectedOutcome?: string;
  readonly constraints?: readonly PlanConstraint[];
  requiresConfirmation?: boolean;
  readonly riskLevel?: ActionRiskLevel;
  status: PlanStepStatus;
}

// ─── Canonical Agent Plan Contract (Prompt 7) ────────────────────────────────
export interface AgentPlan {
  readonly id: string;
  readonly version: number;
  readonly userId: string;
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly conversationId?: string;
  readonly correlationId: string;
  readonly goal: PlanGoal;
  readonly constraints: readonly PlanConstraint[];
  readonly assumptions: readonly PlanAssumption[];
  readonly steps: AgentPlanStep[];
  readonly dependencies: readonly PlanDependency[];
  status: PlanStatus;
  readonly confidence?: number;
  readonly requiresUserInput: boolean;
  readonly clarification?: ClarificationRequest;
  readonly warnings?: readonly string[];
  planHash?: string;
  readonly summary?: string;
  readonly createdAt: string;
  updatedAt: string;
}

// ─── Legacy Plan Step & Action Plan (Prompt 6 Backwards-Compatibility) ───────
export interface PlanStep {
  readonly stepId: string;
  readonly stepNumber: number;
  readonly description: string;
  readonly toolName?: string;
  readonly toolInput?: Record<string, unknown>;
  readonly dependencies?: readonly string[];
  readonly riskLevel: ActionRiskLevel;
  readonly requiresConfirmation?: boolean;
  readonly condition?: PlanCondition;
  readonly expectedOutput?: string;
  readonly requiredCapabilities?: readonly string[];
  readonly requiredInformation?: readonly string[];
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';
  result?: unknown;
  error?: string;
  verified: boolean;
  verificationStatus?: VerificationStatus;
  verificationDetails?: string;
  executionTimeMs?: number;
}

export interface ActionPlan {
  readonly planId: string;
  readonly objective: string;
  readonly steps: PlanStep[];
  readonly totalSteps: number;
  readonly executionMode?: PlanExecutionMode;
  readonly summary?: string;
  readonly completionCriteria?: string;
  readonly parallelGroups?: readonly (readonly string[])[];
  readonly requiresConfirmation: boolean;
  readonly confirmationReasons?: readonly string[];
  readonly createdAt: string;
  // Prompt 7 interoperability fields
  readonly version?: number;
  readonly correlationId?: string;
  readonly canonicalPlan?: AgentPlan;
}

// ─── Plan Validation Contracts ───────────────────────────────────────────────
export interface PlanValidationError {
  readonly code: string;
  readonly message: string;
  readonly stepId?: string;
}

export interface PlanValidationWarning {
  readonly code: string;
  readonly message: string;
  readonly stepId?: string;
}

export interface PlanValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings?: readonly string[];
  readonly requiresConfirmation: boolean;
  readonly confirmationSteps: readonly (PlanStep | AgentPlanStep)[];
  readonly circularDependencies?: readonly string[];
  readonly missingDependencies?: readonly string[];
  // Prompt 7 extended validation
  readonly status?: PlanStatus;
  readonly detailedErrors?: readonly PlanValidationError[];
  readonly detailedWarnings?: readonly PlanValidationWarning[];
  readonly requiresClarification?: boolean;
  readonly clarificationRequest?: ClarificationRequest;
}

export interface PlanExecutionResult {
  readonly planId: string;
  readonly objective: string;
  readonly status: PlanExecutionStatus;
  readonly verificationStatus?: VerificationStatus;
  readonly steps: readonly PlanStep[];
  readonly successfulStepsCount: number;
  readonly failedStepsCount: number;
  readonly summary: string;
  readonly error?: string;
  readonly evidence?: readonly EvidenceItem[];
  readonly durationMs: number;
}

export interface PlanComplexityLimits {
  readonly maxSteps: number;
  readonly maxDependencies: number;
  readonly maxPayloadBytes: number;
  readonly maxDepth?: number;
}

export const DEFAULT_PLAN_COMPLEXITY_LIMITS: PlanComplexityLimits = {
  maxSteps: 20,
  maxDependencies: 50,
  maxPayloadBytes: 256 * 1024, // 256 KB
  maxDepth: 10,
};

