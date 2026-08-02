import { PrismaClient } from '@prisma/client';

export class InAppNotificationProvider {
  constructor(private prisma: PrismaClient) {}

  async createInApp(userId: string, eventId: string, message: string) {
    return (this.prisma as any).eventNotification.create({
      data: { userId, eventId, message },
    });
  }
}
