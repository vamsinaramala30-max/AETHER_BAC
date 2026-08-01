import { WorkspaceService } from './workspace.service';

export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  async getWorkspaceOverview(workspaceId: string, userId: string) {
    return this.workspaceService.getOverview(workspaceId, userId);
  }
}