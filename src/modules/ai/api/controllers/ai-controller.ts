/**
 * AETHER AI — AI Controller (Thin Controller)
 * Delegates request processing to IAIEngine. Contains no business logic.
 */

import type { IAIEngine } from '../../core/ai-engine.js';
import type { AIRequest } from '../../ai-types.js';
import { handleAPIError } from '../middleware/error-handler.js';

export class AIController {
  constructor(private readonly aiEngine?: IAIEngine) {}

  public async processRequest(body: unknown, userId: string, sessionId: string) {
    try {
      if (!this.aiEngine) {
        return {
          success: false,
          error: { code: 'NOT_CONFIGURED', message: 'AI Engine is not initialized.' },
        };
      }

      const req = body as Partial<AIRequest>;
      const request: AIRequest = {
        requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId,
        sessionId,
        conversationId: req.conversationId ?? `conv_${Date.now()}`,
        message: req.message ?? '',
        options: req.options,
        timestamp: Date.now(),
      };

      const result = await this.aiEngine.process(request);
      if (!result.ok) {
        return handleAPIError(result.error);
      }

      return { success: true, data: result.value };
    } catch (err) {
      return handleAPIError(err);
    }
  }
}

export const aiController = new AIController();
