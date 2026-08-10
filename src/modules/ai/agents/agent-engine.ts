/**
 * AETHER AI — Agent Engine
 * Entry point for executing AI agents.
 * Coordinates: Agent Engine → Planner → Executor → Tool Execution → Observation → Agent Loop → Final Response.
 */

import type { AgentRunOptions, AgentRunResult } from './agent-types.js';
import type { IAgentRegistry } from './agent-registry.js';
import { agentRegistry } from './agent-registry.js';
import type { IAgentExecutionLoop } from './agent-loop.js';
import { AgentExecutionLoop } from './agent-loop.js';
import type { AuthenticationContext, ToolExecutionContext } from '../tools/tool-types.js';
import type { IToolExecutor } from '../tools/tool-executor.js';

export interface IAgentEngine {
  executeAgent(
    agentId: string,
    goal: string,
    auth: AuthenticationContext,
    options?: AgentRunOptions,
  ): Promise<AgentRunResult>;
}

export class AgentEngine implements IAgentEngine {
  private readonly registry: IAgentRegistry;
  private readonly loop: IAgentExecutionLoop;

  constructor(registry?: IAgentRegistry, toolExecutor?: IToolExecutor) {
    this.registry = registry ?? agentRegistry;
    this.loop = new AgentExecutionLoop(undefined, toolExecutor);
  }

  public async executeAgent(
    agentId: string,
    goal: string,
    auth: AuthenticationContext,
    options: AgentRunOptions = {},
  ): Promise<AgentRunResult> {
    const agentConfig = this.registry.get(agentId);
    if (!agentConfig) {
      const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      return {
        runId,
        agentId,
        status: 'failed',
        stepsExecuted: 0,
        error: `Agent with ID "${agentId}" not found in registry.`,
        durationMs: 0,
      };
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const toolContext: ToolExecutionContext = {
      auth,
      traceId: runId,
      conversationId: options.conversationId,
      signal: options.signal,
    };

    return this.loop.run(runId, goal, agentConfig, toolContext, options);
  }
}
