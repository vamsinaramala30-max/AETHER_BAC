import { AiRepository } from '../ai.repository';
import { ConversationEntity } from './conversations.entity';

export class ConversationsRepository extends AiRepository {
  private collectionName = 'conversations';

  public async create(
    data: Omit<ConversationEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ConversationEntity> {
    const collection = this.getCollection<ConversationEntity>(this.collectionName);
    const id = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const conversation: ConversationEntity = {
      ...data,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    collection.set(id, conversation);
    return conversation;
  }

  public async findById(id: string): Promise<ConversationEntity | null> {
    const collection = this.getCollection<ConversationEntity>(this.collectionName);
    return collection.get(id) || null;
  }

  public async update(
    id: string,
    updates: Partial<ConversationEntity>,
  ): Promise<ConversationEntity | null> {
    const conversation = await this.findById(id);
    if (!conversation) return null;

    const updated = { ...conversation, ...updates, updatedAt: new Date() };
    this.getCollection<ConversationEntity>(this.collectionName).set(id, updated);
    return updated;
  }

  public async delete(id: string): Promise<boolean> {
    return this.getCollection<ConversationEntity>(this.collectionName).delete(id);
  }
}
