/**
 * AETHER AI — Correlation & Distributed Tracing Middleware (Prompt 9)
 * Intercepts all incoming HTTP requests to ensure end-to-end correlation propagation:
 * FRO -> BAC -> CORE -> MODEL/RAG/MEMORY/TOOLS -> EXECUTION -> Response
 */

import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import { tracer } from '../modules/ai/observability/tracing.js';
import { metrics } from '../modules/ai/observability/metrics.js';
import { logger } from '../modules/ai/observability/logger.js';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      traceId: string;
      requestId: string;
      spanId?: string;
    }
  }
}

export const correlationMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startNow = performance.now();

  // 1. Extract or generate Correlation ID
  const correlationId: string =
    (req.headers['x-correlation-id'] as string) ||
    (req.headers['x-request-id'] as string) ||
    `corr_${randomUUID()}`;

  // 2. Extract or generate Request ID
  const requestId: string =
    (req.headers['x-request-id'] as string) ||
    `req_${randomUUID()}`;

  // 3. Extract W3C traceparent or generate traceId
  // Format: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
  const traceparent = req.headers['traceparent'] as string | undefined;
  let incomingTraceId: string | undefined;
  let incomingParentSpanId: string | undefined;

  if (traceparent && traceparent.startsWith('00-')) {
    const parts = traceparent.split('-');
    if (parts.length >= 3 && parts[1] && parts[2]) {
      incomingTraceId = parts[1];
      incomingParentSpanId = parts[2];
    }
  }

  // 4. Start Root HTTP Trace Span
  const span = tracer.startSpan(`HTTP ${req.method} ${req.path}`, {
    traceId: incomingTraceId,
    parentSpanId: incomingParentSpanId,
    correlationId,
    component: 'HTTP-Gateway',
    attributes: {
      httpMethod: req.method,
      httpPath: req.path,
      httpUrl: req.originalUrl || req.url,
      clientIp: req.ip || 'unknown',
    },
  });

  // 5. Attach to Express Request
  req.correlationId = correlationId;
  req.traceId = span.traceId;
  req.requestId = requestId;
  req.spanId = span.spanId;

  // 6. Set Standard Response Headers
  res.setHeader('x-correlation-id', correlationId);
  res.setHeader('x-request-id', requestId);
  res.setHeader('x-trace-id', span.traceId);

  // 7. Intercept Response Completion
  res.on('finish', () => {
    const durationMs = Number((performance.now() - startNow).toFixed(2));
    const statusCode = res.statusCode;
    const isError = statusCode >= 400;

    // End span
    tracer.endSpan(span.spanId, isError ? 'error' : 'ok', isError ? { code: `HTTP_${statusCode}` } : undefined);

    // Record API metrics
    const routePattern = (req.route && req.route.path) ? String(req.route.path) : req.path;
    metrics.recordApiRequest(req.method, routePattern, statusCode, durationMs);

    // Structured Access Log
    const logContext = {
      correlationId,
      traceId: span.traceId,
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode,
      durationMs,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: (req as any).user?.id || (req as any).user?.userId,
    };

    if (statusCode >= 500) {
      logger.error(`HTTP Request Failed ${req.method} ${req.originalUrl} -> ${statusCode}`, logContext);
    } else if (statusCode >= 400) {
      logger.warn(`HTTP Client Warning ${req.method} ${req.originalUrl} -> ${statusCode}`, logContext);
    } else {
      logger.info(`HTTP Request Completed ${req.method} ${req.originalUrl} -> ${statusCode}`, logContext);
    }
  });

  next();
};
