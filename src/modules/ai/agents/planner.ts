/**
 * AETHER AI — Agent Planner
 * Constructs an execution plan for an agent goal.
 * Uses structured decomposition into actionable steps.
 */

import type { AgentConfig, ExecutionPlan, PlanStep } from './agent-types.js';

export interface IAgentPlanner {
  createPlan(goal: string, config: AgentConfig): Promise<ExecutionPlan>;
}

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
