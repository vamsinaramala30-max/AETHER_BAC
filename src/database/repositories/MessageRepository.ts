import { Message, Prisma } from '@prisma/client';
import { PrismaService, TransactionClient } from '../prisma';

export class MessageRepository extends PrismaService {
  public async findById(id: string, tx?: TransactionClient): Promise<Message | null> {
    const client = tx || this.prisma;
    return client.message.findUnique({
      where: { id },
    });
  }

  public async create(data: Prisma.MessageCreateInput, tx?: TransactionClient): Promise<Message> {
    const client = tx || this.prisma;
    return client.message.create({
      data,
    });
  }

  public async getRecentByConversationId(
    conversationId: string,
    limit: number = 50
  ): Promise<Message[]> {
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  public async delete(id: string, tx?: TransactionClient): Promise<Message> {
    const client = tx || this.prisma;
    return client.message.delete({
      where: { id },
    });
  }
}