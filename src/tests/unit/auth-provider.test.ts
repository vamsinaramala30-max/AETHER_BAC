import { describe, it, expect, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { DefaultAuthProvider } from '../../modules/ai/api/middleware/auth.js';
import { securityConfig } from '../../config/index.js';

describe('SEC-09: DefaultAuthProvider Security & Environment Boundary', () => {
  const originalEnv = process.env.NODE_ENV;
  const provider = new DefaultAuthProvider();

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('strictly rejects unauthenticated requests with no token in development mode', async () => {
    process.env.NODE_ENV = 'development';
    await expect(provider.authenticate({})).rejects.toThrow(/UNAUTHORIZED/);
  });

  it('strictly rejects x-user-id header spoofing in development mode', async () => {
    process.env.NODE_ENV = 'development';
    await expect(
      provider.authenticate({
        'x-user-id': 'spoofed-user-id',
        'x-user-roles': 'admin',
      }),
    ).rejects.toThrow(/UNAUTHORIZED/);
  });

  it('strictly rejects x-user-id header spoofing in production mode', async () => {
    process.env.NODE_ENV = 'production';
    await expect(
      provider.authenticate({
        'x-user-id': 'spoofed-user-id',
        'x-user-roles': 'superadmin',
      }),
    ).rejects.toThrow(/UNAUTHORIZED/);
  });

  it('strictly rejects invalid or forged JWT signatures in production mode', async () => {
    process.env.NODE_ENV = 'production';
    const fakeToken = jwt.sign({ id: 'fake-user-id' }, 'wrong-secret-key');

    await expect(
      provider.authenticate({
        authorization: `Bearer ${fakeToken}`,
      }),
    ).rejects.toThrow(/UNAUTHORIZED/);
  });

  it('successfully authenticates valid cryptographically signed JWT tokens in production', async () => {
    process.env.NODE_ENV = 'production';
    const validPayload = {
      id: 'd9999999-9999-4999-a999-999999999999',
      email: 'verified@aether.os',
      roles: ['user', 'admin'],
      permissions: ['*'],
      workspaceId: 'w1111111-1111-4111-a111-111111111111',
    };
    const validToken = jwt.sign(validPayload, securityConfig.jwt.secret, { expiresIn: '1h' });

    const context = await provider.authenticate({
      authorization: `Bearer ${validToken}`,
    });

    expect(context.userId).toBe(validPayload.id);
    expect(context.roles).toEqual(expect.arrayContaining(['user', 'admin']));
    expect(context.permissions).toEqual(['*']);
    expect(context.workspaceId).toBe(validPayload.workspaceId);
  });

  it('allows explicit test identity headers ONLY when NODE_ENV === test', async () => {
    process.env.NODE_ENV = 'test';
    const context = await provider.authenticate({
      'x-user-id': 'test-runner-id',
      'x-user-roles': 'tester',
      'x-user-permissions': 'read,write',
      'x-session-id': 'sess_test_123',
    });

    expect(context.userId).toBe('test-runner-id');
    expect(context.roles).toEqual(['tester']);
    expect(context.permissions).toEqual(['read', 'write']);
    expect(context.sessionId).toBe('sess_test_123');
  });
});
