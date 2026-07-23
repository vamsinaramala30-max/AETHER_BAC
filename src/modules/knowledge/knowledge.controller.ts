import { Request, Response, NextFunction } from 'express';
import { KnowledgeService } from './knowledge.service';

const knowledgeService = new KnowledgeService();

export class KnowledgeController {
  public async createKnowledgeBase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { workspaceId, name } = req.body;
      const kb = await knowledgeService.createKnowledgeBase(workspaceId, name);
      res.status(201).json({ success: true, data: kb });
    } catch (err) {
      next(err);
    }
  }

  public async getKnowledgeBases(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const workspaceId = req.headers['x-workspace-id'] as string;
      const list = await knowledgeService.getKnowledgeBases(workspaceId);
      res.status(200).json({ success: true, data: list });
    } catch (err) {
      next(err);
    }
  }

  public async getKnowledgeBaseById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const kb = await knowledgeService.getKnowledgeBaseById(req.params.id);
      res.status(200).json({ success: true, data: kb });
    } catch (err) {
      next(err);
    }
  }

  public async deleteKnowledgeBase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await knowledgeService.deleteKnowledgeBase(req.params.id);
      res.status(200).json({ success: true, message: 'Knowledge base deleted' });
    } catch (err) {
      next(err);
    }
  }
}

export const knowledgeController = new KnowledgeController();