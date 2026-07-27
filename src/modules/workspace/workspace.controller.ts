import { Request, Response, NextFunction } from 'express';
import { WorkspaceService } from './workspace.service';

const workspaceService = new WorkspaceService();

export class WorkspaceController {
  public async createWorkspace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { name, slug, description } = req.body;
      const ws = await workspaceService.createWorkspace(userId, name, slug, description);
      res.status(201).json({ success: true, data: ws });
    } catch (err) {
      next(err);
    }
  }

  public async getUserWorkspaces(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const workspaces = await workspaceService.getUserWorkspaces(req.user!.id);
      res.status(200).json({ success: true, data: workspaces });
    } catch (err) {
      next(err);
    }
  }

  public async getWorkspaceById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ws = await workspaceService.getWorkspaceById(req.params.id);
      res.status(200).json({ success: true, data: ws });
    } catch (err) {
      next(err);
    }
  }

  public async updateWorkspace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, description } = req.body;
      const updated = await workspaceService.updateWorkspace(req.params.id, name, description);
      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  public async deleteWorkspace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await workspaceService.deleteWorkspace(req.params.id);
      res.status(200).json({ success: true, message: 'Workspace deleted' });
    } catch (err) {
      next(err);
    }
  }

  public async addMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, role } = req.body;
      const member = await workspaceService.addMember(req.params.id, userId, role);
      res.status(201).json({ success: true, data: member });
    } catch (err) {
      next(err);
    }
  }
}

export const workspaceController = new WorkspaceController();
