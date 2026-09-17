import { PrismaClient } from '@prisma/client';
import { ProjectsModuleSharedRepository } from '../../../projects/project.repository';
import { TasksService } from '../../../projects/tasks/tasks.service';
import { TaskStatus, PriorityLevel } from '../../../projects/projects.constants';
import { logger } from '../../../../config';

export class TasksAdapter {
  private tasksService: TasksService;
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    const sharedRepo = new ProjectsModuleSharedRepository();
    this.tasksService = new TasksService(sharedRepo.tasks);
  }

  public async createTask(params: {
    title: string;
    description?: string;
    projectId?: string;
    assigneeId?: string;
    creatorId?: string;
    priority?: string;
    dueDate?: string | Date;
  }) {
    logger.info(`[TasksAdapter] Creating task '${params.title}'`);
    let priorityVal: PriorityLevel = PriorityLevel.MEDIUM;
    if (params.priority) {
      const upper = params.priority.toUpperCase();
      if (upper === 'LOW') priorityVal = PriorityLevel.LOW;
      else if (upper === 'HIGH') priorityVal = PriorityLevel.HIGH;
      else if (upper === 'URGENT' || upper === 'CRITICAL') priorityVal = PriorityLevel.URGENT;
    }

    return this.tasksService.createTask({
      title: params.title,
      description: params.description,
      projectId: params.projectId || '00000000-0000-0000-0000-000000000000',
      assigneeIds: params.assigneeId ? [params.assigneeId] : [],
      priority: priorityVal,
      dueDate: params.dueDate ? new Date(params.dueDate) : undefined,
    });
  }

  public async updateTask(taskId: string, updates: Record<string, unknown>) {
    logger.info(`[TasksAdapter] Updating task '${taskId}'`, { updates });
    return this.tasksService.updateTask(taskId, updates as any);
  }

  public async completeTask(taskId: string) {
    logger.info(`[TasksAdapter] Marking task '${taskId}' as completed`);
    return this.tasksService.updateTask(taskId, {
      status: TaskStatus.DONE,
      isCompleted: true,
      completedAt: new Date(),
    } as any);
  }

  public async completeAllTasks(userId?: string, workspaceId?: string) {
    logger.info(
      `[TasksAdapter] Completing all incomplete tasks for user '${userId}' in workspace '${workspaceId}'`,
    );
    const whereClause: any = {
      status: { notIn: ['DONE', 'CANCELLED'] as any },
    };
    if (workspaceId && workspaceId !== '00000000-0000-0000-0000-000000000000') {
      whereClause.workspaceId = workspaceId;
    }
    if (userId && userId !== '00000000-0000-0000-0000-000000000000') {
      whereClause.OR = [{ assigneeId: userId }, { creatorId: userId }];
    }

    const updated = await this.prisma.task.updateMany({
      where: whereClause,
      data: {
        status: 'DONE' as any,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    logger.info(`[TasksAdapter] Successfully completed ${updated.count} tasks`);
    return {
      count: updated.count,
      status: 'SUCCESS',
      message: `Marked ${updated.count} incomplete task(s) as Completed`,
    };
  }

  public async summarizeTasks(userId?: string, workspaceId?: string) {
    logger.info(`[TasksAdapter] Generating task summary for user '${userId}'`);
    const whereClause: any = {};
    if (workspaceId && workspaceId !== '00000000-0000-0000-0000-000000000000') {
      whereClause.workspaceId = workspaceId;
    }
    if (userId && userId !== '00000000-0000-0000-0000-000000000000') {
      whereClause.OR = [{ assigneeId: userId }, { creatorId: userId }];
    }

    const tasks = await this.prisma.task.findMany({
      where: whereClause,
      take: 20,
      orderBy: { createdAt: 'desc' },
    });

    const pending = tasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED');
    const done = tasks.filter((t) => t.status === 'DONE');

    return {
      total: tasks.length,
      pendingCount: pending.length,
      completedCount: done.length,
      summary: `Workspace Task Summary: ${pending.length} pending, ${done.length} completed task(s).`,
      tasks: pending.map((t) => ({ id: t.id, title: t.title, priority: t.priority })),
    };
  }

  public async setPriority(taskId: string, priority: string) {
    logger.info(`[TasksAdapter] Setting priority of task '${taskId}' to '${priority}'`);
    let priorityVal: PriorityLevel = PriorityLevel.MEDIUM;
    const upper = priority.toUpperCase();
    if (upper === 'LOW') priorityVal = PriorityLevel.LOW;
    else if (upper === 'HIGH') priorityVal = PriorityLevel.HIGH;
    else if (upper === 'URGENT' || upper === 'CRITICAL') priorityVal = PriorityLevel.URGENT;

    return this.tasksService.updateTask(taskId, { priority: priorityVal } as any);
  }

  public async setDeadline(taskId: string, dueDate: string | Date) {
    logger.info(`[TasksAdapter] Setting deadline of task '${taskId}' to '${dueDate}'`);
    return this.tasksService.updateTask(taskId, { dueDate: new Date(dueDate) } as any);
  }
}
