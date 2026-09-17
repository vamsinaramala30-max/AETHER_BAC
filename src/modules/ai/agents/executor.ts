/**
 * AETHER AI — Step Executor
 * Executes individual agent plan steps, delegating to ToolExecutor when tools are specified.
 */

import type { PlanStep, AgentObservation } from './agent-types.js';
import type { ToolExecutionContext } from '../tools/tool-types.js';
import type { IToolExecutor } from '../tools/tool-executor.js';

export interface IAgentStepExecutor {
  executeStep(step: PlanStep, context: ToolExecutionContext): Promise<AgentObservation>;
}

export class AgentStepExecutor implements IAgentStepExecutor {
  constructor(private readonly toolExecutor?: IToolExecutor) {}

  public async executeStep(
    step: PlanStep,
    context: ToolExecutionContext,
  ): Promise<AgentObservation> {
    const timestamp = new Date().toISOString();

    if (step.toolName && this.toolExecutor) {
      const input = step.toolInput ?? {};
      const result = await this.toolExecutor.execute(step.toolName, input, context);

      step.status = result.success ? 'completed' : 'failed';
      step.result = result.data;
      step.error = result.error;

      return {
        stepNumber: step.stepNumber,
        toolName: step.toolName,
        output: result.data ?? null,
        success: result.success,
        error: result.error,
        timestamp,
      };
    }

    // Standard non-tool step execution
    step.status = 'completed';
    step.result = { completed: true, description: step.description };

    return {
      stepNumber: step.stepNumber,
      output: step.result,
      success: true,
      timestamp,
    };
  }
}
