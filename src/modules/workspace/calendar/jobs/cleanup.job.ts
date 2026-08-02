import { PrismaClient } from '@prisma/client';

export class CleanupJob {
  constructor(private prisma: PrismaClient) {}

  async run(): Promise<void> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await (this.prisma as any).eventNotification.deleteMany({
      where: { isRead: true, createdAt: { lt: thirtyDaysAgo } },
    });
  }
}
