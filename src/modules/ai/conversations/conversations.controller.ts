import { ConversationsService } from './conversations.service';

export class ConversationsController {
  constructor(private service: ConversationsService) {}

  public async create(req: any, res: any): Promise<void> {
    const result = await this.service.createConversation(req.body);
    res.status(201).json({ success: true, data: result });
  }

  public async list(req: any, res: any): Promise<void> {
    const userId = req.headers['x-user-id'] || 'default-user';
    const result = await this.service.listConversations(userId, req.query);
    res.json({ success: true, ...result });
  }

  public async getById(req: any, res: any): Promise<void> {
    try {
      const result = await this.service.getConversation(req.params.id);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(404).json({ success: false, message: err.message });
    }
  }

  public async update(req: any, res: any): Promise<void> {
    try {
      const result = await this.service.updateConversation(req.params.id, req.body);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(404).json({ success: false, message: err.message });
    }
  }

  public async delete(req: any, res: any): Promise<void> {
    const success = await this.service.deleteConversation(req.params.id);
    res.json({ success });
  }
}
