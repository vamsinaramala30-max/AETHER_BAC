import { Request, Response } from 'express';
import { WidgetsService } from './widgets.service';

export class WidgetsController {
  constructor(private readonly service: WidgetsService) {}

  async getWidgets(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.id || req.headers['x-user-id'];

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data = await this.service.getDefaultWidgets(userId as string);
    res.status(200).json({ success: true, data });
  }
}
