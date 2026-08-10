/**
 * AETHER AI — Tracing Abstraction
 * Manages operation spans across AI requests, tools, agents, and RAG execution.
 */

import { performance } from 'perf_hooks';

export interface Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly startTimeMs: number;
  endTimeMs?: number;
  durationMs?: number;
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
  readonly status: 'ok' | 'error';
  errorMessage?: string;
}

export class Tracer {
  private static instance: Tracer;
  private readonly activeSpans = new Map<string, Span>();
  private readonly completedSpans: Span[] = [];

  private constructor() {}

  public static getInstance(): Tracer {
    if (!Tracer.instance) {
      Tracer.instance = new Tracer();
    }
    return Tracer.instance;
  }

  public startSpan(
    name: string,
    parentSpanId?: string,
    attributes: Readonly<Record<string, string | number | boolean>> = {},
  ): Span {
    const traceId = this.generateHexId(16);
    const spanId = this.generateHexId(8);
    const span: Span = {
      traceId,
      spanId,
      parentSpanId,
      name,
      startTimeMs: performance.now(),
      attributes: { ...attributes },
      status: 'ok',
    };
    this.activeSpans.set(spanId, span);
    return span;
  }

  public endSpan(
    spanId: string,
    status: 'ok' | 'error' = 'ok',
    errorMessage?: string,
  ): Span | undefined {
    const span = this.activeSpans.get(spanId);
    if (!span) {
      return undefined;
    }

    const endTimeMs = performance.now();
    const completed: Span = {
      ...span,
      endTimeMs,
      durationMs: endTimeMs - span.startTimeMs,
      status,
      errorMessage,
    };

    this.activeSpans.delete(spanId);
    this.completedSpans.push(completed);
    if (this.completedSpans.length > 500) {
      this.completedSpans.shift();
    }

    return completed;
  }

  public getCompletedSpans(): readonly Span[] {
    return [...this.completedSpans];
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
