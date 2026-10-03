import { AutomationStatus as PrismaAutomationStatus } from '@prisma/client';

export type AutomationStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'PAUSED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'NEEDS_APPROVAL';

export type AutomationTriggerType =
  | 'ONE_TIME'
  | 'RECURRING'
  | 'WEEKLY'
  | 'INTERVAL'
  | 'CRON'
  | 'MANUAL'
  | 'EVENT';

export type TriggerType =
  | 'SCHEDULE'
  | 'CRON_SCHEDULE'
  | 'CALENDAR_EVENT_CREATED'
  | 'CALENDAR_EVENT_UPDATED'
  | 'TASK_CREATED'
  | 'TASK_COMPLETED'
  | 'TASK_OVERDUE'
  | 'PROJECT_CREATED'
  | 'PROJECT_UPDATED'
  | 'GOAL_UPDATED'
  | 'DOCUMENT_CREATED'
  | 'DOCUMENT_UPDATED'
  | 'FILE_UPLOADED'
  | 'AI_EVENT'
  | 'AGENT_EVENT'
  | 'NOTIFICATION_EVENT'
  | 'MANUAL'
  | 'MANUAL_TRIGGER'
  | AutomationTriggerType;

export type ConcurrencyPolicy = 'ALLOW' | 'SKIP_IF_RUNNING' | 'QUEUE' | 'REPLACE';

export type MissedExecutionPolicy =
  | 'RUN_ONCE_IMMEDIATELY'
  | 'CATCH_UP'
  | 'SKIP'
  | 'MARK_MISSED';

export interface AutomationSafetyPolicy {
  allowedTools?: string[];
  maxToolCalls?: number;
  executionTimeoutMs?: number;
  approvalRequirements?: string[];
}

export interface AutomationRetryPolicy {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  nonRetryableErrors?: string[];
}

export interface CircuitBreakerState {
  consecutiveFailures: number;
  failureThreshold: number;
  isBroken: boolean;
  autoPaused?: boolean;
  lastFailureAt?: string;
  autoPausedAt?: string;
}

export interface ExecutionSnapshot {
  automationId: string;
  version: number;
  name: string;
  actions: ActionConfig[];
  safetyPolicy?: AutomationSafetyPolicy;
  workspaceId: string;
  userId?: string;
  scheduledOccurrence?: string;
  capturedAt: string;
}

export interface SchedulerHealthStatus {
  isRunning: boolean;
  workerId: string;
  pollIntervalMs?: number;
  lastPollAt: string;
  activeExecutionsCount: number;
  activeExecutions?: number;
  totalExecutedCount: number;
  totalExecuted?: number;
  totalFailedCount: number;
  totalFailed?: number;
  queueDepth: number;
  uptimeSeconds: number;
}

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'does_not_contain'
  | 'exists'
  | 'is_empty'
  | 'greater_than'
  | 'less_than'
  | 'AND'
  | 'OR'
  | 'NOT';

export interface SingleCondition {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}

export interface CompoundCondition {
  logicalOperator: 'AND' | 'OR' | 'NOT';
  conditions: Array<SingleCondition | CompoundCondition>;
}

export type ConditionConfig =
  | SingleCondition
  | CompoundCondition
  | Array<SingleCondition | CompoundCondition>;

export type ActionType =
  | 'AI_ASK'
  | 'AI_SUMMARIZE'
  | 'AI_ANALYZE'
  | 'AI_CLASSIFY'
  | 'AI_GENERATE'
  | 'AI_EXTRACT'
  | 'AI_TRANSFORM'
  | 'TASK_CREATE'
  | 'TASK_UPDATE'
  | 'TASK_COMPLETE'
  | 'TASK_SET_PRIORITY'
  | 'TASK_SET_DEADLINE'
  | 'PROJECT_CREATE'
  | 'PROJECT_UPDATE'
  | 'PROJECT_ADD_TASK'
  | 'PROJECT_UPDATE_GOAL'
  | 'PROJECT_CREATE_MILESTONE'
  | 'CALENDAR_CREATE_EVENT'
  | 'CALENDAR_UPDATE_EVENT'
  | 'CALENDAR_CREATE_REMINDER'
  | 'KNOWLEDGE_CREATE_ITEM'
  | 'KNOWLEDGE_SAVE_AI_RESULT'
  | 'KNOWLEDGE_TAG'
  | 'FILE_ORGANIZE'
  | 'FILE_RENAME'
  | 'NOTIFICATION_CREATE'
  | 'NOTIFICATION_REMINDER'
  | 'AGENT_RUN'
  | 'CREATE_TASK'
  | 'UPDATE_TASK'
  | 'COMPLETE_TASK'
  | 'ANALYZE_PROJECT'
  | 'SUMMARIZE_DOCUMENT'
  | 'SEARCH_MEMORY'
  | string;

export type ActionExecutionMode = 'AUTOMATIC' | 'APPROVAL_REQUIRED' | 'MANUAL';

export interface ActionConfig {
  id?: string;
  type: ActionType;
  params?: Record<string, unknown>;
  mode?: ActionExecutionMode;
  timeoutMs?: number;
  continueOnError?: boolean;
}

export interface TriggerConfig {
  type: TriggerType;
  params?: Record<string, unknown>;
  schedule?: string; // Cron syntax, ISO timestamp, or interval
  timezone?: string; // Explicit timezone e.g. 'UTC', 'Asia/Kolkata', 'America/New_York'
  triggerType?: AutomationTriggerType;
  interval?: string; // e.g. '6h', '30m'
  dayOfWeek?: number[]; // e.g. [1] for Monday
  time?: string; // e.g. '08:00'
}

export interface AutomationMetadata {
  timezone?: string;
  triggerType?: AutomationTriggerType;
  concurrencyPolicy?: ConcurrencyPolicy;
  missedExecutionPolicy?: MissedExecutionPolicy;
  safetyPolicy?: AutomationSafetyPolicy;
  retryPolicy?: AutomationRetryPolicy;
  circuitBreaker?: CircuitBreakerState;
  version?: number;
  nextRunAt?: string | null;
  lockedUntil?: string | null;
  lockedBy?: string | null;
  [key: string]: unknown;
}

export interface AutomationDTO {
  id: string;
  workspaceId: string;
  userId?: string | null;
  name: string;
  description?: string | null;
  trigger: string;
  triggerConfig?: TriggerConfig;
  conditions?: ConditionConfig | null;
  actions?: ActionConfig[] | Record<string, unknown> | null;
  schedule?: string | null;
  timezone?: string;
  nextRunAt?: Date | string | null;
  isEnabled: boolean;
  status: PrismaAutomationStatus | AutomationStatus;
  version?: number;
  concurrencyPolicy?: ConcurrencyPolicy;
  missedExecutionPolicy?: MissedExecutionPolicy;
  safetyPolicy?: AutomationSafetyPolicy;
  retryPolicy?: AutomationRetryPolicy;
  circuitBreaker?: CircuitBreakerState;
  lastRunAt?: Date | null;
  runCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export interface CreateAutomationInput {
  workspaceId?: string;
  userId?: string;
  name: string;
  description?: string;
  trigger: string;
  triggerConfig?: TriggerConfig;
  conditions?: ConditionConfig | Record<string, unknown>;
  actions: ActionConfig[] | Record<string, unknown> | Array<Record<string, unknown>>;
  schedule?: string;
  timezone?: string;
  triggerType?: AutomationTriggerType;
  concurrencyPolicy?: ConcurrencyPolicy;
  missedExecutionPolicy?: MissedExecutionPolicy;
  safetyPolicy?: AutomationSafetyPolicy;
  retryPolicy?: AutomationRetryPolicy;
  isEnabled?: boolean;
  status?: PrismaAutomationStatus;
}

export interface UpdateAutomationInput {
  name?: string;
  description?: string | null;
  trigger?: string;
  triggerConfig?: TriggerConfig;
  conditions?: ConditionConfig | null;
  actions?: ActionConfig[] | Record<string, unknown> | null;
  schedule?: string | null;
  timezone?: string;
  triggerType?: AutomationTriggerType;
  concurrencyPolicy?: ConcurrencyPolicy;
  missedExecutionPolicy?: MissedExecutionPolicy;
  safetyPolicy?: AutomationSafetyPolicy;
  retryPolicy?: AutomationRetryPolicy;
  isEnabled?: boolean;
  status?: PrismaAutomationStatus | AutomationStatus;
}

export interface ExecutionStepResult {
  stepIndex: number;
  actionId?: string;
  actionType: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'WAITING_APPROVAL';
  input?: Record<string, unknown>;
  output?: unknown;
  error?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export interface ExecutionRecordDTO {
  id: string;
  automationId: string;
  workspaceId: string;
  userId?: string | null;
  status: PrismaAutomationStatus | AutomationStatus;
  triggerData?: Record<string, unknown> | null;
  currentStep: number;
  stepResults?: ExecutionStepResult[] | null;
  result?: Record<string, unknown> | null;
  error?: Record<string, unknown> | string | null;
  retryCount: number;
  startedAt: Date;
  completedAt?: Date | null;
}

export interface ActivityRecordDTO {
  id: string;
  automationId: string;
  executionId?: string | null;
  workspaceId: string;
  userId?: string | null;
  type: string;
  message: string;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  category: 'productivity' | 'ai' | 'tasks' | 'calendar' | 'files';
  icon: string;
  trigger: TriggerConfig;
  conditions?: ConditionConfig;
  actions: ActionConfig[];
}
