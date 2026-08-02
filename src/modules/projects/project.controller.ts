// ============================================================================
// File: backend/src/modules/projects/projects.controller.ts
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { ProjectsOrchestrationService } from './project.service';

export class ProjectsOrchestrationController {
  constructor(private readonly orchestrationService: ProjectsOrchestrationService) {}

  async getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req.query.userId as string) || '';
      const data = await this.orchestrationService.getDashboardData(userId);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async getOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req.query.userId as string) || '';
      const dashboard = await this.orchestrationService.getDashboardData(userId);
      res.status(200).json({
        success: true,
        overview: {
          summary: 'User performance overview retrieved successfully',
          ...dashboard,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}
