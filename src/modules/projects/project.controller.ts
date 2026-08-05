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

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const project = await this.orchestrationService.projectsRepo.findById(req.params.id);
      if (!project) {
        res.status(404).json({ success: false, message: 'Project not found' });
        return;
      }
      res.status(200).json({ success: true, data: project });
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }
      const { name, description, category, workspaceId } = req.body;
      const project = await this.orchestrationService.projectsRepo.save({
        name,
        description,
        category,
        ownerId: userId,
        workspaceId,
      });
      res.status(201).json({ success: true, data: project });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }
      const existing = await this.orchestrationService.projectsRepo.findById(req.params.id);
      if (!existing) {
        res.status(404).json({ success: false, message: 'Project not found' });
        return;
      }
      const { name, description, category, status, progress } = req.body;
      const project = await this.orchestrationService.projectsRepo.save({
        id: req.params.id,
        name: name ?? existing.name,
        description: description ?? existing.description,
        category: category ?? existing.category,
        ownerId: existing.ownerId,
        status,
        progressPercentage: progress ?? existing.progressPercentage,
      });
      res.status(200).json({ success: true, data: project });
    } catch (err) {
      next(err);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deleted = await this.orchestrationService.projectsRepo.delete(req.params.id);
      if (!deleted) {
        res.status(404).json({ success: false, message: 'Project not found' });
        return;
      }
      res.status(200).json({ success: true, message: 'Project deleted' });
    } catch (err) {
      next(err);
    }
  }
}
