import { Request, Response } from 'express';
import { ContinueWorkingService } from './continue-working.service';
import { GetContinueWorkingQuerySchema } from './continue-working.dto';

export class ContinueWorkingController {
  constructor(private readonly service: ContinueWorkingService) {}

  async getRecentWork(req: Request, res: Response): Promise<void> {
    const query = GetContinueWorkingQuerySchema.parse(req.query);
    const userId = (req as any).user?.id || req.headers['x-user-id'];

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data = await this.service.getRecentWork(userId as string, query.workspaceId, query.limit);
    res.status(200).json({ success: true, data });
  }
}