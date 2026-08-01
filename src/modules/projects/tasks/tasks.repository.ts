// ============================================================================
// File: backend/src/modules/projects/tasks/tasks.repository.ts
// ============================================================================

import { TaskEntity } from './tasks.entity';
import { TaskFilterDTO } from './tasks.dto';
import { PaginatedResult } from '../projects/projects.repository';

export class TasksRepository {
  private tasks: Map<string, TaskEntity> = new Map();

  async findById(id: string): Promise<TaskEntity | null> {
    const task = this.tasks.get(id);
    return task ? { ...task } : null;
  }

  async findMany(filter: TaskFilterDTO): Promise<PaginatedResult<TaskEntity>> {
    let items = Array.from(this.tasks.values());

    if (filter.projectId) {
      items = items.filter((t) => t.projectId === filter.projectId);
    }
    if (filter.listId) {
      items = items.filter((t) => t.listId === filter.listId);
    }
    if (filter.status) {
      items = items.filter((t) => t.status === filter.status);
    }
    if (filter.priority) {
      items = items.filter((t) => t.priority === filter.priority);
    }
    if (filter.assigneeId) {
      items = items.filter((t) => t.assigneeIds.includes(filter.assigneeId!));
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      items = items.filter((t) => t.title.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q)));
    }

    const page = Math.max(1, filter.page || 1);
    const limit = Math.max(1, Math.min(100, filter.limit || 20));
    const total = items.length;
    const startIndex = (page - 1) * limit;

    return {
      data: items.slice(startIndex, startIndex + limit),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async save(task: TaskEntity): Promise<TaskEntity> {
    this.tasks.set(task.id, { ...task, updatedAt: new Date() });
    return { ...this.tasks.get(task.id)! };
  }

  async delete(id: string): Promise<boolean> {
    return this.tasks.delete(id);
  }

  async deleteMany(ids: string[]): Promise<number> {
    let count = 0;
    for (const id of ids) {
      if (this.tasks.delete(id)) count++;
    }
    return count;
  }
}