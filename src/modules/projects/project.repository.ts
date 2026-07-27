import { PrismaService } from '../../database/prisma';

export class ProjectRepository extends PrismaService {
  public async create(workspaceId: string, ownerId: string, name: string, description?: string) {
    return this.prisma.project.create({
      data: { workspaceId, ownerId, name, description },
    });
  }

  public async findById(id: string) {
    return this.prisma.project.findUnique({ where: { id } });
  }

  public async findByWorkspaceId(workspaceId: string) {
    return this.prisma.project.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  public async update(id: string, name?: string, description?: string) {
    return this.prisma.project.update({
      where: { id },
      data: { name, description },
    });
  }

  public async delete(id: string) {
    return this.prisma.project.delete({ where: { id } });
  }
}
