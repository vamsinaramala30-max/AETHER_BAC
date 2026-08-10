/**
 * AETHER AI — Tool Listing Routes
 * GET /ai/tools
 */

import { toolRegistry } from '../../tools/tool-registry.js';
import { authProvider } from '../middleware/auth.js';
import type { RouteContext } from './ai.js';

export async function handleToolRoute(ctx: RouteContext) {
  await authProvider.authenticate(ctx.headers);

  if (ctx.method === 'GET' && ctx.path === '/ai/tools') {
    const list = toolRegistry.list();
    return { success: true, data: list };
  }

  return { success: false, error: { code: 'NOT_FOUND', message: 'Route not found.' } };
}
