/**
 * AETHER AI — Memory Routes
 * GET /ai/memory
 * POST /ai/memory
 * DELETE /ai/memory/:id
 */

import { memoryController } from '../controllers/memory-controller.js';
import { authProvider } from '../middleware/auth.js';
import type { MemoryType } from '../../ai-types.js';
import type { RouteContext } from './ai.js';

export async function handleMemoryRoute(ctx: RouteContext) {
  const auth = await authProvider.authenticate(ctx.headers);

  if (ctx.method === 'GET' && ctx.path === '/ai/memory') {
    return memoryController.getMemory(auth.userId);
  }

  if (ctx.method === 'POST' && ctx.path === '/ai/memory') {
    const body = (ctx.body ?? {}) as { type: MemoryType; content: string; importance?: number; ttlMs?: number };
    return memoryController.createMemory(body, auth.userId);
  }

  if (ctx.params?.['id'] && ctx.method === 'DELETE' && ctx.path === `/ai/memory/${ctx.params['id']}`) {
    return memoryController.deleteMemory(ctx.params['id'], auth.userId);
  }

  return { success: false, error: { code: 'NOT_FOUND', message: 'Route not found.' } };
}
