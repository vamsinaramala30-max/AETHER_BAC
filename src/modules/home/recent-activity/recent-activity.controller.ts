import { Request, Response } from 'express';
import { RecentActivityService } from './recent-activity.service';
import { GetRecentActivityQuerySchema } from './recent-activity.dto';

export class RecentActivityController {
  constructor(private readonly service: RecentActivityService) {}

  async getActivity(req: Request, res: Response): Promise<void> {
    const query = GetRecentActivityQuerySchema.parse(req.query);
    const userId = (req as any).user?.id || req.headers['x-user-id'];

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data = await this.service.getActivity(userId as string, query.limit);
    res.status(200).json({ success: true, data });
  }
}