import { KnowledgeRepository } from './knowledge.repository';
import { AppError } from '../../middleware/error.middleware';

export class KnowledgeService {
  private repo: KnowledgeRepository;

  constructor() {
    this.repo = new KnowledgeRepository();
  }

  public async createKnowledgeBase(workspaceId: string, name: string) {
    return this.repo.create(workspaceId, name);
  }

  public async getKnowledgeBases(workspaceId: string) {
    return this.repo.findByWorkspaceId(workspaceId);
  }

  public async getKnowledgeBaseById(id: string) {
    const kb = await this.repo.findById(id);
    if (!kb) {
      throw new AppError('Knowledge Base not found', 404, 'KB_NOT_FOUND');
    }
    return kb;
  }

  public async deleteKnowledgeBase(id: string) {
    await this.getKnowledgeBaseById(id);
    return this.repo.delete(id);
  }
}
