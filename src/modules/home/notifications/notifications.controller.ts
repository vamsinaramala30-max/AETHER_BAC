import { Request, Response } from 'express';
import { NotificationsService } from './notifications.service';
import { GetNotificationsQuerySchema, MarkNotificationReadSchema } from './notifications.dto';

export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  async getNotifications(req: Request, res: Response): Promise<void> {
    const query = GetNotificationsQuerySchema.parse(req.query);
    const userId = (req as any).user?.id || req.headers['x-user-id'];

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data = await this.service.getNotifications(userId as string, query.limit);
    res.status(200).json({ success: true, data });
  }

  async markAsRead(req: Request, res: Response): Promise<void> {
    const body = MarkNotificationReadSchema.parse(req.body);
    const userId = (req as any).user?.id || req.headers['x-user-id'];

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await this.service.markRead(body.notificationId, userId as string);
    res.status(200).json({ success: true, message: 'Notification marked as read' });
  }
}
