// ============================================================================
// File: backend/src/modules/projects/goals/goals.repository.ts
// ============================================================================

import { GoalEntity } from './goals.entity';
import { GoalFilterDTO } from './goals.dto';
import { PaginatedResult } from '../projects.repository';

export class GoalsRepository {
  private goals: Map<string, GoalEntity> = new Map();

  async findById(id: string): Promise<GoalEntity | null> {
    const goal = this.goals.get(id);
    return goal ? { ...goal } : null;
  }

  async findMany(filter: GoalFilterDTO): Promise<PaginatedResult<GoalEntity>> {
    let items = Array.from(this.goals.values());

    if (filter.userId) {
      items = items.filter((g) => g.userId === filter.userId);
    }
    if (filter.category) {
      items = items.filter((g) => g.category.toLowerCase() === filter.category?.toLowerCase());
    }
    if (filter.type) {
      items = items.filter((g) => g.type === filter.type);
    }
    if (filter.status) {
      items = items.filter((g) => g.status === filter.status);
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

  async save(goal: GoalEntity): Promise<GoalEntity> {
    this.goals.set(goal.id, { ...goal, updatedAt: new Date() });
    return { ...this.goals.get(goal.id)! };
  }

  async delete(id: string): Promise<boolean> {
    return this.goals.delete(id);
  }
}
