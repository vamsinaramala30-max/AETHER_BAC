import { Request, Response, NextFunction } from 'express';
import { AiService } from './ai.service';

export class AiController {
  constructor(private aiService: AiService) {}

  public async healthCheck(req: Request, res: Response): Promise<void> {
    const health = await this.aiService.getHealthStatus();
    res.json(health);
  }

  public async chat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.aiService.assistant.processChat({
        userId: (req as any).user?.id || '',
        content: req.body.message || req.body.content || '',
        conversationId: req.body.conversationId,
        model: req.body.model,
        temperature: req.body.temperature,
      });
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  public async generatePrompt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: { prompt: req.body.input } });
    } catch (err) {
      next(err);
    }
  }

  public async getConversations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || '';
      const result = await this.aiService.assistant.listConversations(userId, {
        page: 1,
        limit: 20,
      });
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  public async getConversationById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || '';
      const result = await this.aiService.assistant.getConversation(req.params.id, userId);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
}
