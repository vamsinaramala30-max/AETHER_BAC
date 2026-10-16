import { db } from '../../database/client';

export class WorkspaceRepository {
  async findById(workspaceId: string) {
    return db.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
                avatarUrl: true,
                role: true,
              },
            },
          },
        },
      },
    });
  }

  async findByUserId(userId: string) {
    return db.workspace.findMany({
      where: {
        members: {
          some: { userId },
        },
        deletedAt: null,
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
                avatarUrl: true,
                role: true,
              },
            },
          },
        },
      },
    });
  }

  async aggregateOverview(workspaceId: string, userId: string) {
    const [workspace, projectsCount, tasksCount, filesCount, membersCount] = await Promise.all([
      db.workspace.findUnique({ where: { id: workspaceId } }),
      db.project.count({ where: { workspaceId, deletedAt: null } }),
      db.task.count({ where: { workspaceId, deletedAt: null } }),
      db.file.count({ where: { workspaceId } }),
      db.workspaceMember.count({ where: { workspaceId } }),
    ]);

    return {
      workspaceId,
      userId,
      workspaceName: workspace?.name || 'Workspace',
      stats: {
        projectsCount,
        tasksCount,
        filesCount,
        membersCount,
        storageUsedMb: workspace?.storageUsedMb || 0,
        storageLimitMb: workspace?.storageLimitMb || 5120,
      },
      generatedAt: new Date(),
    };
  }

  async createWorkspace(data: { name: string; description?: string; ownerId: string }) {
    const slug = `ws-${data.ownerId.slice(0, 8)}-${Date.now().toString(36)}`;
    return db.workspace.create({
      data: {
        name: data.name,
        description: data.description,
        slug,
        members: {
          create: {
            userId: data.ownerId,
            role: 'OWNER',
          },
        },
      },
      include: {
        members: true,
      },
    });
  }

  async updateWorkspace(
    workspaceId: string,
    data: { name?: string; description?: string; logoUrl?: string },
  ) {
    return db.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
                avatarUrl: true,
                role: true,
              },
            },
          },
        },
      },
    });
  }

  async deleteWorkspace(workspaceId: string) {
    return db.workspace.update({
      where: { id: workspaceId },
      data: { deletedAt: new Date() },
    });
  }

  async getMember(workspaceId: string, userId: string) {
    return db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
    });
  }

  async listMembers(workspaceId: string) {
    return db.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addMember(
    workspaceId: string,
    userId: string,
    role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' = 'MEMBER',
  ) {
    return db.workspaceMember.create({
      data: {
        workspaceId,
        userId,
        role,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
    });
  }

  async updateMemberRole(
    workspaceId: string,
    userId: string,
    role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER',
  ) {
    return db.workspaceMember.update({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      data: { role },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
    });
  }

  async removeMember(workspaceId: string, userId: string) {
    return db.workspaceMember.delete({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });
  }

  async countOwners(workspaceId: string): Promise<number> {
    return db.workspaceMember.count({
      where: {
        workspaceId,
        role: 'OWNER',
      },
    });
  }

  async executeTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

