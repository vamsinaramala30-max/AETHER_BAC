import { Request, Response, NextFunction } from 'express';
import { AutomationService } from './automation.service';
import { parsePaginationParams } from './utils/execution.utils';

const automationService = new AutomationService();

export class AutomationController {
  public async parseIntent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const prompt = req.body.prompt || req.body.userPrompt || '';
      const result = automationService.parseIntent(prompt);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  public async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const workspaceId =
        (req.headers['x-workspace-id'] as string) || (req as any).user?.workspaceId;
      const userId = (req as any).user?.id;
      const stats = await automationService.getStats(workspaceId, userId);
      res.status(200).json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  }

  public async createAutomation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      const workspaceId =
        req.body.workspaceId ||
        (req as any).user?.workspaceId ||
        (req.headers['x-workspace-id'] as string) ||
        '00000000-0000-0000-0000-000000000000';

      const input = {
        ...req.body,
        workspaceId,
        userId,
        actions: req.body.nodes || req.body.actions || [],
      };

      const auto = await automationService.createAutomation(input);
      res.status(201).json({ success: true, data: auto });
    } catch (err) {
      next(err);
    }
  }

  public async getAutomations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit } = parsePaginationParams(req.query);
      const workspaceId =
        (req.headers['x-workspace-id'] as string) || (req as any).user?.workspaceId;
      const userId = (req as any).user?.id;

      let result;
      if (workspaceId) {
        result = await automationService.getAutomations(workspaceId, page, limit);
      } else if (userId) {
        result = await automationService.getUserAutomations(userId, page, limit);
      } else {
        result = await automationService.getAutomations(
          '00000000-0000-0000-0000-000000000000',
          page,
          limit,
        );
      }

      res.status(200).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  public async getAutomationById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auto = await automationService.getAutomationById(req.params.id);
      res.status(200).json({ success: true, data: auto });
    } catch (err) {
      next(err);
    }
  }

  public async updateAutomation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      const updated = await automationService.updateAutomation(req.params.id, req.body, userId);
      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  public async deleteAutomation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      const result = await automationService.deleteAutomation(req.params.id, userId);
      res.status(200).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  public async activateAutomation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      const activated = await automationService.activateAutomation(req.params.id, userId);
      res.status(200).json({ success: true, data: activated });
    } catch (err) {
      next(err);
    }
  }

  public async pauseAutomation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      const paused = await automationService.pauseAutomation(req.params.id, userId);
      res.status(200).json({ success: true, data: paused });
    } catch (err) {
      next(err);
    }
  }

  public async runAutomation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      const triggerData = req.body.triggerData || req.body;
      const result = await automationService.runAutomation(req.params.id, triggerData, userId);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  public async getAutomationActivity(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { page, limit } = parsePaginationParams(req.query);
      const activity = await automationService.getAutomationActivity(req.params.id, page, limit);
      res.status(200).json({ success: true, ...activity });
    } catch (err) {
      next(err);
    }
  }

  public async getAllActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit } = parsePaginationParams(req.query);
      const search = req.query.search as string;
      const status = req.query.status as string;
      const workspaceId =
        (req.headers['x-workspace-id'] as string) || (req as any).user?.workspaceId;
      const userId = (req as any).user?.id;

      const activity = await automationService.getAllActivity({
        workspaceId,
        userId,
        search,
        status,
        page,
        limit,
      });

      res.status(200).json({ success: true, ...activity });
    } catch (err) {
      next(err);
    }
  }

  public async getExecutions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit } = parsePaginationParams(req.query);
      const executions = await automationService.getExecutions(req.params.id, page, limit);
      res.status(200).json({ success: true, ...executions });
    } catch (err) {
      next(err);
    }
  }

  public async approveExecution(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      const result = await automationService.approveExecution(req.params.executionId, userId);
      res.status(200).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  public async rejectExecution(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const reason = req.body?.reason as string;
      const result = await automationService.rejectExecution(req.params.executionId, reason);
      res.status(200).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  public async getTemplates(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const templates = automationService.getTemplates();
      res.status(200).json({ success: true, data: templates });
    } catch (err) {
      next(err);
    }
  }

  public async getLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    return this.getAllActivity(req, res, next);
  }
}

export const automationController = new AutomationController();
