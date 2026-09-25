import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { authenticate } from '../../middleware/auth.middleware.js';
import { securityConfig } from '../../config/index.js';
import { db } from '../../database/client.js';

describe('SEC-08: Workspace Authorization & Tenant Boundary Enforcement', () => {
  const validUserId = '11111111-1111-4111-8111-111111111111';
  const validWorkspaceId = '33333333-3333-4333-8333-333333333333';
  const foreignWorkspaceId = '99999999-9999-4999-8999-999999999999';

  let validToken: string;

  beforeEach(() => {
    vi.restoreAllMocks();
    validToken = jwt.sign(
      {
        id: validUserId,
        email: 'tester@aether.internal',
        role: 'USER',
      },
      securityConfig.jwt.secret,
      { expiresIn: '1h' },
    );
  });

  it('rejects requests missing Bearer authorization token with 401 UNAUTHORIZED', async () => {
    const req = {
      headers: {},
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('allows valid authenticated user without x-workspace-id header', async () => {
    const req = {
      headers: {
        authorization: `Bearer ${validToken}`,
      },
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe(validUserId);
    expect(req.user.workspaceId).toBeUndefined();
  });

  it('rejects malformed non-UUID x-workspace-id header with 400 INVALID_WORKSPACE_ID', async () => {
    const req = {
      headers: {
        authorization: `Bearer ${validToken}`,
        'x-workspace-id': 'malicious-workspace-injection-string',
      },
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'INVALID_WORKSPACE_ID' }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects x-workspace-id when caller is not a member of the workspace with 403 FORBIDDEN_WORKSPACE', async () => {
    vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue(null as any);

    const req = {
      headers: {
        authorization: `Bearer ${validToken}`,
        'x-workspace-id': foreignWorkspaceId,
      },
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'FORBIDDEN_WORKSPACE' }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('binds validated workspaceId to req.user when caller is confirmed active workspace member', async () => {
    vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({
      id: 'wm-valid-record',
      workspaceId: validWorkspaceId,
      userId: validUserId,
      role: 'ADMIN',
    } as any);

    const req = {
      headers: {
        authorization: `Bearer ${validToken}`,
        'x-workspace-id': validWorkspaceId,
      },
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user.workspaceId).toBe(validWorkspaceId);
  });
});
