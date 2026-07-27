import { Project, Prisma } from '@prisma/client';
import { PrismaService, TransactionClient } from '../prisma';

export class ProjectRepository extends PrismaService {
  public async findById(id: string, tx?: TransactionClient): Promise<Project | null> {
    const client = tx || this.prisma;
    return client.project.findUnique({
      where: { id },
    });
  }

  public async findByWorkspaceId(workspaceId: string, tx?: TransactionClient): Promise<Project[]> {
    const client = tx || this.prisma;
    return client.project.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  public async create(data: Prisma.ProjectCreateInput, tx?: TransactionClient): Promise<Project> {
    const client = tx || this.prisma;
    return client.project.create({
      data,
    });
  }

  public async update(
    id: string,
    data: Prisma.ProjectUpdateInput,
    tx?: TransactionClient,
  ): Promise<Project> {
    const client = tx || this.prisma;
    return client.project.update({
      where: { id },
      data,
    });
  }

  public async delete(id: string, tx?: TransactionClient): Promise<Project> {
    const client = tx || this.prisma;
    return client.project.delete({
      where: { id },
    });
  }
}
