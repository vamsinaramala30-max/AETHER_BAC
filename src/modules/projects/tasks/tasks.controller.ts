// ============================================================================
// File: backend/src/modules/projects/tasks/tasks.controller.ts
// ============================================================================

import { TasksService } from './tasks.service';
import { CreateTaskDTO, UpdateTaskDTO, TaskFilterDTO, BulkTaskOperationDTO } from './tasks.dto';
import { AppError } from '../../../middleware/error.middleware';

export class TasksController {
  constructor(private readonly service: TasksService) {}

  async create(req: { body: CreateTaskDTO; user?: { id: string } }) {
    const data = await this.service.createTask(req.body);
    return { success: true, data };
  }

  async getOne(req: { params: { id: string }; user?: { id: string } }) {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    const data = await this.service.getTask(req.params.id, userId);
    return { success: true, data };
  }

  async list(req: { query: TaskFilterDTO; user?: { id: string } }) {
    const result = await this.service.listTasks(req.query);
    return { success: true, ...result };
  }

  async update(req: { params: { id: string }; body: UpdateTaskDTO; user?: { id: string } }) {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    const data = await this.service.updateTask(req.params.id, req.body, userId);
    return { success: true, data };
  }

  async logTime(req: { params: { id: string }; body: { minutes: number }; user?: { id: string } }) {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    const data = await this.service.logTime(req.params.id, req.body.minutes, userId);
    return { success: true, data };
  }

  async bulk(req: { body: BulkTaskOperationDTO; user?: { id: string } }) {
    const result = await this.service.executeBulkOperation(req.body);
    return { success: true, result };
  }

  async delete(req: { params: { id: string }; user?: { id: string } }) {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    await this.service.deleteTask(req.params.id, userId);
    return { success: true, message: 'Task deleted successfully.' };
  }
}
