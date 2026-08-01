// ============================================================================
// File: backend/src/modules/projects/tasks/tasks.controller.ts
// ============================================================================

import { TasksService } from './tasks.service';
import { CreateTaskDTO, UpdateTaskDTO, TaskFilterDTO, BulkTaskOperationDTO } from './tasks.dto';

export class TasksController {
  constructor(private readonly service: TasksService) {}

  async create(req: { body: CreateTaskDTO }) {
    const data = await this.service.createTask(req.body);
    return { success: true, data };
  }

  async getOne(req: { params: { id: string } }) {
    const data = await this.service.getTask(req.params.id);
    return { success: true, data };
  }

  async list(req: { query: TaskFilterDTO }) {
    const result = await this.service.listTasks(req.query);
    return { success: true, ...result };
  }

  async update(req: { params: { id: string }; body: UpdateTaskDTO }) {
    const data = await this.service.updateTask(req.params.id, req.body);
    return { success: true, data };
  }

  async logTime(req: { params: { id: string }; body: { minutes: number } }) {
    const data = await this.service.logTime(req.params.id, req.body.minutes);
    return { success: true, data };
  }

  async bulk(req: { body: BulkTaskOperationDTO }) {
    const result = await this.service.executeBulkOperation(req.body);
    return { success: true, result };
  }

  async delete(req: { params: { id: string } }) {
    await this.service.deleteTask(req.params.id);
    return { success: true, message: 'Task deleted successfully.' };
  }
}