/**
 * AETHER AI — Conversation Controller (Thin Controller)
 * Handles /ai/conversations route endpoints. Business logic in ConversationManager.
 */

import { conversationManager } from '../../conversations/conversation-manager.js';
import { handleAPIError } from '../middleware/error-handler.js';

export class ConversationController {
  public async list(userId: string) {
    try {
      const list = await conversationManager.listConversations(userId);
      return { success: true, data: list };
    } catch (err) {
      return handleAPIError(err);
    }
  }

  public async create(body: { title?: string }, userId: string) {
    try {
      const conv = await conversationManager.createConversation({ userId, title: body.title });
      return { success: true, data: conv };
    } catch (err) {
      return handleAPIError(err);
    }
  }

  public async get(id: string, userId: string) {
    try {
      const conv = await conversationManager.getConversation(id, userId);
      if (!conv) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found.' } };
      }
      return { success: true, data: conv };
    } catch (err) {
      return handleAPIError(err);
    }
  }

  public async rename(id: string, body: { title: string }, userId: string) {
    try {
      const updated = await conversationManager.renameConversation({
        conversationId: id,
        userId,
        title: body.title,
      });
      if (!updated) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found.' } };
      }
      return { success: true, data: updated };
    } catch (err) {
      return handleAPIError(err);
    }
  }

  public async delete(id: string, userId: string) {
    try {
      const deleted = await conversationManager.deleteConversation(id, userId);
      return { success: true, data: { deleted } };
    } catch (err) {
      return handleAPIError(err);
    }
  }
}

export const conversationController = new ConversationController();
