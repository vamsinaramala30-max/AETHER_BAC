import { Request, Response } from 'express';
import { DailyOverviewService } from './daily-overview.service';
import { GetDailyOverviewQuerySchema } from './daily-overview.dto';

export class DailyOverviewController {
  constructor(private readonly service: DailyOverviewService) {}

  async getOverview(req: Request, res: Response): Promise<void> {
    const query = GetDailyOverviewQuerySchema.parse(req.query);
    const userId = (req as any).user?.id || req.headers['x-user-id'];

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data = await this.service.getOverview(userId as string, query.workspaceId);
    res.status(200).json({ success: true, data });
  }
}
