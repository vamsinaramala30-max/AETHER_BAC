import { Request, Response, NextFunction } from 'express';
import { ProjectService } from './project.service';

const projectService = new ProjectService();

export class ProjectController {
  public async createProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { workspaceId, name, description } = req.body;
      const proj = await projectService.createProject(workspaceId, name, description);
      res.status(201).json({ success: true, data: proj });
    } catch (err) {
      next(err);
    }
  }

  public async getProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const workspaceId = req.headers['x-workspace-id'] as string;
      const projects = await projectService.getProjectsByWorkspace(workspaceId);
      res.status(200).json({ success: true, data: projects });
    } catch (err) {
      next(err);
    }
  }

  public async getProjectById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const proj = await projectService.getProjectById(req.params.id);
      res.status(200).json({ success: true, data: proj });
    } catch (err) {
      next(err);
    }
  }

  public async updateProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, description } = req.body;
      const updated = await projectService.updateProject(req.params.id, name, description);
      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  public async deleteProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await projectService.deleteProject(req.params.id);
      res.status(200).json({ success: true, message: 'Project deleted' });
    } catch (err) {
      next(err);
    }
  }
}

export const projectController = new ProjectController();