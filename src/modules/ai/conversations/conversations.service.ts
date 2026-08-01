import { ConversationsRepository } from './conversations.repository';
import { CreateConversationDto, UpdateConversationDto, QueryConversationDto } from './conversations.dto';
import { ConversationEntity } from './conversations.entity';

export class ConversationsService {
  constructor(private repository: ConversationsRepository) {}

  public async createConversation(dto: CreateConversationDto): Promise<ConversationEntity> {
    return this.repository.create({
      userId: dto.userId,
      workspaceId: dto.workspaceId,
      title: dto.title || 'New Conversation',
      messages: [],
      isPinned: false,
      isArchived: false,
    });
  }

  public async getConversation(id: string): Promise<ConversationEntity> {
    const conv = await this.repository.findById(id);
    if (!conv) throw new Error('Conversation not found');
    return conv;
  }

  public async updateConversation(id: string, dto: UpdateConversationDto): Promise<ConversationEntity> {
    const updated = await this.repository.update(id, dto);
    if (!updated) throw new Error('Conversation not found');
    return updated;
  }

  public async listConversations(userId: string, query: QueryConversationDto) {
    return this.repository.paginate<ConversationEntity>(
      'conversations',
      (item) => {
        if (item.userId !== userId) return false;
        if (query.isArchived !== undefined && item.isArchived !== query.isArchived) return false;
        if (query.isPinned !== undefined && item.isPinned !== query.isPinned) return false;
        if (query.search && !item.title.toLowerCase().includes(query.search.toLowerCase())) return false;
        return true;
      },
      { page: query.page, limit: query.limit, sortBy: 'updatedAt', sortOrder: 'desc' }
    );
  }

  public async deleteConversation(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }
}