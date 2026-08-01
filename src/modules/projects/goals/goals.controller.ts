// ============================================================================
// File: backend/src/modules/projects/goals/goals.controller.ts
// ============================================================================

import { GoalsService } from './goals.service';
import { CreateGoalDTO, UpdateGoalDTO, GoalFilterDTO } from './goals.dto';

export class GoalsController {
  constructor(private readonly service: GoalsService) {}

  async create(req: { body: CreateGoalDTO }) {
    const data = await this.service.createGoal(req.body);
    return { success: true, data };
  }

  async getOne(req: { params: { id: string } }) {
    const data = await this.service.getGoal(req.params.id);
    return { success: true, data };
  }

  async list(req: { query: GoalFilterDTO }) {
    const result = await this.service.listGoals(req.query);
    return { success: true, ...result };
  }

  async update(req: { params: { id: string }; body: UpdateGoalDTO }) {
    const data = await this.service.updateGoal(req.params.id, req.body);
    return { success: true, data };
  }

  async delete(req: { params: { id: string } }) {
    await this.service.deleteGoal(req.params.id);
    return { success: true, message: 'Goal deleted successfully.' };
  }
}