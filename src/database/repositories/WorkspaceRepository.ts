import { Workspace, WorkspaceMember, Prisma } from '@prisma/client';
import { PrismaService, TransactionClient } from '../prisma';

export class WorkspaceRepository extends PrismaService {
  public async findById(id: string, tx?: TransactionClient): Promise<Workspace | null> {
    const client = tx || this.prisma;
    return client.workspace.findUnique({
      where: { id },
    });
  }

  public async findBySlug(slug: string, tx?: TransactionClient): Promise<Workspace | null> {
    const client = tx || this.prisma;
    return client.workspace.findUnique({
      where: { slug },
    });
  }

  public async create(data: Prisma.WorkspaceCreateInput, tx?: TransactionClient): Promise<Workspace> {
    const client = tx || this.prisma;
    return client.workspace.create({
      data,
    });
  }

  public async update(id: string, data: Prisma.WorkspaceUpdateInput, tx?: TransactionClient): Promise<Workspace> {
    const client = tx || this.prisma;
    return client.workspace.update({
      where: { id },
      data,
    });
  }

  public async delete(id: string, tx?: TransactionClient): Promise<Workspace> {
    const client = tx || this.prisma;
    return client.workspace.delete({
      where: { id },
    });
  }

  public async getUserWorkspaces(userId: string): Promise<Workspace[]> {
    return this.prisma.workspace.findMany({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  public async addMember(
    workspaceId: string,
    userId: string,
    role: string,
    tx?: TransactionClient
  ): Promise<WorkspaceMember> {
    const client = tx || this.prisma;
    return client.workspaceMember.create({
      data: {
        workspaceId,
        userId,
        role,
      },
    });
  }

  public async getMember(
    workspaceId: string,
    userId: string,
    tx?: TransactionClient
  ): Promise<WorkspaceMember | null> {
    const client = tx || this.prisma;
    return client.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });
  }
}