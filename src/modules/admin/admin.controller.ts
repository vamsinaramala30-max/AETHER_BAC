import { Request, Response, NextFunction } from 'express';
import { AdminService } from './admin.service';

const adminService = new AdminService();

export class AdminController {
  public async getSystemUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const skip = parseInt(req.query.skip as string, 10) || 0;
      const data = await adminService.getSystemUsers(limit, skip);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  public async getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const skip = parseInt(req.query.skip as string, 10) || 0;
      const data = await adminService.getAuditLogs(limit, skip);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

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
