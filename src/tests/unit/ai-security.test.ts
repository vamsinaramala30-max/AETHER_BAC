import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { Express } from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { aiRoutes } from '../../routes/ai.routes.js';
import { securityConfig } from '../../config/index.js';

describe('SEC-07: AI Route Classification & Authentication Enforcement', () => {
  let app: Express;
  let server: http.Server;
  let baseUrl: string;
  let validToken: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/ai', aiRoutes);

    // Global error handler
    app.use((err: any, req: any, res: any, next: any) => {
      res.status(err.statusCode || 500).json({ error: err.message });
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}/api/v1/ai`;
        resolve();
      });
    });

    validToken = jwt.sign(
      {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'tester@aether.internal',
        role: 'USER',
      },
      securityConfig.jwt.secret,
      { expiresIn: '1h' },
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('Public Operational Endpoints (Accessible without auth)', () => {
    it('allows unauthenticated access to /health', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json).toHaveProperty('status');
    });

    it('allows unauthenticated access to /providers/status', async () => {
      const res = await fetch(`${baseUrl}/providers/status`);
      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
    });

    it('allows unauthenticated access to /models', async () => {
      const res = await fetch(`${baseUrl}/models`);
      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
    });
  });

  describe('Protected Operational Endpoints (Reject unauthenticated callers with 401)', () => {
    it('rejects unauthenticated POST /chat with 401 UNAUTHORIZED', async () => {
      const res = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello AI' }),
      });
      expect(res.status).toBe(401);
      const json = await res.json() as any;
      expect(json.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects unauthenticated POST /stream with 401 UNAUTHORIZED', async () => {
      const res = await fetch(`${baseUrl}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Stream request' }),
      });
      expect(res.status).toBe(401);
      const json = await res.json() as any;
      expect(json.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects unauthenticated POST /prompt with 401 UNAUTHORIZED', async () => {
      const res = await fetch(`${baseUrl}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: 'test' }),
      });
      expect(res.status).toBe(401);
      const json = await res.json() as any;
      expect(json.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects unauthenticated POST /plans with 401 UNAUTHORIZED', async () => {
      const res = await fetch(`${baseUrl}/plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: 'Launch product' }),
      });
      expect(res.status).toBe(401);
      const json = await res.json() as any;
      expect(json.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects unauthenticated GET /plans/any-id with 401 UNAUTHORIZED', async () => {
      const res = await fetch(`${baseUrl}/plans/plan-123`);
      expect(res.status).toBe(401);
      const json = await res.json() as any;
      expect(json.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects unauthenticated POST /agent/execute with 401 UNAUTHORIZED', async () => {
      const res = await fetch(`${baseUrl}/agent/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: 'plan-123' }),
      });
      expect(res.status).toBe(401);
      const json = await res.json() as any;
      expect(json.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects unauthenticated GET /memory with 401 UNAUTHORIZED', async () => {
      const res = await fetch(`${baseUrl}/memory`);
      expect(res.status).toBe(401);
      const json = await res.json() as any;
      expect(json.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects unauthenticated GET /conversations with 401 UNAUTHORIZED', async () => {
      const res = await fetch(`${baseUrl}/conversations`);
      expect(res.status).toBe(401);
      const json = await res.json() as any;
      expect(json.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects unauthenticated GET /tools with 401 UNAUTHORIZED', async () => {
      const res = await fetch(`${baseUrl}/tools`);
      expect(res.status).toBe(401);
      const json = await res.json() as any;
      expect(json.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects unauthenticated POST /tools/execute with 401 UNAUTHORIZED', async () => {
      const res = await fetch(`${baseUrl}/tools/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName: 'web_search', input: {} }),
      });
      expect(res.status).toBe(401);
      const json = await res.json() as any;
      expect(json.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Authenticated Operational Access', () => {
    it('allows authenticated caller with valid JWT to proceed past auth middleware', async () => {
      const res = await fetch(`${baseUrl}/conversations`, {
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });
      // Should not be 401
      expect(res.status).not.toBe(401);
    });
  });
});
