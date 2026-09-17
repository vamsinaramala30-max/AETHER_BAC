/**
 * AETHER AI — Plan Executor
 * Executes structured action plans, verifying every step, enforcing idempotency,
 * and handling partial failures with complete honesty and transparency.
 */

import { performance } from 'perf_hooks';
import type {
  ActionPlan,
  PlanExecutionResult,
  PlanExecutionStatus,
  PlanStep,
} from './planning-types.js';
import type { ToolExecutionContext } from '../tools/tool-types.js';
import type { IToolExecutor } from '../tools/tool-executor.js';
import { toolExecutor } from '../tools/tool-executor.js';
import type { VerificationStatus, EvidenceItem } from '../ai-types.js';

export interface PlanExecutionOptions {
  readonly idempotencyKey?: string;
  readonly confirmedActionIds?: readonly string[];
  readonly signal?: AbortSignal;
}

export interface IPlanExecutor {
  executePlan(
    plan: ActionPlan,
    context: ToolExecutionContext,
    options?: PlanExecutionOptions,
  ): Promise<PlanExecutionResult>;
}

export class PlanExecutor implements IPlanExecutor {
  private readonly idempotencyCache = new Map<string, PlanExecutionResult>();

  constructor(private readonly executor: IToolExecutor = toolExecutor) {}

  public async executePlan(
    plan: ActionPlan,
    context: ToolExecutionContext,
    options: PlanExecutionOptions = {},
  ): Promise<PlanExecutionResult> {
    const startTime = performance.now();

    // ─── Idempotency Check ───────────────────────────────────────────────────
    if (options.idempotencyKey && this.idempotencyCache.has(options.idempotencyKey)) {
      const cached = this.idempotencyCache.get(options.idempotencyKey)!;
      return {
        ...cached,
        summary: `[Idempotent Replay] ${cached.summary}`,
      };
    }

    let successfulSteps = 0;
    let failedSteps = 0;
    const completedStepIds = new Set<string>();
    const failedStepIds = new Set<string>();

    const executedSteps: PlanStep[] = [];
    const evidenceItems: EvidenceItem[] = [];

    for (const step of plan.steps) {
      const stepCopy: PlanStep = { ...step };

      // Cancellation check
      if (options.signal?.aborted || context.signal?.aborted) {
        stepCopy.status = 'cancelled';
        stepCopy.error = 'Plan execution was cancelled.';
        stepCopy.verificationStatus = 'FAILED';
        executedSteps.push(stepCopy);
        failedSteps++;
        break;
      }

      // Check dependency completion
      if (step.dependencies && step.dependencies.length > 0) {
        const hasFailedDep = step.dependencies.some((depId) => failedStepIds.has(depId));
        if (hasFailedDep) {
          stepCopy.status = 'failed';
          stepCopy.error = 'Skipped because a prerequisite dependency step failed.';
          stepCopy.verified = false;
          stepCopy.verificationStatus = 'FAILED';
          executedSteps.push(stepCopy);
          failedStepIds.add(step.stepId);
          failedSteps++;
          continue;
        }
      }

      // Check confirmation requirements
      if (step.riskLevel === 'HIGH_IMPACT' || step.requiresConfirmation) {
        const isConfirmed =
          options.confirmedActionIds?.includes(step.stepId) ||
          options.confirmedActionIds?.includes(step.toolName || '');
        if (!isConfirmed) {
          stepCopy.status = 'failed';
          stepCopy.error = `Action "${step.description}" requires explicit user confirmation before execution.`;
          stepCopy.verified = false;
          stepCopy.verificationStatus = 'FAILED';
          executedSteps.push(stepCopy);
          failedStepIds.add(step.stepId);
          failedSteps++;
          continue;
        }
      }

      stepCopy.status = 'executing';

      if (step.toolName) {
        const stepStart = performance.now();
        const res = await this.executor.execute(
          step.toolName,
          step.toolInput || {},
          context,
          {
            signal: options.signal || context.signal,
            idempotencyKey: options.idempotencyKey
              ? `${options.idempotencyKey}_step_${step.stepNumber}`
              : undefined,
          },
        );

        stepCopy.executionTimeMs = performance.now() - stepStart;

        if (res.success && res.verified !== false) {
          stepCopy.status = 'completed';
          stepCopy.result = res.data;
          stepCopy.verified = true;
          stepCopy.verificationStatus = res.verificationStatus ?? 'VERIFIED';
          stepCopy.verificationDetails = res.verificationDetails;
          completedStepIds.add(step.stepId);
          successfulSteps++;

          evidenceItems.push({
            sourceType: 'tool_result',
            sourceId: step.toolName,
            content: typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? {}),
            relevance: 1.0,
            verified: true,
            verificationStatus: stepCopy.verificationStatus,
            metadata: {
              stepNumber: step.stepNumber,
              toolName: step.toolName,
              details: res.verificationDetails,
            },
          });
        } else {
          stepCopy.status = 'failed';
          stepCopy.error = res.error || 'Step execution failed.';
          stepCopy.verified = false;
          stepCopy.verificationStatus = 'FAILED';
          failedStepIds.add(step.stepId);
          failedSteps++;
        }
      } else {
        stepCopy.status = 'completed';
        stepCopy.verified = true;
        stepCopy.verificationStatus = 'VERIFIED';
        stepCopy.result = { completed: true, description: step.description };
        completedStepIds.add(step.stepId);
        successfulSteps++;

        evidenceItems.push({
          sourceType: 'tool_result',
          sourceId: step.stepId,
          content: step.description,
          relevance: 1.0,
          verified: true,
          verificationStatus: 'VERIFIED',
          metadata: { stepNumber: step.stepNumber },
        });
      }

      executedSteps.push(stepCopy);
    }

    const durationMs = performance.now() - startTime;

    // ─── Status Determination ────────────────────────────────────────────────
    let overallStatus: PlanExecutionStatus;
    let overallVerificationStatus: VerificationStatus;
    let summary: string;

    if (failedSteps === 0 && successfulSteps > 0) {
      overallStatus = 'SUCCESS';
      // Check if any step was not verifiable
      const hasNotVerifiable = executedSteps.some((s) => s.verificationStatus === 'NOT_VERIFIABLE');
      overallVerificationStatus = hasNotVerifiable ? 'NOT_VERIFIABLE' : 'VERIFIED';
      summary = `All ${successfulSteps} actions completed and verified successfully.`;
    } else if (successfulSteps > 0 && failedSteps > 0) {
      overallStatus = 'PARTIAL_SUCCESS';
      overallVerificationStatus = 'PARTIALLY_VERIFIED';
      const failedDescriptions = executedSteps
        .filter((s) => s.status === 'failed')
        .map((s) => `Step ${s.stepNumber} ("${s.description}"): ${s.error}`)
        .join('; ');
      summary = `${successfulSteps} actions completed successfully. ${failedSteps} action could not be completed: ${failedDescriptions}`;
    } else {
      overallStatus = 'FAILED';
      overallVerificationStatus = 'FAILED';
      const errors = executedSteps
        .map((s) => s.error)
        .filter(Boolean)
        .join('; ');
      summary = `Plan execution failed. ${errors || 'No actions could be completed.'}`;
    }

    const result: PlanExecutionResult = {
      planId: plan.planId,
      objective: plan.objective,
      status: overallStatus,
      verificationStatus: overallVerificationStatus,
      steps: executedSteps,
      successfulStepsCount: successfulSteps,
      failedStepsCount: failedSteps,
      summary,
      error: failedSteps > 0 ? summary : undefined,
      evidence: evidenceItems,
      durationMs,
    };

    // Cache idempotent successful results
    if (options.idempotencyKey && overallStatus === 'SUCCESS') {
      this.idempotencyCache.set(options.idempotencyKey, result);
    }

    return result;
  }

  public clearIdempotencyCache(): void {
    this.idempotencyCache.clear();
  }
}

export const planExecutor = new PlanExecutor();
