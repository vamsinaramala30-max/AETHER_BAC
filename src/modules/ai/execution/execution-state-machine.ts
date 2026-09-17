/**
 * AETHER AI - Execution State Machine (Prompt 8)
 * Enforces deterministic, explicit state transitions for agent execution.
 * Invalid transitions are rejected with a typed error - no silent state corruption.
 */

import type { ExecutionStatus } from './execution-types.js';

export class InvalidTransitionError extends Error {
  public readonly from: ExecutionStatus;
  public readonly to: ExecutionStatus;
  public readonly reason: string;

  constructor(from: ExecutionStatus, to: ExecutionStatus, reason?: string) {
    const msg = 'Invalid execution state transition: ' + from + ' -> ' + to + (reason ? ': ' + reason : '');
    super(msg);
    this.name = 'InvalidTransitionError';
    this.from = from;
    this.to = to;
    this.reason = reason ?? 'Not an allowed transition';
  }
}

const ALLOWED_TRANSITIONS: Readonly<Record<ExecutionStatus, ReadonlySet<ExecutionStatus>>> = {
  PENDING: new Set<ExecutionStatus>(['VALIDATING', 'CANCELLED']),
  VALIDATING: new Set<ExecutionStatus>(['AUTHORIZED', 'FAILED', 'BLOCKED', 'CANCELLED']),
  AUTHORIZED: new Set<ExecutionStatus>(['RUNNING', 'CANCELLED']),
  RUNNING: new Set<ExecutionStatus>([
    'RUNNING',
    'VERIFYING',
    'WAITING_FOR_INPUT',
    'WAITING_FOR_APPROVAL',
    'FAILED',
    'TIMED_OUT',
    'BLOCKED',
    'RECOVERING',
    'CANCELLED',
    'COMPLETED',
    'PARTIALLY_COMPLETED',
  ]),
  VERIFYING: new Set<ExecutionStatus>([
    'RUNNING',
    'COMPLETED',
    'PARTIALLY_COMPLETED',
    'FAILED',
    'RECOVERING',
  ]),
  RECOVERING: new Set<ExecutionStatus>(['RUNNING', 'FAILED', 'BLOCKED', 'CANCELLED']),
  WAITING_FOR_INPUT: new Set<ExecutionStatus>(['RUNNING', 'CANCELLED', 'TIMED_OUT', 'FAILED']),
  WAITING_FOR_APPROVAL: new Set<ExecutionStatus>([
    'RUNNING',
    'CANCELLED',
    'TIMED_OUT',
    'BLOCKED',
    'FAILED',
  ]),
  COMPLETED: new Set<ExecutionStatus>([]),
  PARTIALLY_COMPLETED: new Set<ExecutionStatus>([]),
  FAILED: new Set<ExecutionStatus>([]),
  TIMED_OUT: new Set<ExecutionStatus>([]),
  CANCELLED: new Set<ExecutionStatus>([]),
  BLOCKED: new Set<ExecutionStatus>([]),
};

const TERMINAL_STATUSES: ReadonlySet<ExecutionStatus> = new Set([
  'COMPLETED',
  'PARTIALLY_COMPLETED',
  'FAILED',
  'TIMED_OUT',
  'CANCELLED',
  'BLOCKED',
]);

const CANCELLABLE_STATUSES: ReadonlySet<ExecutionStatus> = new Set([
  'PENDING',
  'VALIDATING',
  'AUTHORIZED',
  'RUNNING',
  'VERIFYING',
  'RECOVERING',
  'WAITING_FOR_INPUT',
  'WAITING_FOR_APPROVAL',
]);

export interface IExecutionStateMachine {
  canTransition(from: ExecutionStatus, to: ExecutionStatus): boolean;
  transition(from: ExecutionStatus, to: ExecutionStatus, reason?: string): ExecutionStatus;
  isTerminal(status: ExecutionStatus): boolean;
  canCancel(status: ExecutionStatus): boolean;
  canResume(status: ExecutionStatus): boolean;
  getAllowedTransitions(from: ExecutionStatus): ReadonlySet<ExecutionStatus>;
}

export class ExecutionStateMachine implements IExecutionStateMachine {
  public canTransition(from: ExecutionStatus, to: ExecutionStatus): boolean {
    return ALLOWED_TRANSITIONS[from]?.has(to) === true;
  }

  public transition(from: ExecutionStatus, to: ExecutionStatus, reason?: string): ExecutionStatus {
    if (!this.canTransition(from, to)) {
      throw new InvalidTransitionError(from, to, reason);
    }
    return to;
  }

  public isTerminal(status: ExecutionStatus): boolean {
    return TERMINAL_STATUSES.has(status);
  }

  public canCancel(status: ExecutionStatus): boolean {
    return CANCELLABLE_STATUSES.has(status);
  }

  public canResume(status: ExecutionStatus): boolean {
    return status === 'WAITING_FOR_INPUT' || status === 'WAITING_FOR_APPROVAL';
  }

  public getAllowedTransitions(from: ExecutionStatus): ReadonlySet<ExecutionStatus> {
    return ALLOWED_TRANSITIONS[from] ?? new Set();
  }
}

export const executionStateMachine = new ExecutionStateMachine();
