/**
 * AETHER AI — Tool Types
 * Strict type definitions for the tool subsystem.
 * Every tool must define: name, description, input schema,
 * permission requirements, execution handler, and typed output.
 */

// ─── JSON Schema Types ───────────────────────────────────────────────────────

export type JSONSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';

export interface JSONSchemaProperty {
  readonly type: JSONSchemaType;
  readonly description?: string;
  readonly enum?: readonly (string | number | boolean)[];
  readonly items?: JSONSchemaProperty;
  readonly properties?: Readonly<Record<string, JSONSchemaProperty>>;
  readonly required?: readonly string[];
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly default?: string | number | boolean;
}

export interface ToolInputSchema {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, JSONSchemaProperty>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
}

import type { VerificationStatus } from '../ai-types.js';

// ─── Error Taxonomy ──────────────────────────────────────────────────────────

export type ToolErrorCode =
  | 'VALIDATION_ERROR'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'TRANSIENT_ERROR'
  | 'EXECUTION_ERROR'
  | 'VERIFICATION_FAILED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'UNKNOWN_ERROR';

export type ActionRiskLevel =
  | 'READ_ONLY'
  | 'LOW_RISK'
  | 'MODIFY'
  | 'HIGH_IMPACT'
  | 'READ'
  | 'LOW_RISK_WRITE'
  | 'HIGH_RISK_WRITE'
  | 'DESTRUCTIVE'
  | 'EXTERNAL_SENSITIVE';

// ─── Action State Lifecycle ──────────────────────────────────────────────────

export type ActionState =
  | 'PLANNED'
  | 'VALIDATING'
  | 'AUTHORIZED'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'TIMED_OUT'
  | 'DENIED'
  | 'CANCELLED'
  | 'REQUESTED';

// ─── Authentication / Authorization Context ──────────────────────────────────

export interface AuthenticationContext {
  readonly userId: string;
  readonly sessionId: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly workspaceId?: string;
  readonly userWorkspaceIds?: readonly string[];
}

// ─── Tool Execution Context ──────────────────────────────────────────────────

export interface ToolExecutionContext {
  readonly auth: AuthenticationContext;
  readonly traceId: string;
  readonly conversationId?: string;
  readonly correlationId?: string;
  readonly projectId?: string;
  readonly workspaceId?: string;
  readonly requestId?: string;
  readonly signal?: AbortSignal;
}

// ─── Tool Execution Options ──────────────────────────────────────────────────

export interface ToolExecutionOptions {
  readonly idempotencyKey?: string;
  readonly maxRetries?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly allowRetry?: boolean;
}

export interface ToolValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

// ─── Validated Tool Input ────────────────────────────────────────────────────

export interface ValidatedToolInput<T = Record<string, unknown>> {
  readonly rawInput: Record<string, unknown>;
  readonly validatedInput: T;
  readonly validatedAt: number;
}

// ─── Tool Verification ───────────────────────────────────────────────────────

export interface ToolVerificationResult {
  readonly verified: boolean;
  readonly status?: VerificationStatus;
  readonly details?: string;
  readonly error?: string;
  readonly evidence?: unknown;
  readonly reason?: string;
  readonly verifiedObject?: unknown;
}

export type VerificationResult = ToolVerificationResult;

// ─── Tool Result ─────────────────────────────────────────────────────────────

export type ToolResultCode =
  | 'SUCCESS'
  | 'TOOL_NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'TOOL_EXECUTION_FAILED'
  | 'VERIFICATION_FAILED'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'UNAUTHORIZED_RESOURCE'
  | 'RATE_LIMITED'
  | ToolErrorCode;

export interface ToolResultMetadata {
  readonly toolId: string;
  readonly executionId: string;
  readonly durationMs?: number;
  readonly correlationId?: string;
}

export interface ToolResult<T = unknown> {
  readonly success: boolean;
  readonly code: ToolResultCode;
  readonly data?: T;
  readonly error?: string;
  readonly executionTimeMs: number;
  readonly verified?: boolean;
  readonly verificationStatus?: VerificationStatus;
  readonly verificationDetails?: string;
  readonly riskLevel?: ActionRiskLevel;
  readonly actionState?: ActionState;
  readonly retryCount?: number;
  readonly cached?: boolean;
  readonly metadata?: ToolResultMetadata;
}

// ─── Tool Execution Record (Auditable History) ───────────────────────────────

export interface ToolExecutionRecord {
  readonly executionId: string;
  readonly toolId: string;
  readonly toolName: string;
  readonly toolVersion: string;
  readonly userId: string;
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly conversationId?: string;
  readonly correlationId?: string;
  readonly inputHash?: string;
  readonly input: Record<string, unknown>;
  readonly resultSummary?: string;
  readonly status: 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'CANCELLED' | 'VERIFICATION_FAILED';
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly durationMs: number;
  readonly retryCount: number;
  readonly error?: string;
  readonly verified: boolean;
  readonly verificationStatus: VerificationStatus;
  readonly verificationDetails?: string;
}

// ─── Tool Definition ─────────────────────────────────────────────────────────

export type ToolCategory =
  | 'tasks'
  | 'projects'
  | 'goals'
  | 'productivity'
  | 'knowledge'
  | 'notes'
  | 'memory'
  | 'workspace'
  | 'system'
  | 'automation';

export interface ToolDefinition<
  TInput extends object = Record<string, unknown>,
  TOutput = unknown,
> {
  readonly id?: string;
  readonly name: string;
  readonly description: string;
  readonly version?: string;
  readonly category: ToolCategory;
  readonly inputSchema: ToolInputSchema;
  readonly outputSchema?: unknown;
  readonly requiredPermissions: readonly string[];
  readonly permissions?: readonly string[];
  readonly riskLevel?: ActionRiskLevel;
  readonly requiresConfirmation?:
    | boolean
    | ((input: TInput, context: ToolExecutionContext) => boolean);
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly idempotent?: boolean;
  readonly retryable?: boolean;
  handler(input: TInput, context: ToolExecutionContext): Promise<TOutput>;
  execute?(input: TInput, context: ToolExecutionContext): Promise<ToolResult<TOutput>>;
  verify?(
    output: TOutput,
    input: TInput,
    context: ToolExecutionContext,
  ): Promise<ToolVerificationResult>;
}

// ─── Tool Listing (public-safe, no handler exposed) ──────────────────────────

export interface ToolDescriptor {
  readonly id?: string;
  readonly name: string;
  readonly description: string;
  readonly version?: string;
  readonly category: ToolCategory;
  readonly inputSchema: ToolInputSchema;
  readonly requiredPermissions: readonly string[];
  readonly riskLevel?: ActionRiskLevel;
  readonly requiresConfirmation?: boolean;
  readonly idempotent?: boolean;
  readonly retryable?: boolean;
  readonly timeoutMs?: number;
}

// ─── Tool Invocation Request ─────────────────────────────────────────────────

export interface ToolInvocation {
  readonly toolName: string;
  readonly input: Record<string, unknown>;
  readonly context: ToolExecutionContext;
  readonly options?: ToolExecutionOptions;
}

