import { PrismaClient } from '@prisma/client';
import { ProjectsModuleSharedRepository } from '../../../projects/project.repository';
import { ProjectsOrchestrationService } from '../../../projects/project.service';
import { logger } from '../../../../config';

export class ProjectsAdapter {
  private orchestration: ProjectsOrchestrationService;

  constructor(private prisma: PrismaClient) {
    const sharedRepo = new ProjectsModuleSharedRepository();
    this.orchestration = new ProjectsOrchestrationService(sharedRepo);
  }

  public async createProject(params: {
    name: string;
    description?: string;
    workspaceId: string;
    ownerId: string;
    priority?: string;
  }) {
    logger.info(`[ProjectsAdapter] Creating project '${params.name}'`);
    return this.prisma.project.create({
      data: {
        name: params.name,
        description: params.description,
        workspaceId: params.workspaceId,
        ownerId: params.ownerId,
        status: 'ACTIVE',
      },
    });
  }

  public async updateProject(projectId: string, updates: Record<string, unknown>) {
    logger.info(`[ProjectsAdapter] Updating project '${projectId}'`, { updates });
    return this.prisma.project.update({
      where: { id: projectId },
      data: updates as any,
    });
  }

  public async updateGoal(goalId: string, updates: Record<string, unknown>) {
    logger.info(`[ProjectsAdapter] Updating goal '${goalId}'`, { updates });
    return this.orchestration.goals.updateGoal(goalId, updates as any);
  }

  public async createMilestone(params: {
    projectId: string;
    title: string;
    description?: string;
    dueDate?: string | Date;
  }) {
    logger.info(
      `[ProjectsAdapter] Creating milestone '${params.title}' for project '${params.projectId}'`,
    );
    return this.prisma.milestone.create({
      data: {
        projectId: params.projectId,
        title: params.title,
        description: params.description,
        dueDate: params.dueDate ? new Date(params.dueDate) : null,
      },
    });
  }
}
