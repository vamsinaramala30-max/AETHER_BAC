/**
 * AETHER AI — Conversation Service
 * High-level orchestration for user multi-turn chat interactions.
 * Integrates Conversations with the Part 1 AIEngine / AIOrchestrator and Memory subsystem.
 * Strictly user-scoped. No fake AI data.
 */

import type { Conversation, ConversationMessage, SendMessageOptions } from './conversation-types.js';
import type { IConversationManager } from './conversation-manager.js';
import { conversationManager } from './conversation-manager.js';
import type { IMessageService } from './message-service.js';
import { messageService } from './message-service.js';
import type { IHistoryManager } from './history-manager.js';
import { historyManager } from './history-manager.js';
import type { IAIEngine } from '../core/ai-engine.js';
import type { AIRequest } from '../ai-types.js';

export interface ChatResponse {
  readonly conversation: Conversation;
  readonly userMessage: ConversationMessage;
  readonly assistantMessage: ConversationMessage;
  readonly history: readonly ConversationMessage[];
}

export class ConversationService {
  constructor(
    private readonly manager: IConversationManager = conversationManager,
    private readonly msgService: IMessageService = messageService,
    private readonly histManager: IHistoryManager = historyManager,
    private readonly aiEngine?: IAIEngine,
  ) {}

  public async sendMessage(
    userId: string,
    content: string,
    conversationId?: string,
    options?: SendMessageOptions,
  ): Promise<ChatResponse> {
    let conv: Conversation | undefined;

    if (conversationId) {
      conv = await this.manager.getConversation(conversationId, userId);
      if (!conv) {
        throw new Error(`Conversation "${conversationId}" not found for user.`);
      }
    } else {
      const autoTitle = content.trim().substring(0, 35) || 'New Conversation';
      conv = await this.manager.createConversation({ userId, title: autoTitle });
    }

    // 1. Add user message
    const userMsg = await this.msgService.addMessage({
      conversationId: conv.id,
      userId,
      role: 'user',
      content,
    });

    // 2. Fetch & prune history
    const allMsgs = await this.msgService.getMessages(conv.id, userId);
    const prunedHistory = this.histManager.pruneHistory(allMsgs);

    let assistantContent = '';

    // 3. Delegate to AIEngine if available
    if (this.aiEngine) {
      const aiReq: AIRequest = {
        requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId,
        sessionId: `sess_${conv.id}`,
        conversationId: conv.id,
        message: content,
        options: {
          modelId: options?.modelId,
          enableMemory: options?.enableMemory,
          enableRAG: options?.enableRAG,
          ragCollectionIds: options?.ragCollectionIds,
        },
        signal: options?.signal,
        timestamp: Date.now(),
      };

      const result = await this.aiEngine.process(aiReq);
      if (result.ok) {
        assistantContent = result.value.message;
      } else {
        assistantContent = `Error generating response: ${result.error.message}`;
      }
    } else {
      assistantContent = `Local AI model runtime is not connected. Received message: "${content}".`;
    }

    // 4. Add assistant response message
    const assistantMsg = await this.msgService.addMessage({
      conversationId: conv.id,
      userId,
      role: 'assistant',
      content: assistantContent,
    });

    const updatedHistory = await this.msgService.getMessages(conv.id, userId);

    return {
      conversation: conv,
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      history: updatedHistory,
    };
  }
}

export const conversationService = new ConversationService();
