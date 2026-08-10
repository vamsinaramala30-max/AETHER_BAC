/**
 * AETHER AI — Agent Types
 * Strict type definitions for the agent subsystem.
 */

import type { AuthenticationContext, ToolExecutionContext } from '../tools/tool-types.js';

export type AgentStatus =
  | 'idle'
  | 'planning'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AgentConfig {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly goal: string;
  readonly tools: readonly string[];
  readonly maxIterations: number;
  readonly timeoutMs: number;
}

export interface PlanStep {
  readonly stepNumber: number;
  readonly description: string;
  readonly toolName?: string;
  readonly toolInput?: Record<string, unknown>;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result?: unknown;
  error?: string;
}

export interface ExecutionPlan {
  readonly planId: string;
  readonly goal: string;
  readonly steps: readonly PlanStep[];
  readonly createdAt: string;
}

export interface AgentObservation {
  readonly stepNumber: number;
  readonly toolName?: string;
  readonly output: unknown;
  readonly success: boolean;
  readonly timestamp: string;
  readonly error?: string;
}

export interface AgentRunOptions {
  readonly signal?: AbortSignal;
  readonly conversationId?: string;
  readonly maxIterations?: number;
  readonly timeoutMs?: number;
}

export interface AgentRunResult {
  readonly runId: string;
  readonly agentId: string;
  readonly status: AgentStatus;
  readonly stepsExecuted: number;
  readonly response?: string;
  readonly error?: string;
  readonly durationMs: number;
}

export interface AgentExecutionContext {
  readonly runId: string;
  readonly agentConfig: AgentConfig;
  readonly auth: AuthenticationContext;
  readonly toolContext: ToolExecutionContext;
  readonly signal?: AbortSignal;
}
