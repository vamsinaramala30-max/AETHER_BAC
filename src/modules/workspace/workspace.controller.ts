import { Request, Response, NextFunction } from 'express';
import { WorkspaceService } from './workspace.service';

export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {
    this.getUserWorkspaces = this.getUserWorkspaces.bind(this);
    this.createWorkspace = this.createWorkspace.bind(this);
    this.getWorkspaceById = this.getWorkspaceById.bind(this);
    this.updateWorkspace = this.updateWorkspace.bind(this);
    this.deleteWorkspace = this.deleteWorkspace.bind(this);
    this.listMembers = this.listMembers.bind(this);
    this.addMember = this.addMember.bind(this);
    this.updateMemberRole = this.updateMemberRole.bind(this);
    this.removeMember = this.removeMember.bind(this);
    this.leaveWorkspace = this.leaveWorkspace.bind(this);
    this.getOverviewHttp = this.getOverviewHttp.bind(this);
  }

  async getWorkspaceOverview(workspaceId: string, userId: string) {
    return this.workspaceService.getOverview(workspaceId, userId);
  }

  async getOverviewHttp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id || '';
      const workspaceId = req.params.workspaceId || req.params.id || '';
      const overview = await this.workspaceService.getOverview(workspaceId, userId);
      res.status(200).json({ data: overview });
    } catch (err) {
      next(err);
    }
  }

  async getUserWorkspaces(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id || '';
      const workspaces = await this.workspaceService.getUserWorkspaces(userId);
      res.status(200).json({ data: workspaces });
    } catch (err) {
      next(err);
    }
  }

  async createWorkspace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id || '';
      const workspace = await this.workspaceService.createWorkspace(userId, req.body);
      res.status(201).json({ data: workspace });
    } catch (err) {
      next(err);
    }
  }

  async getWorkspaceById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id || '';
      const workspace = await this.workspaceService.getWorkspaceById(req.params.id, userId);
      res.status(200).json({ data: workspace });
    } catch (err) {
      next(err);
    }
  }

  async updateWorkspace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id || '';
      const workspace = await this.workspaceService.updateWorkspace(
        req.params.id,
        userId,
        req.body,
      );
      res.status(200).json({ data: workspace });
    } catch (err) {
      next(err);
    }
  }

  async deleteWorkspace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id || '';
      await this.workspaceService.deleteWorkspace(req.params.id, userId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  async listMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id || '';
      const members = await this.workspaceService.listMembers(req.params.id, userId);
      res.status(200).json({ data: members });
    } catch (err) {
      next(err);
    }
  }

  async addMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id || '';
      const member = await this.workspaceService.addMember(req.params.id, userId, req.body);
      res.status(201).json({ data: member });
    } catch (err) {
      next(err);
    }
  }

  async updateMemberRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id || '';
      const memberId = req.params.memberId;
      const updated = await this.workspaceService.updateMemberRole(
        req.params.id,
        userId,
        memberId,
        req.body.role,
      );
      res.status(200).json({ data: updated });
    } catch (err) {
      next(err);
    }
  }

  async removeMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id || '';
      const memberId = req.params.memberId;
      await this.workspaceService.removeMember(req.params.id, userId, memberId);
      res.status(200).json({ success: true, message: 'Member removed from workspace' });
    } catch (err) {
      next(err);
    }
  }

  async leaveWorkspace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id || '';
      await this.workspaceService.leaveWorkspace(req.params.id, userId);
      res.status(200).json({ success: true, message: 'Successfully left workspace' });
    } catch (err) {
      next(err);
    }
  }
}

