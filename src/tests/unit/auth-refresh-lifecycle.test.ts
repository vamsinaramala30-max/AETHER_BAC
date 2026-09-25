import { describe, it, expect } from 'vitest';
import { AppError } from '../../middleware/error.middleware.js';
import { classifyError } from '../../modules/ai/observability/error-taxonomy.js';

describe('Auth Refresh & Error Taxonomy Invariants', () => {
  it('classifies AppError(401, INVALID_REFRESH_TOKEN) as AUTHENTICATION_ERROR with HTTP 401', () => {
    const error = new AppError('Refresh token is expired or invalid', 401, 'INVALID_REFRESH_TOKEN');
    const canonical = classifyError(error);

    expect(canonical.statusCode).toBe(401);
    expect(canonical.code).toBe('AUTHENTICATION_ERROR');
    expect(canonical.message).toBe('Refresh token is expired or invalid');
    expect(canonical.retryable).toBe(false);
  });

  it('preserves client error status codes rather than falling back to INTERNAL_ERROR 500', () => {
    const forbidden = new AppError('Insufficient permissions', 403, 'FORBIDDEN');
    const canonicalForbidden = classifyError(forbidden);
    expect(canonicalForbidden.statusCode).toBe(403);
    expect(canonicalForbidden.code).toBe('AUTHORIZATION_ERROR');

    const badRequest = new AppError('Missing refreshToken parameter', 400, 'BAD_REQUEST');
    const canonicalBad = classifyError(badRequest);
    expect(canonicalBad.statusCode).toBe(400);
    expect(canonicalBad.code).toBe('VALIDATION_ERROR');

    const notFound = new AppError('User not found', 404, 'NOT_FOUND');
    const canonicalNotFound = classifyError(notFound);
    expect(canonicalNotFound.statusCode).toBe(404);
    expect(canonicalNotFound.code).toBe('NOT_FOUND');

    const conflict = new AppError('User already exists', 409, 'CONFLICT');
    const canonicalConflict = classifyError(conflict);
    expect(canonicalConflict.statusCode).toBe(409);
    expect(canonicalConflict.code).toBe('CONFLICT');
  });

  it('classifies generic unhandled errors as INTERNAL_ERROR 500 without leaking sensitive messages', () => {
    const internalErr = new Error('Database connection failed at postgres://user:secret@localhost:5432/db');
    const canonical = classifyError(internalErr);

    expect(canonical.statusCode).toBe(500);
    expect(canonical.code).toBe('INTERNAL_ERROR');
    // Sensitive DB string must not be leaked
    expect(canonical.message).not.toContain('postgres://');
    expect(canonical.message).not.toContain('secret');
  });
});
