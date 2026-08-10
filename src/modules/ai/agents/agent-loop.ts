/**
 * AETHER AI — Agent Execution Loop
 * Core loop driving planning, step execution, observation gathering, and state management.
 * Protects against infinite loops, handles cancellation/timeouts, and hides private reasoning.
 */

import { performance } from 'perf_hooks';
import type { AgentConfig, AgentRunOptions, AgentRunResult } from './agent-types.js';
import { AgentStateTracker } from './agent-state.js';
import { AgentShortTermMemory } from './agent-memory.js';
import type { IAgentPlanner } from './planner.js';
import { AgentPlanner } from './planner.js';
import type { IAgentStepExecutor } from './executor.js';
import { AgentStepExecutor } from './executor.js';
import type { ToolExecutionContext } from '../tools/tool-types.js';
import type { IToolExecutor } from '../tools/tool-executor.js';

export interface IAgentExecutionLoop {
  run(
    runId: string,
    goal: string,
    config: AgentConfig,
    toolContext: ToolExecutionContext,
    options?: AgentRunOptions,
  ): Promise<AgentRunResult>;
}

export class AgentExecutionLoop implements IAgentExecutionLoop {
  private readonly planner: IAgentPlanner;
  private readonly executor: IAgentStepExecutor;

  constructor(planner?: IAgentPlanner, toolExecutor?: IToolExecutor) {
    this.planner = planner ?? new AgentPlanner();
    this.executor = new AgentStepExecutor(toolExecutor);
  }

  public async run(
    runId: string,
    goal: string,
    config: AgentConfig,
    toolContext: ToolExecutionContext,
    options: AgentRunOptions = {},
  ): Promise<AgentRunResult> {
    const startTime = performance.now();
    const maxIterations = options.maxIterations ?? config.maxIterations;
    const tracker = new AgentStateTracker(maxIterations);
    const memory = new AgentShortTermMemory();

    tracker.transitionTo('planning', 'Constructing plan');

    let plan;
    try {
      plan = await this.planner.createPlan(goal, config);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Planning failed';
      tracker.transitionTo('failed', errorMsg);
      return {
        runId,
        agentId: config.id,
        status: 'failed',
        stepsExecuted: 0,
        error: errorMsg,
        durationMs: performance.now() - startTime,
      };
    }

    tracker.transitionTo('running', 'Executing steps');
    let stepsExecuted = 0;

    for (const step of plan.steps) {
      // Cancellation check
      if (options.signal?.aborted || toolContext.signal?.aborted) {
        tracker.transitionTo('cancelled', 'Aborted by signal');
        return {
          runId,
          agentId: config.id,
          status: 'cancelled',
          stepsExecuted,
          error: 'Agent execution was cancelled.',
          durationMs: performance.now() - startTime,
        };
      }

      // Infinite loop prevention check
      if (!tracker.incrementIteration()) {
        return {
          runId,
          agentId: config.id,
          status: 'failed',
          stepsExecuted,
          error: tracker.getMessage(),
          durationMs: performance.now() - startTime,
        };
      }

      memory.recordStep(step);
      const observation = await this.executor.executeStep(step, toolContext);
      memory.recordObservation(observation);
      stepsExecuted++;

      if (!observation.success) {
        tracker.transitionTo('failed', `Step ${step.stepNumber} failed`);
        return {
          runId,
          agentId: config.id,
          status: 'failed',
          stepsExecuted,
          error: observation.error ?? `Step ${step.stepNumber} failed without specific error.`,
          durationMs: performance.now() - startTime,
        };
      }
    }

    const finalAnswer = `Task "${goal}" completed successfully across ${stepsExecuted} steps.`;
    memory.setFinalResponse(finalAnswer);
    tracker.transitionTo('completed', 'All steps executed successfully');

    return {
      runId,
      agentId: config.id,
      status: 'completed',
      stepsExecuted,
      response: memory.getSummary(),
      durationMs: performance.now() - startTime,
    };
  }
}
