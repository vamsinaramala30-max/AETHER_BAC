import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { db } from '../../database/client';
import { securityConfig, logger, env } from '../../config';
import { AppError } from '../../middleware/error.middleware';
import { checkRedisHealth } from '../../routes/health.routes';
import { verifyTotpToken } from './totp.util';
import {
  AdminOverviewMetrics,
  AdminUserListItem,
  AdminUserQueryOptions,
  AdminAuditLogQueryOptions,
  AdminLoginResult,
} from './admin.types';

export class AdminService {
  /**
   * Helper to safely record audit events into PostgreSQL audit_logs table
   */
  public async logAuditEvent(params: {
    userId?: string | null;
    action: string;
    resource: string;
    payload?: Record<string, any>;
    ipAddress?: string | null;
  }): Promise<void> {
    try {
      await db.auditLog.create({
        data: {
          userId: params.userId || null,
          action: params.action,
          resource: params.resource,
          payload: params.payload ? (params.payload as any) : undefined,
          ipAddress: params.ipAddress || null,
        },
      });
    } catch (err) {
      logger.error('Failed to persist admin audit log:', err);
    }
  }

  /**
   * Dedicated Administrator Login
   * Rejects non-admin users immediately with generic unauthorized response.
   * Prompts for MFA if admin account has is2FAEnabled = true.
   */
  public async adminLogin(payload: {
    email: string;
    password: string;
    mfaCode?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AdminLoginResult> {
    const email = payload.email.trim().toLowerCase();

    const user = await db.user.findUnique({
      where: { email },
    });

    // Uniform authentication failure message to protect against user enumeration
    const genericAuthError = new AppError(
      'Invalid administrative credentials or unauthorized account.',
      401,
      'INVALID_ADMIN_CREDENTIALS',
    );

    if (!user || !user.passwordHash) {
      await this.logAuditEvent({
        action: 'ADMIN_LOGIN_FAILURE',
        resource: `user:${email}`,
        payload: { reason: 'User not found or no password hash', email },
        ipAddress: payload.ipAddress,
      });
      throw genericAuthError;
    }

    const isMatch = await bcrypt.compare(payload.password, user.passwordHash);
    if (!isMatch) {
      await this.logAuditEvent({
        userId: user.id,
        action: 'ADMIN_LOGIN_FAILURE',
        resource: `user:${user.id}`,
        payload: { reason: 'Password mismatch', email },
        ipAddress: payload.ipAddress,
      });
      throw genericAuthError;
    }

    // Explicit administrator role boundary enforcement
    const allowedRoles = ['ADMIN', 'SUPERADMIN', 'SUPER_ADMIN'];
    if (!allowedRoles.includes(user.role)) {
      await this.logAuditEvent({
        userId: user.id,
        action: 'UNAUTHORIZED_ADMIN_LOGIN_ATTEMPT',
        resource: `user:${user.id}`,
        payload: { attemptedRole: user.role, email },
        ipAddress: payload.ipAddress,
      });
      logger.warn(`Privilege boundary breach attempt by non-admin ${user.id} (${user.role})`);
      throw genericAuthError;
    }

    // Account suspension check
    if (user.deletedAt) {
      await this.logAuditEvent({
        userId: user.id,
        action: 'ADMIN_LOGIN_SUSPENDED_ACCOUNT',
        resource: `user:${user.id}`,
        payload: { email },
        ipAddress: payload.ipAddress,
      });
      throw new AppError(
        'This administrator account has been suspended. Please contact security operations.',
        403,
        'ACCOUNT_SUSPENDED',
      );
    }

    // If 2FA is enabled on this admin account, check for MFA
    if (user.is2FAEnabled) {
      if (!payload.mfaCode) {
        // Issue short-lived ticket (5 minutes) for the second-factor step
        const mfaTicket = jwt.sign(
          {
            userId: user.id,
            email: user.email,
            purpose: 'admin_mfa_challenge',
          },
          securityConfig.jwt.secret,
          { expiresIn: '5m' },
        );

        return {
          mfaRequired: true,
          mfaTicket,
        };
      }

      // Verify supplied TOTP / recovery code
      const isValid = await this.verifyTotpOrRecovery(user, payload.mfaCode);
      if (!isValid) {
        await this.logAuditEvent({
          userId: user.id,
          action: 'ADMIN_MFA_FAILURE',
          resource: `user:${user.id}`,
          payload: { reason: 'Invalid MFA code' },
          ipAddress: payload.ipAddress,
        });
        throw new AppError('Invalid MFA verification code.', 401, 'INVALID_MFA_CODE');
      }
    }

    return this.completeAdminSession(user, payload.ipAddress, payload.userAgent);
  }

  /**
   * Complete MFA verification step with temporary MFA ticket
   */
  public async verifyMfaChallenge(payload: {
    mfaTicket: string;
    code: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AdminLoginResult> {
    let decoded: any;
    try {
      decoded = jwt.verify(payload.mfaTicket, securityConfig.jwt.secret);
      if (decoded.purpose !== 'admin_mfa_challenge' || !decoded.userId) {
        throw new Error('Invalid ticket purpose');
      }
    } catch {
      throw new AppError('MFA challenge session expired or invalid. Please sign in again.', 401, 'INVALID_MFA_TICKET');
    }

    const user = await db.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user || user.deletedAt) {
      throw new AppError('Administrator account not found or suspended.', 401, 'INVALID_ADMIN_CREDENTIALS');
    }

    const isValid = await this.verifyTotpOrRecovery(user, payload.code);
    if (!isValid) {
      await this.logAuditEvent({
        userId: user.id,
        action: 'ADMIN_MFA_FAILURE',
        resource: `user:${user.id}`,
        payload: { reason: 'Invalid code provided with ticket' },
        ipAddress: payload.ipAddress,
      });
      throw new AppError('Invalid verification code.', 401, 'INVALID_MFA_CODE');
    }

    return this.completeAdminSession(user, payload.ipAddress, payload.userAgent);
  }

  /**
   * Check TOTP code or recovery code for a user
   */
  private async verifyTotpOrRecovery(user: any, code: string): Promise<boolean> {
    const cleanCode = code.trim();

    // 1. Check TOTP if secret exists
    if (user.twoFactorSecret && verifyTotpToken(user.twoFactorSecret, cleanCode)) {
      return true;
    }

    // 2. Check recovery codes if present
    if (Array.isArray(user.twoFactorRecoveryCodes) && user.twoFactorRecoveryCodes.length > 0) {
      const matchIndex = user.twoFactorRecoveryCodes.findIndex((rc: string) => rc === cleanCode);
      if (matchIndex !== -1) {
        // Consume one-time recovery code
        const updatedCodes = [...user.twoFactorRecoveryCodes];
        updatedCodes.splice(matchIndex, 1);
        await db.user.update({
          where: { id: user.id },
          data: { twoFactorRecoveryCodes: updatedCodes },
        });
        await this.logAuditEvent({
          userId: user.id,
          action: 'ADMIN_RECOVERY_CODE_CONSUMED',
          resource: `user:${user.id}`,
        });
        return true;
      }
    }

    return false;
  }

  /**
   * Issue tokens, persist session and log success
   */
  private async completeAdminSession(
    user: any,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AdminLoginResult> {
    // Record login timestamp
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessTokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion ?? 0,
    };

    const accessToken = jwt.sign(accessTokenPayload, securityConfig.jwt.secret, {
      expiresIn: (securityConfig.jwt.expiresIn || '15m') as SignOptions['expiresIn'],
    });

    const refreshToken = jwt.sign({ id: user.id }, securityConfig.jwt.refreshSecret, {
      expiresIn: (securityConfig.jwt.refreshExpiresIn || '7d') as SignOptions['expiresIn'],
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await db.session.create({
      data: {
        userId: user.id,
        refreshToken,
        userAgent: userAgent || null,
        ipAddress: ipAddress || null,
        expiresAt,
      },
    });

    await this.logAuditEvent({
      userId: user.id,
      action: 'ADMIN_LOGIN_SUCCESS',
      resource: `user:${user.id}`,
      payload: { role: user.role },
      ipAddress,
    });

    return {
      mfaRequired: false,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName || user.email.split('@')[0],
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: securityConfig.jwt.expiresIn || '15m',
      },
    };
  }

  /**
   * Admin Portal Overview Metrics
   */
  public async getOverview(): Promise<AdminOverviewMetrics> {
    const [
      totalUsers,
      activeUsers,
      unverifiedUsers,
      suspendedUsers,
      twoFactorUsers,
      adminUsers,
      recentLogs,
    ] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { deletedAt: null } }),
      db.user.count({ where: { isEmailVerified: false } }),
      db.user.count({ where: { deletedAt: { not: null } } }),
      db.user.count({ where: { is2FAEnabled: true } }),
      db.user.count({ where: { role: { in: ['ADMIN', 'SUPERADMIN'] } } }),
      db.auditLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true } } },
      }),
    ]);

    // Database health & latency check
    let dbStatus: 'up' | 'degraded' | 'down' = 'up';
    let latencyMs = 0;
    let pgVersion = 'PostgreSQL';

    try {
      const start = Date.now();
      const versionResult: any = await db.$queryRaw`SELECT version()`;
      latencyMs = Date.now() - start;
      if (Array.isArray(versionResult) && versionResult[0]?.version) {
        pgVersion = String(versionResult[0].version).split(',')[0];
      }
    } catch {
      dbStatus = 'down';
    }

    const isRedisUp = await checkRedisHealth();

    // Check backup artifacts evidence
    const backupStatus = this.inspectBackupEvidence();

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        unverified: unverifiedUsers,
        suspended: suspendedUsers,
        twoFactorEnabled: twoFactorUsers,
        admins: adminUsers,
      },
      system: {
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage(),
        uptimeSeconds: Math.floor(process.uptime()),
        environment: env.NODE_ENV || 'development',
      },
      services: {
        database: {
          status: dbStatus,
          latencyMs,
          version: pgVersion,
          provider: env.DATABASE_URL?.includes('supabase')
            ? 'managed-postgresql'
            : 'self-hosted-postgresql',
        },
        redis: {
          status: isRedisUp ? 'up' : 'down',
        },
        aiModel: {
          status: env.AETHER_MODEL_BASE_URL ? 'up' : 'unconfigured',
          endpoint: env.AETHER_MODEL_BASE_URL || 'http://localhost:5002',
        },
        storage: {
          driver: env.STORAGE_DRIVER || 'local',
          status: env.STORAGE_DRIVER === 'supabase' && !env.SUPABASE_URL ? 'misconfigured' : 'ready',
        },
      },
      backups: backupStatus,
      recentSecurityEvents: recentLogs.map((log) => ({
        id: log.id,
        action: log.action,
        actorEmail: log.user?.email || 'System / Anonymous',
        ipAddress: log.ipAddress,
        resource: log.resource,
        createdAt: log.createdAt,
        payload: log.payload,
      })),
    };
  }

  /**
   * Forensic inspection of backup directory and evidence verification
   * Never fabricates success without verified non-empty archive files.
   */
  private inspectBackupEvidence(): AdminOverviewMetrics['backups'] {
    try {
      const backupDir = path.resolve(process.cwd(), 'backups');
      const manifestPath = path.join(backupDir, 'manifest.json');

      if (!fs.existsSync(manifestPath)) {
        return {
          lastBackupTimestamp: null,
          lastRestoreVerificationTimestamp: null,
          status: 'warning',
          evidenceFound: false,
          details: 'No backup manifest or scheduled backup repository discovered on server.',
        };
      }

      const raw = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw);

      // Check referenced dump file
      let dumpPath = path.join(backupDir, 'aether_db.dump');
      if (manifest.files && Array.isArray(manifest.files) && manifest.files[0]?.path) {
        dumpPath = path.join(backupDir, manifest.files[0].path);
      }

      if (!fs.existsSync(dumpPath)) {
        return {
          lastBackupTimestamp: manifest.created_at || null,
          lastRestoreVerificationTimestamp: null,
          status: 'warning',
          evidenceFound: false,
          details: 'Manifest exists but database dump archive file is missing from storage.',
        };
      }

      const stats = fs.statSync(dumpPath);
      // Mock files in repo are exactly 64 bytes
      if (stats.size <= 100) {
        return {
          lastBackupTimestamp: manifest.created_at || null,
          lastRestoreVerificationTimestamp: null,
          status: 'unverified',
          backupSizeBytes: stats.size,
          evidenceFound: false,
          storagePath: dumpPath,
          details: `Standby mock placeholder detected (${stats.size} bytes). Genuine database export required before production migration.`,
        };
      }

      return {
        lastBackupTimestamp: manifest.created_at || null,
        lastRestoreVerificationTimestamp: manifest.verified_at || null,
        status: 'healthy',
        backupSizeBytes: stats.size,
        evidenceFound: true,
        storagePath: dumpPath,
        details: `Verified backup archive present (${(stats.size / 1024 / 1024).toFixed(2)} MB).`,
      };
    } catch (err: any) {
      return {
        lastBackupTimestamp: null,
        lastRestoreVerificationTimestamp: null,
        status: 'warning',
        evidenceFound: false,
        details: `Error inspecting backup storage: ${err.message}`,
      };
    }
  }

  /**
   * Paginated user list with search, role, and status filters.
   * Redacts all sensitive credential fields.
   */
  public async getSystemUsers(options: AdminUserQueryOptions = {}) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (options.search && options.search.trim() !== '') {
      const q = options.search.trim();
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { fullName: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (options.role && options.role !== 'ALL') {
      where.role = options.role;
    }

    if (options.status === 'SUSPENDED') {
      where.deletedAt = { not: null };
    } else if (options.status === 'ACTIVE') {
      where.deletedAt = null;
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        take: limit,
        skip,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          username: true,
          fullName: true,
          role: true,
          isEmailVerified: true,
          is2FAEnabled: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      }),
      db.user.count({ where }),
    ]);

    const formatted: AdminUserListItem[] = users.map((u) => ({
      ...u,
      status: u.deletedAt ? 'SUSPENDED' : 'ACTIVE',
    }));

    return {
      users: formatted,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Assign or revoke roles through strict authorization checks.
   */
  public async updateUserRole(adminId: string, targetUserId: string, newRole: string) {
    const allowedRoles = ['USER', 'ADMIN', 'SUPERADMIN'];
    if (!allowedRoles.includes(newRole)) {
      throw new AppError(`Invalid role specified: ${newRole}`, 400, 'INVALID_ROLE');
    }

    if (adminId === targetUserId && newRole === 'USER') {
      throw new AppError('Cannot demote your own administrator account.', 400, 'SELF_DEMOTION_DISALLOWED');
    }

    const targetUser = await db.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      throw new AppError('Target user not found.', 404, 'USER_NOT_FOUND');
    }

    const updated = await db.user.update({
      where: { id: targetUserId },
      data: {
        role: newRole as any,
        tokenVersion: { increment: 1 }, // Invalidate existing sessions
      },
      select: {
        id: true,
        email: true,
        role: true,
        tokenVersion: true,
      },
    });

    // Invalidate target user's active sessions upon role mutation
    await db.session.deleteMany({ where: { userId: targetUserId } }).catch(() => null);

    await this.logAuditEvent({
      userId: adminId,
      action: 'ADMIN_USER_ROLE_CHANGE',
      resource: `user:${targetUserId}`,
      payload: { previousRole: targetUser.role, newRole },
    });

    return updated;
  }

  /**
   * Suspend or reinstate user accounts.
   * When suspended, user sessions are immediately revoked and tokens invalidated.
   */
  public async updateUserStatus(
    adminId: string,
    targetUserId: string,
    status: 'ACTIVE' | 'SUSPENDED',
  ) {
    if (adminId === targetUserId) {
      throw new AppError('Cannot suspend your own administrator account.', 400, 'SELF_SUSPENSION_DISALLOWED');
    }

    const targetUser = await db.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      throw new AppError('Target user not found.', 404, 'USER_NOT_FOUND');
    }

    const isSuspending = status === 'SUSPENDED';

    const updated = await db.user.update({
      where: { id: targetUserId },
      data: {
        deletedAt: isSuspending ? new Date() : null,
        tokenVersion: { increment: 1 }, // Revokes JWTs via tokenVersion mismatch
      },
      select: {
        id: true,
        email: true,
        deletedAt: true,
      },
    });

    if (isSuspending) {
      // Purge all active refresh sessions from DB
      await db.session.deleteMany({ where: { userId: targetUserId } }).catch(() => null);
    }

    await this.logAuditEvent({
      userId: adminId,
      action: isSuspending ? 'ADMIN_USER_SUSPEND' : 'ADMIN_USER_REINSTATE',
      resource: `user:${targetUserId}`,
      payload: { status },
    });

    return {
      id: updated.id,
      email: updated.email,
      status,
      deletedAt: updated.deletedAt,
    };
  }

  /**
   * Revoke all active sessions for a target user.
   */
  public async revokeUserSessions(adminId: string, targetUserId: string) {
    const targetUser = await db.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      throw new AppError('Target user not found.', 404, 'USER_NOT_FOUND');
    }

    await db.user.update({
      where: { id: targetUserId },
      data: { tokenVersion: { increment: 1 } },
    });

    const deleted = await db.session.deleteMany({
      where: { userId: targetUserId },
    });

    await this.logAuditEvent({
      userId: adminId,
      action: 'ADMIN_SESSIONS_REVOKED',
      resource: `user:${targetUserId}`,
      payload: { revokedCount: deleted.count },
    });

    return { success: true, revokedCount: deleted.count };
  }

  /**
   * Export user account data under validated, audited admin workflow.
   * Applies data minimization and never exports passwords or sensitive keys.
   */
  public async exportUserData(adminId: string, targetUserId: string) {
    const user = await db.user.findUnique({
      where: { id: targetUserId },
      include: {
        memberships: { include: { workspace: { select: { id: true, name: true, slug: true } } } },
        projects: { select: { id: true, name: true, status: true, createdAt: true } },
        _count: {
          select: {
            tasksCreated: true,
            files: true,
            conversations: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    }

    await this.logAuditEvent({
      userId: adminId,
      action: 'ADMIN_USER_DATA_EXPORT',
      resource: `user:${targetUserId}`,
      payload: { email: user.email },
    });

    return {
      account: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        is2FAEnabled: user.is2FAEnabled,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      workspaces: user.memberships.map((m) => ({
        workspaceId: m.workspace.id,
        workspaceName: m.workspace.name,
        role: m.role,
      })),
      projects: user.projects,
      activityCounts: user._count,
    };
  }

  /**
   * Paginated audit logs with action and target filtering.
   * Strips any credential fragments from payload.
   */
  public async getAuditLogs(options: AdminAuditLogQueryOptions = {}) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 50));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (options.action && options.action.trim() !== '') {
      where.action = { contains: options.action.trim(), mode: 'insensitive' };
    }
    if (options.userId) {
      where.userId = options.userId;
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        take: limit,
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, email: true, fullName: true, role: true },
          },
        },
      }),
      db.auditLog.count({ where }),
    ]);

    // Redact any potential passwords/tokens from payloads
    const sanitizedLogs = logs.map((log) => {
      let sanitizedPayload = log.payload;
      if (sanitizedPayload && typeof sanitizedPayload === 'object') {
        const copy: any = { ...sanitizedPayload };
        delete copy.password;
        delete copy.passwordHash;
        delete copy.token;
        delete copy.refreshToken;
        delete copy.accessToken;
        delete copy.secret;
        sanitizedPayload = copy;
      }
      return {
        ...log,
        payload: sanitizedPayload,
      };
    });

    return {
      logs: sanitizedLogs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Database connectivity and recovery status report
   */
  public async getDatabaseStatus() {
    let isConnected = false;
    let latencyMs = 0;
    let dbVersion = 'Unknown';
    let dbSize = 'Unknown';

    try {
      const start = Date.now();
      const versionResult: any = await db.$queryRaw`SELECT version()`;
      latencyMs = Date.now() - start;
      isConnected = true;
      if (Array.isArray(versionResult) && versionResult[0]?.version) {
        dbVersion = String(versionResult[0].version).split(',')[0];
      }

      try {
        const sizeResult: any = await db.$queryRaw`SELECT pg_size_pretty(pg_database_size(current_database())) as size`;
        if (Array.isArray(sizeResult) && sizeResult[0]?.size) {
          dbSize = sizeResult[0].size;
        }
      } catch {
        // Fallback if permission restricts pg_database_size
      }
    } catch (err: any) {
      logger.error('Database probe error in getDatabaseStatus:', err);
    }

    const backupInfo = this.inspectBackupEvidence();

    return {
      connected: isConnected,
      latencyMs,
      version: dbVersion,
      databaseSize: dbSize,
      sqlBrowserAccessAllowed: false, // Explicit security guarantee: browser SQL execution is prohibited
      backup: backupInfo,
    };
  }

  /**
   * Record a triggered manual backup event
   */
  public async recordBackupTrigger(adminId: string) {
    await this.logAuditEvent({
      userId: adminId,
      action: 'ADMIN_BACKUP_TRIGGERED',
      resource: 'database:backup',
      payload: { initiatedBy: adminId, timestamp: new Date().toISOString() },
    });

    return {
      success: true,
      message: 'Database backup request initiated. Logged in audit registry.',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Backward-compatible system metrics
   */
  public async getSystemMetrics() {
    return {
      memoryUsage: process.memoryUsage(),
      cpuUptime: process.uptime(),
      nodeVersion: process.version,
    };
  }
}

export const adminService = new AdminService();
