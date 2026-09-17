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
    const now = new Date();

    const deadlineDate =
      dto.deadline && !isNaN(new Date(dto.deadline).getTime())
        ? new Date(dto.deadline)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const goal: Partial<GoalEntity> & { projectId?: string; workspaceId?: string } = {
      userId: dto.userId,
      projectId:
        (dto as any).projectId ||
        (dto.linkedProjectIds && dto.linkedProjectIds.length > 0
          ? dto.linkedProjectIds[0]
          : undefined),
      workspaceId: (dto as any).workspaceId,
      title: dto.title || 'Untitled Goal',
      description: dto.description || null,
      type: dto.type || ('OBJECTIVE' as any),
      status: (dto as any).status || GoalStatus.NOT_STARTED,
      category: dto.category || 'General',
      targetValue: dto.targetValue || 100,
      currentValue: (dto as any).progress ?? (dto as any).currentValue ?? 0,
      unit: dto.unit || '%',
      deadline: deadlineDate,
      milestones: [],
      linkedProjectIds: (dto as any).projectId
        ? [(dto as any).projectId]
        : dto.linkedProjectIds || [],
      linkedTaskIds: dto.linkedTaskIds || [],
      isCompleted: false,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    return this.repository.save(goal as GoalEntity);
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
    if (dto.currentValue !== undefined || (dto as any).progress !== undefined) {
      goal.currentValue = (dto as any).progress ?? dto.currentValue;
      if (goal.currentValue >= goal.targetValue) {
        goal.isCompleted = true;
        goal.status = GoalStatus.ACHIEVED;
        goal.completedAt = new Date();
      }
    }
    if (dto.deadline !== undefined) goal.deadline = new Date(dto.deadline);
    if (dto.linkedProjectIds !== undefined) goal.linkedProjectIds = dto.linkedProjectIds;
    if ((dto as any).projectId !== undefined) {
      (goal as any).projectId = (dto as any).projectId;
    }
    if (dto.linkedTaskIds !== undefined) goal.linkedTaskIds = dto.linkedTaskIds;

    return this.repository.save(goal);
  }

  async deleteGoal(id: string): Promise<boolean> {
    await this.getGoal(id);
    return this.repository.delete(id);
  }
}
