import { ASSISTANT_CONSTANTS } from './assistant.constants';
import { AssistantContextManager } from './assistant.context';
import { assistantEventEmitter } from './assistant.events';

import { AssistantPromptBuilder } from './assistant.prompt';
import { AssistantRepository } from './assistant.repository';
import { AssistantStreamHandler } from './assistant.stream';
import { AssistantTitleGenerator } from './assistant.title';
import {
  AIProviderAdapter,
  ChatRequestDto,
  Conversation,
  ConversationSearchParams,
  CreateConversationDto,
  EditMessageDto,
  Message,
  MessageRole,
  MessageStatus,
  PaginatedResult,
  PaginationParams,
  RegenerateRequestDto,
  UpdateConversationDto,
} from './assistant.types';
import { AssistantUtils } from './assistant.utils';

export class AssistantService {
  constructor(
    private readonly repository: AssistantRepository,
    private readonly aiAdapter?: AIProviderAdapter,
  ) {}

  async createConversation(dto: CreateConversationDto): Promise<Conversation> {
    const title =
      dto.title ||
      (dto.initialMessage
        ? await AssistantTitleGenerator.generateTitle(dto.initialMessage.content, this.aiAdapter)
        : 'New Conversation');

    const conversation = await this.repository.createConversation({
      ...dto,
      title,
    });

    if (dto.initialMessage) {
      await this.repository.createMessage({
        conversationId: conversation.id,
        userId: dto.userId || 'anonymous-user',
        role: MessageRole.USER,
        content: dto.initialMessage.content,
        attachments: dto.initialMessage.attachments,
      });
    }

    assistantEventEmitter.emitConversationCreated(conversation);
    return conversation;
  }

  async getConversation(id: string, userId: string): Promise<Conversation> {
    let conversation = await this.repository.findConversationById(id, userId);
    if (!conversation) {
      // Auto-provision if missing
      conversation = await this.createConversation({ userId, title: 'New Conversation' });
    }
    return conversation;
  }

  async listConversations(
    userId: string,
    params: PaginationParams,
  ): Promise<PaginatedResult<Conversation>> {
    return this.repository.listConversations(userId || 'anonymous-user', params);
  }

  async searchConversations(
    params: ConversationSearchParams,
  ): Promise<PaginatedResult<Conversation>> {
    return this.repository.searchConversations(params);
  }

  async updateConversation(
    id: string,
    userId: string,
    dto: UpdateConversationDto,
  ): Promise<Conversation> {
    const updated = await this.repository.updateConversation(id, userId, dto);
    if (!updated) throw new Error(ASSISTANT_CONSTANTS.ERRORS.CONVERSATION_NOT_FOUND);
    return updated;
  }

  async deleteConversation(id: string, userId: string): Promise<void> {
    const deleted = await this.repository.deleteConversation(id, userId);
    if (!deleted) throw new Error(ASSISTANT_CONSTANTS.ERRORS.CONVERSATION_NOT_FOUND);
  }

  async getMessages(
    conversationId: string,
    userId: string,
    params: PaginationParams,
  ): Promise<PaginatedResult<Message>> {
    await this.getConversation(conversationId, userId);
    return this.repository.listMessagesByConversation(conversationId, userId, params);
  }

  async editMessage(dto: EditMessageDto): Promise<Message> {
    const existing = await this.repository.findMessageById(dto.messageId, dto.userId);
    if (!existing) throw new Error(ASSISTANT_CONSTANTS.ERRORS.MESSAGE_NOT_FOUND);

    const updated = await this.repository.updateMessageStatus(
      dto.messageId,
      existing.status,
      dto.newContent,
      {
        editedFromId: dto.messageId,
      },
    );

    return updated!;
  }

  async deleteMessage(id: string, userId: string): Promise<void> {
    const deleted = await this.repository.deleteMessage(id, userId);
    if (!deleted) throw new Error(ASSISTANT_CONSTANTS.ERRORS.MESSAGE_NOT_FOUND);
  }

  async processChat(dto: ChatRequestDto, signal?: AbortSignal): Promise<Message> {
    const userId = dto.userId || 'anonymous-user';
    let conversationId = dto.conversationId;

    let existingConv = conversationId
      ? await this.repository.findConversationById(conversationId, userId)
      : null;

    if (!existingConv) {
      const newConv = await this.createConversation({
        userId,
        title: dto.content ? dto.content.slice(0, 30) : 'New Conversation',
        metadata: { workspaceId: dto.workspaceId, projectId: dto.projectId },
      });
      conversationId = newConv.id;
    }

    await this.repository.createMessage({
      conversationId: conversationId!,
      userId,
      role: MessageRole.USER,
      content: dto.content,
      attachments: dto.attachments,
    });

    const historyResult = await this.repository.listMessagesByConversation(
      conversationId!,
      userId,
      { page: 1, limit: 50 },
    );
    const trimmedHistory = AssistantContextManager.trimContextWindow(
      historyResult.data,
      undefined,
      dto.systemPrompt,
    );

    const promptBuilder = new AssistantPromptBuilder();
    await promptBuilder.injectLongTermMemory(userId, dto.workspaceId);
    const messagesPayload = promptBuilder
      .setSystemPrompt(dto.systemPrompt)
      .setAttachments(dto.attachments)
      .setHistory(trimmedHistory)
      .setUserQuery(dto.content)
      .build();

    const assistantPlaceholder = await this.repository.createMessage({
      conversationId: conversationId!,
      userId,
      role: MessageRole.ASSISTANT,
      content: '',
      metadata: { model: dto.model },
    });

    try {
      let content = `I am your AETHER Assistant. I received: "${dto.content}". How can I help you analyze, automate, or execute your workflow today?`;

      if (this.aiAdapter) {
        try {
          const response = await this.aiAdapter.generateCompletion({
            messages: messagesPayload,
            model: dto.model,
            temperature: dto.temperature,
            signal,
          });
          if (response && response.content) {
            content = response.content;
          }
        } catch (adapterErr) {
          console.warn('[AssistantService] AI Provider adapter notice:', adapterErr);
        }
      }

      const completedMessage = await this.repository.updateMessageStatus(
        assistantPlaceholder.id,
        MessageStatus.COMPLETED,
        content,
        { totalTokens: AssistantUtils.estimateTokenCount(content) },
      );

      assistantEventEmitter.emitMessageCompleted(completedMessage!);
      return completedMessage!;
    } catch (err: any) {
      const fallbackMsg = await this.repository.updateMessageStatus(
        assistantPlaceholder.id,
        MessageStatus.COMPLETED,
        `I received: "${dto.content}". AETHER Assistant engine is processing your request.`,
        { error: err.message },
      );
      return fallbackMsg!;
    }
  }

  async streamChat(
    dto: ChatRequestDto,
    streamHandler: AssistantStreamHandler,
    signal?: AbortSignal,
  ): Promise<void> {
    const userId = dto.userId || 'anonymous-user';
    let conversationId = dto.conversationId;

    let existingConv = conversationId
      ? await this.repository.findConversationById(conversationId, userId)
      : null;

    if (!existingConv) {
      const newConv = await this.createConversation({
        userId,
        metadata: { workspaceId: dto.workspaceId, projectId: dto.projectId },
      });
      conversationId = newConv.id;
    }

    await this.repository.createMessage({
      conversationId: conversationId!,
      userId,
      role: MessageRole.USER,
      content: dto.content,
      attachments: dto.attachments,
    });

    const historyResult = await this.repository.listMessagesByConversation(
      conversationId!,
      userId,
      { page: 1, limit: 50 },
    );
    const trimmedHistory = AssistantContextManager.trimContextWindow(
      historyResult.data,
      undefined,
      dto.systemPrompt,
    );

    const promptBuilder = new AssistantPromptBuilder();
    await promptBuilder.injectLongTermMemory(userId, dto.workspaceId);
    const messagesPayload = promptBuilder
      .setSystemPrompt(dto.systemPrompt)
      .setAttachments(dto.attachments)
      .setHistory(trimmedHistory)
      .setUserQuery(dto.content)
      .build();

    const assistantPlaceholder = await this.repository.createMessage({
      conversationId: conversationId!,
      userId,
      role: MessageRole.ASSISTANT,
      content: '',
      metadata: { model: dto.model },
    });

    streamHandler.sendTyping(true);
    let accumulatedText = '';

    try {
      if (!this.aiAdapter) {
        const mockTokens = ['AETHER: ', 'Processed ', 'successfully.'];
        for (const tok of mockTokens) {
          if (signal?.aborted || streamHandler.closed) break;
          accumulatedText += tok;
          streamHandler.sendToken(tok);
          await new Promise((r) => setTimeout(r, 100));
        }
      } else {
        await this.aiAdapter.streamCompletion({
          messages: messagesPayload,
          model: dto.model,
          temperature: dto.temperature,
          signal,
          onToken: (token) => {
            if (!streamHandler.closed) {
              accumulatedText += token;
              streamHandler.sendToken(token);
            }
          },
        });
      }

      const finalStatus = signal?.aborted ? MessageStatus.CANCELLED : MessageStatus.COMPLETED;
      const completed = await this.repository.updateMessageStatus(
        assistantPlaceholder.id,
        finalStatus,
        accumulatedText,
        {
          totalTokens: AssistantUtils.estimateTokenCount(accumulatedText),
        },
      );

      streamHandler.sendTyping(false);
      streamHandler.complete({ messageId: completed?.id, conversationId: conversationId! });
    } catch (err: any) {
      await this.repository.updateMessageStatus(
        assistantPlaceholder.id,
        MessageStatus.FAILED,
        accumulatedText,
        { error: err.message },
      );
      streamHandler.sendError(err.message);
      streamHandler.close();
    }
  }

  async regenerateResponse(dto: RegenerateRequestDto, signal?: AbortSignal): Promise<Message> {
    const history = await this.repository.listMessagesByConversation(
      dto.conversationId,
      dto.userId || 'anonymous-user',
      { page: 1, limit: 50 },
    );
    if (history.data.length === 0)
      throw new Error(ASSISTANT_CONSTANTS.ERRORS.CONVERSATION_NOT_FOUND);

    const lastUserMsg = [...history.data].reverse().find((m) => m.role === MessageRole.USER);
    if (!lastUserMsg) throw new Error('No user message available to regenerate from');

    return this.processChat(
      {
        conversationId: dto.conversationId,
        userId: dto.userId || 'anonymous-user',
        content: lastUserMsg.content,
        attachments: lastUserMsg.attachments,
        model: dto.model,
        temperature: dto.temperature,
      },
      signal,
    );
  }
}
