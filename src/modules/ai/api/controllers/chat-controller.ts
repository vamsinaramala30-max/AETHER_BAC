/**
 * AETHER AI — Chat Controller (Thin Controller)
 * Handles POST /ai/chat and POST /ai/chat/stream endpoints.
 * Business logic resides in ConversationService and AIEngine.
 */

import { conversationService } from '../../conversations/conversation-service.js';
import type { IAIEngine } from '../../core/ai-engine.js';
import type { StreamSubscriber } from '../../core/streaming-engine.js';
import type { AIRequest } from '../../ai-types.js';
import { handleAPIError } from '../middleware/error-handler.js';

export class ChatController {
  constructor(private readonly aiEngine?: IAIEngine) {}

  public async chat(body: { message: string; conversationId?: string; modelId?: string }, userId: string) {
    try {
      const response = await conversationService.sendMessage(
        userId,
        body.message,
        body.conversationId,
        { modelId: body.modelId },
      );
      return { success: true, data: response };
    } catch (err) {
      return handleAPIError(err);
    }
  }

  public async chatStream(
    body: { message: string; conversationId?: string; modelId?: string },
    userId: string,
    subscriber: StreamSubscriber,
  ) {
    try {
      if (!this.aiEngine) {
        return {
          success: false,
          error: { code: 'NOT_CONFIGURED', message: 'Streaming engine not initialized.' },
        };
      }

      const req: AIRequest = {
        requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId,
        sessionId: `sess_${userId}`,
        conversationId: body.conversationId ?? `conv_${Date.now()}`,
        message: body.message,
        options: { streaming: true, modelId: body.modelId },
        timestamp: Date.now(),
      };

      const result = await this.aiEngine.processStream(req, subscriber);
      if (!result.ok) {
        return handleAPIError(result.error);
      }

      return { success: true };
    } catch (err) {
      return handleAPIError(err);
    }
  }
}

export const chatController = new ChatController();
