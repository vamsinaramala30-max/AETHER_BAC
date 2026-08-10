/**
 * AETHER AI — Safe Error Handler Middleware
 * Formats errors into safe client responses without exposing internal stack traces,
 * secrets, private memory, or sensitive internal system file paths.
 */

import { isAetherAIError } from '../../ai-errors.js';

export interface SafeErrorResponse {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export function handleAPIError(err: unknown): SafeErrorResponse {
  if (isAetherAIError(err)) {
    return {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    };
  }

  if (err instanceof Error) {
    // Sanitize non-Aether errors to avoid exposing internal details/paths/stacks
    const isAuth = err.message.includes('UNAUTHORIZED') || err.message.includes('Forbidden');
    const code = isAuth ? 'UNAUTHORIZED' : 'INTERNAL_ERROR';
    const safeMsg = isAuth ? err.message : 'An internal AI processing error occurred.';

    return {
      success: false,
      error: {
        code,
        message: safeMsg,
      },
    };
  }

  return {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected AI system error occurred.',
    },
  };
}
