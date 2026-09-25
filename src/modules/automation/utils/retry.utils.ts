import { logger } from '../../../config';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  retryableErrors?: Array<string | RegExp>;
  abortSignal?: AbortSignal;
}

const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'abortSignal'>> = {
  maxRetries: 3,
  initialDelayMs: 200,
  maxDelayMs: 3000,
  backoffFactor: 2,
  retryableErrors: [],
};

const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404, 409, 422]);
const NON_RETRYABLE_CODES = new Set([
  'VALIDATION_ERROR',
  'AUTHENTICATION_ERROR',
  'AUTHORIZATION_ERROR',
  'TENANT_ISOLATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_ID',
  'AUTOMATION_NOT_FOUND',
  'AUTOMATION_DISABLED',
  'AUTOMATION_PAUSED',
]);

/**
 * Determines whether a failure is transient and eligible for bounded retry.
 * Permanent errors (validation, auth, permissions, 404s, conflicts) are never retried.
 */
export function isRetryableError(
  error: unknown,
  allowedPatterns?: Array<string | RegExp>,
): boolean {
  if (!error) return false;

  // 1. Check explicit retryable flag from CanonicalError or AppError
  if (typeof (error as any).retryable === 'boolean' && (error as any).retryable === false) {
    return false;
  }

  // 2. Check HTTP status codes
  const status = (error as any).statusCode || (error as any).status;
  if (typeof status === 'number' && NON_RETRYABLE_STATUS_CODES.has(status)) {
    return false;
  }

  // 3. Check canonical error code
  const code = (error as any).code || (error as any).errorCode;
  if (typeof code === 'string' && NON_RETRYABLE_CODES.has(code.toUpperCase())) {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  const lowerMsg = message.toLowerCase();

  // 4. Check non-retryable message hints
  if (
    lowerMsg.includes('validation') ||
    lowerMsg.includes('unauthorized') ||
    lowerMsg.includes('forbidden') ||
    lowerMsg.includes('permission denied') ||
    lowerMsg.includes('not found') ||
    lowerMsg.includes('already running') ||
    lowerMsg.includes('already exists')
  ) {
    return false;
  }

  // 5. If specific retryable patterns are configured, check against them
  if (allowedPatterns && allowedPatterns.length > 0) {
    return allowedPatterns.some((pattern) => {
      if (typeof pattern === 'string') {
        return message.includes(pattern) || (typeof code === 'string' && code.includes(pattern));
      }
      return pattern.test(message) || (typeof code === 'string' && pattern.test(code));
    });
  }

  // Default: transient/unexpected failures are retryable
  return true;
}

export async function withRetry<T>(
  operationName: string,
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const boundedMaxRetries = Math.min(Math.max(options?.maxRetries ?? DEFAULT_RETRY_OPTIONS.maxRetries, 0), 5);
  const config = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
    maxRetries: boundedMaxRetries,
  };

  let attempt = 0;
  let delay = config.initialDelayMs;

  while (true) {
    if (config.abortSignal?.aborted) {
      throw new Error(`Operation '${operationName}' was cancelled before completion.`);
    }

    try {
      attempt++;
      return await fn();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRetryable = isRetryableError(error, config.retryableErrors);

      // If error is permanent/non-retryable, abort immediately without wasting attempts
      if (!isRetryable) {
        logger.warn(
          `[RetryUtil] Operation '${operationName}' failed with non-retryable error: ${errorMessage}. Halting retries.`,
        );
        throw error;
      }

      const isLastAttempt = attempt > config.maxRetries;

      if (isLastAttempt) {
        logger.error(
          `[RetryUtil] Operation '${operationName}' failed after exhausting ${attempt} attempts: ${errorMessage}`,
          { error },
        );
        throw error;
      }

      logger.warn(
        `[RetryUtil] Operation '${operationName}' failed (attempt ${attempt}/${config.maxRetries}). Retrying in ${delay}ms... Error: ${errorMessage}`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * config.backoffFactor, config.maxDelayMs);
    }
  }
}

