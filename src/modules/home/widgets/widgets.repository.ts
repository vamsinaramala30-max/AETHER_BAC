import { PrismaClient } from '@prisma/client';

export class WidgetsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getUserWidgetSettings(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    return user;
  }
}
