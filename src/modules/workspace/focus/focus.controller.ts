import { Request, Response, NextFunction } from 'express';
import { FocusService } from './focus.service';
import { StartFocusSessionDto, FocusAnalyticsDto } from './focus.dto';

export class FocusController {
  constructor(private readonly focusService: FocusService) {}

  async start(userId: string, dto: StartFocusSessionDto) {
    return this.focusService.startSession(userId, dto);
  }

  async complete(sessionId: string, durationSeconds: number) {
    return this.focusService.completeSession(sessionId, durationSeconds);
  }

  async addDistraction(sessionId: string) {
    return this.focusService.recordDistraction(sessionId);
  }

  async getAnalytics(dto: FocusAnalyticsDto) {
    return this.focusService.getAnalytics(dto);
  }

  async handleStart(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || '';
      const workspaceId = req.params.workspaceId || (req as any).user?.workspaceId || '';
      const dto = {
        workspaceId,
        type: req.body.type || 'focus',
        durationMinutes: req.body.durationMinutes || 25,
      };
      const session = await this.focusService.startSession(userId, dto);
      res.status(201).json({ success: true, data: session });
    } catch (err) {
      next(err);
    }
  }

  async handleComplete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const targetId = req.params.sessionId || req.params.id;
      const durationSeconds = req.body.durationSeconds || req.body.actualDurationSeconds || 0;
      const session = await this.focusService.completeSession(targetId, durationSeconds);
      res.status(200).json({ success: true, data: session });
    } catch (err) {
      next(err);
    }
  }

  async handleAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || '';
      const workspaceId = req.params.workspaceId || (req as any).user?.workspaceId || '';
      const data = await this.focusService.getAnalytics({ workspaceId, userId });
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}
