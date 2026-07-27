import { Conversation, Prisma } from '@prisma/client';
import { PrismaService, TransactionClient } from '../prisma';

export class ConversationRepository extends PrismaService {
  public async findById(id: string, tx?: TransactionClient): Promise<Conversation | null> {
    const client = tx || this.prisma;
    return client.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  public async findByUserId(userId: string, workspaceId: string): Promise<Conversation[]> {
    return this.prisma.conversation.findMany({
      where: { userId, workspaceId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  public async create(
    data: Prisma.ConversationCreateInput,
    tx?: TransactionClient,
  ): Promise<Conversation> {
    const client = tx || this.prisma;
    return client.conversation.create({
      data,
    });
  }

  public async updateTitle(
    id: string,
    title: string,
    tx?: TransactionClient,
  ): Promise<Conversation> {
    const client = tx || this.prisma;
    return client.conversation.update({
      where: { id },
      data: { title },
    });
  }

  public async delete(id: string, tx?: TransactionClient): Promise<Conversation> {
    const client = tx || this.prisma;
    return client.conversation.delete({
      where: { id },
    });
  }
}
