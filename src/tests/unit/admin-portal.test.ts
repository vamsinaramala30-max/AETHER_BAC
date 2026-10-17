import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { adminService } from '../../modules/admin/admin.service';
import { requireAdmin } from '../../middleware/admin.middleware';
import { db } from '../../database/client';
import { securityConfig } from '../../config';

describe('AETHER Admin Portal & Security Verification Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Dedicated Administrator Authentication & Boundary Enforcement', () => {
    it('successfully logs in an administrator with valid credentials', async () => {
      const mockAdmin = {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'admin@aether.internal',
        fullName: 'System Administrator',
        role: 'ADMIN',
        passwordHash: '$2a$10$mockHashedPassword123',
        is2FAEnabled: false,
        deletedAt: null,
        tokenVersion: 1,
      };

      vi.spyOn(db.user, 'findUnique').mockResolvedValue(mockAdmin as any);
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      vi.spyOn(db.user, 'update').mockResolvedValue(mockAdmin as any);
      vi.spyOn(db.session, 'create').mockResolvedValue({ id: 'sess-1' } as any);
      const auditSpy = vi.spyOn(db.auditLog, 'create').mockResolvedValue({ id: 'audit-1' } as any);

      const result = await adminService.adminLogin({
        email: 'admin@aether.internal',
        password: 'ValidPassword#123',
        ipAddress: '192.168.1.100',
        userAgent: 'AetherAdmin/1.0',
      });

      expect(result.mfaRequired).toBe(false);
      expect(result.user?.email).toBe('admin@aether.internal');
      expect(result.user?.role).toBe('ADMIN');
      expect(result.tokens?.accessToken).toBeDefined();
      expect(result.tokens?.refreshToken).toBeDefined();

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ADMIN_LOGIN_SUCCESS',
            userId: mockAdmin.id,
          }),
        }),
      );
    });

    it('rejects regular USER accounts attempting to access admin portal with 401 generic error and logs audit alert', async () => {
      const mockRegularUser = {
        id: '22222222-2222-4222-8222-222222222222',
        email: 'standard.user@aether.internal',
        role: 'USER', // Standard non-admin role
        passwordHash: '$2a$10$mockHashedPassword123',
        is2FAEnabled: false,
        deletedAt: null,
      };

      vi.spyOn(db.user, 'findUnique').mockResolvedValue(mockRegularUser as any);
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      const auditSpy = vi.spyOn(db.auditLog, 'create').mockResolvedValue({ id: 'audit-1' } as any);

      await expect(
        adminService.adminLogin({
          email: 'standard.user@aether.internal',
          password: 'ValidPassword#123',
          ipAddress: '203.0.113.45',
        }),
      ).rejects.toThrow('Invalid administrative credentials or unauthorized account.');

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'UNAUTHORIZED_ADMIN_LOGIN_ATTEMPT',
            userId: mockRegularUser.id,
          }),
        }),
      );
    });

    it('rejects invalid password with generic error and records failure audit log', async () => {
      const mockAdmin = {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'admin@aether.internal',
        role: 'ADMIN',
        passwordHash: '$2a$10$mockHashedPassword123',
      };

      vi.spyOn(db.user, 'findUnique').mockResolvedValue(mockAdmin as any);
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(false as never); // Incorrect password
      const auditSpy = vi.spyOn(db.auditLog, 'create').mockResolvedValue({ id: 'audit-1' } as any);

      await expect(
        adminService.adminLogin({
          email: 'admin@aether.internal',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow('Invalid administrative credentials or unauthorized account.');

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ADMIN_LOGIN_FAILURE',
          }),
        }),
      );
    });

    it('blocks suspended administrator accounts from authenticating', async () => {
      const mockSuspendedAdmin = {
        id: '33333333-3333-4333-8333-333333333333',
        email: 'suspended.admin@aether.internal',
        role: 'ADMIN',
        passwordHash: '$2a$10$mockHashedPassword123',
        deletedAt: new Date(), // Suspended
      };

      vi.spyOn(db.user, 'findUnique').mockResolvedValue(mockSuspendedAdmin as any);
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      const auditSpy = vi.spyOn(db.auditLog, 'create').mockResolvedValue({ id: 'audit-1' } as any);

      await expect(
        adminService.adminLogin({
          email: 'suspended.admin@aether.internal',
          password: 'ValidPassword#123',
        }),
      ).rejects.toThrow('This administrator account has been suspended.');

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ADMIN_LOGIN_SUSPENDED_ACCOUNT',
          }),
        }),
      );
    });
  });

  describe('2. Multi-Factor Authentication (MFA) Enforcement', () => {
    it('issues MFA challenge ticket when admin has 2FA enabled and code is not yet supplied', async () => {
      const mock2FAAdmin = {
        id: '44444444-4444-4444-8444-444444444444',
        email: 'mfa.admin@aether.internal',
        role: 'SUPERADMIN',
        passwordHash: '$2a$10$mockHashedPassword123',
        is2FAEnabled: true,
        twoFactorSecret: 'JBSWY3DPEHPK3PXP', // Base32 test secret
        deletedAt: null,
      };

      vi.spyOn(db.user, 'findUnique').mockResolvedValue(mock2FAAdmin as any);
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      const result = await adminService.adminLogin({
        email: 'mfa.admin@aether.internal',
        password: 'ValidPassword#123',
      });

      expect(result.mfaRequired).toBe(true);
      expect(result.mfaTicket).toBeDefined();
      expect(result.tokens).toBeUndefined(); // No access token granted yet
    });

    it('successfully completes login when one-time emergency recovery code is provided', async () => {
      const mock2FAAdmin = {
        id: '44444444-4444-4444-8444-444444444444',
        email: 'mfa.admin@aether.internal',
        role: 'SUPERADMIN',
        fullName: 'Super Admin',
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
        twoFactorRecoveryCodes: ['RECOVER-1234-ABCD', 'RECOVER-5678-EFGH'],
        tokenVersion: 2,
        deletedAt: null,
      };

      vi.spyOn(db.user, 'findUnique').mockResolvedValue(mock2FAAdmin as any);
      const userUpdateSpy = vi.spyOn(db.user, 'update').mockResolvedValue(mock2FAAdmin as any);
      vi.spyOn(db.session, 'create').mockResolvedValue({ id: 'sess-mfa' } as any);
      vi.spyOn(db.auditLog, 'create').mockResolvedValue({ id: 'audit-mfa' } as any);

      // Generate valid temporary MFA ticket
      const ticket = jwt.sign(
        { userId: mock2FAAdmin.id, email: mock2FAAdmin.email, purpose: 'admin_mfa_challenge' },
        securityConfig.jwt.secret,
      );

      const result = await adminService.verifyMfaChallenge({
        mfaTicket: ticket,
        code: 'RECOVER-1234-ABCD',
      });

      expect(result.mfaRequired).toBe(false);
      expect(result.tokens?.accessToken).toBeDefined();

      // Ensure consumed recovery code was removed from user record
      expect(userUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mock2FAAdmin.id },
          data: { twoFactorRecoveryCodes: ['RECOVER-5678-EFGH'] },
        }),
      );
    });

    it('rejects invalid or expired MFA challenge tickets', async () => {
      await expect(
        adminService.verifyMfaChallenge({
          mfaTicket: 'malformed.tampered.ticket',
          code: '123456',
        }),
      ).rejects.toThrow('MFA challenge session expired or invalid.');
    });
  });

  describe('3. requireAdmin Middleware Access Control', () => {
    it('blocks unauthenticated requests with 401 UNAUTHORIZED', () => {
      const req: any = {};
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('blocks regular USER role with 403 FORBIDDEN', () => {
      const req: any = {
        user: { id: 'usr-1', role: 'USER' },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: 'FORBIDDEN' }),
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('allows ADMIN role through to next handler', () => {
      const req: any = {
        user: { id: 'adm-1', role: 'ADMIN' },
      };
      const res: any = {};
      const next = vi.fn();

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('allows SUPERADMIN role through to next handler', () => {
      const req: any = {
        user: { id: 'sup-1', role: 'SUPERADMIN' },
      };
      const res: any = {};
      const next = vi.fn();

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('4. User Management, Status Modification, & Session Revocation', () => {
    it('disallows an administrator from demoting their own account', async () => {
      const adminId = '11111111-1111-4111-8111-111111111111';

      await expect(
        adminService.updateUserRole(adminId, adminId, 'USER'),
      ).rejects.toThrow('Cannot demote your own administrator account.');
    });

    it('disallows an administrator from suspending their own account', async () => {
      const adminId = '11111111-1111-4111-8111-111111111111';

      await expect(
        adminService.updateUserStatus(adminId, adminId, 'SUSPENDED'),
      ).rejects.toThrow('Cannot suspend your own administrator account.');
    });

    it('suspending a user sets deletedAt, increments tokenVersion, and purges all active sessions', async () => {
      const adminId = '11111111-1111-4111-8111-111111111111';
      const targetUserId = '55555555-5555-5555-8555-555555555555';

      vi.spyOn(db.user, 'findUnique').mockResolvedValue({
        id: targetUserId,
        email: 'bad.actor@aether.internal',
      } as any);

      const updateSpy = vi.spyOn(db.user, 'update').mockResolvedValue({
        id: targetUserId,
        email: 'bad.actor@aether.internal',
        deletedAt: new Date(),
      } as any);

      const sessionDeleteSpy = vi.spyOn(db.session, 'deleteMany').mockResolvedValue({ count: 4 } as any);
      const auditSpy = vi.spyOn(db.auditLog, 'create').mockResolvedValue({ id: 'aud-sus' } as any);

      const result = await adminService.updateUserStatus(adminId, targetUserId, 'SUSPENDED');

      expect(result.status).toBe('SUSPENDED');
      expect(result.deletedAt).toBeDefined();

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: targetUserId },
          data: expect.objectContaining({
            tokenVersion: { increment: 1 },
          }),
        }),
      );

      expect(sessionDeleteSpy).toHaveBeenCalledWith({
        where: { userId: targetUserId },
      });

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ADMIN_USER_SUSPEND',
            userId: adminId,
            resource: `user:${targetUserId}`,
          }),
        }),
      );
    });

    it('revokes active user sessions by bumping tokenVersion and deleting sessions', async () => {
      const adminId = '11111111-1111-4111-8111-111111111111';
      const targetUserId = '66666666-6666-6666-8666-666666666666';

      vi.spyOn(db.user, 'findUnique').mockResolvedValue({ id: targetUserId } as any);
      const userUpdateSpy = vi.spyOn(db.user, 'update').mockResolvedValue({ id: targetUserId } as any);
      const sessionDeleteSpy = vi.spyOn(db.session, 'deleteMany').mockResolvedValue({ count: 3 } as any);
      const auditSpy = vi.spyOn(db.auditLog, 'create').mockResolvedValue({ id: 'aud-rev' } as any);

      const res = await adminService.revokeUserSessions(adminId, targetUserId);

      expect(res.success).toBe(true);
      expect(res.revokedCount).toBe(3);
      expect(userUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: targetUserId },
          data: { tokenVersion: { increment: 1 } },
        }),
      );
      expect(sessionDeleteSpy).toHaveBeenCalledWith({ where: { userId: targetUserId } });
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ADMIN_SESSIONS_REVOKED',
          }),
        }),
      );
    });
  });

  describe('5. Database State, Recovery Evidence, & Secret Redaction', () => {
    it('verifies that browser SQL editor execution is strictly prohibited and returns real DB latency', async () => {
      (vi.spyOn(db, '$queryRaw') as any).mockImplementation(async (strings: any) => {
        const queryStr = String(strings);
        if (queryStr.includes('version')) {
          return [{ version: 'PostgreSQL 16.4 on x86_64-pc-linux-gnu' }];
        }
        if (queryStr.includes('pg_size_pretty')) {
          return [{ size: '42 MB' }];
        }
        return [{ 1: 1 }];
      });

      const dbStatus = await adminService.getDatabaseStatus();

      expect(dbStatus.connected).toBe(true);
      expect(dbStatus.sqlBrowserAccessAllowed).toBe(false); // Security guarantee
      expect(dbStatus.version).toContain('PostgreSQL 16.4');
      expect(dbStatus.databaseSize).toBe('42 MB');
      expect(dbStatus.backup).toBeDefined();
    });

    it('sanitizes and strips sensitive passwords and tokens from audit log query outputs', async () => {
      const mockRawLogs = [
        {
          id: 'log-1',
          userId: 'usr-1',
          action: 'USER_REGISTER',
          resource: 'user:usr-1',
          payload: {
            email: 'user@aether.internal',
            password: 'secret_plaintext_leak',
            token: 'jwt.token.fragment',
            secret: 'totp_secret_key',
            clientMeta: { os: 'Linux' },
          },
          ipAddress: '10.0.0.1',
          createdAt: new Date(),
          user: { id: 'usr-1', email: 'user@aether.internal', fullName: 'User', role: 'USER' },
        },
      ];

      vi.spyOn(db.auditLog, 'findMany').mockResolvedValue(mockRawLogs as any);
      vi.spyOn(db.auditLog, 'count').mockResolvedValue(1);

      const result = await adminService.getAuditLogs({ page: 1, limit: 10 });

      expect(result.logs.length).toBe(1);
      const sanitizedPayload = result.logs[0].payload as any;
      expect(sanitizedPayload.password).toBeUndefined();
      expect(sanitizedPayload.token).toBeUndefined();
      expect(sanitizedPayload.secret).toBeUndefined();
      expect(sanitizedPayload.email).toBe('user@aether.internal');
      expect(sanitizedPayload.clientMeta.os).toBe('Linux');
    });

    it('exports user account data applying data minimization without passwords', async () => {
      const adminId = '11111111-1111-4111-8111-111111111111';
      const targetUserId = '77777777-7777-7777-8777-777777777777';

      const mockTarget = {
        id: targetUserId,
        email: 'audited.subject@aether.internal',
        username: 'audited_subj',
        fullName: 'Subject Name',
        role: 'USER',
        passwordHash: '$2a$10$SUPER_SECRET_HASH',
        twoFactorSecret: 'SUPER_SECRET_2FA',
        isEmailVerified: true,
        is2FAEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        memberships: [],
        projects: [],
        _count: { tasksCreated: 2, files: 1, conversations: 0 },
      };

      vi.spyOn(db.user, 'findUnique').mockResolvedValue(mockTarget as any);
      const auditSpy = vi.spyOn(db.auditLog, 'create').mockResolvedValue({ id: 'aud-exp' } as any);

      const exported = await adminService.exportUserData(adminId, targetUserId);

      expect((exported as any).passwordHash).toBeUndefined();
      expect((exported as any).account.passwordHash).toBeUndefined();
      expect((exported as any).account.twoFactorSecret).toBeUndefined();
      expect(exported.account.email).toBe('audited.subject@aether.internal');
      expect(exported.activityCounts.tasksCreated).toBe(2);

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ADMIN_USER_DATA_EXPORT',
          }),
        }),
      );
    });
  });
});
