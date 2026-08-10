import { PrismaClient, AutomationStatus } from '@prisma/client';
import { AutomationRepository } from '../repositories/automation.repository';
import { ExecutionRepository } from '../repositories/execution.repository';
import { ActivityRepository } from '../repositories/activity.repository';
import { ConditionEngine } from './condition-engine';
import { ActionEngine } from './action-engine';
import { ActionConfig, ExecutionStepResult, ConditionConfig } from '../automation.types';
import { withRetry } from '../utils/retry.utils';
import { formatStepResult } from '../utils/execution.utils';
import { logger } from '../../../config';
import { eventBus } from '../../../events/EventBus';

export class ExecutionEngine {
  private autoRepo: AutomationRepository;
  private execRepo: ExecutionRepository;
  private actRepo: ActivityRepository;
  private conditionEngine: ConditionEngine;
  private actionEngine: ActionEngine;

  constructor(prisma: PrismaClient) {
    this.autoRepo = new AutomationRepository();
    this.execRepo = new ExecutionRepository();
    this.actRepo = new ActivityRepository();
    this.conditionEngine = new ConditionEngine();
    this.actionEngine = new ActionEngine(prisma);
  }

  public async execute(
    automationId: string,
    triggerData?: Record<string, unknown>,
    requestUserId?: string,
  ): Promise<{ executionId: string; status: AutomationStatus; result?: unknown }> {
    logger.info(`[ExecutionEngine] Starting execution flow for automation '${automationId}'`);

    // 1. Load automation
    const auto = await this.autoRepo.findById(automationId);
    if (!auto) {
      throw new Error(`Automation '${automationId}' not found.`);
    }

    if (!auto.isEnabled || auto.status === AutomationStatus.PAUSED) {
      logger.info(`[ExecutionEngine] Automation '${automationId}' is disabled or paused. Skipping.`);
      return { executionId: '', status: AutomationStatus.PAUSED };
    }

    const userId = requestUserId || auto.userId || undefined;
    const workspaceId = auto.workspaceId;

    // 2. Create execution record
    const execution = await this.execRepo.createExecution(
      auto.id,
      workspaceId,
      userId,
      triggerData,
    );
    const executionId = execution.id;

    // Log activity
    await this.actRepo.logActivity(
      auto.id,
      workspaceId,
      'EXECUTION_STARTED',
      `Automation execution started [Trigger: ${auto.trigger}]`,
      executionId,
      userId,
      { triggerData },
    );

    // 3. Prepare execution context
    const context: Record<string, unknown> = {
      automationId: auto.id,
      executionId,
      workspaceId,
      userId,
      trigger: {
        type: auto.trigger,
        data: triggerData || {},
        timestamp: new Date().toISOString(),
      },
      steps: {},
    };

    try {
      // 4. Evaluate conditions
      const conditions = auto.conditions as ConditionConfig | null;
      const passConditions = this.conditionEngine.evaluate(conditions, context);

      if (!passConditions) {
        logger.info(`[ExecutionEngine] Execution '${executionId}' failed condition checks. Halting.`);

        await this.execRepo.updateExecution(executionId, {
          status: AutomationStatus.COMPLETED,
          result: { skipped: true, reason: 'Conditions not met' },
          completedAt: new Date(),
        });

        await this.actRepo.logActivity(
          auto.id,
          workspaceId,
          'EXECUTION_SKIPPED',
          'Execution skipped because conditions evaluated to false',
          executionId,
          userId,
        );

        return { executionId, status: AutomationStatus.COMPLETED, result: { skipped: true } };
      }

      // 5. Parse actions array
      let actions: ActionConfig[] = [];
      if (Array.isArray(auto.actions)) {
        actions = auto.actions as unknown as ActionConfig[];
      } else if (auto.actions && typeof auto.actions === 'object') {
        actions = [auto.actions as unknown as ActionConfig];
      }

      const stepResults: ExecutionStepResult[] = [];
      let finalResult: unknown = null;

      // 6. Execute action step pipeline
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const stepIndex = i + 1;
        const actionType = action.type || 'UNKNOWN';
        const actionMode = action.mode || 'AUTOMATIC';

        // Check if action requires manual approval
        if (actionMode === 'APPROVAL_REQUIRED' || actionMode === 'MANUAL') {
          logger.info(`[ExecutionEngine] Step ${stepIndex} requires approval. Pausing execution.`);

          const stepResult = formatStepResult(
            stepIndex,
            actionType,
            'WAITING_APPROVAL',
            action.params as Record<string, unknown>,
            undefined,
            undefined,
            new Date(),
            action.id,
          );
          stepResults.push(stepResult);

          await this.execRepo.updateExecution(executionId, {
            status: AutomationStatus.NEEDS_APPROVAL,
            currentStep: stepIndex,
            stepResults,
          });

          await this.actRepo.logActivity(
            auto.id,
            workspaceId,
            'APPROVAL_REQUESTED',
            `Action '${actionType}' requires user approval before proceeding`,
            executionId,
            userId,
            { stepIndex, action },
          );

          return { executionId, status: AutomationStatus.NEEDS_APPROVAL };
        }

        // Execute action step with bounded retry
        const stepStart = new Date();
        try {
          const stepOutput = await withRetry(
            `Step ${stepIndex} (${actionType})`,
            () => this.actionEngine.executeAction(action, context),
            { maxRetries: 2, initialDelayMs: 150 },
          );

          // Update context with step output
          const stepsObj = (context.steps || {}) as Record<string, any>;
          stepsObj[`step${stepIndex}`] = { output: stepOutput };
          if (action.id) {
            stepsObj[action.id] = { output: stepOutput };
          }
          context.steps = stepsObj;
          finalResult = stepOutput;

          const stepResult = formatStepResult(
            stepIndex,
            actionType,
            'SUCCESS',
            action.params as Record<string, unknown>,
            stepOutput,
            undefined,
            stepStart,
            action.id,
          );
          stepResults.push(stepResult);

          await this.execRepo.updateExecution(executionId, {
            currentStep: stepIndex,
            stepResults,
          });

          await this.actRepo.logActivity(
            auto.id,
            workspaceId,
            'STEP_COMPLETED',
            `Step ${stepIndex} (${actionType}) completed successfully`,
            executionId,
            userId,
            { stepIndex, actionType },
          );
        } catch (stepErr) {
          const stepResult = formatStepResult(
            stepIndex,
            actionType,
            'FAILED',
            action.params as Record<string, unknown>,
            undefined,
            stepErr,
            stepStart,
            action.id,
          );
          stepResults.push(stepResult);

          if (!action.continueOnError) {
            throw stepErr;
          }

          logger.warn(`[ExecutionEngine] Step ${stepIndex} failed but continueOnError is true. Continuing.`);
        }
      }

      // 7. Mark execution completed & update automation run stats
      await this.execRepo.updateExecution(executionId, {
        status: AutomationStatus.COMPLETED,
        currentStep: actions.length,
        stepResults,
        result: typeof finalResult === 'object' && finalResult !== null ? (finalResult as Record<string, unknown>) : { output: finalResult },
        completedAt: new Date(),
      });

      await this.autoRepo.recordRun(auto.id, AutomationStatus.ACTIVE);

      await this.actRepo.logActivity(
        auto.id,
        workspaceId,
        'EXECUTION_COMPLETED',
        'Automation execution completed successfully',
        executionId,
        userId,
      );

      eventBus.emit('automation.executed', {
        automationId: auto.id,
        workspaceId,
        executionTimeMs: Date.now() - execution.startedAt.getTime(),
        status: 'SUCCESS',
      });

      return { executionId, status: AutomationStatus.COMPLETED, result: finalResult };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`[ExecutionEngine] Execution '${executionId}' failed: ${errorMessage}`, { err });

      await this.execRepo.updateExecution(executionId, {
        status: AutomationStatus.FAILED,
        error: { message: errorMessage, stack: (err as Error).stack },
        completedAt: new Date(),
      });

      await this.autoRepo.recordRun(auto.id, AutomationStatus.FAILED);

      await this.actRepo.logActivity(
        auto.id,
        workspaceId,
        'EXECUTION_FAILED',
        `Automation execution failed: ${errorMessage}`,
        executionId,
        userId,
        { error: errorMessage },
      );

      eventBus.emit('automation.failed', {
        automationId: auto.id,
        workspaceId,
        executionTimeMs: Date.now() - execution.startedAt.getTime(),
        status: 'FAILED',
      });

      return { executionId, status: AutomationStatus.FAILED, result: { error: errorMessage } };
    }
  }

  /**
   * Resume pending execution after approval.
   */
  public async approveExecution(executionId: string, _userId?: string): Promise<boolean> {
    const execution = await this.execRepo.findById(executionId);
    if (!execution || execution.status !== AutomationStatus.NEEDS_APPROVAL) {
      return false;
    }

    logger.info(`[ExecutionEngine] Approving execution '${executionId}'`);

    await this.execRepo.updateExecution(executionId, {
      status: AutomationStatus.RUNNING,
    });

    await this.actRepo.logActivity(
      execution.automationId,
      execution.workspaceId,
      'APPROVAL_COMPLETED',
      'Execution step approved by user',
      executionId,
      execution.userId,
    );

    // Continue executing remaining steps asynchronously
    this.execute(execution.automationId, (execution.triggerData as Record<string, unknown>) || {}, execution.userId || undefined);
    return true;
  }

  /**
   * Reject pending execution.
   */
  public async rejectExecution(executionId: string, reason?: string): Promise<boolean> {
    const execution = await this.execRepo.findById(executionId);
    if (!execution || execution.status !== AutomationStatus.NEEDS_APPROVAL) {
      return false;
    }

    logger.info(`[ExecutionEngine] Rejecting execution '${executionId}'`);

    await this.execRepo.updateExecution(executionId, {
      status: AutomationStatus.CANCELLED,
      error: { message: `Execution rejected by user: ${reason || 'No reason provided'}` },
      completedAt: new Date(),
    });

    await this.actRepo.logActivity(
      execution.automationId,
      execution.workspaceId,
      'APPROVAL_REJECTED',
      `Execution step rejected by user: ${reason || 'No reason provided'}`,
      executionId,
      execution.userId,
    );

    return true;
  }
}
