import { PrismaClient } from '@prisma/client';

export class QuickActionsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async logActionExecution(userId: string, actionKey: string, payload: any) {
    return this.prisma.auditLog.create({
      data: {
        userId,
        action: `QUICK_ACTION_${actionKey.toUpperCase()}`,
        resource: 'QUICK_ACTION',
        payload: payload || {},
      },
    });
  }
}
