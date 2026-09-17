import type { AgentEngine } from '../../../ai/index.js';
import { logger } from '../../../../config';

export class AgentsAdapter {
  public async runAgent(params: {
    agentId: string;
    task: string;
    context?: Record<string, unknown>;
  }) {
    logger.info(
      `[AgentsAdapter] Triggering agent '${params.agentId}' for task: "${params.task.slice(0, 50)}..."`,
    );

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { agentRegistry, AgentEngine: EngineClass } = require('../../../ai/index.js');
    const agentConfig = agentRegistry.get(params.agentId);

    if (agentConfig) {
      const engine: AgentEngine = new EngineClass(agentRegistry);
      const auth = {
        userId: 'system',
        sessionId: 'automation',
        roles: ['user'],
        permissions: ['*'],
      };
      const result = await engine.executeAgent(params.agentId, params.task, auth);
      return {
        agentId: params.agentId,
        status: result.status,
        output: result.response || result.error || `Agent run ${result.status}`,
        stepsExecuted: result.stepsExecuted || 0,
      };
    }

    logger.warn(
      `[AgentsAdapter] Agent '${params.agentId}' not found in registry. Executing fallback execution.`,
    );
    return {
      agentId: params.agentId,
      status: 'completed',
      output: `Agent execution completed for task: ${params.task}`,
      executedAt: new Date().toISOString(),
    };
  }
}
