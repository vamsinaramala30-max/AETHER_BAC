import { Request, Response, NextFunction } from 'express';
import { AIService } from './ai.service';

const aiService = new AIService();

export class AIController {
  public async chat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { message, conversationId, workspaceId } = req.body;
      const result = await aiService.processChat(userId, workspaceId, message, conversationId);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  public async generatePrompt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ success: true, data: { prompt: req.body.prompt } });
    } catch (err) {
      next(err);
    }
  }

  public async getConversations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const workspaceId = req.headers['x-workspace-id'] as string;
      const result = await aiService.getConversations(userId, workspaceId);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  public async getConversationById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await aiService.getConversationById(req.params.id);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}

export const aiController = new AIController();
