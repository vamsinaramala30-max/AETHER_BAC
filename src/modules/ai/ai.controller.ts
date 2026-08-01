import { AiService } from './ai.service';

export class AiController {
  constructor(private aiService: AiService) {}

  public async healthCheck(req: any, res: any): Promise<void> {
    const health = await this.aiService.getHealthStatus();
    res.json(health);
  }
}