// ============================================================================
// File: backend/src/modules/projects/projects.controller.ts
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { ProjectsOrchestrationService } from './project.service';
import { db } from '../../database/client';

export class ProjectsOrchestrationController {
  constructor(private readonly orchestrationService: ProjectsOrchestrationService) {}

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const workspaceId =
        (req.headers['x-workspace-id'] as string) ||
        (req.query.workspaceId as string) ||
        (req as any).user?.workspaceId;

      if (workspaceId) {
        const membership = await db.workspaceMember.findFirst({
          where: { workspaceId, userId },
        });
        if (!membership) {
          res.status(403).json({ success: false, message: 'Forbidden: Access to workspace denied' });
          return;
        }
      }

      const filter: any = {
        ...req.query,
      };

      if (workspaceId) {
        filter.workspaceId = workspaceId;
      } else {
        filter.memberId = userId;
      }

      const result = await this.orchestrationService.projectsRepo.findMany(filter);
      res.status(200).json({
        success: true,
        data: result.data,
        projects: result.data,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      });
    } catch (err) {
      next(err);
    }
  }

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
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }
      const project = await this.orchestrationService.projectsRepo.findById(req.params.id);
      if (!project) {
        res.status(404).json({ success: false, message: 'Project not found' });
        return;
      }
      if (project.ownerId !== userId) {
        let isMember = false;
        if (project.workspaceId) {
          const membership = await db.workspaceMember.findFirst({
            where: { workspaceId: project.workspaceId, userId },
          });
          isMember = !!membership;
        }
        if (!isMember) {
          res.status(403).json({ success: false, message: 'Forbidden: Access to project denied' });
          return;
        }
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
      if (workspaceId) {
        const userRole = (req as any).user?.role;
        const isSystemAdmin = userRole === 'ADMIN' || userRole === 'SUPERADMIN' || userRole === 'SUPER_ADMIN';
        if (!isSystemAdmin) {
          const membership = await db.workspaceMember.findFirst({
            where: { workspaceId, userId },
          });
          if (!membership || membership.role === 'VIEWER') {
            res.status(403).json({
              success: false,
              message: 'Forbidden: Cannot create project in this workspace',
              error: {
                code: 'FORBIDDEN_WORKSPACE',
                message: 'Forbidden: Cannot create project in this workspace',
              },
            });
            return;
          }
        }
      }
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
      if (existing.ownerId !== userId) {
        let isAuthorized = false;
        const userRole = (req as any).user?.role;
        if (userRole === 'ADMIN' || userRole === 'SUPERADMIN' || userRole === 'SUPER_ADMIN') {
          isAuthorized = true;
        } else if (existing.workspaceId) {
          const membership = await db.workspaceMember.findFirst({
            where: { workspaceId: existing.workspaceId, userId },
          });
          // Viewers are read-only; OWNER, ADMIN, or MEMBER may update workspace projects
          if (membership && membership.role !== 'VIEWER') {
            isAuthorized = true;
          }
        }
        if (!isAuthorized) {
          res.status(403).json({
            success: false,
            message: 'Forbidden: Access to project denied',
            error: {
              code: 'FORBIDDEN_PROJECT_UPDATE',
              message: 'Forbidden: Access to project denied',
            },
          });
          return;
        }
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
      if (existing.ownerId !== userId) {
        let isAuthorized = false;
        const userRole = (req as any).user?.role;
        if (userRole === 'ADMIN' || userRole === 'SUPERADMIN' || userRole === 'SUPER_ADMIN') {
          isAuthorized = true;
        } else if (existing.workspaceId) {
          // In a shared workspace, only workspace OWNER or ADMIN may delete projects not owned by them (AUDIT-HIGH-02)
          const membership = await db.workspaceMember.findFirst({
            where: { workspaceId: existing.workspaceId, userId },
          });
          if (membership && (membership.role === 'OWNER' || membership.role === 'ADMIN')) {
            isAuthorized = true;
          }
        }
        if (!isAuthorized) {
          res.status(403).json({
            success: false,
            message: 'Forbidden: Only project owners or workspace admins can delete projects',
            error: {
              code: 'FORBIDDEN_PROJECT_DELETE',
              message: 'Forbidden: Only project owners or workspace admins can delete projects',
            },
          });
          return;
        }
      }
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

  async getMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
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
      if (existing.ownerId !== userId) {
        let isMember = false;
        if (existing.workspaceId) {
          const membership = await db.workspaceMember.findFirst({
            where: { workspaceId: existing.workspaceId, userId },
          });
          isMember = !!membership;
        }
        if (!isMember) {
          res.status(403).json({ success: false, message: 'Forbidden: Access to project denied' });
          return;
        }
      }

      const workspaceMembers = existing.workspaceId
        ? await db.workspaceMember.findMany({
            where: { workspaceId: existing.workspaceId },
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                  avatarUrl: true,
                },
              },
            },
          })
        : [];

      const members = workspaceMembers.map((m: any) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        joinedAt: m.createdAt?.toISOString ? m.createdAt.toISOString() : new Date().toISOString(),
        createdAt: m.createdAt?.toISOString ? m.createdAt.toISOString() : new Date().toISOString(),
        user: m.user,
      }));

      res.status(200).json({ success: true, data: members, members });
    } catch (err) {
      next(err);
    }
  }
}
