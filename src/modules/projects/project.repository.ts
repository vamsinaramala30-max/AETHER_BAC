// ============================================================================
// File: backend/src/modules/projects/projects.repository.ts
// ============================================================================

import { ProjectsRepository } from './projects.repository';
import { TasksRepository } from './tasks/tasks.repository';
import { GoalsRepository } from './goals/goals.repository';
import { StudyPlannerRepository } from './study-planner/study-planner.repository';
import { WeeklyReviewRepository } from './weekly-review/weekly-review.repository';

export class ProjectsModuleSharedRepository {
  public readonly projects: ProjectsRepository;
  public readonly tasks: TasksRepository;
  public readonly goals: GoalsRepository;
  public readonly studyPlanner: StudyPlannerRepository;
  public readonly weeklyReviews: WeeklyReviewRepository;

  constructor() {
    this.projects = new ProjectsRepository();
    this.tasks = new TasksRepository();
    this.goals = new GoalsRepository();
    this.studyPlanner = new StudyPlannerRepository();
    this.weeklyReviews = new WeeklyReviewRepository();
  }

  async getAggregateStats(userId: string) {
    const projects = await this.projects.findMany({ ownerId: userId, limit: 100 });
    const tasks = await this.tasks.findMany({ assigneeId: userId, limit: 100 });
    const goals = await this.goals.findMany({ userId, limit: 100 });

    return {
      totalProjects: projects.total,
      totalTasks: tasks.total,
      completedTasks: tasks.data.filter((t) => t.isCompleted).length,
      totalGoals: goals.total,
      completedGoals: goals.data.filter((g) => g.isCompleted).length,
    };
  }
}