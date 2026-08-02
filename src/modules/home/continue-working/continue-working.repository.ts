import { PrismaClient } from '@prisma/client';

export class ContinueWorkingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getRecentItems(userId: string, workspaceId: string, limit: number) {
    const conversations = await this.prisma.conversation.findMany({
      where: { workspaceId, userId, deletedAt: null },
      take: limit,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, updatedAt: true },
    });

    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      type: 'CONVERSATION' as const,
      updatedAt: c.updatedAt.toISOString(),
    }));
  }
}
