// ============================================================================
// File: backend/src/modules/projects/projects.service.ts
// ============================================================================

import { ProjectsSubService } from './projects/projects.service';
import { TasksService } from './tasks/tasks.service';
import { GoalsService } from './goals/goals.service';
import { StudyPlannerService } from './study-planner/study-planner.service';
import { WeeklyReviewService } from './weekly-review/weekly-review.service';
import { ProjectsModuleSharedRepository } from './projects.repository';

export class ProjectsOrchestrationService {
  public readonly projects: ProjectsSubService;
  public readonly tasks: TasksService;
  public readonly goals: GoalsService;
  public readonly studyPlanner: StudyPlannerService;
  public readonly weeklyReview: WeeklyReviewService;

  constructor(private readonly sharedRepo: ProjectsModuleSharedRepository) {
    this.projects = new ProjectsSubService(sharedRepo.projects);
    this.tasks = new TasksService(sharedRepo.tasks);
    this.goals = new GoalsService(sharedRepo.goals);
    this.studyPlanner = new StudyPlannerService(sharedRepo.studyPlanner);
    this.weeklyReview = new WeeklyReviewService(sharedRepo.weeklyReviews);
  }

  async getDashboardData(userId: string) {
    const stats = await this.sharedRepo.getAggregateStats(userId);
    const recentProjects = await this.projects.listProjects({ ownerId: userId, limit: 5 });
    const pendingTasks = await this.tasks.listTasks({ assigneeId: userId, limit: 10 });
    const activeGoals = await this.goals.listGoals({ userId, limit: 5 });

    return {
      stats,
      recentProjects: recentProjects.data,
      pendingTasks: pendingTasks.data,
      activeGoals: activeGoals.data,
    };
  }
}