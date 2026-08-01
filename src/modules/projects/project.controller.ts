// ============================================================================
// File: backend/src/modules/projects/projects.controller.ts
// ============================================================================

import { ProjectsOrchestrationService } from './project.service';

export class ProjectsOrchestrationController {
  constructor(private readonly orchestrationService: ProjectsOrchestrationService) {}

  async getDashboard(req: { query: { userId: string } }) {
    const data = await this.orchestrationService.getDashboardData(req.query.userId);
    return { success: true, data };
  }

  async getOverview(req: { query: { userId: string } }) {
    const dashboard = await this.orchestrationService.getDashboardData(req.query.userId);
    return {
      success: true,
      overview: {
        summary: 'User performance overview retrieved successfully',
        ...dashboard,
      },
    };
  }
}