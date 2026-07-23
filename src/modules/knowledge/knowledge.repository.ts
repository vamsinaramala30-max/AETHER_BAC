import { PrismaService } from '../../database/prisma';

export class KnowledgeRepository extends PrismaService {
  public async create(workspaceId: string, name: string) {
    return this.prisma.knowledgeBase.create({
      data: { workspaceId, name },
    });
  }

  public async findById(id: string) {
    return this.prisma.knowledgeBase.findUnique({
      where: { id },
      include: { documents: true },
    });
  }

  public async findByWorkspaceId(workspaceId: string) {
    return this.prisma.knowledgeBase.findMany({ where: { workspaceId } });
  }

  public async delete(id: string) {
    return this.prisma.knowledgeBase.delete({ where: { id } });
  }
}