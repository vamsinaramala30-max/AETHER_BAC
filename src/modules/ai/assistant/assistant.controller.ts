import { Response } from 'express';
import { AssistantAnalytics } from './assistant.analytics';
import { AuthenticatedRequest } from './assistant.middleware';
import { AssistantService } from './assistant.service';
import { AssistantStreamHandler } from './assistant.stream';
import { AssistantValidator } from './assistant.validators';

export class AssistantController {
  constructor(private readonly service: AssistantService) {}

  public createConversation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      AssistantValidator.validateCreateConversation(req.body);
      const conversation = await this.service.createConversation({
        ...req.body,
        userId: req.user!.id,
      });
      res.status(201).json(conversation);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  public getConversations = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const pagination = AssistantValidator.validatePagination(req.query.page, req.query.limit);
      const result = await this.service.listConversations(req.user!.id, pagination);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  public getConversationById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const conversation = await this.service.getConversation(req.params.id, req.user!.id);
      res.status(200).json(conversation);
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  };

  public updateConversation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const updated = await this.service.updateConversation(req.params.id, req.user!.id, req.body);
      res.status(200).json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  public deleteConversation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await this.service.deleteConversation(req.params.id, req.user!.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  };

  public getMessages = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const pagination = AssistantValidator.validatePagination(req.query.page, req.query.limit);
      const result = await this.service.getMessages(
        req.params.conversationId,
        req.user!.id,
        pagination,
      );
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  public updateMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const updated = await this.service.editMessage({
        messageId: req.params.id,
        userId: req.user!.id,
        newContent: req.body.content,
      });
      res.status(200).json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  public deleteMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await this.service.deleteMessage(req.params.id, req.user!.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  };

  public chatSync = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      AssistantValidator.validateSendMessage(req.body);
      const controller = new AbortController();
      req.on('close', () => controller.abort());

      const message = await this.service.processChat(
        {
          ...req.body,
          userId: req.user!.id,
          workspaceId: req.user!.workspaceId,
        },
        controller.signal,
      );

      res.status(200).json(message);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  public chatStream = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      AssistantValidator.validateSendMessage(req.body);
      const controller = new AbortController();
      req.on('close', () => controller.abort());

      const streamHandler = new AssistantStreamHandler(res);

      await this.service.streamChat(
        {
          ...req.body,
          userId: req.user!.id,
          workspaceId: req.user!.workspaceId,
        },
        streamHandler,
        controller.signal,
      );
    } catch (error: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: error.message });
      }
    }
  };

  public chatRegenerate = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const controller = new AbortController();
      req.on('close', () => controller.abort());

      const message = await this.service.regenerateResponse(
        {
          ...req.body,
          userId: req.user!.id,
        },
        controller.signal,
      );

      res.status(200).json(message);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  public search = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const query = AssistantValidator.validateSearch(req.query.q);
      const pagination = AssistantValidator.validatePagination(req.query.page, req.query.limit);

      const result = await this.service.searchConversations({
        query,
        userId: req.user!.id,
        workspaceId: req.user!.workspaceId,
        ...pagination,
      });

      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  public analytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const summary = await AssistantAnalytics.getInstance().getSummary(req.user!.id);
      res.status(200).json(summary);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };
}
