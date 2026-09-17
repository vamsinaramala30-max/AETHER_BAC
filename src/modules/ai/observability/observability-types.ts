/**
 * AETHER AI — Canonical Observability Contracts (Prompt 9)
 * Authoritative types for structured logging, distributed tracing, metrics,
 * health reporting, and diagnostic contracts.
 */

// ─── Severity Levels ──────────────────────────────────────────────────────────

export type ObservabilitySeverity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

// ─── Canonical Observability Record ───────────────────────────────────────────

export interface ObservabilityEventRecord {
  // Identifiers
  readonly requestId: string;
  readonly correlationId: string;
  readonly traceId: string;
  readonly spanId?: string;
  readonly parentSpanId?: string;
  readonly userId?: string;
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly conversationId?: string;

  // Execution Context
  readonly planId?: string;
  readonly planVersion?: number;
  readonly executionId?: string;
  readonly stepId?: string;
  readonly toolName?: string;
  readonly toolVersion?: string;

  // Classification
  readonly component: string;
  readonly operation: string;
  readonly eventType: string;
  readonly severity: ObservabilitySeverity;

  // Timing
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly durationMs?: number;

  // Status & Error
  readonly status: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'RUNNING' | 'CANCELLED' | 'TIMEOUT' | 'DEGRADED';
  readonly errorCode?: string;
  readonly retryCount?: number;

  // Model Metadata
  readonly model?: string;
  readonly modelVersion?: string;

  // RAG / Memory Metadata
  readonly ragQueryId?: string;
  readonly memoryOperationId?: string;

  // Safe Metadata (secrets & CoT stripped)
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ─── Distributed Tracing Contracts ───────────────────────────────────────────

export interface TraceSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly correlationId: string;
  readonly name: string;
  readonly component: string;
  readonly startTimeMs: number;
  readonly startedAt: string;
  endTimeMs?: number;
  completedAt?: string;
  durationMs?: number;
  readonly attributes: Record<string, string | number | boolean>;
  status: 'ok' | 'error' | 'cancelled';
  errorCode?: string;
  errorMessage?: string;
}

export interface TraceTree {
  readonly traceId: string;
  readonly correlationId: string;
  readonly rootSpan: TraceSpan;
  readonly spans: readonly TraceSpan[];
  readonly totalDurationMs: number;
  readonly status: 'ok' | 'error' | 'cancelled';
  readonly startedAt: string;
  readonly completedAt?: string;
}

// ─── Observability Configuration ─────────────────────────────────────────────

export interface ObservabilityConfig {
  readonly serviceName?: string;
  readonly environment?: string;
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  readonly traceEnabled: boolean;
  readonly metricsEnabled: boolean;
  readonly healthCheckEnabled: boolean;
  readonly promptsLogged: boolean;       // MUST default to false
  readonly outputsLogged: boolean;       // MUST default to false
  readonly chainOfThoughtLogged?: boolean; // Invariant: always false
  readonly redactSensitiveData?: boolean;
  readonly traceSampleRate: number;      // 0.0 to 1.0 (default: 1.0)
  readonly logRetentionDays: number;     // default: 30
  readonly traceRetentionDays: number;   // default: 7
  readonly metricRetentionDays: number;  // default: 30
  readonly maxTraceBufferSize: number;   // default: 1000
  readonly maxSpansInMemory?: number;
  readonly healthCheckTimeoutMs?: number;
}

export const DEFAULT_OBSERVABILITY_CONFIG: ObservabilityConfig = {
  serviceName: 'aether-bac',
  environment: 'development',
  logLevel: 'info',
  traceEnabled: true,
  metricsEnabled: true,
  healthCheckEnabled: true,
  promptsLogged: false,
  outputsLogged: false,
  chainOfThoughtLogged: false,
  redactSensitiveData: true,
  traceSampleRate: 1.0,
  logRetentionDays: 30,
  traceRetentionDays: 7,
  metricRetentionDays: 30,
  maxTraceBufferSize: 1000,
  maxSpansInMemory: 1000,
  healthCheckTimeoutMs: 2000,
};
