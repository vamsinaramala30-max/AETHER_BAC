import { Request, Response, NextFunction } from 'express';
import { AnalyticsService } from './analytics.service';

const analyticsService = new AnalyticsService();

export class AnalyticsController {
  public async getOverviewMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const workspaceId = req.headers['x-workspace-id'] as string | undefined;
      const metrics = await analyticsService.getOverview(workspaceId);
      res.status(200).json({ success: true, data: metrics });
    } catch (err) {
      next(err);
    }
  }

  public async getUsageMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const usage = await analyticsService.getUsageMetrics();
      res.status(200).json({ success: true, data: usage });
    } catch (err) {
      next(err);
    }
  }
}

export const analyticsController = new AnalyticsController();