/**
 * AETHER AI — Metrics Registry
 * Tracks system performance metrics: model latency, generation duration,
 * retrieval duration, RAG duration, tool duration, agent duration, errors, and availability.
 */

export interface MetricSummary {
  readonly count: number;
  readonly sum: number;
  readonly min: number;
  readonly max: number;
  readonly avg: number;
}

export class MetricsRegistry {
  private static instance: MetricsRegistry;
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly histograms = new Map<string, number[]>();

  private constructor() {}

  public static getInstance(): MetricsRegistry {
    if (!MetricsRegistry.instance) {
      MetricsRegistry.instance = new MetricsRegistry();
    }
    return MetricsRegistry.instance;
  }

  // ─── Metric Trackers ─────────────────────────────────────────────────────────

  public recordModelLatency(durationMs: number, modelId: string): void {
    this.recordHistogram('model_latency_ms', durationMs, { modelId });
  }

  public recordGenerationDuration(durationMs: number, status: string): void {
    this.recordHistogram('generation_duration_ms', durationMs, { status });
  }

  public recordRetrievalDuration(durationMs: number): void {
    this.recordHistogram('retrieval_duration_ms', durationMs);
  }

  public recordRAGDuration(durationMs: number): void {
    this.recordHistogram('rag_duration_ms', durationMs);
  }

  public recordToolDuration(toolName: string, durationMs: number, success: boolean): void {
    this.recordHistogram('tool_duration_ms', durationMs, { toolName, success: String(success) });
  }

  public recordAgentDuration(agentId: string, durationMs: number, status: string): void {
    this.recordHistogram('agent_duration_ms', durationMs, { agentId, status });
  }

  public recordError(code: string, component: string): void {
    this.incrementCounter('ai_errors_total', 1, { code, component });
  }

  public setRuntimeAvailability(runtimeType: string, available: boolean): void {
    this.setGauge('runtime_available', available ? 1 : 0, { runtimeType });
  }

  // ─── Generic Methods ────────────────────────────────────────────────────────

  public incrementCounter(name: string, value = 1, labels: Record<string, string> = {}): void {
    const key = this.formatKey(name, labels);
    const current = this.counters.get(key) ?? 0;
    this.counters.set(key, current + value);
  }

  public setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.formatKey(name, labels);
    this.gauges.set(key, value);
  }

  public recordHistogram(name: string, durationMs: number, labels: Record<string, string> = {}): void {
    const key = this.formatKey(name, labels);
    const existing = this.histograms.get(key) ?? [];
    existing.push(durationMs);
    if (existing.length > 1000) {
      existing.shift();
    }
    this.histograms.set(key, existing);
  }

  public getCounter(name: string, labels: Record<string, string> = {}): number {
    const key = this.formatKey(name, labels);
    return this.counters.get(key) ?? 0;
  }

  public getGauge(name: string, labels: Record<string, string> = {}): number {
    const key = this.formatKey(name, labels);
    return this.gauges.get(key) ?? 0;
  }

  public getHistogramSummary(name: string, labels: Record<string, string> = {}): MetricSummary {
    const key = this.formatKey(name, labels);
    const values = this.histograms.get(key) ?? [];
    if (values.length === 0) {
      return { count: 0, sum: 0, min: 0, max: 0, avg: 0 };
    }

    const count = values.length;
    const sum = values.reduce((acc, val) => acc + val, 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = sum / count;

    return { count, sum, min, max, avg };
  }

  public clear(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  private formatKey(name: string, labels: Record<string, string>): string {
    const labelPairs = Object.entries(labels)
      .sort(([k1], [k2]) => k1.localeCompare(k2))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return labelPairs ? `${name}{${labelPairs}}` : name;
  }
}

export const metrics = MetricsRegistry.getInstance();
