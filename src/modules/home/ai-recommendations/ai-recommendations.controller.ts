import { Request, Response } from 'express';
import { AIRecommendationsService } from './ai-recommendations.service';
import { GetAIRecommendationsQuerySchema } from './ai-recommendations.dto';

export class AIRecommendationsController {
  constructor(private readonly service: AIRecommendationsService) {}

  async getRecommendations(req: Request, res: Response): Promise<void> {
    const query = GetAIRecommendationsQuerySchema.parse(req.query);
    const data = await this.service.getRecommendations(query.workspaceId);
    res.status(200).json({ success: true, data });
  }
}
