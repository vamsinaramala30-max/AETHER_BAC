import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

export class NotificationController {
  constructor(private prisma: PrismaClient) {}

  async getUserNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const notifications = await (this.prisma as any).eventNotification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      res.status(200).json({ data: notifications });
    } catch (err) {
      next(err);
    }
  }
}
