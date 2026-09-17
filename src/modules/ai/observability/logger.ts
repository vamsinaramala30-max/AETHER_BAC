/**
 * AETHER AI — Structured Logger (Prompt 9)
 * Authoritative production logging system integrated with Winston.
 *
 * Rules:
 * - Emits strictly structured JSON logs.
 * - Automatically redacts all sensitive fields and credentials recursively.
 * - Strips all private Chain-of-Thought (CoT) and deliberation content.
 * - Preserves correlationId, traceId, executionId, planId across calls.
 * - Severity levels: DEBUG, INFO, WARN, ERROR, FATAL.
 */

import { logger as winstonLogger } from '../../../config/logger.js';
import { DataSanitizer } from './sanitizer.js';
import type { ObservabilitySeverity } from './observability-types.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  readonly correlationId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly userId?: string;
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly conversationId?: string;
  readonly planId?: string;
  readonly executionId?: string;
  readonly stepId?: string;
  readonly toolName?: string;
  readonly durationMs?: number;
  readonly status?: string;
  readonly errorCode?: string;
  readonly event?: string;
  readonly [key: string]: unknown;
}

export interface LoggerOptions {
  readonly minLevel?: LogLevel;
  readonly component?: string;
  readonly defaultContext?: LogContext;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

export class StructuredLogger {
  private readonly minLevel: LogLevel;
  private readonly component: string;
  private readonly defaultContext: LogContext;

  constructor(options: LoggerOptions = {}) {
    const envLogLevel = (process.env['LOG_LEVEL']?.toLowerCase() as LogLevel) || 'info';
    this.minLevel = options.minLevel ?? (LEVEL_PRIORITY[envLogLevel] ? envLogLevel : 'info');
    this.component = options.component ?? 'AETHER-CORE';
    this.defaultContext = options.defaultContext ?? {};
  }

  public child(subComponent: string, context?: LogContext): StructuredLogger {
    return new StructuredLogger({
      minLevel: this.minLevel,
      component: `${this.component}:${subComponent}`,
      defaultContext: { ...this.defaultContext, ...context },
    });
  }

  public withContext(context: LogContext): StructuredLogger {
    return new StructuredLogger({
      minLevel: this.minLevel,
      component: this.component,
      defaultContext: { ...this.defaultContext, ...context },
    });
  }

  public debug(message: string, context?: LogContext): void {
    this.write('debug', message, context);
  }

  public info(message: string, context?: LogContext): void {
    this.write('info', message, context);
  }

  public warn(message: string, context?: LogContext): void {
    this.write('warn', message, context);
  }

  public error(message: string, context?: LogContext, error?: Error): void {
    const errorDetails = error
      ? {
          errorMessage: error.message,
          errorName: error.name,
          errorCode: (error as any).code,
        }
      : {};
    this.write('error', message, { ...errorDetails, ...context });
  }

  public fatal(message: string, context?: LogContext, error?: Error): void {
    const errorDetails = error
      ? {
          errorMessage: error.message,
          errorName: error.name,
          errorCode: (error as any).code,
        }
      : {};
    this.write('fatal', message, { ...errorDetails, ...context });
  }

  private write(level: LogLevel, message: string, context?: LogContext): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) {
      return;
    }

    const mergedContext = {
      ...this.defaultContext,
      ...(context ?? {}),
    };

    // Strip private Chain-of-Thought deliberation completely
    const cotStripped = DataSanitizer.stripCoT(mergedContext) as Record<string, unknown>;

    // Recursively redact all sensitive tokens, passwords, keys
    const sanitized = DataSanitizer.sanitize(cotStripped) as Record<string, unknown>;

    const logEntry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase() as ObservabilitySeverity,
      component: this.component,
      message: DataSanitizer.sanitizeString(message),
      ...sanitized,
    };

    // Forward to Winston transport
    const formatted = JSON.stringify(logEntry);
    if (level === 'fatal' || level === 'error') {
      winstonLogger.error(formatted);
    } else if (level === 'warn') {
      winstonLogger.warn(formatted);
    } else if (level === 'info') {
      winstonLogger.info(formatted);
    } else {
      winstonLogger.debug(formatted);
    }
  }
}

// Global authoritative instances
export const structuredLogger = new StructuredLogger();
export const logger = structuredLogger;
export { StructuredLogger as Logger };
