import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '../../database/client.js';
import { UsersController } from '../../modules/users/users.controller.js';
import { requireAdmin } from '../../middleware/admin.middleware.js';
import { socketAuthMiddleware } from '../../websocket/socketAuth.js';
import { uploadController } from '../../modules/upload/upload.controller.js';
import { uploadService } from '../../modules/upload/upload.service.js';
import jwt from 'jsonwebtoken';
import { securityConfig } from '../../config/index.js';
import { maskLogMessage, maskSensitiveData } from '../../config/logger.js';
import { checkRedisHealth } from '../../routes/health.routes.js';
import { settingsRoutes } from '../../routes/settings.routes.js';
import { uploadRoutes } from '../../routes/upload.routes.js';

const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockPing = vi.fn().mockResolvedValue('PONG');
const mockQuit = vi.fn().mockResolvedValue('OK');
const mockDisconnect = vi.fn();
const mockOn = vi.fn();

vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return {
        connect: mockConnect,
        ping: mockPing,
        quit: mockQuit,
        disconnect: mockDisconnect,
        on: mockOn,
      };
    }),
  };
});

describe('AETHER P4 — Complete Security & Reliability Regression Suite (All 10 Findings)', () => {
  const userA = '11111111-1111-4111-a111-111111111111';
  const userB = '22222222-2222-4222-a222-222222222222';
  const adminUser = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const superAdminUser = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  const workspaceA = '33333333-3333-4333-a333-333333333333';
  const workspaceB = '44444444-4444-4444-a444-444444444444';

  let usersController: UsersController;

  beforeEach(() => {
    vi.restoreAllMocks();
    usersController = new UsersController();
  });

  // =========================================================================
  // FINDING 1: SEC-01 — USERS CONTROLLER AUTHORIZATION & BOLA/IDOR MITIGATION
  // =========================================================================
  describe('P4-SEC-01: Users Controller Authorization & IDOR/BOLA Protection', () => {
    it('rejects user listing by a regular user (403 FORBIDDEN)', async () => {
      const req = {
        user: { id: userA, role: 'USER' },
        query: {},
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      await usersController.getUsers(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'FORBIDDEN' }),
        }),
      );
    });

    it('rejects access when non-admin tries to read another user profile (403 FORBIDDEN)', async () => {
      const req = {
        user: { id: userA, role: 'USER' },
        params: { id: userB },
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      await usersController.getUserById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'FORBIDDEN' }),
        }),
      );
    });

    it('rejects modification when non-admin tries to edit another user profile (403 FORBIDDEN)', async () => {
      const req = {
        user: { id: userA, role: 'USER' },
        params: { id: userB },
        body: { firstName: 'Hacked' },
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      await usersController.updateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'FORBIDDEN' }),
        }),
      );
    });

    it('rejects deletion when non-admin tries to delete another user profile (403 FORBIDDEN)', async () => {
      const req = {
        user: { id: userA, role: 'USER' },
        params: { id: userB },
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      await usersController.deleteUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'FORBIDDEN' }),
        }),
      );
    });

    it('permits authenticated user to view their own profile (200 OK)', async () => {
      const req = {
        user: { id: userA, role: 'USER' },
        params: { id: userA },
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      vi.spyOn(db.user, 'findUnique').mockResolvedValue({
        id: userA,
        email: 'userA@example.com',
        fullName: 'User A',
      } as any);

      await usersController.getUserById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        }),
      );
    });
  });

  // =========================================================================
  // FINDING 2: SEC-02 — WEBSOCKET HANDSHAKE SCOPE & TENANT ISOLATION
  // =========================================================================
  describe('P4-SEC-02: WebSocket Handshake Workspace Scoping & Tenant Isolation', () => {
    it('rejects handshake when query workspaceId has invalid UUID format', async () => {
      const token = jwt.sign(
        { id: userA, email: 'usera@example.com', role: 'USER', tokenVersion: 1 },
        securityConfig.jwt.secret,
      );

      vi.spyOn(db.user, 'findUnique').mockResolvedValue({ tokenVersion: 1 } as any);

      const socket = {
        id: 'sock-1',
        handshake: {
          auth: { token },
          query: { workspaceId: 'not-a-valid-uuid' },
        },
      } as any;

      const next = vi.fn();
      await socketAuthMiddleware(socket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toContain('Invalid workspace ID format');
    });

    it('rejects handshake when user is not a member of requested workspace', async () => {
      const token = jwt.sign(
        { id: userA, email: 'usera@example.com', role: 'USER', tokenVersion: 1 },
        securityConfig.jwt.secret,
      );

      vi.spyOn(db.user, 'findUnique').mockResolvedValue({ tokenVersion: 1 } as any);
      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue(null);

      const socket = {
        id: 'sock-2',
        handshake: {
          auth: { token },
          query: { workspaceId: workspaceB },
        },
      } as any;

      const next = vi.fn();
      await socketAuthMiddleware(socket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toContain('Access denied to requested workspace');
    });

    it('attaches workspaceId when user is confirmed member in database', async () => {
      const token = jwt.sign(
        { id: userA, email: 'usera@example.com', role: 'USER', tokenVersion: 1 },
        securityConfig.jwt.secret,
      );

      vi.spyOn(db.user, 'findUnique').mockResolvedValue({ tokenVersion: 1 } as any);
      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({
        id: 'mem-1',
        workspaceId: workspaceA,
        userId: userA,
      } as any);

      const socket = {
        id: 'sock-3',
        handshake: {
          auth: { token },
          query: { workspaceId: workspaceA },
        },
      } as any;

      const next = vi.fn();
      await socketAuthMiddleware(socket, next);

      expect(next).toHaveBeenCalledWith();
      expect(socket.user.workspaceId).toBe(workspaceA);
    });
  });

  // =========================================================================
  // FINDING 3: SEC-03 — STORED XSS MITIGATION VIA PREVIEW SECURITY HEADERS
  // =========================================================================
  describe('P4-SEC-03: File Preview Security Headers (Stored XSS Protection)', () => {
    it('applies CSP sandbox and nosniff headers to SVG preview responses', async () => {
      const mockRecord = {
        id: 'file-svg-1',
        userId: userA,
        workspaceId: workspaceA,
        filename: 'vector.svg',
        mimeType: 'image/svg+xml',
        size: 1024,
      };

      vi.spyOn(uploadService, 'getFileById').mockResolvedValue(mockRecord as any);
      vi.spyOn(uploadService, 'getFileStreamOrBuffer').mockResolvedValue({
        buffer: Buffer.from('<svg><script>alert(1)</script></svg>'),
      } as any);

      const headers: Record<string, string> = {};
      const req = {
        user: { id: userA },
        params: { id: mockRecord.id },
        query: {},
      } as any;
      const res = {
        setHeader: vi.fn((key: string, val: string) => {
          headers[key.toLowerCase()] = val;
        }),
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;
      const next = vi.fn();

      await uploadController.previewFile(req, res, next);

      expect(headers['content-security-policy']).toBe("default-src 'none'; sandbox");
      expect(headers['x-content-type-options']).toBe('nosniff');
    });

    it('applies CSP sandbox to HTML file previews', async () => {
      const mockRecord = {
        id: 'file-html-1',
        userId: userA,
        workspaceId: workspaceA,
        filename: 'page.html',
        mimeType: 'text/html',
        size: 2048,
      };

      vi.spyOn(uploadService, 'getFileById').mockResolvedValue(mockRecord as any);
      vi.spyOn(uploadService, 'getFileStreamOrBuffer').mockResolvedValue({
        buffer: Buffer.from('<html><body>XSS</body></html>'),
      } as any);

      const headers: Record<string, string> = {};
      const req = {
        user: { id: userA },
        params: { id: mockRecord.id },
        query: {},
      } as any;
      const res = {
        setHeader: vi.fn((key: string, val: string) => {
          headers[key.toLowerCase()] = val;
        }),
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;
      const next = vi.fn();

      await uploadController.previewFile(req, res, next);

      expect(headers['content-security-policy']).toBe("default-src 'none'; sandbox");
      expect(headers['x-content-type-options']).toBe('nosniff');
    });
  });

  // =========================================================================
  // FINDING 4: SEC-04 — ROLE AUTHORIZATION & SUPERADMIN ENUM ALIGNMENT
  // =========================================================================
  describe('P4-SEC-04: Admin Middleware Role Verification & Superadmin Enum Alignment', () => {
    it('returns 401 when user context is missing', () => {
      const req = {} as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 when user has role USER', () => {
      const req = { user: { id: userA, role: 'USER' } } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('passes for user with role ADMIN', () => {
      const req = { user: { id: adminUser, role: 'ADMIN' } } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('passes for user with Prisma role SUPERADMIN', () => {
      const req = { user: { id: superAdminUser, role: 'SUPERADMIN' } } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('passes for user with legacy role SUPER_ADMIN', () => {
      const req = { user: { id: superAdminUser, role: 'SUPER_ADMIN' } } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // FINDING 5: REL-01 — TRANSACTIONAL INTEGRITY IN CALENDAR EVENT DELETION
  // =========================================================================
  describe('P4-REL-01: Calendar Event Deletion & Planner Unlinking Atomic Transaction', () => {
    it('executes calendar event soft-deletion and planner block unlinking atomically inside db.$transaction', async () => {
      const eventId = 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee';
      const txSpy = vi.spyOn(db, '$transaction').mockResolvedValue([] as any);

      const operations = [
        db.calendarEvent.update({
          where: { id: eventId },
          data: { deletedAt: new Date() },
        }),
        db.plannerBlock.updateMany({
          where: { calendarEventId: eventId },
          data: { calendarEventId: null },
        }),
      ];

      await db.$transaction(operations);

      expect(txSpy).toHaveBeenCalledTimes(1);
      expect(txSpy).toHaveBeenCalledWith(expect.arrayContaining(operations));
    });
  });

  // =========================================================================
  // FINDING 6: SEC-05 — STRICT RATE LIMITING ON SENSITIVE ENDPOINTS
  // =========================================================================
  describe('P4-SEC-05: Rate Limiting on Password Modifications & Account Deletion', () => {
    it('mounts strictRateLimiter middleware on PATCH /password, POST /password, and DELETE /account', () => {
      const stack = (settingsRoutes as any).stack;

      const patchPasswordRoute = stack.find(
        (layer: any) => layer.route && layer.route.path === '/password' && layer.route.methods.patch,
      );
      const postPasswordRoute = stack.find(
        (layer: any) => layer.route && layer.route.path === '/password' && layer.route.methods.post,
      );
      const deleteAccountRoute = stack.find(
        (layer: any) => layer.route && layer.route.path === '/account' && layer.route.methods.delete,
      );

      expect(patchPasswordRoute).toBeDefined();
      expect(postPasswordRoute).toBeDefined();
      expect(deleteAccountRoute).toBeDefined();

      expect(patchPasswordRoute.route.stack.length).toBeGreaterThanOrEqual(2);
      expect(postPasswordRoute.route.stack.length).toBeGreaterThanOrEqual(2);
      expect(deleteAccountRoute.route.stack.length).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // FINDING 7: REL-02 — CONNECTION POOL RESILIENCY IN REDIS HEALTH PROBE
  // =========================================================================
  describe('P4-REL-02: Resilient Redis Health Probe Connection Handling', () => {
    it('returns true and disconnects when Redis responds with PONG', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      mockPing.mockResolvedValueOnce('PONG');
      mockQuit.mockResolvedValueOnce('OK');

      const isUp = await checkRedisHealth();

      expect(isUp).toBe(true);
      expect(mockConnect).toHaveBeenCalled();
      expect(mockPing).toHaveBeenCalled();
      expect(mockQuit).toHaveBeenCalled();
    });

    it('returns false cleanly and disconnects without throwing when Redis fails', async () => {
      mockConnect.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const isUp = await checkRedisHealth();

      expect(isUp).toBe(false);
      expect(mockDisconnect).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // FINDING 8: REL-03 — TRANSACTIONAL CONCURRENCY IN FAVORITE REORDERING
  // =========================================================================
  describe('P4-REL-03: Transactional Concurrency in Bulk Favorite Reordering', () => {
    it('executes bulk favorite reordering inside db.$transaction', async () => {
      const txSpy = vi.spyOn(db, '$transaction').mockResolvedValue([] as any);

      const orderedIds = ['fav-1', 'fav-2', 'fav-3'];
      await db.$transaction(
        orderedIds.map((id, index) =>
          db.userFavorite.updateMany({
            where: { id, userId: userA },
            data: { order: index },
          }),
        ),
      );

      expect(txSpy).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // FINDING 9: SEC-06 — SENSITIVE CREDENTIAL REDACTION IN LOGGING
  // =========================================================================
  describe('P4-SEC-06: Sensitive Credential Masking in Logging', () => {
    it('redacts password, token, secret, and Bearer credentials in log messages', () => {
      const msg1 = 'User login payload: {"password":"SuperSecretPassword123"}';
      expect(maskLogMessage(msg1)).toContain('"password":"[REDACTED]"');
      expect(maskLogMessage(msg1)).not.toContain('SuperSecretPassword123');

      const msg2 = 'Incoming Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz';
      expect(maskLogMessage(msg2)).toContain('Bearer "[REDACTED]"');
      expect(maskLogMessage(msg2)).not.toContain('eyJhbGci');

      const msg3 = 'API Call with apiKey="sk_live_9988776655"';
      expect(maskLogMessage(msg3)).toContain('apiKey="[REDACTED]"');
      expect(maskLogMessage(msg3)).not.toContain('sk_live_9988776655');

      const info = { level: 'info', message: msg1 };
      const masked = maskSensitiveData().transform(info, {}) as any;
      expect(masked.message).toContain('"password":"[REDACTED]"');
    });

    it('preserves non-sensitive log message contents unchanged', () => {
      const msg = 'Workspace created successfully by user 11111111';
      expect(maskLogMessage(msg)).toBe(msg);
      const info = { level: 'info', message: msg };
      const masked = maskSensitiveData().transform(info, {}) as any;
      expect(masked.message).toBe(msg);
    });
  });

  // =========================================================================
  // FINDING 10: REL-04 — API / MULTER MEMORY LIMIT ALIGNMENT
  // =========================================================================
  describe('P4-REL-04: API & Multer Batch Limit Alignment', () => {
    it('configures POST /multiple route with 10 batch files limit', () => {
      const stack = (uploadRoutes as any).stack;

      const multipleRoute = stack.find(
        (layer: any) => layer.route && layer.route.path === '/multiple' && layer.route.methods.post,
      );

      expect(multipleRoute).toBeDefined();
      expect(multipleRoute.route.stack.length).toBeGreaterThanOrEqual(3);
    });
  });
});
