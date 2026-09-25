/**
 * AETHER AI — Canonical Error Taxonomy & Mapping (Prompt 9)
 * Authoritative 17-class error taxonomy and operational failure classification.
 *
 * Rules:
 * - Maps all errors to safe structured representations.
 * - Never leaks internal stack traces or database errors to external users.
 * - Maps every failure to code, message, severity, retryable, correlationId, component, operation.
 */

import type { ObservabilitySeverity } from './observability-types.js';

export type CanonicalErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'TENANT_ISOLATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'TRANSIENT_FAILURE'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'MODEL_UNAVAILABLE'
  | 'RAG_FAILURE'
  | 'MEMORY_FAILURE'
  | 'TOOL_FAILURE'
  | 'VERIFICATION_FAILURE'
  | 'CANCELLED'
  | 'INTERNAL_ERROR';

export interface StructuredErrorDetails {
  readonly code: CanonicalErrorCode;
  readonly message: string;
  readonly severity: ObservabilitySeverity;
  readonly retryable: boolean;
  readonly correlationId?: string;
  readonly component?: string;
  readonly operation?: string;
  readonly statusCode: number;
}

export class CanonicalError extends Error {
  public readonly code: CanonicalErrorCode;
  public readonly severity: ObservabilitySeverity;
  public readonly retryable: boolean;
  public readonly correlationId?: string;
  public readonly component?: string;
  public readonly operation?: string;
  public readonly statusCode: number;

  constructor(details: StructuredErrorDetails) {
    super(details.message);
    this.name = `CanonicalError[${details.code}]`;
    this.code = details.code;
    this.severity = details.severity;
    this.retryable = details.retryable;
    this.correlationId = details.correlationId;
    this.component = details.component;
    this.operation = details.operation;
    this.statusCode = details.statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public get httpStatus(): number {
    return this.statusCode;
  }

  public toSafeJSON(): Record<string, unknown> {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryable,
        correlationId: this.correlationId,
      },
    };
  }
}

export class StandardError extends CanonicalError {
  constructor(code: CanonicalErrorCode, message: string, statusCode = 500, retryable?: boolean) {
    const isRetryable =
      retryable !== undefined
        ? retryable
        : ['RATE_LIMITED', 'TIMEOUT', 'TRANSIENT_FAILURE', 'DEPENDENCY_UNAVAILABLE', 'MODEL_UNAVAILABLE'].includes(code);

    super({
      code,
      message,
      statusCode,
      retryable: isRetryable,
      severity: statusCode >= 500 ? 'ERROR' : 'WARN',
    });
  }
}

export class ErrorTaxonomy {
  /**
   * Classifies any arbitrary error into the authoritative 17-class taxonomy.
   */
  public static classify(
    err: unknown,
    context?: {
      correlationId?: string;
      component?: string;
      operation?: string;
    },
  ): CanonicalError {
    if (err instanceof CanonicalError) {
      return err;
    }

    const rawMessage = err instanceof Error ? err.message : String(err ?? 'Unknown internal failure');
    const lowerMessage = rawMessage.toLowerCase();
    const rawCode = (err as any)?.errorCode
      ? String((err as any).errorCode).toUpperCase()
      : (err as any)?.code
        ? String((err as any).code).toUpperCase()
        : '';
    const explicitStatus =
      typeof (err as any)?.statusCode === 'number'
        ? (err as any).statusCode
        : typeof (err as any)?.status === 'number'
          ? (err as any).status
          : undefined;

    // 1. TIMEOUT
    if (
      explicitStatus === 504 ||
      explicitStatus === 408 ||
      lowerMessage.includes('timeout') ||
      lowerMessage.includes('timed out') ||
      rawCode === 'TIMEOUT' ||
      rawCode === 'ETIMEDOUT'
    ) {
      return new CanonicalError({
        code: 'TIMEOUT',
        message: 'Operation timed out.',
        severity: 'WARN',
        retryable: true,
        correlationId: context?.correlationId,
        component: context?.component ?? 'Core',
        operation: context?.operation ?? 'Unknown',
        statusCode: 504,
      });
    }

    // 2. CANCELLED
    if (
      explicitStatus === 499 ||
      lowerMessage.includes('cancelled') ||
      lowerMessage.includes('canceled') ||
      lowerMessage.includes('aborted') ||
      rawCode === 'CANCELLED'
    ) {
      return new CanonicalError({
        code: 'CANCELLED',
        message: 'Operation was cancelled.',
        severity: 'INFO',
        retryable: false,
        correlationId: context?.correlationId,
        component: context?.component ?? 'Core',
        operation: context?.operation ?? 'Unknown',
        statusCode: 499,
      });
    }

    // 3. TENANT_ISOLATION_ERROR
    if (
      lowerMessage.includes('tenant') ||
      lowerMessage.includes('cross-tenant') ||
      lowerMessage.includes('cross-user') ||
      rawCode === 'TENANT_VIOLATION' ||
      rawCode === 'TENANT_ISOLATION_ERROR'
    ) {
      return new CanonicalError({
        code: 'TENANT_ISOLATION_ERROR',
        message: 'Cross-tenant or unauthorized entity boundary access denied.',
        severity: 'ERROR',
        retryable: false,
        correlationId: context?.correlationId,
        component: context?.component ?? 'Security',
        operation: context?.operation ?? 'Unknown',
        statusCode: 403,
      });
    }

    // 4. AUTHORIZATION_ERROR (HTTP 403)
    if (
      explicitStatus === 403 ||
      lowerMessage.includes('forbidden') ||
      lowerMessage.includes('permission denied') ||
      lowerMessage.includes('not authorized') ||
      lowerMessage.includes('access denied') ||
      rawCode === 'FORBIDDEN' ||
      rawCode === 'AUTHORIZATION' ||
      rawCode === 'AUTHORIZATION_ERROR'
    ) {
      return new CanonicalError({
        code: 'AUTHORIZATION_ERROR',
        message: 'You do not have permission to perform this action.',
        severity: 'WARN',
        retryable: false,
        correlationId: context?.correlationId,
        component: context?.component ?? 'Auth',
        operation: context?.operation ?? 'Unknown',
        statusCode: 403,
      });
    }

    // 5. AUTHENTICATION_ERROR (HTTP 401)
    if (
      explicitStatus === 401 ||
      lowerMessage.includes('unauthorized') ||
      lowerMessage.includes('unauthenticated') ||
      lowerMessage.includes('jwt') ||
      lowerMessage.includes('refresh token') ||
      rawCode === 'UNAUTHORIZED' ||
      rawCode === 'AUTHENTICATION_ERROR' ||
      rawCode === 'INVALID_REFRESH_TOKEN' ||
      rawCode === 'TOKEN_EXPIRED' ||
      rawCode === 'INVALID_TOKEN' ||
      rawCode === 'REFRESH_TOKEN_REQUIRED' ||
      rawCode === 'INVALID_CREDENTIALS' ||
      rawCode === 'OAUTH_ACCOUNT' ||
      rawCode.includes('AUTH')
    ) {
      return new CanonicalError({
        code: 'AUTHENTICATION_ERROR',
        message:
          rawMessage.length < 200 && !rawMessage.toLowerCase().includes('password') && !rawMessage.toLowerCase().includes('secret')
            ? rawMessage
            : 'Authentication is required to perform this action.',
        severity: 'WARN',
        retryable: false,
        correlationId: context?.correlationId,
        component: context?.component ?? 'Auth',
        operation: context?.operation ?? 'Unknown',
        statusCode: 401,
      });
    }

    // 6. VALIDATION_ERROR
    if (
      explicitStatus === 400 ||
      lowerMessage.includes('validation') ||
      lowerMessage.includes('invalid input') ||
      lowerMessage.includes('invalid parameter') ||
      lowerMessage.includes('schema') ||
      rawCode === 'VALIDATION_ERROR' ||
      rawCode === 'INVALID_REQUEST' ||
      rawCode === 'INVALID_INPUT'
    ) {
      return new CanonicalError({
        code: 'VALIDATION_ERROR',
        message: rawMessage.length < 200 ? rawMessage : 'Request parameters failed validation.',
        severity: 'WARN',
        retryable: false,
        correlationId: context?.correlationId,
        component: context?.component ?? 'Validation',
        operation: context?.operation ?? 'Unknown',
        statusCode: 400,
      });
    }

    // 7. NOT_FOUND
    if (
      explicitStatus === 404 ||
      lowerMessage.includes('not found') ||
      rawCode === 'NOT_FOUND' ||
      rawCode === 'USER_NOT_FOUND'
    ) {
      return new CanonicalError({
        code: 'NOT_FOUND',
        message: rawMessage.length < 200 ? rawMessage : 'Requested resource was not found.',
        severity: 'INFO',
        retryable: false,
        correlationId: context?.correlationId,
        component: context?.component ?? 'Repository',
        operation: context?.operation ?? 'Unknown',
        statusCode: 404,
      });
    }

    // 8. CONFLICT
    if (
      explicitStatus === 409 ||
      lowerMessage.includes('conflict') ||
      lowerMessage.includes('already exists') ||
      rawCode === 'CONFLICT' ||
      rawCode === 'USER_EXISTS'
    ) {
      return new CanonicalError({
        code: 'CONFLICT',
        message: rawMessage.length < 200 ? rawMessage : 'A conflicting operation is already in progress or state conflict occurred.',
        severity: 'WARN',
        retryable: false,
        correlationId: context?.correlationId,
        component: context?.component ?? 'State',
        operation: context?.operation ?? 'Unknown',
        statusCode: 409,
      });
    }

    // 9. RATE_LIMITED
    if (
      explicitStatus === 429 ||
      lowerMessage.includes('rate limit') ||
      lowerMessage.includes('too many requests') ||
      rawCode === 'RATE_LIMITED' ||
      rawCode === 'RATE_LIMIT'
    ) {
      return new CanonicalError({
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded. Please retry after some time.',
        severity: 'WARN',
        retryable: true,
        correlationId: context?.correlationId,
        component: context?.component ?? 'RateLimit',
        operation: context?.operation ?? 'Unknown',
        statusCode: 429,
      });
    }

    // 10. MODEL_UNAVAILABLE
    if (
      lowerMessage.includes('model unavailable') ||
      lowerMessage.includes('provider unavailable') ||
      lowerMessage.includes('blocked_by_weights') ||
      lowerMessage.includes('blocked by trained model weights') ||
      (lowerMessage.includes('5002') && (lowerMessage.includes('econnrefused') || rawCode === 'ECONNREFUSED')) ||
      rawCode === 'MODEL_UNAVAILABLE' ||
      rawCode === 'PROVIDER_UNAVAILABLE' ||
      rawCode === 'BLOCKED_BY_WEIGHTS'
    ) {
      return new CanonicalError({
        code: 'MODEL_UNAVAILABLE',
        message: 'AI inference model is currently unavailable.',
        severity: 'ERROR',
        retryable: true,
        correlationId: context?.correlationId,
        component: context?.component ?? 'Model',
        operation: context?.operation ?? 'Unknown',
        statusCode: 503,
      });
    }

    // 11. RAG_FAILURE
    if (
      lowerMessage.includes('rag') ||
      lowerMessage.includes('embedding') ||
      lowerMessage.includes('retrieval failed') ||
      rawCode === 'RAG_FAILED' ||
      rawCode === 'EMBEDDING_FAILED' ||
      rawCode === 'RETRIEVAL_FAILED'
    ) {
      return new CanonicalError({
        code: 'RAG_FAILURE',
        message: 'Knowledge retrieval pipeline encountered an error.',
        severity: 'ERROR',
        retryable: true,
        correlationId: context?.correlationId,
        component: context?.component ?? 'RAG',
        operation: context?.operation ?? 'Unknown',
        statusCode: 502,
      });
    }

    // 12. MEMORY_FAILURE
    if (
      lowerMessage.includes('memory') ||
      rawCode === 'MEMORY_FAILED'
    ) {
      return new CanonicalError({
        code: 'MEMORY_FAILURE',
        message: 'Persistent or working memory operation encountered an error.',
        severity: 'ERROR',
        retryable: true,
        correlationId: context?.correlationId,
        component: context?.component ?? 'Memory',
        operation: context?.operation ?? 'Unknown',
        statusCode: 500,
      });
    }

    // 13. TOOL_FAILURE
    if (
      lowerMessage.includes('tool execution') ||
      lowerMessage.includes('tool error') ||
      rawCode === 'TOOL_FAILURE' ||
      rawCode === 'TOOL_FAILED'
    ) {
      return new CanonicalError({
        code: 'TOOL_FAILURE',
        message: 'Tool execution failed.',
        severity: 'ERROR',
        retryable: false,
        correlationId: context?.correlationId,
        component: context?.component ?? 'Tools',
        operation: context?.operation ?? 'Unknown',
        statusCode: 500,
      });
    }

    // 14. VERIFICATION_FAILURE
    if (
      explicitStatus === 422 ||
      lowerMessage.includes('verification') ||
      rawCode === 'VERIFICATION_FAILURE' ||
      rawCode === 'VERIFICATION_FAILED'
    ) {
      return new CanonicalError({
        code: 'VERIFICATION_FAILURE',
        message: 'State verification check failed for the action.',
        severity: 'ERROR',
        retryable: false,
        correlationId: context?.correlationId,
        component: context?.component ?? 'Verification',
        operation: context?.operation ?? 'Unknown',
        statusCode: 422,
      });
    }

    // 15. DEPENDENCY_UNAVAILABLE
    if (
      lowerMessage.includes('econnrefused') ||
      lowerMessage.includes('connection refused') ||
      lowerMessage.includes('database down') ||
      lowerMessage.includes('redis down') ||
      rawCode === 'DEPENDENCY_UNAVAILABLE' ||
      rawCode === 'ECONNREFUSED'
    ) {
      return new CanonicalError({
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'A required backend dependency is unavailable.',
        severity: 'FATAL',
        retryable: true,
        correlationId: context?.correlationId,
        component: context?.component ?? 'Infrastructure',
        operation: context?.operation ?? 'Unknown',
        statusCode: 503,
      });
    }

    // 16. TRANSIENT_FAILURE
    if (
      lowerMessage.includes('network') ||
      lowerMessage.includes('temporary') ||
      lowerMessage.includes('transient') ||
      lowerMessage.includes('econnreset') ||
      rawCode === 'TRANSIENT_FAILURE' ||
      rawCode === 'NETWORK_ERROR' ||
      rawCode === 'ECONNRESET'
    ) {
      return new CanonicalError({
        code: 'TRANSIENT_FAILURE',
        message: 'A transient network or operational failure occurred. Retryable.',
        severity: 'WARN',
        retryable: true,
        correlationId: context?.correlationId,
        component: context?.component ?? 'Core',
        operation: context?.operation ?? 'Unknown',
        statusCode: 503,
      });
    }

    // 17. INTERNAL_ERROR (Default fallback)
    return new CanonicalError({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected internal error occurred.',
      severity: 'ERROR',
      retryable: false,
      correlationId: context?.correlationId,
      component: context?.component ?? 'Core',
      operation: context?.operation ?? 'Unknown',
      statusCode: 500,
    });
  }
}

export const classifyError = (
  err: unknown,
  context?: { correlationId?: string; component?: string; operation?: string },
): CanonicalError => ErrorTaxonomy.classify(err, context);
