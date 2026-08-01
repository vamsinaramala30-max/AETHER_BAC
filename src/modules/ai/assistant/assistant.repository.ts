import {
  Conversation,
  ConversationSearchParams,
  CreateConversationDto,
  CreateMessageDto,
  Message,
  MessageStatus,
  PaginatedResult,
  PaginationParams,
  UpdateConversationDto,
} from './assistant.types';

export class AssistantRepository {
  private conversations: Map<string, Conversation> = new Map();
  private messages: Map<string, Message> = new Map();

  async createConversation(dto: CreateConversationDto): Promise<Conversation> {
    const id = crypto.randomUUID();
    const now = new Date();

    const conversation: Conversation = {
      id,
      userId: dto.userId,
      title: dto.title || 'New Conversation',
      metadata: dto.metadata || {},
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    };

    this.conversations.set(id, conversation);
    return conversation;
  }

  async findConversationById(id: string, userId: string): Promise<Conversation | null> {
    const conv = this.conversations.get(id);
    if (!conv || conv.userId !== userId) return null;
    return conv;
  }

  async listConversations(userId: string, params: PaginationParams): Promise<PaginatedResult<Conversation>> {
    const userConvs = Array.from(this.conversations.values())
      .filter((c) => c.userId === userId && !c.metadata.isArchived)
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());

    const total = userConvs.length;
    const totalPages = Math.ceil(total / params.limit) || 1;
    const start = (params.page - 1) * params.limit;
    const data = userConvs.slice(start, start + params.limit);

    return { data, total, page: params.page, limit: params.limit, totalPages };
  }

  async searchConversations(params: ConversationSearchParams): Promise<PaginatedResult<Conversation>> {
    const queryLower = params.query.toLowerCase();
    const filtered = Array.from(this.conversations.values()).filter((c) => {
      if (c.userId !== params.userId) return false;
      if (params.workspaceId && c.metadata.workspaceId !== params.workspaceId) return false;
      return c.title.toLowerCase().includes(queryLower);
    });

    const total = filtered.length;
    const totalPages = Math.ceil(total / params.limit) || 1;
    const start = (params.page - 1) * params.limit;
    const data = filtered.slice(start, start + params.limit);

    return { data, total, page: params.page, limit: params.limit, totalPages };
  }

  async updateConversation(id: string, userId: string, dto: UpdateConversationDto): Promise<Conversation | null> {
    const conv = await this.findConversationById(id, userId);
    if (!conv) return null;

    if (dto.title !== undefined) conv.title = dto.title;
    if (dto.metadata) conv.metadata = { ...conv.metadata, ...dto.metadata };
    conv.updatedAt = new Date();

    this.conversations.set(id, conv);
    return conv;
  }

  async deleteConversation(id: string, userId: string): Promise<boolean> {
    const conv = await this.findConversationById(id, userId);
    if (!conv) return false;

    for (const [msgId, msg] of this.messages.entries()) {
      if (msg.conversationId === id) {
        this.messages.delete(msgId);
      }
    }

    return this.conversations.delete(id);
  }

  async createMessage(dto: CreateMessageDto): Promise<Message> {
    const id = crypto.randomUUID();
    const now = new Date();

    const message: Message = {
      id,
      conversationId: dto.conversationId,
      userId: dto.userId,
      role: dto.role,
      content: dto.content,
      status: dto.metadata?.error ? MessageStatus.FAILED : MessageStatus.COMPLETED,
      attachments: dto.attachments || [],
      metadata: dto.metadata || {},
      createdAt: now,
      updatedAt: now,
    };

    this.messages.set(id, message);

    const conv = this.conversations.get(dto.conversationId);
    if (conv) {
      conv.messageCount += 1;
      conv.lastMessageAt = now;
      conv.updatedAt = now;
      this.conversations.set(conv.id, conv);
    }

    return message;
  }

  async findMessageById(id: string, userId: string): Promise<Message | null> {
    const msg = this.messages.get(id);
    if (!msg || msg.userId !== userId) return null;
    return msg;
  }

  async listMessagesByConversation(
    conversationId: string,
    userId: string,
    params: PaginationParams
  ): Promise<PaginatedResult<Message>> {
    const convMessages = Array.from(this.messages.values())
      .filter((m) => m.conversationId === conversationId && m.userId === userId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const total = convMessages.length;
    const totalPages = Math.ceil(total / params.limit) || 1;
    const start = (params.page - 1) * params.limit;
    const data = convMessages.slice(start, start + params.limit);

    return { data, total, page: params.page, limit: params.limit, totalPages };
  }

  async updateMessageStatus(id: string, status: MessageStatus, content?: string, metadata?: Record<string, unknown>): Promise<Message | null> {
    const msg = this.messages.get(id);
    if (!msg) return null;

    msg.status = status;
    if (content !== undefined) msg.content = content;
    if (metadata) msg.metadata = { ...msg.metadata, ...metadata };
    msg.updatedAt = new Date();

    this.messages.set(id, msg);
    return msg;
  }

  async deleteMessage(id: string, userId: string): Promise<boolean> {
    const msg = await this.findMessageById(id, userId);
    if (!msg) return false;
    return this.messages.delete(id);
  }
}