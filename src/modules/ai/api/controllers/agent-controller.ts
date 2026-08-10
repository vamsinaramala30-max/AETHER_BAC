/**
 * AETHER AI — Agent Controller (Thin Controller)
 * Handles GET /ai/agents and POST /ai/agents endpoints.
 */

import { agentRegistry } from '../../agents/agent-registry.js';
import { AgentEngine } from '../../agents/agent-engine.js';
import type { AuthenticationContext } from '../../tools/tool-types.js';
import { handleAPIError } from '../middleware/error-handler.js';

const agentEngine = new AgentEngine();

export class AgentController {
  public async listAgents() {
    try {
      const agents = agentRegistry.list();
      return { success: true, data: agents };
    } catch (err) {
      return handleAPIError(err);
    }
  }

  public async runAgent(body: { agentId: string; goal: string; conversationId?: string }, auth: AuthenticationContext) {
    try {
      const result = await agentEngine.executeAgent(
        body.agentId,
        body.goal,
        auth,
        { conversationId: body.conversationId },
      );
      return { success: true, data: result };
    } catch (err) {
      return handleAPIError(err);
    }
  }
}

export const agentController = new AgentController();
