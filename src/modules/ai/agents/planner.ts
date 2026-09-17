/**
 * AETHER AI — Agent Planner (DEPRECATED)
 * @deprecated Deprecated in Prompt 7. Use authoritative PlanningEngine in src/modules/ai/planning/planning-engine.ts.
 * AETHER_CORE remains the sole authoritative planning coordinator.
 */

import type { AgentConfig, ExecutionPlan, PlanStep } from './agent-types.js';

/**
 * @deprecated Use IPlanningEngine from src/modules/ai/planning/planning-engine.js instead.
 */
export interface IAgentPlanner {
  createPlan(goal: string, config: AgentConfig): Promise<ExecutionPlan>;
}

/**
 * @deprecated Use PlanningEngine from src/modules/ai/planning/planning-engine.js instead.
 */
export class AgentPlanner implements IAgentPlanner {
  public async createPlan(goal: string, config: AgentConfig): Promise<ExecutionPlan> {
    const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const steps: PlanStep[] = [];

    // Assign steps based on available tools in agent config
    if (config.tools.length > 0) {
      for (let i = 0; i < config.tools.length; i++) {
        const toolName = config.tools[i]!;
        steps.push({
          stepNumber: i + 1,
          description: `Execute tool ${toolName} for goal: ${goal}`,
          toolName,
          toolInput: {},
          status: 'pending',
        });
      }
    } else {
      steps.push({
        stepNumber: 1,
        description: `Analyze and resolve goal: ${goal}`,
        status: 'pending',
      });
    }

    return {
      planId,
      goal,
      steps,
      createdAt: new Date().toISOString(),
    };
  }
}

export const agentPlanner = new AgentPlanner();
