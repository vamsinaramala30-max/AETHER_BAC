import { AIRecommendationsRepository } from './ai-recommendations.repository';
import { AIRecommendationsEntity, RecommendationEntity } from './ai-recommendations.entity';

export class AIRecommendationsService {
  constructor(private readonly repository: AIRecommendationsRepository) {}

  async getRecommendations(workspaceId: string): Promise<AIRecommendationsEntity> {
    const context = await this.repository.getWorkspaceContext(workspaceId);
    const recommendations: RecommendationEntity[] = [];

    if (context.projectCount === 0) {
      recommendations.push({
        id: 'rec-1',
        title: 'Create Your First Project',
        description: 'Organize your conversations and documents inside a project.',
        actionUrl: '/projects/new',
        type: 'SUGGESTION',
      });
    }

    if (context.documentCount === 0) {
      recommendations.push({
        id: 'rec-2',
        title: 'Upload Knowledge Documents',
        description: 'Provide context for AI model interactions by uploading files.',
        actionUrl: '/knowledge/upload',
        type: 'OPTIMIZATION',
      });
    }

    return { recommendations };
  }
}
