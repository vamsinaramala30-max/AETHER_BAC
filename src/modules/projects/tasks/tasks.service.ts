// ============================================================================
// File: backend/src/modules/projects/tasks/tasks.service.ts
// ============================================================================

import { TasksRepository } from './tasks.repository';
import { TaskEntity } from './tasks.entity';
import { CreateTaskDTO, UpdateTaskDTO, TaskFilterDTO, BulkTaskOperationDTO } from './tasks.dto';
import { TaskStatus, PriorityLevel, RecurrenceInterval } from '../projects.constants';

export class TasksService {
  constructor(private readonly repository: TasksRepository) {}

  async createTask(dto: CreateTaskDTO): Promise<TaskEntity> {
    const id = `tsk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date();

    const task: TaskEntity = {
      id,
      projectId: dto.projectId,
      listId: dto.listId || null,
      parentTaskId: dto.parentTaskId || null,
      title: dto.title,
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
    };

    return this.repository.save(task);
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

    return this.repository.save(task);
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
