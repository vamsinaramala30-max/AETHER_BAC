import { Request, Response, NextFunction } from 'express';
import { SyncService, SyncProvider } from './sync.service';
import { AppError } from '../../../../middleware/error.middleware';

export { SyncProvider };

export class SyncController {
  constructor(private syncService: SyncService) {}

  async syncGoogle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
      const { calendarId } = req.body;
      const result = await this.syncService.triggerSync(
        userId,
        calendarId,
        SyncProvider.GOOGLE,
        (req as any).user?.workspaceId,
      );
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  async syncOutlook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
      const { calendarId } = req.body;
      const result = await this.syncService.triggerSync(
        userId,
        calendarId,
        SyncProvider.OUTLOOK,
        (req as any).user?.workspaceId,
      );
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  async syncApple(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
      const { calendarId } = req.body;
      const result = await this.syncService.triggerSync(
        userId,
        calendarId,
        SyncProvider.APPLE,
        (req as any).user?.workspaceId,
      );
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
}

