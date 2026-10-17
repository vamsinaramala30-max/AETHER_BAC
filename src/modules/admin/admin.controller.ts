import { Request, Response, NextFunction } from 'express';
import { adminService } from './admin.service';

export class AdminController {
  /**
   * Dedicated Admin Login
   */
  public async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, mfaCode } = req.body || {};
      if (!email || !password) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_CREDENTIALS',
            message: 'Email and password are required.',
          },
        });
        return;
      }

      const ipAddress = req.ip || req.socket.remoteAddress || undefined;
      const userAgent = req.headers['user-agent'];

      const result = await adminService.adminLogin({
        email,
        password,
        mfaCode,
        ipAddress,
        userAgent,
      });

      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Verify MFA challenge for Admin Login
   */
  public async verifyMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { mfaTicket, code } = req.body || {};
      if (!mfaTicket || !code) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_MFA_PARAMS',
            message: 'MFA ticket and verification code are required.',
          },
        });
        return;
      }

      const ipAddress = req.ip || req.socket.remoteAddress || undefined;
      const userAgent = req.headers['user-agent'];

      const result = await adminService.verifyMfaChallenge({
        mfaTicket,
        code,
        ipAddress,
        userAgent,
      });

      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin Logout and session purge
   */
  public async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = (req as any).user?.id;
      const ipAddress = req.ip || req.socket.remoteAddress || undefined;

      if (adminId) {
        await adminService.logAuditEvent({
          userId: adminId,
          action: 'ADMIN_LOGOUT',
          resource: `user:${adminId}`,
          ipAddress,
        });
      }

      res.status(200).json({ success: true, message: 'Admin session terminated.' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin Overview Metrics
   */
  public async getOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const overview = await adminService.getOverview();
      res.status(200).json({ success: true, data: overview });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get users with pagination and search
   */
  public async getSystemUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const role = typeof req.query.role === 'string' ? req.query.role : undefined;
      const status = typeof req.query.status === 'string' ? (req.query.status as any) : undefined;

      const data = await adminService.getSystemUsers({ page, limit, search, role, status });
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update User Role
   */
  public async updateUserRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = (req as any).user.id;
      const targetUserId = req.params.id;
      const { role } = req.body || {};

      if (!role) {
        res.status(400).json({
          success: false,
          error: { code: 'MISSING_ROLE', message: 'Role parameter is required.' },
        });
        return;
      }

      const updated = await adminService.updateUserRole(adminId, targetUserId, role);
      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update User Status (Suspend / Reinstate)
   */
  public async updateUserStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = (req as any).user.id;
      const targetUserId = req.params.id;
      const { status } = req.body || {};

      if (status !== 'ACTIVE' && status !== 'SUSPENDED') {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_STATUS', message: 'Status must be ACTIVE or SUSPENDED.' },
        });
        return;
      }

      const updated = await adminService.updateUserStatus(adminId, targetUserId, status);
      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Revoke User Sessions
   */
  public async revokeUserSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = (req as any).user.id;
      const targetUserId = req.params.id;

      const result = await adminService.revokeUserSessions(adminId, targetUserId);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Export User Data
   */
  public async exportUserData(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = (req as any).user.id;
      const targetUserId = req.params.id;

      const result = await adminService.exportUserData(adminId, targetUserId);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get Audit Logs
   */
  public async getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const action = typeof req.query.action === 'string' ? req.query.action : undefined;
      const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;

      const data = await adminService.getAuditLogs({ page, limit, action, userId });
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get Database and Backup Recovery Status
   */
  public async getDatabaseStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = await adminService.getDatabaseStatus();
      res.status(200).json({ success: true, data: status });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Trigger / Record Backup Execution
   */
  public async triggerBackup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = (req as any).user.id;
      const result = await adminService.recordBackupTrigger(adminId);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * System Metrics
   */
  public async getSystemMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const metrics = await adminService.getSystemMetrics();
      res.status(200).json({ success: true, data: metrics });
    } catch (err) {
      next(err);
    }
  }
}

export const adminController = new AdminController();
