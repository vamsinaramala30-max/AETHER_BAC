import { PrismaClient } from '@prisma/client';

export class TodaysScheduleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getScheduledEvents(userId: string, workspaceId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const conversations = await this.prisma.conversation.findMany({
      where: {
        workspaceId,
        userId,
        updatedAt: { gte: startOfDay },
      },
      take: 5,
      orderBy: { updatedAt: 'asc' },
    });

    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      time: c.updatedAt.toISOString(),
      type: 'CONVERSATION' as const,
    }));
  }
}