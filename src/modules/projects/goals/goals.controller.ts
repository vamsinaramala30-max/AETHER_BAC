// ============================================================================
// File: backend/src/modules/projects/goals/goals.controller.ts
// ============================================================================

import { GoalsService } from './goals.service';
import { CreateGoalDTO, UpdateGoalDTO, GoalFilterDTO } from './goals.dto';
import { AppError } from '../../../middleware/error.middleware';

export class GoalsController {
  constructor(private readonly service: GoalsService) {}

  async create(req: { body: CreateGoalDTO; user?: { id: string } }) {
    const data = await this.service.createGoal(req.body);
    return { success: true, data };
  }

  async getOne(req: { params: { id: string }; user?: { id: string } }) {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    const data = await this.service.getGoal(req.params.id, userId);
    return { success: true, data };
  }

  async list(req: { query: GoalFilterDTO; user?: { id: string } }) {
    const result = await this.service.listGoals(req.query);
    return { success: true, ...result };
  }

  async update(req: { params: { id: string }; body: UpdateGoalDTO; user?: { id: string } }) {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    const data = await this.service.updateGoal(req.params.id, req.body, userId);
    return { success: true, data };
  }

  async delete(req: { params: { id: string }; user?: { id: string } }) {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    await this.service.deleteGoal(req.params.id, userId);
    return { success: true, message: 'Goal deleted successfully.' };
  }
}
