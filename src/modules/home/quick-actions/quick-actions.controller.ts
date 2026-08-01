import { Request, Response } from 'express';
import { QuickActionsService } from './quick-actions.service';
import { ExecuteQuickActionSchema } from './quick-actions.dto';

export class QuickActionsController {
  constructor(private readonly service: QuickActionsService) {}

  async getActions(_req: Request, res: Response): Promise<void> {
    const data = await this.service.getAvailableActions();
    res.status(200).json({ success: true, data });
  }

  async execute(req: Request, res: Response): Promise<void> {
    const body = ExecuteQuickActionSchema.parse(req.body);
    const userId = (req as any).user?.id || req.headers['x-user-id'];

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data = await this.service.executeAction(userId as string, body.actionKey, body.payload);
    res.status(200).json({ success: true, data });
  }
}