import { logger } from '../../../config';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  retryableErrors?: Array<string | RegExp>;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 200,
  maxDelayMs: 3000,
  backoffFactor: 2,
  retryableErrors: [],
};

export async function withRetry<T>(
  operationName: string,
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let attempt = 0;
  let delay = config.initialDelayMs;

  while (true) {
    try {
      attempt++;
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt > config.maxRetries;
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (isLastAttempt) {
        logger.error(
          `[RetryUtil] Operation '${operationName}' failed after ${attempt} attempts: ${errorMessage}`,
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
