import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { corsConfig } from '../../config/cors.js';

describe('SEC-06: CORS Security & Allowed Origins Hardening', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  it('allows request when origin is undefined (non-browser requests, mobile native, curl)', () => {
    let allowed: boolean | string | undefined;
    (corsConfig.origin as any)(undefined, (err: Error | null, allow?: boolean | string) => {
      expect(err).toBeNull();
      allowed = allow;
    });
    expect(allowed).toBe(true);
  });

  it('strictly rejects arbitrary .vercel.app malicious origins', () => {
    let allowed: boolean | string | undefined;
    (corsConfig.origin as any)(
      'https://malicious-attacker.vercel.app',
      (err: Error | null, allow?: boolean | string) => {
        expect(err).toBeNull();
        allowed = allow;
      },
    );
    expect(allowed).toBe(false);
  });

  it('strictly rejects unknown third-party web origins', () => {
    let allowed: boolean | string | undefined;
    (corsConfig.origin as any)(
      'https://evil-phishing-site.com',
      (err: Error | null, allow?: boolean | string) => {
        expect(err).toBeNull();
        allowed = allow;
      },
    );
    expect(allowed).toBe(false);
  });

  it('allows development localhost origins in non-production environments', () => {
    process.env.NODE_ENV = 'development';
    let allowed1: boolean | string | undefined;
    let allowed2: boolean | string | undefined;

    (corsConfig.origin as any)(
      'http://localhost:5173',
      (err: Error | null, allow?: boolean | string) => {
        expect(err).toBeNull();
        allowed1 = allow;
      },
    );
    (corsConfig.origin as any)(
      'http://127.0.0.1:5174',
      (err: Error | null, allow?: boolean | string) => {
        expect(err).toBeNull();
        allowed2 = allow;
      },
    );

    expect(allowed1).toBe(true);
    expect(allowed2).toBe(true);
  });

  it('rejects unconfigured localhost origins in strict production environment', () => {
    process.env.NODE_ENV = 'production';
    let allowed: boolean | string | undefined;
    (corsConfig.origin as any)(
      'http://localhost:9999',
      (err: Error | null, allow?: boolean | string) => {
        expect(err).toBeNull();
        allowed = allow;
      },
    );
    expect(allowed).toBe(false);
  });

  it('enforces credentials support and safe preflight configuration', () => {
    expect(corsConfig.credentials).toBe(true);
    expect(corsConfig.methods).toEqual(
      expect.arrayContaining(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']),
    );
    expect(corsConfig.maxAge).toBe(86400);
  });

  it('includes distributed tracing, session, and idempotency headers in allowedHeaders', () => {
    const headers = (corsConfig.allowedHeaders as string[]).map((h) => h.toLowerCase());
    expect(headers).toContain('x-correlation-id');
    expect(headers).toContain('traceparent');
    expect(headers).toContain('idempotency-key');
    expect(headers).toContain('x-workspace-id');
    expect(headers).toContain('authorization');
  });

  it('exposes correlation and rate limiting headers in exposedHeaders', () => {
    const exposed = (corsConfig.exposedHeaders as string[]).map((h) => h.toLowerCase());
    expect(exposed).toContain('x-correlation-id');
    expect(exposed).toContain('traceparent');
    expect(exposed).toContain('x-ratelimit-remaining');
  });
});
