// ============================================================================
// File: backend/src/modules/projects/tasks/tasks.service.ts
// ============================================================================

import { TasksRepository } from './tasks.repository';
import { TaskEntity } from './tasks.entity';
import { CreateTaskDTO, UpdateTaskDTO, TaskFilterDTO, BulkTaskOperationDTO } from './tasks.dto';
import { TaskStatus, PriorityLevel, RecurrenceInterval } from '../projects.constants';
import { db } from '../../../database/client';

export class TasksService {
  constructor(private readonly repository: TasksRepository) {}

  private async notifyAssignees(assigneeIds: string[], title: string, message: string, type: string = 'TASK') {
    if (!assigneeIds?.length) return;

    try {
      await Promise.all(
        assigneeIds.map(async (assigneeId) => {
          const userExists = await db.user.findUnique({ where: { id: assigneeId } });
          if (!userExists) return;
          await db.notification.create({
            data: {
              userId: assigneeId,
              title,
              message,
              type: type as any,
            },
          });
        }),
      );
    } catch {
      // Ignore notification failures
    }
  }

  async createTask(dto: CreateTaskDTO): Promise<TaskEntity> {
    const id = `tsk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date();

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
      creatorId: dto.assigneeIds && dto.assigneeIds.length > 0 ? dto.assigneeIds[0] : undefined,
    };

    const savedTask = await this.repository.save(task);
    await this.notifyAssignees(
      savedTask.assigneeIds,
      'Task assigned',
      `You were assigned to task "${savedTask.title}".`,
    );
    return savedTask;
  }

  async getTask(id: string): Promise<TaskEntity> {
    const task = await this.repository.findById(id);
    if (!task) throw new Error(`Task with ID ${id} not found.`);
    return task;
  }

  async listTasks(filter: TaskFilterDTO) {
    return this.repository.findMany(filter);
  }

  async updateTask(id: string, dto: UpdateTaskDTO): Promise<TaskEntity> {
    const task = await this.getTask(id);
    const previousAssignees = [...task.assigneeIds];

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
    const shouldNotify = dto.status !== undefined || dto.assigneeIds !== undefined || dto.title !== undefined;

    if (shouldNotify) {
      const nextAssignees = savedTask.assigneeIds || [];
      const newlyAssigned = nextAssignees.filter((id) => !previousAssignees.includes(id));

      if (dto.status === TaskStatus.DONE) {
        await this.notifyAssignees(nextAssignees, 'Task completed', `Task "${savedTask.title}" is now complete.`);
      } else if (newlyAssigned.length > 0) {
        await this.notifyAssignees(newlyAssigned, 'Task assigned', `You were assigned to task "${savedTask.title}".`);
      } else {
        await this.notifyAssignees(nextAssignees, 'Task updated', `Task "${savedTask.title}" was updated.`);
      }
    }

    return savedTask;
  }

  async logTime(id: string, minutes: number): Promise<TaskEntity> {
    const task = await this.getTask(id);
    task.loggedMinutes += minutes;
    return this.repository.save(task);
  }

  async executeBulkOperation(dto: BulkTaskOperationDTO) {
    if (dto.action === 'DELETE') {
      const deletedCount = await this.repository.deleteMany(dto.taskIds);
      return { count: deletedCount };
    }

    const updatedTasks: TaskEntity[] = [];
    for (const taskId of dto.taskIds) {
      const task = await this.getTask(taskId);
      if (dto.action === 'UPDATE_STATUS' && dto.payload.status) {
        task.status = dto.payload.status;
        task.isCompleted = dto.payload.status === TaskStatus.DONE;
      } else if (dto.action === 'ASSIGN' && dto.payload.assigneeIds) {
        task.assigneeIds = dto.payload.assigneeIds;
      } else if (dto.action === 'ADD_LABEL' && dto.payload.label) {
        if (!task.labels.includes(dto.payload.label)) {
          task.labels.push(dto.payload.label);
        }
      }
      const saved = await this.repository.save(task);
      updatedTasks.push(saved);
    }
    return { updated: updatedTasks.length };
  }

  async deleteTask(id: string): Promise<boolean> {
    await this.getTask(id);
    return this.repository.delete(id);
  }
}
