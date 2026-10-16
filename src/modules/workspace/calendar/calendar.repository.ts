import { PrismaClient } from '@prisma/client';
import { db } from '../../../database/client';

export class CalendarRepository {
  constructor(private prisma: PrismaClient = db) {}

  async create(data: any): Promise<any> {
    return (this.prisma as any).calendar.create({ data, include: { members: true } });
  }

  async findById(id: string): Promise<any | null> {
    return (this.prisma as any).calendar.findUnique({ where: { id }, include: { members: true } });
  }

  async findByUserId(userId: string): Promise<any[]> {
    return (this.prisma as any).calendar.findMany({
      where: { members: { some: { userId } } },
      include: { members: true },
    });
  }

  async update(id: string, data: any): Promise<any> {
    return (this.prisma as any).calendar.update({
      where: { id },
      data,
      include: { members: true },
    });
  }

  async delete(id: string): Promise<any> {
    return (this.prisma as any).calendar.delete({ where: { id } });
  }

  async getUserRole(calendarId: string, userId: string): Promise<string | null> {
    const member = await (this.prisma as any).calendarMember.findUnique({
      where: { calendarId_userId: { calendarId, userId } },
    });
    return member ? (member.accessRole as string) : null;
  }

  async checkWorkspaceMembership(workspaceId: string, userId: string): Promise<boolean> {
    const member = await (this.prisma as any).workspaceMember?.findFirst({
      where: { workspaceId, userId },
    });
    return Boolean(member);
  }

  async findEvents(params: {
    workspaceId?: string;
    userId?: string;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<any[]> {
    const where: any = { deletedAt: null };

    if (params.workspaceId) {
      where.workspaceId = params.workspaceId;
    }
    if (params.userId) {
      where.userId = params.userId;
    }
    if (params.startDate) {
      where.endDate = { gte: params.startDate };
    }
    if (params.endDate) {
      where.startDate = { lte: params.endDate };
    }

    return (this.prisma as any).calendarEvent.findMany({
      where,
      orderBy: { startDate: 'asc' },
      take: params.limit ? Math.min(params.limit, 100) : 50,
      include: {
        project: { select: { id: true, name: true } },
        task: { select: { id: true, title: true, status: true } },
      },
    });
  }
}

