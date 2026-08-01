import { Request, Response, NextFunction } from 'express';
import { SyncService } from './sync.service';
import { SyncProvider } from '@prisma/client';

export class SyncController {
  constructor(private syncService: SyncService) {}

  async syncGoogle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { calendarId } = req.body;
      const result = await this.syncService.triggerSync(userId, calendarId, SyncProvider.GOOGLE);
      res.status(200).json({ data: result });
    } catch (err) { next(err); }
  }

  async syncOutlook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { calendarId } = req.body;
      const result = await this.syncService.triggerSync(userId, calendarId, SyncProvider.OUTLOOK);
      res.status(200).json({ data: result });
    } catch (err) { next(err); }
  }

  async syncApple(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { calendarId } = req.body;
      const result = await this.syncService.triggerSync(userId, calendarId, SyncProvider.APPLE);
      res.status(200).json({ data: result });
    } catch (err) { next(err); }
  }
}