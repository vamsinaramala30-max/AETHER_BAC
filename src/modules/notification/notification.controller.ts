import { Request, Response, NextFunction } from 'express';
import { NotificationService } from './notification.service';

export class NotificationController {
  constructor(private service: NotificationService) {}

  getPreferences = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ status: 'error', message: 'Unauthorized' });
        return;
      }
      const data = await this.service.getPreferences(userId);
      res.json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  };

  updatePreferences = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ status: 'error', message: 'Unauthorized' });
        return;
      }
      const data = await this.service.updatePreferences(userId, req.body);
      res.json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  };

  getHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ status: 'error', message: 'Unauthorized' });
        return;
      }
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = (req.query.search as string) || '';
      const status = (req.query.status as 'read' | 'unread' | 'all') || 'all';
      const data = await this.service.getHistory(userId, page, limit, search, status);
      res.json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  };

  markRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ status: 'error', message: 'Unauthorized' });
        return;
      }
      const { id } = req.params;
      await this.service.markAsRead(id, userId);
      res.json({ status: 'success', message: 'Notification marked as read' });
    } catch (err) {
      next(err);
    }
  };

  markAllRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ status: 'error', message: 'Unauthorized' });
        return;
      }
      await this.service.markAllAsRead(userId);
      res.json({ status: 'success', message: 'All notifications marked as read' });
    } catch (err) {
      next(err);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ status: 'error', message: 'Unauthorized' });
        return;
      }
      const { id } = req.params;
      await this.service.deleteNotification(id, userId);
      res.json({ status: 'success', message: 'Notification removed' });
    } catch (err) {
      next(err);
    }
  };

  deleteAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ status: 'error', message: 'Unauthorized' });
        return;
      }
      await this.service.deleteAllNotifications(userId);
      res.json({ status: 'success', message: 'All notifications cleared' });
    } catch (err) {
      next(err);
    }
  };

  subscribePush = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ status: 'error', message: 'Unauthorized' });
        return;
      }
      await this.service.registerPush(userId, req.body);
      res.json({ status: 'success', message: 'Push subscription registered' });
    } catch (err) {
      next(err);
    }
  };
}
