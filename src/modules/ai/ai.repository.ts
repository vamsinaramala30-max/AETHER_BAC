import { PrismaService } from '../../database/prisma';

export class AIRepository extends PrismaService {
  public async createConversation(userId: string, workspaceId: string, projectId: string, title: string) {
    return this.prisma.conversation.create({
      data: { userId, workspaceId, projectId, title },
    });
  }

  public async findConversationById(id: string) {
    return this.prisma.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  public async addMessage(conversationId: string, role: string, content: string) {
    return this.prisma.message.create({
      data: { conversationId, role, content },
    });
  }

  public async getUserConversations(userId: string, workspaceId: string) {
    return this.prisma.conversation.findMany({
      where: { userId, workspaceId },
      orderBy: { updatedAt: 'desc' },
    });
  }
}