import { Request, Response, NextFunction } from 'express';
import { AutomationService } from './automation.service';
import { Prisma } from '@prisma/client';

const automationService = new AutomationService();

export class AutomationController {
  public async createAutomation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { workspaceId, name, trigger, actions } = req.body;
      const auto = await automationService.createAutomation(
        workspaceId,
        name,
        trigger,
        actions as Prisma.InputJsonValue,
      );
      res.status(201).json({ success: true, data: auto });
    } catch (err) {
      next(err);
    }
  }

  public async getAutomations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const workspaceId = req.headers['x-workspace-id'] as string;
      const list = await automationService.getAutomations(workspaceId);
      res.status(200).json({ success: true, data: list });
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
      const updated = await automationService.updateAutomation(
        req.params.id,
        req.body as { name?: string; isEnabled?: boolean; actions?: Prisma.InputJsonValue },
      );
      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  public async deleteAutomation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await automationService.deleteAutomation(req.params.id);
      res.status(200).json({ success: true, message: 'Automation deleted' });
    } catch (err) {
      next(err);
    }
  }
}

export const automationController = new AutomationController();
