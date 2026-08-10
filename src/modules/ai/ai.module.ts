import { Request, Response, NextFunction } from 'express';
import { chatController } from './api/controllers/chat-controller.js';
import { aiController as coreAiController } from './api/controllers/ai-controller.js';
import { conversationController } from './api/controllers/conversation-controller.js';
import { modelController } from './api/controllers/model-controller.js';

export class AiExpressController {
  public async chat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const body = req.body || {};
      const message = body.message || body.content || '';
      const conversationId = body.conversationId;
      const modelId = body.model;
      const result = await chatController.chat({ message, conversationId, modelId }, userId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async generatePrompt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const sessionId = (req as any).sessionID || `sess_${userId}`;
      const result = await coreAiController.processRequest(req.body, userId, sessionId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async getConversations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const result = await conversationController.list(userId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async getConversationById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const { id } = req.params;
      const result = await conversationController.get(id, userId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}

export class ModelsExpressController {
  public async getModels(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
      const result = await modelController.listModels();
      res.status(200).json(result);
    } catch (err) {
      if (next) {
        next(err);
      } else {
        res.status(500).json({ success: false, error: (err as Error).message });
      }
    }
  }

  public async getModelById(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (id === 'status') {
        const result = await modelController.getRuntimeStatus();
        res.status(200).json(result);
        return;
      }
      const modelsResult = await modelController.listModels();
      if (modelsResult.success && Array.isArray(modelsResult.data)) {
        const found = modelsResult.data.find((m: any) => m.id === id || m.name === id);
        if (found) {
          res.status(200).json({ success: true, data: found });
          return;
        }
      }
      res.status(200).json({ success: true, data: { id, name: id, status: 'available' } });
    } catch (err) {
      if (next) {
        next(err);
      } else {
        res.status(500).json({ success: false, error: (err as Error).message });
      }
    }
  }
}

export class AiModule {
  public readonly aiController: AiExpressController;
  public readonly modelsController: ModelsExpressController;

  constructor() {
    this.aiController = new AiExpressController();
    this.modelsController = new ModelsExpressController();
  }
}
