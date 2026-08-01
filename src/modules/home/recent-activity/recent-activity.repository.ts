import { PrismaClient } from '@prisma/client';

export class RecentActivityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getLogs(userId: string, limit: number) {
    return this.prisma.auditLog.findMany({
      where: { userId },
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        action: true,
        resource: true,
        createdAt: true,
      },
    });
  }
}