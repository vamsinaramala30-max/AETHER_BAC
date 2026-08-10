/**
 * AETHER AI — Structured Logger
 * Safe structured logging system.
 * SECURITY: Automatically redacts private conversation text, tokens, and secrets.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  readonly [key: string]: unknown;
}

export interface LoggerOptions {
  readonly minLevel?: LogLevel;
  readonly component?: string;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

export class Logger {
  private readonly minLevel: LogLevel;
  private readonly component: string;

  constructor(options: LoggerOptions = {}) {
    this.minLevel = options.minLevel ?? 'info';
    this.component = options.component ?? 'AETHER-AI';
  }

  public child(component: string): Logger {
    return new Logger({
      minLevel: this.minLevel,
      component: `${this.component}:${component}`,
    });
  }

  public debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  public info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  public warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  public error(message: string, context?: LogContext, error?: Error): void {
    const errorContext: LogContext = {
      ...context,
      ...(error ? { errorMessage: error.message, errorName: error.name } : {}),
    };
    this.log('error', message, errorContext);
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) {
      return;
    }

    const sanitizedContext = context ? this.sanitizeContext(context) : {};
    const payload = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      component: this.component,
      message,
      ...sanitizedContext,
    };

    const formatted = JSON.stringify(payload);
    if (level === 'error') {
      console.error(formatted);
    } else if (level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }

  /**
   * Redacts private user content and sensitive metadata keys.
   */
  private sanitizeContext(context: LogContext): LogContext {
    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = new Set([
      'apikey',
      'token',
      'password',
      'secret',
      'authorization',
      'prompt',
      'content',
      'message',
      'usertext',
      'rawcontent',
    ]);

    for (const [key, value] of Object.entries(context)) {
      if (sensitiveKeys.has(key.toLowerCase())) {
        sanitized[key] = '[REDACTED_PRIVATE_CONTENT]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = '[OBJECT]';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
}

export const logger = new Logger();
