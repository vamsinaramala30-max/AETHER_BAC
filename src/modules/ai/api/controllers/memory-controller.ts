/**
 * AETHER AI — Memory Controller (Thin Controller)
 * Handles /ai/memory endpoints. Delegates logic directly to MemoryEngine.
 */

import type { IMemoryEngine } from '../../memory/memory-engine.js';
import type { MemoryType } from '../../ai-types.js';
import { handleAPIError } from '../middleware/error-handler.js';

export class MemoryController {
  constructor(private readonly memoryEngine?: IMemoryEngine) {}

  public async getMemory(userId: string) {
    try {
      if (!this.memoryEngine) {
        return { success: true, data: [] };
      }
      const result = await this.memoryEngine.getAllMemory(userId);
      if (!result.ok) return handleAPIError(result.error);
      return { success: true, data: result.value };
    } catch (err) {
      return handleAPIError(err);
    }
  }

  public async createMemory(
    body: { type: MemoryType; content: string; importance?: number; ttlMs?: number },
    userId: string,
  ) {
    try {
      if (!this.memoryEngine) {
        return {
          success: false,
          error: { code: 'NOT_CONFIGURED', message: 'Memory engine is not enabled.' },
        };
      }
      const result = await this.memoryEngine.createMemory({
        userId,
        type: body.type,
        content: body.content,
        importance: body.importance,
        ttlMs: body.ttlMs,
      });
      if (!result.ok) return handleAPIError(result.error);
      return { success: true, data: result.value };
    } catch (err) {
      return handleAPIError(err);
    }
  }

  public async deleteMemory(id: string, userId: string) {
    try {
      if (!this.memoryEngine) {
        return { success: true, data: { deleted: false } };
      }
      const result = await this.memoryEngine.deleteMemory(id, userId);
      if (!result.ok) return handleAPIError(result.error);
      return { success: true, data: { deleted: true } };
    } catch (err) {
      return handleAPIError(err);
    }
  }
}

export const memoryController = new MemoryController();
