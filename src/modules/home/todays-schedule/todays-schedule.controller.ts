import { Request, Response } from 'express';
import { TodaysScheduleService } from './todays-schedule.service';
import { GetTodaysScheduleQuerySchema } from './todays-schedule.dto';

export class TodaysScheduleController {
  constructor(private readonly service: TodaysScheduleService) {}

  async getSchedule(req: Request, res: Response): Promise<void> {
    const query = GetTodaysScheduleQuerySchema.parse(req.query);
    const userId = (req as any).user?.id || req.headers['x-user-id'];

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data = await this.service.getSchedule(userId as string, query.workspaceId);
    res.status(200).json({ success: true, data });
  }
}
