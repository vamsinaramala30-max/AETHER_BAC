/**
 * AETHER AI — Chat Controller (Thin Controller)
 * Handles POST /ai/chat and POST /ai/chat/stream endpoints.
 * Business logic resides in ConversationService and AIEngine.
 */

import { conversationService } from '../../conversations/conversation-service.js';
import type { IAIEngine } from '../../core/ai-engine.js';
import { globalAiEngine } from '../../core/ai-engine.js';
import type { StreamSubscriber } from '../../core/streaming-engine.js';
import type { AIRequest } from '../../ai-types.js';
import { handleAPIError } from '../middleware/error-handler.js';

export class ChatController {
  private readonly _aiEngine?: IAIEngine;

  constructor(aiEngine?: IAIEngine) {
    this._aiEngine = aiEngine;
  }

  private get aiEngine(): IAIEngine {
    return this._aiEngine ?? globalAiEngine;
  }

  public async chat(
    body: {
      message?: string;
      messages?: Array<{ role: string; content: string }>;
      conversationId?: string;
      conversation_id?: string;
      modelId?: string;
      model_id?: string;
      providerMode?: 'auto' | 'aether' | 'gemini' | 'openai' | 'ollama';
    },
    userId: string,
  ) {
    try {
      const message =
        body.message ||
        (Array.isArray(body.messages) && body.messages.length > 0
          ? body.messages[body.messages.length - 1]?.content
          : '');
      const conversationId = body.conversationId || body.conversation_id;
      const modelId = body.modelId || body.model_id;

      const response = await conversationService.sendMessage(
        userId,
        message || '',
        conversationId,
        { modelId, providerMode: body.providerMode },
      );
      return { success: true, data: response };
    } catch (err) {
      return handleAPIError(err);
    }
  }

  public async chatStream(
    body: {
      message?: string;
      messages?: Array<{ role: string; content: string }>;
      conversationId?: string;
      conversation_id?: string;
      modelId?: string;
      model_id?: string;
      providerMode?: 'auto' | 'aether' | 'gemini' | 'openai' | 'ollama';
    },
    userId: string,
    subscriber: StreamSubscriber,
  ) {
    try {
      const engine = this.aiEngine;
      if (!engine) {
        return {
          success: false,
          error: { code: 'NOT_CONFIGURED', message: 'Streaming engine not initialized.' },
        };
      }

      const message =
        body.message ||
        (Array.isArray(body.messages) && body.messages.length > 0
          ? body.messages[body.messages.length - 1]?.content
          : '');
      const conversationId = body.conversationId || body.conversation_id;
      const modelId = body.modelId || body.model_id;

      const req: AIRequest = {
        requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId,
        sessionId: `sess_${userId}`,
        conversationId: conversationId ?? `conv_${Date.now()}`,
        message: message || '',
        options: { streaming: true, modelId, providerMode: body.providerMode },
        timestamp: Date.now(),
      };

      const result = await engine.processStream(req, subscriber);
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
