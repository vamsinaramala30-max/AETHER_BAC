/**
 * AETHER AI — Agent Routes
 * GET /ai/agents
 * POST /ai/agents
 */

import { agentController } from '../controllers/agent-controller.js';
import { authProvider } from '../middleware/auth.js';
import type { RouteContext } from './ai.js';

export async function handleAgentRoute(ctx: RouteContext) {
  const auth = await authProvider.authenticate(ctx.headers);

  if (ctx.method === 'GET' && ctx.path === '/ai/agents') {
    return agentController.listAgents();
  }

  if (ctx.method === 'POST' && ctx.path === '/ai/agents') {
    const body = (ctx.body ?? {}) as { agentId: string; goal: string; conversationId?: string };
    return agentController.runAgent(body, auth);
  }

  return { success: false, error: { code: 'NOT_FOUND', message: 'Route not found.' } };
}
