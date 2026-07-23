import { Request, Response, NextFunction } from 'express';
import { SettingsService } from './settings.service';

const settingsService = new SettingsService();

export class SettingsController {
  public async getSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const settings = await settingsService.getSettings(req.user!.id);
      res.status(200).json({ success: true, data: settings });
    } catch (err) {
      next(err);
    }
  }

  public async updateSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const updated = await settingsService.updateSettings(req.user!.id, req.body);
      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
}

export const settingsController = new SettingsController();