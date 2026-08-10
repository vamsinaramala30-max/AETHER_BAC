import { PrismaService } from '../../../database/prisma';
import { Prisma } from '@prisma/client';

export class ActivityRepository extends PrismaService {
  public async logActivity(
    automationId: string,
    workspaceId: string,
    type: string,
    message: string,
    executionId?: string | null,
    userId?: string | null,
    metadata?: Record<string, unknown>,
  ) {
    return this.prisma.automationActivity.create({
      data: {
        automationId,
        executionId: executionId || null,
        workspaceId,
        userId: userId || null,
        type,
        message,
        metadata: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  }

  public async findByAutomationId(automationId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    const [total, items] = await Promise.all([
      this.prisma.automationActivity.count({ where: { automationId } }),
      this.prisma.automationActivity.findMany({
        where: { automationId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  public async findAll(options: {
    workspaceId?: string;
    userId?: string;
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.AutomationActivityWhereInput = {};
    if (options.workspaceId) where.workspaceId = options.workspaceId;
    if (options.userId) where.userId = options.userId;

    if (options.search) {
      where.OR = [
        { message: { contains: options.search, mode: 'insensitive' } },
        { type: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.automationActivity.count({ where }),
      this.prisma.automationActivity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          automation: {
            select: { name: true, trigger: true },
          },
        },
      }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }
}
