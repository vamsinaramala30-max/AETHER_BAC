import { PrismaClient } from '@prisma/client';

export class AIRecommendationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getWorkspaceContext(workspaceId: string) {
    const projectCount = await this.prisma.project.count({
      where: { workspaceId, deletedAt: null },
    });
    const documentCount = await this.prisma.document.count({
      where: { knowledgeBase: { workspaceId } },
    });
    return { projectCount, documentCount };
  }
}
