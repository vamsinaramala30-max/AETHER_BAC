import { MessageRepository } from '../../../database/repositories/MessageRepository';

export class ConversationMemory {
  private messageRepo: MessageRepository;

  constructor() {
    this.messageRepo = new MessageRepository();
  }

  public async getHistory(conversationId: string, limit: number = 10) {
    return this.messageRepo.getRecentByConversationId(conversationId, limit);
  }
}
