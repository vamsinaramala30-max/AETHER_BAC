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
import { AppError } from '../../../middleware/error.middleware';
import { DataSanitizer } from '../../ai/observability/sanitizer';

/**
 * Timeout wrapper for bounding asynchronous step execution.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new AppError(`Action step '${operationName}' timed out after ${timeoutMs}ms`, 504, 'TIMEOUT'));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

export class ExecutionEngine {
  private autoRepo: AutomationRepository;
  private execRepo: ExecutionRepository;
  private actRepo: ActivityRepository;
  private conditionEngine: ConditionEngine;
  private actionEngine: ActionEngine;

  // In-flight concurrency lock to prevent overlapping executions for the same automation rule
  private static activeLocks: Set<string> = new Set();

  // 60-second idempotency cache to deduplicate rapid/repeated triggers
  private static idempotencyCache: Map<
    string,
    { executionId: string; status: AutomationStatus; result?: unknown; timestamp: number }
  > = new Map();

  // Maximum allowed action steps per automation to protect system resources
  private static readonly MAX_ACTIONS_PER_RULE = 20;

  // Default timeout per action step
  private static readonly DEFAULT_STEP_TIMEOUT_MS = 30_000;

  constructor(prisma: PrismaClient) {
    this.autoRepo = new AutomationRepository();
    this.execRepo = new ExecutionRepository();
    this.actRepo = new ActivityRepository();
    this.conditionEngine = new ConditionEngine();
    this.actionEngine = new ActionEngine(prisma);
  }

  /**
   * Cleans up idempotency entries older than 60 seconds.
   */
  private static pruneIdempotencyCache(): void {
    const now = Date.now();
    for (const [key, entry] of ExecutionEngine.idempotencyCache.entries()) {
      if (now - entry.timestamp > 60_000) {
        ExecutionEngine.idempotencyCache.delete(key);
      }
    }
  }

  public async execute(
    automationId: string,
    triggerData?: Record<string, unknown>,
    requestUserId?: string,
  ): Promise<{ executionId: string; status: AutomationStatus; result?: unknown }> {
    logger.info(`[ExecutionEngine] Starting execution flow for automation '${automationId}'`);

    // 1. Idempotency Check (60-second trigger deduplication)
    ExecutionEngine.pruneIdempotencyCache();
    const idempotencyKey =
      (triggerData?.idempotencyKey as string) ||
      (triggerData?.idempotency_key as string) ||
      undefined;

    if (idempotencyKey) {
      const cacheKey = `${automationId}:${String(idempotencyKey).trim()}`;
      const cached = ExecutionEngine.idempotencyCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 60_000) {
        logger.info(
          `[ExecutionEngine] Duplicate trigger detected for automation '${automationId}' with idempotency key '${idempotencyKey}'. Returning cached result.`,
        );
        return {
          executionId: cached.executionId,
          status: cached.status,
          result: cached.result,
        };
      }
    }

    // 2. Concurrency Lock: Prevent multiple concurrent executions of the same automation
    if (ExecutionEngine.activeLocks.has(automationId)) {
      logger.warn(
        `[ExecutionEngine] Automation '${automationId}' is already running an active execution. Rejecting concurrent trigger.`,
      );
      throw new AppError(
        `Automation '${automationId}' is already running an active execution. Duplicate concurrent runs are blocked.`,
        409,
        'CONFLICT',
      );
    }

    // Acquire concurrency lock synchronously before any async operations
    ExecutionEngine.activeLocks.add(automationId);

    let executionId: string | undefined;
    let autoRecord: any = null;
    let executionStartedAt: Date = new Date();

    try {
      // 3. Load automation from persistent database
      const auto = await this.autoRepo.findById(automationId);
      if (!auto) {
        throw new AppError(`Automation '${automationId}' not found.`, 404, 'AUTOMATION_NOT_FOUND');
      }
      autoRecord = auto;

      // Guard against executing deleted automations
      if (auto.deletedAt) {
        throw new AppError(
          `Cannot execute deleted automation '${automationId}'.`,
          404,
          'AUTOMATION_DELETED',
        );
      }

      // Guard against executing disabled or paused automations
      if (!auto.isEnabled) {
        logger.info(`[ExecutionEngine] Automation '${automationId}' is disabled. Skipping execution.`);
        throw new AppError(
          `Cannot execute disabled automation '${automationId}'.`,
          400,
          'AUTOMATION_DISABLED',
        );
      }

      if (auto.status === AutomationStatus.PAUSED) {
        logger.info(`[ExecutionEngine] Automation '${automationId}' is paused. Skipping execution.`);
        throw new AppError(
          `Cannot execute paused automation '${automationId}'.`,
          400,
          'AUTOMATION_PAUSED',
        );
      }

      const userId = requestUserId || auto.userId || undefined;
      const workspaceId = auto.workspaceId;
      const sanitizedTriggerData = DataSanitizer.sanitize(triggerData || {});

      // 4. Create execution record in PostgreSQL
      const execution = await this.execRepo.createExecution(
        auto.id,
        workspaceId,
        userId,
        sanitizedTriggerData,
      );
      executionId = execution.id;
      executionStartedAt = execution.startedAt;

      // Log activity
      await this.actRepo.logActivity(
        auto.id,
        workspaceId,
        'EXECUTION_STARTED',
        `Automation execution started [Trigger: ${auto.trigger}]`,
        executionId,
        userId,
        { trigger: auto.trigger },
      );

      // 5. Prepare execution context
      const context: Record<string, unknown> = {
        automationId: auto.id,
        executionId,
        workspaceId,
        userId,
        trigger: {
          type: auto.trigger,
          data: sanitizedTriggerData,
          timestamp: new Date().toISOString(),
        },
        steps: {},
      };
      // 6. Evaluate conditions
      const conditions = auto.conditions as ConditionConfig | null;
      const passConditions = this.conditionEngine.evaluate(conditions, context);

      if (!passConditions) {
        logger.info(
          `[ExecutionEngine] Execution '${executionId}' did not meet condition checks. Halting cleanly.`,
        );

        const skipResult = { skipped: true, reason: 'Conditions not met' };

        await this.execRepo.updateExecution(executionId, {
          status: AutomationStatus.COMPLETED,
          result: skipResult,
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

        if (idempotencyKey) {
          ExecutionEngine.idempotencyCache.set(`${automationId}:${idempotencyKey}`, {
            executionId,
            status: AutomationStatus.COMPLETED,
            result: skipResult,
            timestamp: Date.now(),
          });
        }

        return { executionId, status: AutomationStatus.COMPLETED, result: skipResult };
      }

      // 7. Parse actions array and enforce resource bounds
      let actions: ActionConfig[] = [];
      if (Array.isArray(auto.actions)) {
        actions = auto.actions as unknown as ActionConfig[];
      } else if (auto.actions && typeof auto.actions === 'object') {
        actions = [auto.actions as unknown as ActionConfig];
      }

      if (actions.length > ExecutionEngine.MAX_ACTIONS_PER_RULE) {
        throw new AppError(
          `Automation rule defines ${actions.length} actions, exceeding maximum safety bound of ${ExecutionEngine.MAX_ACTIONS_PER_RULE}.`,
          400,
          'VALIDATION_ERROR',
        );
      }

      const stepResults: ExecutionStepResult[] = [];
      let finalResult: unknown = null;

      // 8. Execute action step pipeline
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const stepIndex = i + 1;
        const actionType = action.type || 'UNKNOWN';
        const actionMode = action.mode || 'AUTOMATIC';
        const timeoutMs = action.timeoutMs || ExecutionEngine.DEFAULT_STEP_TIMEOUT_MS;

        // Check if action requires manual approval
        if (actionMode === 'APPROVAL_REQUIRED' || actionMode === 'MANUAL') {
          logger.info(`[ExecutionEngine] Step ${stepIndex} requires approval. Pausing execution.`);

          const stepResult = formatStepResult(
            stepIndex,
            actionType,
            'WAITING_APPROVAL',
            DataSanitizer.sanitize(action.params as Record<string, unknown>),
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
            { stepIndex, actionType },
          );

          return { executionId, status: AutomationStatus.NEEDS_APPROVAL };
        }

        // Execute action step with bounded retry and timeout
        const stepStart = new Date();
        try {
          const stepOutput = await withRetry(
            `Step ${stepIndex} (${actionType})`,
            () =>
              withTimeout(
                this.actionEngine.executeAction(action, context),
                timeoutMs,
                `${actionType}_step_${stepIndex}`,
              ),
            { maxRetries: 2, initialDelayMs: 150 },
          );

          const sanitizedOutput = DataSanitizer.sanitize(stepOutput);

          // Update context with sanitized step output
          const stepsObj = (context.steps || {}) as Record<string, any>;
          stepsObj[`step${stepIndex}`] = { output: sanitizedOutput };
          if (action.id) {
            stepsObj[action.id] = { output: sanitizedOutput };
          }
          context.steps = stepsObj;
          finalResult = sanitizedOutput;

          const stepResult = formatStepResult(
            stepIndex,
            actionType,
            'SUCCESS',
            DataSanitizer.sanitize(action.params as Record<string, unknown>),
            sanitizedOutput,
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
          const stepErrorMessage = stepErr instanceof Error ? stepErr.message : String(stepErr);
          const sanitizedError = DataSanitizer.sanitize({ message: stepErrorMessage });

          const stepResult = formatStepResult(
            stepIndex,
            actionType,
            'FAILED',
            DataSanitizer.sanitize(action.params as Record<string, unknown>),
            undefined,
            sanitizedError,
            stepStart,
            action.id,
          );
          stepResults.push(stepResult);

          if (!action.continueOnError) {
            throw stepErr;
          }

          logger.warn(
            `[ExecutionEngine] Step ${stepIndex} failed but continueOnError is true. Continuing.`,
          );
        }
      }

      // 9. Mark execution completed & update automation run stats
      const sanitizedFinalResult =
        typeof finalResult === 'object' && finalResult !== null
          ? (DataSanitizer.sanitize(finalResult) as Record<string, unknown>)
          : { output: finalResult };

      await this.execRepo.updateExecution(executionId, {
        status: AutomationStatus.COMPLETED,
        currentStep: actions.length,
        stepResults,
        result: sanitizedFinalResult,
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

      const responsePayload = {
        executionId,
        status: AutomationStatus.COMPLETED,
        result: sanitizedFinalResult,
      };

      if (idempotencyKey) {
        ExecutionEngine.idempotencyCache.set(`${automationId}:${idempotencyKey}`, {
          ...responsePayload,
          timestamp: Date.now(),
        });
      }

      return responsePayload;
    } catch (err) {
      if (!executionId || !autoRecord) {
        throw err;
      }

      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`[ExecutionEngine] Execution '${executionId}' failed: ${errorMessage}`);

      const sanitizedErrorObj = {
        message: DataSanitizer.sanitizeString(errorMessage),
      };

      await this.execRepo.updateExecution(executionId, {
        status: AutomationStatus.FAILED,
        error: sanitizedErrorObj,
        completedAt: new Date(),
      });

      await this.autoRepo.recordRun(autoRecord.id, AutomationStatus.FAILED);

      await this.actRepo.logActivity(
        autoRecord.id,
        autoRecord.workspaceId,
        'EXECUTION_FAILED',
        `Automation execution failed: ${sanitizedErrorObj.message}`,
        executionId,
        requestUserId || autoRecord.userId || undefined,
        { error: sanitizedErrorObj.message },
      );

      eventBus.emit('automation.failed', {
        automationId: autoRecord.id,
        workspaceId: autoRecord.workspaceId,
        executionTimeMs: Date.now() - executionStartedAt.getTime(),
        status: 'FAILED',
      });

      const failPayload = {
        executionId,
        status: AutomationStatus.FAILED,
        result: { error: sanitizedErrorObj.message },
      };

      if (idempotencyKey) {
        ExecutionEngine.idempotencyCache.set(`${automationId}:${idempotencyKey}`, {
          ...failPayload,
          timestamp: Date.now(),
        });
      }

      return failPayload;
    } finally {
      // Always release concurrency lock
      ExecutionEngine.activeLocks.delete(automationId);
    }
  }

  /**
   * Resume pending execution after approval.
   */
  public async approveExecution(executionId: string, userId?: string): Promise<boolean> {
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
      userId || execution.userId,
    );

    // Continue executing remaining steps
    this.execute(
      execution.automationId,
      (execution.triggerData as Record<string, unknown>) || {},
      userId || execution.userId || undefined,
    ).catch((err) => {
      logger.error(`[ExecutionEngine] Approved execution continuation failed: ${err.message}`);
    });

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

    const sanitizedReason = DataSanitizer.sanitizeString(reason || 'No reason provided');

    await this.execRepo.updateExecution(executionId, {
      status: AutomationStatus.CANCELLED,
      error: { message: `Execution rejected by user: ${sanitizedReason}` },
      completedAt: new Date(),
    });

    await this.actRepo.logActivity(
      execution.automationId,
      execution.workspaceId,
      'APPROVAL_REJECTED',
      `Execution step rejected by user: ${sanitizedReason}`,
      executionId,
      execution.userId,
    );

    return true;
  }
}

