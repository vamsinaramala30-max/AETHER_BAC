import { WorkspaceRepository } from './workspace.repository';
import { AppError } from '../../middleware/error.middleware';

export class WorkspaceService {
  private repo: WorkspaceRepository;

  constructor() {
    this.repo = new WorkspaceRepository();
  }

  public async createWorkspace(userId: string, name: string, slug: string, description?: string) {
    return this.repo.createWorkspace(userId, name, slug, description);
  }

  public async getUserWorkspaces(userId: string) {
    return this.repo.findByUserId(userId);
  }

  public async getWorkspaceById(id: string) {
    const ws = await this.repo.findById(id);
    if (!ws) {
      throw new AppError('Workspace not found', 404, 'WORKSPACE_NOT_FOUND');
    }
    return ws;
  }

  public async updateWorkspace(id: string, name?: string, description?: string) {
    await this.getWorkspaceById(id);
    return this.repo.updateWorkspace(id, name, description);
  }

  public async deleteWorkspace(id: string) {
    await this.getWorkspaceById(id);
    return this.repo.deleteWorkspace(id);
  }

  public async addMember(workspaceId: string, userId: string, role: string) {
    await this.getWorkspaceById(workspaceId);
    return this.repo.addMember(workspaceId, userId, role);
  }
}
