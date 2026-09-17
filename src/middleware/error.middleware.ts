/**
 * AETHER AI — Error Handling Middleware (Prompt 9)
 * Maps all caught exceptions into the canonical 17-class error taxonomy.
 * Zero leakage of internal stack traces, DB connection strings, or passwords.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../modules/ai/observability/logger.js';
import { classifyError, CanonicalError } from '../modules/ai/observability/error-taxonomy.js';
import { metrics } from '../modules/ai/observability/metrics.js';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    errorCode: string = 'INTERNAL_ERROR',
    details?: unknown,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const errorHandler = (
  err: Error | AppError | unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const canonical: CanonicalError =
    err instanceof CanonicalError
      ? err
      : classifyError(err, {
          correlationId: req.correlationId,
          component: 'HTTP-Router',
          operation: `${req.method} ${req.path}`,
        });

  // Record error metric
  metrics.incrementCounter('request_errors_total', 1, {
    route: (req.route && req.route.path) ? String(req.route.path) : req.path,
    errorCode: canonical.code,
  });

  // Log structured error without sensitive data
  logger.error(`Unhandled API Error: [${canonical.code}] ${canonical.message}`, {
    correlationId: req.correlationId,
    traceId: req.traceId,
    requestId: req.requestId,
    errorCode: canonical.code,
    statusCode: canonical.statusCode,
    path: req.originalUrl || req.url,
    method: req.method,
  });

  res.status(canonical.statusCode).json({
    success: false,
    error: {
      code: canonical.code,
      message: canonical.message,
      retryable: canonical.retryable,
      correlationId: req.correlationId,
    },
  });
};
