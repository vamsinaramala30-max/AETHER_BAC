/**
 * AETHER AI — Distributed Tracing System (Prompt 9)
 * Canonical distributed tracer providing parent-child span hierarchy,
 * correlation propagation, monotonic timing, and bounded memory buffers.
 */

import { performance } from 'perf_hooks';
import { randomUUID } from 'crypto';
import type { TraceSpan, TraceTree } from './observability-types.js';

export type { TraceSpan as Span };

export class Tracer {
  private static instance: Tracer;
  private readonly activeSpans = new Map<string, TraceSpan>();
  private readonly completedSpans: TraceSpan[] = [];
  private readonly traceIndex = new Map<string, TraceSpan[]>();
  private readonly correlationIndex = new Map<string, string>(); // correlationId -> traceId
  private readonly maxBufferSize = 1000;

  private constructor() {}

  public static getInstance(): Tracer {
    if (!Tracer.instance) {
      Tracer.instance = new Tracer();
    }
    return Tracer.instance;
  }

  /**
   * Starts a new trace span. If parentSpanId or existing traceId is supplied,
   * the span joins the existing trace context.
   */
  public startSpan(
    name: string,
    options?: {
      parentSpanId?: string;
      traceId?: string;
      correlationId?: string;
      component?: string;
      attributes?: Record<string, string | number | boolean>;
      userId?: string;
      workspaceId?: string;
    },
  ): TraceSpan {
    const parentSpan = options?.parentSpanId ? this.activeSpans.get(options.parentSpanId) : undefined;
    const correlationId =
      options?.correlationId ?? parentSpan?.correlationId ?? `corr_${randomUUID()}`;
    const traceId =
      options?.traceId ?? parentSpan?.traceId ?? options?.correlationId ?? this.generateHexId(16);
    const spanId = this.generateHexId(8);
    const now = performance.now();

    const attributes: Record<string, string | number | boolean> = { ...(options?.attributes ?? {}) };
    if (options?.userId) attributes['userId'] = options.userId;
    if (options?.workspaceId) attributes['workspaceId'] = options.workspaceId;

    const span: TraceSpan = {
      traceId,
      spanId,
      parentSpanId: options?.parentSpanId,
      correlationId,
      name,
      component: options?.component ?? parentSpan?.component ?? 'AETHER-CORE',
      startTimeMs: now,
      startedAt: new Date().toISOString(),
      attributes,
      status: 'ok',
    };

    this.activeSpans.set(spanId, span);
    this.correlationIndex.set(correlationId, traceId);

    return span;
  }

  /**
   * Ends an active span with monotonic duration measurement.
   */
  public endSpan(
    spanId: string,
    status: 'ok' | 'error' | 'cancelled' = 'ok',
    error?: { code?: string; message?: string },
  ): TraceSpan | undefined {
    const span = this.activeSpans.get(spanId);
    if (!span) {
      return undefined;
    }

    const endNow = performance.now();
    const durationMs = Math.max(0, endNow - span.startTimeMs);

    span.endTimeMs = endNow;
    span.completedAt = new Date().toISOString();
    span.durationMs = Number(durationMs.toFixed(2));
    span.status = status;
    if (error?.code) span.errorCode = error.code;
    if (error?.message) span.errorMessage = error.message;

    this.activeSpans.delete(spanId);
    this.recordCompletedSpan(span);

    return span;
  }

  /**
   * Retrieves a completed trace tree by traceId with optional tenant verification.
   */
  public getTrace(id: string, userId?: string): TraceTree | null {
    const traceId = this.correlationIndex.get(id) ?? id;
    const spans = this.traceIndex.get(traceId) ?? this.traceIndex.get(id) ?? [];
    if (spans.length === 0) {
      return null;
    }

    // Tenant isolation verification: if userId provided, ensure no cross-user leakage
    if (userId) {
      const traceUserId = spans.find((s) => s.attributes['userId'])?.attributes['userId'];
      if (traceUserId && traceUserId !== userId && userId !== 'admin') {
        return null; // Tenant mismatch: unauthorized
      }
    }

    const rootSpan = spans.find((s) => !s.parentSpanId) ?? spans[0]!;
    const totalDuration = spans.reduce((max, s) => Math.max(max, s.durationMs ?? 0), 0);
    const hasError = spans.some((s) => s.status === 'error');
    const isCancelled = spans.some((s) => s.status === 'cancelled');

    return {
      traceId,
      correlationId: rootSpan.correlationId,
      rootSpan,
      spans: [...spans],
      totalDurationMs: Number(totalDuration.toFixed(2)),
      status: hasError ? 'error' : isCancelled ? 'cancelled' : 'ok',
      startedAt: rootSpan.startedAt,
      completedAt: spans[spans.length - 1]?.completedAt,
    };
  }

  /**
   * Retrieves all spans associated with a correlationId.
   */
  public getSpansByCorrelationId(correlationId: string, userId?: string): readonly TraceSpan[] {
    const traceId = this.correlationIndex.get(correlationId);
    if (!traceId) {
      return [];
    }
    const tree = this.getTrace(traceId, userId);
    return tree ? tree.spans : [];
  }

  /**
   * Retrieves all completed spans (read-only snapshot).
   */
  public getCompletedSpans(): readonly TraceSpan[] {
    return [...this.completedSpans];
  }

  /**
   * Retrieves count of completed spans.
   */
  public getSpanCount(): number {
    return this.completedSpans.length;
  }

  /**
   * Clears in-memory spans (useful for test isolation).
   */
  public clear(): void {
    this.activeSpans.clear();
    this.completedSpans.length = 0;
    this.traceIndex.clear();
    this.correlationIndex.clear();
  }

  private recordCompletedSpan(span: TraceSpan): void {
    this.completedSpans.push(span);

    const existingTrace = this.traceIndex.get(span.traceId) ?? [];
    existingTrace.push(span);
    this.traceIndex.set(span.traceId, existingTrace);

    if (span.correlationId && span.correlationId !== span.traceId) {
      const existingCorr = this.traceIndex.get(span.correlationId) ?? [];
      existingCorr.push(span);
      this.traceIndex.set(span.correlationId, existingCorr);
    }

    // Bounded buffer management with FIFO eviction to prevent memory leaks
    if (this.completedSpans.length > this.maxBufferSize) {
      const evicted = this.completedSpans.shift();
      if (evicted) {
        const trace = this.traceIndex.get(evicted.traceId);
        if (trace) {
          const idx = trace.indexOf(evicted);
          if (idx !== -1) trace.splice(idx, 1);
          if (trace.length === 0) {
            this.traceIndex.delete(evicted.traceId);
            this.correlationIndex.delete(evicted.correlationId);
          }
        }
        if (evicted.correlationId && evicted.correlationId !== evicted.traceId) {
          const corrTrace = this.traceIndex.get(evicted.correlationId);
          if (corrTrace) {
            const idx = corrTrace.indexOf(evicted);
            if (idx !== -1) corrTrace.splice(idx, 1);
            if (corrTrace.length === 0) {
              this.traceIndex.delete(evicted.correlationId);
            }
          }
        }
      }
    }
  }

  private generateHexId(length: number): string {
    const chars = 'abcdef0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

export const tracer = Tracer.getInstance();
