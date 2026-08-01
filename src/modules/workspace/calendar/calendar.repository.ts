import { PrismaClient } from '@prisma/client';

export class CalendarRepository {
  constructor(private prisma: PrismaClient) {}

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
    return (this.prisma as any).calendar.update({ where: { id }, data, include: { members: true } });
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
}