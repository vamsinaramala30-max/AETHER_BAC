// ============================================================================
// File: backend/src/modules/projects/tasks/tasks.service.ts
// ============================================================================

import { TasksRepository } from './tasks.repository';
import { TaskEntity } from './tasks.entity';
import { CreateTaskDTO, UpdateTaskDTO, TaskFilterDTO, BulkTaskOperationDTO } from './tasks.dto';
import { TaskStatus, PriorityLevel, RecurrenceInterval } from '../projects.constants';
import { db } from '../../../database/client';
import { AppError } from '../../../middleware/error.middleware';
import { emitToWorkspace, emitToUser } from '../../../websocket/socket';
import { SocketEvent } from '../../../websocket/socketTypes';

export async function syncProjectProgress(projectId?: string | null): Promise<number> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!projectId || !isUuid.test(projectId)) return 0;
  try {
    const tasks = await db.task.findMany({
      where: { projectId, deletedAt: null },
      select: { status: true, completedAt: true },
    });
    const activeTasks = tasks.filter((t) => t.status !== 'CANCELLED');
    let progress = 0;
    if (activeTasks.length > 0) {
      const doneTasks = activeTasks.filter((t) => t.status === 'DONE' || !!t.completedAt);
      progress = Math.min(100, Math.max(0, Math.round((doneTasks.length / activeTasks.length) * 100)));
    }
    await db.project.update({
      where: { id: projectId },
      data: { progress },
    });
    return progress;
  } catch {
    return 0;
  }
}

export class TasksService {
  constructor(private readonly repository: TasksRepository) {}

  private async notifyAssignees(
    assigneeIds: string[],
    title: string,
    message: string,
    type: string = 'TASK',
  ) {
    if (!assigneeIds?.length) return;

    try {
      await Promise.all(
        assigneeIds.map(async (assigneeId) => {
          const userExists = await db.user.findUnique({ where: { id: assigneeId } });
          if (!userExists) return;
          const createdNotif = await db.notification.create({
            data: {
              userId: assigneeId,
              title,
              message,
              type: type as any,
            },
          });
          emitToUser(assigneeId, SocketEvent.NOTIFICATION_NEW, createdNotif);
        }),
      );
    } catch {
      // Ignore notification failures
    }
  }

  async createTask(dto: CreateTaskDTO, userId?: string): Promise<TaskEntity> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const now = new Date();

    const creatorId = userId || (dto.assigneeIds && dto.assigneeIds.length > 0 ? dto.assigneeIds[0] : undefined);
    if (!creatorId) {
      throw new AppError('Creator user ID is required to create a task', 400, 'CREATOR_REQUIRED');
    }

    // Idempotency check: if client retries creation with existing ID
    if (dto.id && isUuid.test(dto.id)) {
      const existing = await this.repository.findById(dto.id);
      if (existing) {
        return existing;
      }
    }

    if (!dto.projectId || !isUuid.test(dto.projectId)) {
      throw new AppError('A valid project ID is required to create a task', 400, 'INVALID_PROJECT_ID');
    }

    const project = await db.project.findFirst({
      where: { id: dto.projectId, deletedAt: null },
      include: { workspace: { include: { members: true } } },
    });
    if (!project) {
      throw new AppError(`Project ${dto.projectId} not found`, 404, 'PROJECT_NOT_FOUND');
    }

    if (creatorId !== project.ownerId) {
      const isMember = project.workspace?.members?.some((m) => m.userId === creatorId);
      if (!isMember) {
        throw new AppError('Forbidden: Access to specified project denied', 403, 'FORBIDDEN');
      }
    }

    const task: Partial<TaskEntity> & { title: string; creatorId?: string } = {
      title: dto.title,
      projectId: dto.projectId,
      listId: dto.listId || null,
      parentTaskId: dto.parentTaskId || null,
      description: dto.description || null,
      status: dto.status || TaskStatus.TODO,
      priority: dto.priority || PriorityLevel.MEDIUM,
      assigneeIds: dto.assigneeIds || [],
      dependencyTaskIds: dto.dependencyTaskIds || [],
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      estimatedMinutes: dto.estimatedMinutes || null,
      loggedMinutes: 0,
      recurrence: dto.recurrence || RecurrenceInterval.NONE,
      labels: dto.labels || [],
      checklists: [],
      comments: [],
      isCompleted: dto.status === TaskStatus.DONE,
      completedAt: dto.status === TaskStatus.DONE ? now : null,
      createdAt: now,
      updatedAt: now,
      creatorId,
    };

    const savedTask = await this.repository.save(task);
    await syncProjectProgress(savedTask.projectId);

    await this.notifyAssignees(
      savedTask.assigneeIds,
      'Task assigned',
      `You were assigned to task "${savedTask.title}".`,
    );

    // Realtime sync to workspace & creator
    if (savedTask.workspaceId) {
      emitToWorkspace(savedTask.workspaceId, SocketEvent.TASK_CREATED, savedTask);
    }
    if (savedTask.creatorId) {
      emitToUser(savedTask.creatorId, SocketEvent.TASK_CREATED, savedTask);
    }

    return savedTask;
  }

  async getTask(id: string, userId?: string): Promise<TaskEntity> {
    const task = await this.repository.findById(id);
    if (!task) throw new AppError(`Task with ID ${id} not found.`, 404, 'NOT_FOUND');
    if (userId) {
      const isCreator = task.creatorId === userId;
      const isAssignee = task.assigneeIds && task.assigneeIds.includes(userId);
      if (!isCreator && !isAssignee) {
        let isMember = false;
        if (task.workspaceId) {
          const membership = await db.workspaceMember.findFirst({
            where: { workspaceId: task.workspaceId, userId },
          });
          isMember = !!membership;
        }
        if (!isMember) {
          throw new AppError('Forbidden: Access to task denied', 403, 'FORBIDDEN');
        }
      }
    }
    return task;
  }

  async listTasks(filter: TaskFilterDTO, userId?: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (userId && isUuid.test(userId)) {
      const memberships = await db.workspaceMember.findMany({
        where: { userId },
        select: { workspaceId: true },
      });
      const userWorkspaceIds = memberships.map((m) => m.workspaceId);

      if (filter.workspaceId) {
        if (!userWorkspaceIds.includes(filter.workspaceId)) {
          throw new AppError('Forbidden: Access to requested workspace denied', 403, 'FORBIDDEN');
        }
      } else if (!filter.projectId) {
        filter.workspaceIds = userWorkspaceIds;
      }

      if (filter.projectId) {
        if (!isUuid.test(filter.projectId)) {
          return { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
        }
        const project = await db.project.findFirst({
          where: { id: filter.projectId, deletedAt: null },
          select: { workspaceId: true, ownerId: true },
        });
        if (!project) {
          throw new AppError(`Project ${filter.projectId} not found`, 404, 'NOT_FOUND');
        }
        if (project.ownerId !== userId && !userWorkspaceIds.includes(project.workspaceId)) {
          throw new AppError('Forbidden: Access to requested project denied', 403, 'FORBIDDEN');
        }
      }
    }
    return this.repository.findMany(filter);
  }

  async updateTask(id: string, dto: UpdateTaskDTO, userId?: string): Promise<TaskEntity> {
    const task = await this.getTask(id, userId);
    const previousAssignees = [...task.assigneeIds];
    const prevStatus = task.status;

    if (dto.title !== undefined) task.title = dto.title;
    if (dto.description !== undefined) task.description = dto.description;
    if (dto.listId !== undefined) task.listId = dto.listId;
    if (dto.status !== undefined) {
      task.status = dto.status;
      if (dto.status === TaskStatus.DONE && !task.isCompleted) {
        task.isCompleted = true;
        task.completedAt = new Date();
      } else if (dto.status !== TaskStatus.DONE) {
        task.isCompleted = false;
        task.completedAt = null;
      }
    }
    if (dto.priority !== undefined) task.priority = dto.priority;
    if (dto.assigneeIds !== undefined) task.assigneeIds = dto.assigneeIds;
    if (dto.dependencyTaskIds !== undefined) task.dependencyTaskIds = dto.dependencyTaskIds;
    if (dto.dueDate !== undefined) task.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.estimatedMinutes !== undefined) task.estimatedMinutes = dto.estimatedMinutes;
    if (dto.loggedMinutes !== undefined) task.loggedMinutes = dto.loggedMinutes;
    if (dto.recurrence !== undefined) task.recurrence = dto.recurrence;
    if (dto.labels !== undefined) task.labels = dto.labels;

    const savedTask = await this.repository.save(task);
    await syncProjectProgress(savedTask.projectId);
    if (task.projectId && task.projectId !== savedTask.projectId) {
      await syncProjectProgress(task.projectId);
    }

    // Sync completion status with linked planner blocks
    if (dto.status !== undefined && dto.status !== prevStatus) {
      try {
        const isDone = dto.status === TaskStatus.DONE;
        const result = await db.plannerBlock.updateMany({
          where: { taskId: id },
          data: { completed: isDone },
        });
        if (result.count > 0) {
          if (savedTask.workspaceId) {
            emitToWorkspace(savedTask.workspaceId, SocketEvent.PLANNER_UPDATED, { taskId: id, completed: isDone });
          }
          if (savedTask.creatorId) {
            emitToUser(savedTask.creatorId, SocketEvent.PLANNER_UPDATED, { taskId: id, completed: isDone });
          }
        }
      } catch {
        // Planner block synchronization resilience
      }
    }

    // Realtime task update broadcast
    if (savedTask.workspaceId) {
      emitToWorkspace(savedTask.workspaceId, SocketEvent.TASK_UPDATED, savedTask);
    }
    if (savedTask.creatorId) {
      emitToUser(savedTask.creatorId, SocketEvent.TASK_UPDATED, savedTask);
    }

    const shouldNotify =
      dto.status !== undefined || dto.assigneeIds !== undefined || dto.title !== undefined;

    if (shouldNotify) {
      const nextAssignees = savedTask.assigneeIds || [];
      const newlyAssigned = nextAssignees.filter((id) => !previousAssignees.includes(id));

      if (dto.status === TaskStatus.DONE) {
        await this.notifyAssignees(
          nextAssignees,
          'Task completed',
          `Task "${savedTask.title}" is now complete.`,
        );
      } else if (newlyAssigned.length > 0) {
        await this.notifyAssignees(
          newlyAssigned,
          'Task assigned',
          `You were assigned to task "${savedTask.title}".`,
        );
      } else {
        await this.notifyAssignees(
          nextAssignees,
          'Task updated',
          `Task "${savedTask.title}" was updated.`,
        );
      }
    }

    return savedTask;
  }

  async logTime(id: string, minutes: number, userId?: string): Promise<TaskEntity> {
    const task = await this.getTask(id, userId);
    task.loggedMinutes += minutes;
    return this.repository.save(task);
  }

  async executeBulkOperation(
    dto: BulkTaskOperationDTO,
    userId?: string,
    trustedWorkspaceId?: string,
  ) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!userId || !isUuid.test(userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }

    if (!dto || !Array.isArray(dto.taskIds) || dto.taskIds.length === 0) {
      throw new AppError('Task IDs must be a non-empty array', 400, 'INVALID_INPUT');
    }

    for (const id of dto.taskIds) {
      if (!isUuid.test(id)) {
        throw new AppError(`One or more task IDs are invalid UUIDs: ${id}`, 400, 'INVALID_ID_FORMAT');
      }
    }

    const validActions = ['UPDATE_STATUS', 'DELETE', 'ASSIGN', 'ADD_LABEL'];
    if (!dto.action || !validActions.includes(dto.action)) {
      throw new AppError('Invalid bulk operation action', 400, 'INVALID_ACTION');
    }

    const uniqueTaskIds = Array.from(new Set(dto.taskIds));

    // Verify user workspace memberships
    const memberships = await db.workspaceMember.findMany({
      where: { userId },
      select: { workspaceId: true, role: true },
    });
    const userWorkspaceIds = new Set(memberships.map((m) => m.workspaceId));
    if (userWorkspaceIds.size === 0) {
      throw new AppError('Forbidden: Access to requested workspace denied', 403, 'FORBIDDEN');
    }

    if (trustedWorkspaceId && !userWorkspaceIds.has(trustedWorkspaceId)) {
      throw new AppError('Forbidden: Access to requested workspace denied', 403, 'FORBIDDEN');
    }

    // Resolve all requested tasks
    const existingTasks = await db.task.findMany({
      where: { id: { in: uniqueTaskIds }, deletedAt: null },
      select: {
        id: true,
        workspaceId: true,
        projectId: true,
        labels: true,
        status: true,
        creatorId: true,
        assigneeId: true,
      },
    });

    if (existingTasks.length !== uniqueTaskIds.length) {
      throw new AppError('One or more requested tasks were not found', 404, 'NOT_FOUND');
    }

    // Ensure all tasks belong to authorized workspace and there is no mixed-workspace contamination
    const targetWorkspaceId = trustedWorkspaceId || existingTasks[0]?.workspaceId;
    if (!targetWorkspaceId || !userWorkspaceIds.has(targetWorkspaceId)) {
      throw new AppError('Forbidden: Access to task workspace denied', 403, 'FORBIDDEN');
    }

    for (const task of existingTasks) {
      if (task.workspaceId !== targetWorkspaceId || !userWorkspaceIds.has(task.workspaceId)) {
        throw new AppError(
          'Forbidden: Mixed or unauthorized workspace tasks are not permitted in a single bulk operation',
          403,
          'FORBIDDEN',
        );
      }
    }

    return await db.$transaction(async (tx) => {
      if (dto.action === 'DELETE') {
        if ((tx as any).plannerBlock) {
          await (tx as any).plannerBlock.updateMany({
            where: { taskId: { in: uniqueTaskIds } },
            data: { taskId: null },
          });
        }
        if ((tx as any).calendarEvent) {
          await (tx as any).calendarEvent.updateMany({
            where: { taskId: { in: uniqueTaskIds } },
            data: { taskId: null },
          });
        }

        const deleteResult = await tx.task.updateMany({
          where: { id: { in: uniqueTaskIds }, workspaceId: targetWorkspaceId, deletedAt: null },
          data: { deletedAt: new Date() },
        });

        const affectedProjects = new Set(
          existingTasks.map((t) => t.projectId).filter(Boolean) as string[],
        );
        for (const pId of affectedProjects) {
          await syncProjectProgress(pId);
        }

        if (targetWorkspaceId) {
          emitToWorkspace(targetWorkspaceId, SocketEvent.TASK_DELETED, { taskIds: uniqueTaskIds });
        }

        return { count: deleteResult.count, success: true };
      } else if (dto.action === 'UPDATE_STATUS') {
        const newStatus = dto.payload?.status;
        if (!newStatus) {
          throw new AppError('Status is required for UPDATE_STATUS action', 400, 'INVALID_INPUT');
        }
        const isCompleted = newStatus === TaskStatus.DONE;
        const completedAt = isCompleted ? new Date() : null;

        const updateResult = await tx.task.updateMany({
          where: { id: { in: uniqueTaskIds }, workspaceId: targetWorkspaceId, deletedAt: null },
          data: { status: newStatus as any, completedAt },
        });

        if ((tx as any).plannerBlock) {
          await (tx as any).plannerBlock.updateMany({
            where: { taskId: { in: uniqueTaskIds } },
            data: { completed: isCompleted },
          });
        }

        const affectedProjects = new Set(
          existingTasks.map((t) => t.projectId).filter(Boolean) as string[],
        );
        for (const pId of affectedProjects) {
          await syncProjectProgress(pId);
        }

        if (targetWorkspaceId) {
          emitToWorkspace(targetWorkspaceId, SocketEvent.TASK_UPDATED, {
            taskIds: uniqueTaskIds,
            status: newStatus,
          });
        }

        return { count: updateResult.count, updated: updateResult.count, success: true };
      } else if (dto.action === 'ASSIGN') {
        const assigneeIds = dto.payload?.assigneeIds;
        const assigneeId = assigneeIds && assigneeIds.length > 0 ? assigneeIds[0] : null;
        if (assigneeId) {
          if (!isUuid.test(assigneeId)) {
            throw new AppError('Invalid assignee ID format', 400, 'INVALID_ID_FORMAT');
          }
          const assigneeMember = await tx.workspaceMember.findFirst({
            where: { workspaceId: targetWorkspaceId, userId: assigneeId },
          });
          if (!assigneeMember) {
            throw new AppError('Assignee is not a member of the workspace', 400, 'INVALID_ASSIGNEE');
          }
        }

        const updateResult = await tx.task.updateMany({
          where: { id: { in: uniqueTaskIds }, workspaceId: targetWorkspaceId, deletedAt: null },
          data: { assigneeId },
        });

        return { count: updateResult.count, updated: updateResult.count, success: true };
      } else if (dto.action === 'ADD_LABEL') {
        const label = dto.payload?.label?.trim();
        if (!label) {
          throw new AppError('Label is required for ADD_LABEL action', 400, 'INVALID_INPUT');
        }

        let updatedCount = 0;
        for (const task of existingTasks) {
          const currentLabels = task.labels || [];
          if (!currentLabels.includes(label)) {
            await tx.task.update({
              where: { id: task.id },
              data: { labels: [...currentLabels, label] },
            });
            updatedCount++;
          }
        }

        return { count: uniqueTaskIds.length, updated: updatedCount, success: true };
      }

      return { count: 0, updated: 0, success: true };
    });
  }

  async deleteTask(id: string, userId?: string): Promise<boolean> {
    const task = await this.getTask(id, userId);

    try {
      await db.$transaction(async (tx) => {
        if ((tx as any).plannerBlock) {
          await (tx as any).plannerBlock.updateMany({
            where: { taskId: id },
            data: { taskId: null },
          });
        }
        if ((tx as any).calendarEvent) {
          await (tx as any).calendarEvent.updateMany({
            where: { taskId: id },
            data: { taskId: null },
          });
        }
        await tx.task.update({
          where: { id },
          data: { deletedAt: new Date() },
        });
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(`Database persistence failure: unable to delete task ${id}`, 503, 'DATABASE_PERSISTENCE_ERROR');
    }

    if (task.projectId) {
      await syncProjectProgress(task.projectId);
    }
    if (task.workspaceId) {
      emitToWorkspace(task.workspaceId, SocketEvent.TASK_DELETED, { id, workspaceId: task.workspaceId });
      emitToWorkspace(task.workspaceId, SocketEvent.PLANNER_UPDATED, { unlinkedTaskId: id });
      emitToWorkspace(task.workspaceId, SocketEvent.CALENDAR_UPDATED, { unlinkedTaskId: id });
    }
    if (task.creatorId) {
      emitToUser(task.creatorId, SocketEvent.TASK_DELETED, { id });
    }
    return true;
  }
}
