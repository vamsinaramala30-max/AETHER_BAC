import { Request, Response, NextFunction } from 'express';
import { AiService } from './ai.service';

export class AiController {
  constructor(private aiService: AiService) {}

  public healthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      const health = await this.aiService.getHealthStatus();
      res.status(200).json({ success: true, data: health });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  };

  public chat = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const { message, content, conversationId, model, temperature } = req.body || {};
      const userMessage = message || content;

      if (!userMessage || typeof userMessage !== 'string' || !userMessage.trim()) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Field "message" or "content" string is required.',
        });
        return;
      }

      const result = await this.aiService.assistant.processChat({
        userId: (req as any).user?.id || 'anonymous-user',
        content: userMessage,
        conversationId,
        model: model || 'llama3.1:8b',
        temperature,
      });

      res.status(200).json({
        success: true,
        data: result,
        message: result.content,
        conversationId: result.conversationId,
        usage: {
          promptTokens: result.metadata?.totalTokens || 0,
          completionTokens: 0,
        },
      });
    } catch (err: any) {
      const errorMessage = err.message || 'AI generation failed';
      if (errorMessage.includes('Ollama is not running')) {
        res.status(503).json({
          success: false,
          error: 'OLLAMA_UNAVAILABLE',
          message: 'Ollama is not running. Start the Ollama service and try again.',
        });
        return;
      }
      if (errorMessage.includes('Provider not configured')) {
        res.status(400).json({
          success: false,
          error: 'PROVIDER_NOT_CONFIGURED',
          message: 'Provider not configured.',
        });
        return;
      }
      if (errorMessage.includes('not installed')) {
        res.status(400).json({
          success: false,
          error: 'MODEL_NOT_INSTALLED',
          message: errorMessage,
        });
        return;
      }

      res.status(400).json({
        success: false,
        error: 'CHAT_ERROR',
        message: errorMessage,
      });
    }
  };

  public generatePrompt = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json({ success: true, data: { prompt: req.body.input } });
    } catch (err) {
      next(err);
    }
  };

  public getConversations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id || 'anonymous-user';
      const result = await this.aiService.assistant.listConversations(userId, {
        page: 1,
        limit: 50,
      });
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  public getConversationById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id || 'anonymous-user';
      const result = await this.aiService.assistant.getConversation(req.params.id, userId);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };
}
