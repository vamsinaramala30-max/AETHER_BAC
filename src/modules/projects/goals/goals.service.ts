// ============================================================================
// File: backend/src/modules/projects/goals/goals.service.ts
// ============================================================================

import { GoalsRepository } from './goals.repository';
import { GoalEntity } from './goals.entity';
import { CreateGoalDTO, UpdateGoalDTO, GoalFilterDTO } from './goals.dto';
import { GoalStatus } from '../projects.constants';

export class GoalsService {
  constructor(private readonly repository: GoalsRepository) {}

  async createGoal(dto: CreateGoalDTO): Promise<GoalEntity> {
    const id = `gol_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date();

    const goal: GoalEntity = {
      id,
      userId: dto.userId,
      title: dto.title,
      description: dto.description || null,
      type: dto.type,
      status: GoalStatus.NOT_STARTED,
      category: dto.category,
      targetValue: dto.targetValue || 100,
      currentValue: 0,
      unit: dto.unit || '%',
      deadline: new Date(dto.deadline),
      milestones: [],
      linkedProjectIds: dto.linkedProjectIds || [],
      linkedTaskIds: dto.linkedTaskIds || [],
      isCompleted: false,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    return this.repository.save(goal);
  }

  async getGoal(id: string): Promise<GoalEntity> {
    const goal = await this.repository.findById(id);
    if (!goal) throw new Error(`Goal with ID ${id} not found.`);
    return goal;
  }

  async listGoals(filter: GoalFilterDTO) {
    return this.repository.findMany(filter);
  }

  async updateGoal(id: string, dto: UpdateGoalDTO): Promise<GoalEntity> {
    const goal = await this.getGoal(id);

    if (dto.title !== undefined) goal.title = dto.title;
    if (dto.description !== undefined) goal.description = dto.description;
    if (dto.status !== undefined) goal.status = dto.status;
    if (dto.category !== undefined) goal.category = dto.category;
    if (dto.targetValue !== undefined) goal.targetValue = dto.targetValue;
    if (dto.currentValue !== undefined) {
      goal.currentValue = dto.currentValue;
      if (goal.currentValue >= goal.targetValue) {
        goal.isCompleted = true;
        goal.status = GoalStatus.ACHIEVED;
        goal.completedAt = new Date();
      }
    }
    if (dto.deadline !== undefined) goal.deadline = new Date(dto.deadline);
    if (dto.linkedProjectIds !== undefined) goal.linkedProjectIds = dto.linkedProjectIds;
    if (dto.linkedTaskIds !== undefined) goal.linkedTaskIds = dto.linkedTaskIds;

    return this.repository.save(goal);
  }

  async deleteGoal(id: string): Promise<boolean> {
    await this.getGoal(id);
    return this.repository.delete(id);
  }
}