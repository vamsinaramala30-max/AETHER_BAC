import { PrismaClient } from '@prisma/client';

export class SearchService {
  constructor(private prisma: PrismaClient) {}

  async searchEvents(userId: string, query: string, limit = 20) {
    return this.prisma.event.findMany({
      where: {
        calendar: { members: { some: { userId } } },
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { location: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      include: { calendar: true },
    });
  }
}