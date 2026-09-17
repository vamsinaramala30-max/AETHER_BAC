/**
 * AETHER AI — Metrics Registry (Prompt 9)
 * Canonical production metrics system covering API, Model, RAG, Memory,
 * Tools, Agents, and System dependencies.
 *
 * Rules:
 * - Strictly prevents high-cardinality label pollution (rejects raw userId, executionId, etc.).
 * - Bounded histograms (max 1,000 observations per bucket).
 * - Exposes JSON summaries and standard Prometheus metrics text.
 */

export interface MetricSummary {
  readonly count: number;
  readonly sum: number;
  readonly min: number;
  readonly max: number;
  readonly avg: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
}

export interface MetricsSummary {
  readonly timestamp: string;
  readonly counters: Record<string, number>;
  readonly gauges: Record<string, number>;
  readonly histograms: Record<string, MetricSummary>;
  readonly custom: Record<string, number>;
  readonly api: { requestsTotal: number };
  readonly model: { requestsTotal: number; errorsTotal: number };
  readonly rag: { requestsTotal: number; errorsTotal: number };
  readonly memory: { operationsTotal: number; errorsTotal: number };
  readonly tools: { requestsTotal: number; denialsTotal: number; timeoutsTotal: number; verificationFailuresTotal: number };
  readonly agent: { executionsTotal: number; failedTotal: number; cancellationsTotal: number };
}

const HIGH_CARDINALITY_LABEL_KEYS = new Set([
  'userid',
  'user_id',
  'conversationid',
  'conversation_id',
  'executionid',
  'execution_id',
  'requestid',
  'request_id',
  'planid',
  'plan_id',
  'sessionid',
  'session_id',
  'stepid',
  'step_id',
  'messageid',
  'message_id',
]);

export class MetricsRegistry {
  private static instance: MetricsRegistry;
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly histograms = new Map<string, number[]>();
  private readonly maxHistogramSamples = 1000;

  private constructor() {}

  public static getInstance(): MetricsRegistry {
    if (!MetricsRegistry.instance) {
      MetricsRegistry.instance = new MetricsRegistry();
    }
    return MetricsRegistry.instance;
  }

  public reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  // ─── 1. API Metrics ─────────────────────────────────────────────────────────

  public recordApiRequest(method: string, route: string, statusCode: number, durationMs: number): void {
    const statusBucket = `${Math.floor(statusCode / 100)}xx`;
    this.incrementCounter('aether_http_requests_total', 1, { method, route, status: String(statusCode) });
    this.incrementCounter('request_count', 1, { method, route, status: statusBucket });
    this.recordHistogram('request_latency_ms', durationMs, { method, route });
    if (statusCode >= 400) {
      this.incrementCounter('request_errors_total', 1, { method, route, status: String(statusCode) });
    }
  }

  public recordApiTimeout(route: string): void {
    this.incrementCounter('request_timeouts_total', 1, { route });
  }

  // ─── 2. Model Metrics ───────────────────────────────────────────────────────

  public recordModelRequest(provider: string, modelId: string): void {
    this.incrementCounter('model_requests_total', 1, { provider, modelId });
  }

  public recordModelLatency(durationMs: number, provider: string, modelId: string): void {
    this.recordHistogram('model_latency_ms', durationMs, { provider, modelId });
  }

  public recordModelTimeToFirstToken(durationMs: number, provider: string, modelId: string): void {
    this.recordHistogram('model_time_to_first_token_ms', durationMs, { provider, modelId });
  }

  public recordModelFailure(provider: string, modelId: string, errorCode: string): void {
    this.incrementCounter('model_failures_total', 1, { provider, modelId, errorCode });
  }

  public recordModelTimeout(provider: string, modelId: string): void {
    this.incrementCounter('model_timeouts_total', 1, { provider, modelId });
  }

  public recordModelTokens(provider: string, modelId: string, tokens: number, type: 'prompt' | 'completion'): void {
    this.incrementCounter('model_tokens_total', tokens, { provider, modelId, type });
  }

  // ─── 3. RAG Metrics ─────────────────────────────────────────────────────────

  public recordRAGRequest(stage: string): void {
    this.incrementCounter('rag_requests_total', 1, { stage });
  }

  public recordRAGLatency(durationMs: number, stage: string): void {
    this.recordHistogram('rag_latency_ms', durationMs, { stage });
  }

  public recordRetrievalLatency(durationMs: number, strategy: string): void {
    this.recordHistogram('retrieval_latency_ms', durationMs, { strategy });
  }

  public recordRerankLatency(durationMs: number): void {
    this.recordHistogram('rerank_latency_ms', durationMs);
  }

  public recordRAGFailure(stage: string, errorCode: string): void {
    this.incrementCounter('retrieval_failures_total', 1, { stage, errorCode });
  }

  public recordCitations(count: number): void {
    this.recordHistogram('citation_count', count);
  }

  // ─── 4. Memory Metrics ──────────────────────────────────────────────────────

  public recordMemoryRead(scope: string, success: boolean): void {
    this.incrementCounter('memory_reads_total', 1, { scope, success: String(success) });
  }

  public recordMemoryWrite(scope: string, success: boolean): void {
    this.incrementCounter('memory_writes_total', 1, { scope, success: String(success) });
  }

  public recordMemoryDelete(scope: string, success: boolean): void {
    this.incrementCounter('memory_deletes_total', 1, { scope, success: String(success) });
  }

  public recordMemoryLatency(durationMs: number, operation: string): void {
    this.recordHistogram('memory_latency_ms', durationMs, { operation });
  }

  public recordMemoryFailure(operation: string, errorCode: string): void {
    this.incrementCounter('memory_failures_total', 1, { operation, errorCode });
  }

  public recordMemoryOperation(operation: string, status: string): void {
    this.incrementCounter('memory_operations_total', 1, { operation, status });
  }

  // ─── 5. Tools Metrics ───────────────────────────────────────────────────────

  public recordToolRequest(toolName: string): void {
    this.incrementCounter('tool_requests_total', 1, { toolName });
  }

  public recordToolDuration(toolName: string, durationMs: number, success: boolean): void {
    this.recordHistogram('tool_latency_ms', durationMs, { toolName, success: String(success) });
  }

  public recordToolFailure(toolName: string, category: string): void {
    this.incrementCounter('tool_failures_total', 1, { toolName, category });
  }

  public recordToolTimeout(toolName: string): void {
    this.incrementCounter('tool_timeouts_total', 1, { toolName });
  }

  public recordToolDenial(toolName: string, reason: string): void {
    this.incrementCounter('tool_denials_total', 1, { toolName, reason });
  }

  public recordToolVerificationFailure(toolName: string): void {
    this.incrementCounter('tool_verification_failures_total', 1, { toolName });
  }

  // ─── 6. Agent & Execution Metrics ───────────────────────────────────────────

  public recordAgentExecution(status: string): void {
    this.incrementCounter('agent_executions_total', 1, { status });
  }

  public recordExecutionDuration(durationMs: number, status: string): void {
    this.recordHistogram('execution_duration_ms', durationMs, { status });
  }

  public recordExecutionFailure(category: string): void {
    this.incrementCounter('execution_failures_total', 1, { category });
  }

  public recordExecutionRetry(attempt: number): void {
    this.incrementCounter('execution_retries_total', 1, { attempt: String(attempt) });
  }

  public recordExecutionTimeout(): void {
    this.incrementCounter('execution_timeouts_total', 1);
  }

  public recordExecutionCancellation(): void {
    this.incrementCounter('execution_cancellations_total', 1);
  }

  public recordApprovalWait(): void {
    this.incrementCounter('approval_waits_total', 1);
  }

  // ─── 7. System Metrics ──────────────────────────────────────────────────────

  public recordDependencyFailure(dependency: string): void {
    this.incrementCounter('dependency_failures_total', 1, { dependency });
  }

  public recordDatabaseFailure(operation: string): void {
    this.incrementCounter('database_failures_total', 1, { operation });
  }

  public recordRedisFailure(operation: string): void {
    this.incrementCounter('redis_failures_total', 1, { operation });
  }

  public recordCacheHit(cacheName: string): void {
    this.incrementCounter('cache_hits_total', 1, { cacheName });
  }

  public recordCacheMiss(cacheName: string): void {
    this.incrementCounter('cache_misses_total', 1, { cacheName });
  }

  // Backward compatibility alias
  public recordError(code: string, component: string): void {
    this.incrementCounter('ai_errors_total', 1, { code, component });
  }

  // Backward compatibility alias
  public recordGenerationDuration(durationMs: number, status: string): void {
    this.recordHistogram('generation_duration_ms', durationMs, { status });
  }

  // Backward compatibility alias
  public recordRetrievalDuration(durationMs: number): void {
    this.recordHistogram('retrieval_duration_ms', durationMs);
  }

  // Backward compatibility alias
  public recordRAGDuration(durationMs: number): void {
    this.recordHistogram('rag_duration_ms', durationMs);
  }

  // Backward compatibility alias
  public recordAgentDuration(agentId: string, durationMs: number, status: string): void {
    this.recordHistogram('agent_duration_ms', durationMs, { status });
  }

  // Backward compatibility alias
  public setRuntimeAvailability(runtimeType: string, available: boolean): void {
    this.setGauge('runtime_available', available ? 1 : 0, { runtimeType });
  }

  // ─── Generic Core Methods (with Cardinality Protection) ─────────────────────

  public incrementCounter(name: string, value = 1, labels: Record<string, string> = {}): void {
    const cleanLabels = this.filterLabels(labels);
    const key = this.formatKey(name, cleanLabels);
    const current = this.counters.get(key) ?? 0;
    this.counters.set(key, current + value);
  }

  public setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const cleanLabels = this.filterLabels(labels);
    const key = this.formatKey(name, cleanLabels);
    this.gauges.set(key, value);
  }

  public recordHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const cleanLabels = this.filterLabels(labels);
    const key = this.formatKey(name, cleanLabels);
    const existing = this.histograms.get(key) ?? [];
    existing.push(value);
    if (existing.length > this.maxHistogramSamples) {
      existing.shift();
    }
    this.histograms.set(key, existing);
  }

  public getCounter(name: string, labels: Record<string, string> = {}): number {
    const cleanLabels = this.filterLabels(labels);
    const key = this.formatKey(name, cleanLabels);
    return this.counters.get(key) ?? 0;
  }

  public getGauge(name: string, labels: Record<string, string> = {}): number {
    const cleanLabels = this.filterLabels(labels);
    const key = this.formatKey(name, cleanLabels);
    return this.gauges.get(key) ?? 0;
  }

  public getHistogramSummary(name: string, labels: Record<string, string> = {}): MetricSummary {
    const cleanLabels = this.filterLabels(labels);
    const key = this.formatKey(name, cleanLabels);
    const values = this.histograms.get(key) ?? [];

    if (values.length === 0) {
      return { count: 0, sum: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const count = sorted.length;
    const min = sorted[0]!;
    const max = sorted[count - 1]!;
    const avg = Number((sum / count).toFixed(2));
    const p50 = sorted[Math.floor(count * 0.5)]!;
    const p95 = sorted[Math.floor(count * 0.95)]!;
    const p99 = sorted[Math.floor(count * 0.99)]!;

    return { count, sum, min, max, avg, p50, p95, p99 };
  }

  public recordCustomMetric(name: string, value = 1, labels: Record<string, string> = {}): void {
    this.incrementCounter(name, value, labels);
  }

  /**
   * Returns a complete JSON snapshot of all system metrics.
   */
  public getSummary(): MetricsSummary {
    const counters: Record<string, number> = {};
    for (const [k, v] of this.counters.entries()) {
      counters[k] = v;
    }

    const gauges: Record<string, number> = {};
    for (const [k, v] of this.gauges.entries()) {
      gauges[k] = v;
    }

    const histograms: Record<string, MetricSummary> = {};
    for (const k of this.histograms.keys()) {
      const parts = k.split('{');
      const baseName = parts[0]!;
      histograms[k] = this.getHistogramSummary(baseName);
    }

    const totalRequests = Object.entries(counters).filter(([k]) => k.startsWith('request_count')).reduce((sum, [_, v]) => sum + v, 0);
    const modelRequests = Object.entries(counters).filter(([k]) => k.startsWith('model_requests_total')).reduce((sum, [_, v]) => sum + v, 0);
    const modelErrors = Object.entries(counters).filter(([k]) => k.startsWith('model_failures_total')).reduce((sum, [_, v]) => sum + v, 0);
    const ragRequests = Object.entries(counters).filter(([k]) => k.startsWith('rag_requests_total')).reduce((sum, [_, v]) => sum + v, 0);
    const ragErrors = Object.entries(counters).filter(([k]) => k.startsWith('retrieval_failures_total')).reduce((sum, [_, v]) => sum + v, 0);
    const memOps = Object.entries(counters).filter(([k]) => k.startsWith('memory_')).reduce((sum, [_, v]) => sum + v, 0);
    const memErrors = Object.entries(counters).filter(([k]) => k.startsWith('memory_failures_total')).reduce((sum, [_, v]) => sum + v, 0);
    const toolRequests = Object.entries(counters).filter(([k]) => k.startsWith('tool_requests_total')).reduce((sum, [_, v]) => sum + v, 0);
    const toolDenials = Object.entries(counters).filter(([k]) => k.startsWith('tool_denials_total')).reduce((sum, [_, v]) => sum + v, 0);
    const toolTimeouts = Object.entries(counters).filter(([k]) => k.startsWith('tool_timeouts_total')).reduce((sum, [_, v]) => sum + v, 0);
    const toolVerifFailures = Object.entries(counters).filter(([k]) => k.startsWith('tool_verification_failures_total')).reduce((sum, [_, v]) => sum + v, 0);
    const agentExecs = Object.entries(counters).filter(([k]) => k.startsWith('agent_executions_total')).reduce((sum, [_, v]) => sum + v, 0);
    const agentFails = Object.entries(counters).filter(([k]) => k.includes('execution_failures_total') || (k.startsWith('agent_executions_total') && k.includes('FAILED'))).reduce((sum, [_, v]) => sum + v, 0);
    const agentCancels = Object.entries(counters).filter(([k]) => k.includes('execution_cancellations_total') || (k.startsWith('agent_executions_total') && k.includes('CANCELLED'))).reduce((sum, [_, v]) => sum + v, 0);
    const custom: Record<string, number> = {};
    for (const [k, v] of Object.entries(counters)) {
      custom[k] = v;
      const baseName = k.split('{')[0]!;
      custom[baseName] = (custom[baseName] ?? 0) + v;
    }

    return {
      timestamp: new Date().toISOString(),
      counters,
      gauges,
      histograms,
      custom,
      api: { requestsTotal: totalRequests },
      model: { requestsTotal: modelRequests, errorsTotal: modelErrors },
      rag: { requestsTotal: ragRequests, errorsTotal: ragErrors },
      memory: { operationsTotal: memOps, errorsTotal: memErrors },
      tools: { requestsTotal: toolRequests, denialsTotal: toolDenials, timeoutsTotal: toolTimeouts, verificationFailuresTotal: toolVerifFailures },
      agent: { executionsTotal: agentExecs, failedTotal: agentFails, cancellationsTotal: agentCancels },
    };
  }

  /**
   * Serializes metrics to Prometheus exposition text format.
   */
  public toPrometheus(): string {
    const lines: string[] = [
      '# HELP aether_http_requests_total Total number of HTTP requests processed.',
      '# TYPE aether_http_requests_total counter',
      '# HELP request_count Total number of API requests.',
      '# TYPE request_count counter',
      '# HELP request_latency_ms API request latency in milliseconds.',
      '# TYPE request_latency_ms histogram',
    ];

    for (const [key, val] of this.counters.entries()) {
      lines.push(`${key} ${val}`);
    }

    for (const [key, val] of this.gauges.entries()) {
      lines.push(`${key} ${val}`);
    }

    for (const [key, values] of this.histograms.entries()) {
      if (values.length === 0) continue;
      const sum = values.reduce((a, b) => a + b, 0);
      lines.push(`${key}_count ${values.length}`);
      lines.push(`${key}_sum ${sum}`);
    }

    return lines.join('\n');
  }

  /**
   * Clears all metrics (useful in unit tests).
   */
  public clear(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  /**
   * Filters out high-cardinality keys like userId, requestId, executionId.
   */
  private filterLabels(labels: Record<string, string>): Record<string, string> {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(labels)) {
      const lower = k.toLowerCase().replace(/[-_]/g, '');
      if (HIGH_CARDINALITY_LABEL_KEYS.has(k.toLowerCase()) || HIGH_CARDINALITY_LABEL_KEYS.has(lower)) {
        continue; // Discard high-cardinality label
      }
      clean[k] = String(v);
    }
    return clean;
  }

  private formatKey(name: string, labels: Record<string, string>): string {
    const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) {
      return name;
    }
    const labelStr = entries.map(([k, v]) => `${k}="${v}"`).join(',');
    return `${name}{${labelStr}}`;
  }
}

export const metrics = MetricsRegistry.getInstance();
