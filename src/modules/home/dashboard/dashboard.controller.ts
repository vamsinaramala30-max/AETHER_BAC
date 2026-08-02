import { Request, Response } from 'express';
import { DashboardService } from './dashboard.service';
import { GetDashboardQuerySchema } from './dashboard.dto';

export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  async getSummary(req: Request, res: Response): Promise<void> {
    const query = GetDashboardQuerySchema.parse(req.query);
    const userId = (req as any).user?.id || req.headers['x-user-id'];

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data = await this.dashboardService.getDashboardSummary(
      userId as string,
      query.workspaceId,
    );
    res.status(200).json({ success: true, data });
  }
}
