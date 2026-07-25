import { PrismaService } from '../../database/prisma';
import { WorkspaceRole } from '@prisma/client';

export class WorkspaceRepository extends PrismaService {
  public async createWorkspace(userId: string, name: string, slug: string, description?: string) {
    return this.prisma.workspace.create({
      data: {
        name,
        slug,
        description,
        members: {
          create: {
            userId,
            role: WorkspaceRole.OWNER,
          },
        },
      },
    });
  }

  public async findById(id: string) {
    return this.prisma.workspace.findUnique({
      where: { id },
      include: { members: { include: { user: true } } },
    });
  }

  public async findByUserId(userId: string) {
    return this.prisma.workspace.findMany({
      where: { members: { some: { userId } } },
    });
  }

  public async updateWorkspace(id: string, name?: string, description?: string) {
    return this.prisma.workspace.update({
      where: { id },
      data: { name, description },
    });
  }

  public async deleteWorkspace(id: string) {
    return this.prisma.workspace.delete({ where: { id } });
  }

  public async addMember(workspaceId: string, userId: string, role: string) {
    return this.prisma.workspaceMember.create({
      data: { workspaceId, userId, role: role as any },
    });
  }
}