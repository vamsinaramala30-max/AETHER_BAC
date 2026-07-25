import { ProjectRepository } from './project.repository';
import { AppError } from '../../middleware/error.middleware';

export class ProjectService {
  private repo: ProjectRepository;

  constructor() {
    this.repo = new ProjectRepository();
  }

  public async createProject(workspaceId: string, ownerId: string, name: string, description?: string) {
    return this.repo.create(workspaceId, ownerId, name, description || '');
  }

  public async getProjectsByWorkspace(workspaceId: string) {
    return this.repo.findByWorkspaceId(workspaceId);
  }

  public async getProjectById(id: string) {
    const proj = await this.repo.findById(id);
    if (!proj) throw new AppError('Project not found', 404, 'PROJECT_NOT_FOUND');
    return proj;
  }

  public async updateProject(id: string, name?: string, description?: string) {
    await this.getProjectById(id);
    return this.repo.update(id, name, description);
  }

  public async deleteProject(id: string) {
    await this.getProjectById(id);
    return this.repo.delete(id);
  }
}