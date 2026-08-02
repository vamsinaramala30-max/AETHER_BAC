import { Request, Response, NextFunction } from 'express';
import { WorkspaceService } from './workspace.service';

export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  async getWorkspaceOverview(workspaceId: string, userId: string) {
    return this.workspaceService.getOverview(workspaceId, userId);
  }

  async getUserWorkspaces(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || '';
      const workspaces = (await (this.workspaceService as any).getUserWorkspaces?.(userId)) ?? [];
      res.status(200).json({ data: workspaces });
    } catch (err) {
      next(err);
    }
  }

  async createWorkspace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || '';
      const workspace =
        (await (this.workspaceService as any).createWorkspace?.(userId, req.body)) ?? {};
      res.status(201).json({ data: workspace });
    } catch (err) {
      next(err);
    }
  }

  async getWorkspaceById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || '';
      const workspace =
        (await (this.workspaceService as any).getWorkspaceById?.(req.params.id, userId)) ?? null;
      if (!workspace) {
        res.status(404).json({ error: 'Workspace not found' });
        return;
      }
      res.status(200).json({ data: workspace });
    } catch (err) {
      next(err);
    }
  }

  async updateWorkspace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || '';
      const workspace =
        (await (this.workspaceService as any).updateWorkspace?.(req.params.id, userId, req.body)) ??
        {};
      res.status(200).json({ data: workspace });
    } catch (err) {
      next(err);
    }
  }

  async deleteWorkspace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || '';
      await (this.workspaceService as any).deleteWorkspace?.(req.params.id, userId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  async addMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || '';
      const member =
        (await (this.workspaceService as any).addMember?.(req.params.id, userId, req.body)) ?? {};
      res.status(201).json({ data: member });
    } catch (err) {
      next(err);
    }
  }
}
