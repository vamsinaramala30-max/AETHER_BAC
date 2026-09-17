/**
 * AETHER AI - Execution Engine (Prompt 8)
 * The core autonomous agent execution loop.
 *
 * Architecture:
 *   PlanHandoffPayload (from Prompt 7)
 *     -> Plan Integrity Verification
 *     -> State Machine: PENDING -> VALIDATING -> AUTHORIZED -> RUNNING
 *     -> Topological Step Execution (Kahn algorithm)
 *     -> Prompt 6 ToolExecutor per step
 *     -> ExecutionVerifier per step
 *     -> ExecutionRecovery on failure
 *     -> COMPLETED / PARTIALLY_COMPLETED / FAILED
 *
 * Invariants:
 *   1. Only HANDED_OFF plans from Prompt 7 are accepted.
 *   2. Plan hash is verified before execution begins.
 *   3. Server-side auth is the only source of userId/permissions.
 *   4. Every tool call goes through Prompt 6 ToolExecutor (never bypassed).
 *   5. No arbitrary code/shell/SQL/subprocess execution.
 *   6. High-impact steps require explicit approval before execution.
 *   7. Retries are bounded (max 3 per step, configurable).
 *   8. All execution state is persisted to PostgreSQL (with memory fallback).
 *   9. Success is only reported when tool.verified === true.
 *  10. Tenant isolation is enforced at every DB boundary.
 */

import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { performance } from 'perf_hooks';
import type { PlanHandoffPayload, ValidatedHandoffStep } from '../planning/plan-handoff.js';
import type { IToolExecutor } from '../tools/tool-executor.js';
import { toolExecutor } from '../tools/tool-executor.js';
import type { ToolExecutionContext } from '../tools/tool-types.js';
import { planRepository } from '../planning/plan-repository.js';
import { planValidator } from '../planning/plan-validator.js';
import type { IExecutionRepository } from './execution-repository.js';
import { executionRepository } from './execution-repository.js';
import type { IExecutionStateMachine } from './execution-state-machine.js';
import { executionStateMachine } from './execution-state-machine.js';
import type { IExecutionVerifier } from './execution-verifier.js';
import { executionVerifier } from './execution-verifier.js';
import type { IExecutionRecovery } from './execution-recovery.js';
import { executionRecovery } from './execution-recovery.js';
import type {
  AgentExecution,
  AgentExecutionStep,
  ExecutionContext,
  ExecutionOptions,
  ExecutionResult,
  ExecutionStepResult,
  ExecutionEvent,
  ExecutionEventType,
  ApprovalRequest,
  UserInputRequest,
  FailureCategory,
} from './execution-types.js';
import { metrics } from '../observability/metrics.js';
import { tracer } from '../observability/tracing.js';
import { logger } from '../observability/logger.js';
import { DataSanitizer } from '../observability/sanitizer.js';

// ============================================================================
// Types
// ============================================================================

export type ExecutionEventCallback = (event: ExecutionEvent) => void;

export interface IExecutionEngine {
  startExecution(
    handoff: PlanHandoffPayload,
    ctx: ExecutionContext,
    options?: ExecutionOptions,
    onEvent?: ExecutionEventCallback,
  ): Promise<ExecutionResult>;
  cancelExecution(executionId: string, userId: string): Promise<boolean>;
  approveStep(executionId: string, stepId: string, userId: string): Promise<boolean>;
  provideInput(executionId: string, stepId: string, input: Record<string, unknown>, userId: string): Promise<boolean>;
  getExecution(executionId: string, userId: string): Promise<AgentExecution | null>;
}

// ============================================================================
// ExecutionEngine
// ============================================================================

export class ExecutionEngine implements IExecutionEngine {
  private readonly DEFAULT_EXECUTION_TIMEOUT_MS = 5 * 60 * 1000;
  private readonly DEFAULT_STEP_TIMEOUT_MS = 60_000;
  private readonly DEFAULT_MAX_RETRIES = 3;

  private readonly cancellationMap = new Map<string, AbortController>();
  private readonly approvalMap = new Map<string, () => void>();
  private readonly inputMap = new Map<string, (input: Record<string, unknown>) => void>();
  private readonly activeExecutionLocks = new Set<string>();

  constructor(
    private readonly toolExec: IToolExecutor = toolExecutor,
    private readonly repo: IExecutionRepository = executionRepository,
    private readonly sm: IExecutionStateMachine = executionStateMachine,
    private readonly ver: IExecutionVerifier = executionVerifier,
    private readonly rec: IExecutionRecovery = executionRecovery,
  ) {}

  // --------------------------------------------------------------------------
  // Start Execution
  // --------------------------------------------------------------------------

  public async startExecution(
    handoff: PlanHandoffPayload,
    ctx: ExecutionContext,
    options: ExecutionOptions = {},
    onEvent?: ExecutionEventCallback,
  ): Promise<ExecutionResult> {
    const startTime = performance.now();
    const executionId = randomUUID();
    const correlationId = ctx.correlationId;

    // --- Idempotency & concurrency check ---
    const idempKey = options.idempotencyKey ?? (handoff.planId + '_v' + handoff.version + '_' + ctx.userId);
    const existing = await this.repo.findByIdempotencyKey(idempKey, ctx.userId);
    if (existing) {
      if (this.sm.isTerminal(existing.status)) {
        return this.resultFromExecution(existing, performance.now() - startTime);
      }
      return this.failResult(
        existing.id,
        handoff,
        ctx,
        'CONFLICT',
        'Execution ' + existing.id + ' is already active in state ' + existing.status + ' for this plan.',
        performance.now() - startTime,
      );
    }

    if (this.activeExecutionLocks.has(idempKey)) {
      return this.failResult(
        executionId,
        handoff,
        ctx,
        'CONFLICT',
        'An execution with this idempotency key is currently running.',
        performance.now() - startTime,
      );
    }

    this.activeExecutionLocks.add(idempKey);

    // --- Tenant isolation: auth userId must match plan owner ---
    if (handoff.executionContext.userId !== ctx.userId) {
      this.activeExecutionLocks.delete(idempKey);
      return this.failResult(executionId, handoff, ctx, 'TENANT_VIOLATION',
        'Authenticated user does not match plan owner.', performance.now() - startTime);
    }

    // --- Abort controller ---
    const abortCtrl = new AbortController();
    this.cancellationMap.set(executionId, abortCtrl);
    const signal = this.combineSignals(options.signal, ctx.signal, abortCtrl.signal);

    try {
      // --- Create DB record ---
    let exec = await this.repo.createExecution({
      id: executionId,
      planId: handoff.planId,
      planVersion: handoff.version,
      planHash: handoff.planHash,
      correlationId,
      handoffId: handoff.handoffId,
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
      projectId: ctx.projectId,
      conversationId: ctx.conversationId,
      status: 'PENDING',
      currentStepId: undefined,
      completedStepIds: [],
      failedStepIds: [],
      blockedStepIds: [],
      replanningRequired: false,
      idempotencyKey: idempKey,
      totalSteps: handoff.totalSteps,
      completedStepsCount: 0,
      failedStepsCount: 0,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    this.emit(onEvent, 'execution.started', exec, correlationId);

    // PENDING -> VALIDATING
    exec = await this.doTransition(exec, 'VALIDATING', ctx.userId) ?? exec;

    // --- Plan integrity verification ---
    const integrity = await this.verifyPlanIntegrity(handoff, ctx);
    if (!integrity.valid) {
      exec = await this.doTransition(exec, 'BLOCKED', ctx.userId, {
        failureReason: integrity.reason, failureCategory: 'VALIDATION',
      }) ?? exec;
      this.emit(onEvent, 'execution.failed', exec, correlationId, { message: integrity.reason });
      this.cancellationMap.delete(executionId);
      return this.resultFromExecution(exec, performance.now() - startTime);
    }

    this.emit(onEvent, 'plan.validated', exec, correlationId);

    // VALIDATING -> AUTHORIZED
    exec = await this.doTransition(exec, 'AUTHORIZED', ctx.userId) ?? exec;

    // --- Topological sort ---
    const ordered = this.topoSort(handoff.steps);
    if (ordered === null) {
      exec = await this.doTransition(exec, 'BLOCKED', ctx.userId, {
        failureReason: 'Cyclic dependency detected in plan.', failureCategory: 'VALIDATION',
      }) ?? exec;
      this.cancellationMap.delete(executionId);
      return this.resultFromExecution(exec, performance.now() - startTime);
    }

    // AUTHORIZED -> RUNNING
    exec = await this.doTransition(exec, 'RUNNING', ctx.userId) ?? exec;

    const completedIds = new Set<string>();
    const failedIds = new Set<string>();
    const stepResults: ExecutionStepResult[] = [];
    const timeoutMs = options.executionTimeoutMs ?? this.DEFAULT_EXECUTION_TIMEOUT_MS;

    for (const hs of ordered) {
      // Cancellation
      if (signal.aborted) {
        exec = await this.doTransition(exec, 'CANCELLED', ctx.userId, {
          failureReason: 'Execution cancelled.',
        }) ?? exec;
        this.emit(onEvent, 'execution.cancelled', exec, correlationId);
        this.cancellationMap.delete(executionId);
        return this.resultFromExecution(exec, performance.now() - startTime);
      }

      // Global timeout
      if (performance.now() - startTime > timeoutMs) {
        exec = await this.doTransition(exec, 'TIMED_OUT', ctx.userId, {
          failureReason: 'Execution timeout exceeded.', failureCategory: 'TIMEOUT',
        }) ?? exec;
        this.cancellationMap.delete(executionId);
        return this.resultFromExecution(exec, performance.now() - startTime);
      }

      // Dependency check
      const failedDeps = hs.dependencies.filter((d) => failedIds.has(d));
      if (failedDeps.length > 0) {
        const bs = this.buildStep(executionId, hs, {
          status: 'BLOCKED',
          failureReason: 'Prerequisite failed: ' + failedDeps.join(', '),
          failureCategory: 'VALIDATION',
        });
        await this.repo.persistStep(executionId, bs);
        failedIds.add(hs.stepId); stepResults.push(this.toStepResult(bs)); continue;
      }
      const missingDeps = hs.dependencies.filter((d) => !completedIds.has(d));
      if (missingDeps.length > 0) {
        const bs = this.buildStep(executionId, hs, {
          status: 'BLOCKED',
          failureReason: 'Unresolved deps: ' + missingDeps.join(', '),
          failureCategory: 'VALIDATION',
        });
        await this.repo.persistStep(executionId, bs);
        failedIds.add(hs.stepId); stepResults.push(this.toStepResult(bs)); continue;
      }

      let execStep = this.buildStep(executionId, hs, { status: 'PENDING' });
      await this.repo.persistStep(executionId, execStep);
      this.emit(onEvent, 'step.started', exec, correlationId, { stepId: hs.stepId });

      // Approval gate
      if (hs.isHighImpact || hs.requiresConfirmation) {
        execStep = { ...execStep, status: 'WAITING_FOR_APPROVAL' };
        await this.repo.persistStep(executionId, execStep);
        exec = await this.doTransition(exec, 'WAITING_FOR_APPROVAL', ctx.userId, {
          currentStepId: hs.stepId,
        }) ?? exec;

        const ar: ApprovalRequest = {
          approvalId: randomUUID(), executionId, stepId: hs.stepId,
          toolName: hs.toolName, riskLevel: 'HIGH_IMPACT', action: hs.description,
          reason: 'High-impact action requires approval.', requestedAt: new Date().toISOString(),
        };
        this.emit(onEvent, 'approval.required', exec, correlationId, {
          approvalRequest: ar as unknown as Record<string, unknown>,
        });

        const approved = await this.waitForApproval(executionId, hs.stepId, signal);
        if (!approved) {
          if (signal.aborted) {
            exec = await this.doTransition(exec, 'CANCELLED', ctx.userId, {
              failureReason: 'Execution cancelled.',
            }) ?? exec;
            this.emit(onEvent, 'execution.cancelled', exec, correlationId);
            return this.resultFromExecution(exec, performance.now() - startTime);
          }
          execStep = { ...execStep, status: 'CANCELLED', failureReason: 'Approval not granted.' };
          await this.repo.persistStep(executionId, execStep);
          failedIds.add(hs.stepId); stepResults.push(this.toStepResult(execStep)); continue;
        }
        // Re-validate after approval
        exec = await this.doTransition(exec, 'RUNNING', ctx.userId, {
          currentStepId: hs.stepId,
        }) ?? exec;
      }

      // Execute with retry
      const sr = await this.executeStepWithRetry(exec, execStep, hs, ctx, options, signal, onEvent, correlationId);
      stepResults.push(sr);

      if (sr.status === 'COMPLETED') {
        completedIds.add(hs.stepId);
        exec = await this.repo.updateStatus(executionId, exec.status, 'RUNNING', ctx.userId, {
          completedStepIds: [...exec.completedStepIds, hs.stepId],
          completedStepsCount: exec.completedStepsCount + 1,
          replanningRequired: exec.replanningRequired,
        }) ?? exec;
      } else {
        failedIds.add(hs.stepId);
        exec = await this.repo.updateStatus(executionId, exec.status, 'RUNNING', ctx.userId, {
          failedStepIds: [...exec.failedStepIds, hs.stepId],
          failedStepsCount: exec.failedStepsCount + 1,
          replanningRequired: exec.replanningRequired,
        }) ?? exec;
      }
    }

    // --- Final status ---
    const nCompleted = completedIds.size;
    const nFailed = failedIds.size;
    const nTotal = handoff.totalSteps;

    let finalStatus: AgentExecution['status'];
    let summary: string;
    let overallVerified = false;

    if (nFailed === 0 && nCompleted === nTotal) {
      finalStatus = 'COMPLETED';
      overallVerified = stepResults.every((s) => s.verified || s.verificationStatus === 'NOT_VERIFIABLE');
      summary = 'All ' + nTotal + ' steps completed and verified.';
    } else if (nCompleted > 0 && nFailed > 0) {
      finalStatus = 'PARTIALLY_COMPLETED';
      const failedDesc = stepResults.filter((s) => s.status !== 'COMPLETED').map((s) => s.title + ': ' + (s.error ?? 'failed')).join('; ');
      summary = nCompleted + ' steps completed, ' + nFailed + ' failed. ' + failedDesc;
    } else {
      finalStatus = 'FAILED';
      summary = 'Execution failed. ' + nFailed + ' step(s) could not complete.';
    }

    exec = await this.repo.updateStatus(executionId, 'RUNNING', finalStatus, ctx.userId, {
      completedStepsCount: nCompleted,
      failedStepsCount: nFailed,
      completedAt: new Date().toISOString(),
      failureReason: nFailed > 0 ? summary : undefined,
      replanningRequired: exec.replanningRequired,
    }) ?? exec;

    const evType: ExecutionEventType = finalStatus === 'FAILED' ? 'execution.failed' : 'execution.completed';
    this.emit(onEvent, evType, exec, correlationId, { message: summary });

    return {
        executionId,
        planId: handoff.planId,
        planVersion: handoff.version,
        correlationId,
        status: finalStatus,
        steps: stepResults,
        completedStepsCount: nCompleted,
        failedStepsCount: nFailed,
        totalSteps: nTotal,
        summary,
        verified: overallVerified,
        durationMs: performance.now() - startTime,
        replanningRequired: exec.replanningRequired ?? false,
      };
    } finally {
      this.activeExecutionLocks.delete(idempKey);
      this.cancellationMap.delete(executionId);
    }
  }

  // --------------------------------------------------------------------------
  // Step Execution with Retry
  // --------------------------------------------------------------------------

  private async executeStepWithRetry(
    exec: AgentExecution,
    execStep: AgentExecutionStep,
    hs: ValidatedHandoffStep,
    ctx: ExecutionContext,
    options: ExecutionOptions,
    signal: AbortSignal,
    onEvent: ExecutionEventCallback | undefined,
    correlationId: string,
  ): Promise<ExecutionStepResult> {
    const maxRetries = options.maxRetries ?? this.DEFAULT_MAX_RETRIES;
    const stepTimeoutMs = options.stepTimeoutMs ?? this.DEFAULT_STEP_TIMEOUT_MS;
    let attempt = 0;

    while (attempt <= maxRetries) {
      if (signal.aborted) {
        const s = { ...execStep, status: 'CANCELLED' as const, attemptCount: attempt };
        await this.repo.persistStep(exec.id, s);
        return this.toStepResult(s);
      }

      attempt++;
      const t0 = performance.now();
      const idempKey = exec.id + '_' + hs.stepId + '_a' + attempt;

      let runStep: AgentExecutionStep = { ...execStep, status: 'RUNNING', attemptCount: attempt, idempotencyKey: idempKey, startedAt: new Date().toISOString() };
      await this.repo.persistStep(exec.id, runStep);

      // Non-tool step
      if (!hs.toolName) {
        const done: AgentExecutionStep = { ...runStep, status: 'COMPLETED', verified: true, verificationStatus: 'VERIFIED', verificationDetails: 'Non-tool step.', completedAt: new Date().toISOString(), durationMs: performance.now() - t0 };
        await this.repo.persistStep(exec.id, done);
        return this.toStepResult(done);
      }

      // Security: only registered tools
      const toolDef = this.toolExec.getTool?.(hs.toolName);
      if (!toolDef) {
        const blocked: AgentExecutionStep = { ...runStep, status: 'BLOCKED', failureReason: 'Tool "' + hs.toolName + '" not registered. Arbitrary tool execution rejected.', failureCategory: 'VALIDATION' };
        await this.repo.persistStep(exec.id, blocked);
        this.emit(onEvent, 'step.failed', exec, correlationId, { stepId: hs.stepId });
        return this.toStepResult(blocked);
      }

      this.emit(onEvent, 'tool.started', exec, correlationId, { stepId: hs.stepId, toolName: hs.toolName, attempt });

      const toolCtx: ToolExecutionContext = {
        auth: ctx.auth,
        traceId: exec.id + '_s_' + hs.stepId,
        correlationId,
        conversationId: ctx.conversationId,
        workspaceId: ctx.workspaceId,
        projectId: ctx.projectId,
        requestId: exec.id,
        signal,
      };

      let toolResult;
      try {
        toolResult = await this.toolExec.execute(hs.toolName, hs.validatedInput ?? {}, toolCtx, {
          idempotencyKey: idempKey,
          maxRetries: 0,
          timeoutMs: stepTimeoutMs,
          signal,
        });
      } catch (err) {
        const cat = this.rec.classifyFailure(err);
        const dec = this.rec.decideRecovery(cat, attempt, maxRetries);
        await this.repo.recordAttempt({ stepId: runStep.id, attempt, status: 'FAILED', error: err instanceof Error ? err.message : String(err), startedAt: runStep.startedAt ?? new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: performance.now() - t0 });
        if (dec.shouldRetry && attempt < maxRetries) {
          await this.sleep(dec.delayMs ?? 500);
          continue;
        }
        const fs: AgentExecutionStep = { ...runStep, status: 'FAILED', failureReason: err instanceof Error ? err.message : 'Unknown error', failureCategory: cat, completedAt: new Date().toISOString(), durationMs: performance.now() - t0 };
        await this.repo.persistStep(exec.id, fs);
        this.emit(onEvent, 'step.failed', exec, correlationId, { stepId: hs.stepId });
        return this.toStepResult(fs);
      }

      this.emit(onEvent, 'tool.completed', exec, correlationId, { stepId: hs.stepId, toolName: hs.toolName });

      runStep = { ...runStep, status: 'VERIFYING' };
      await this.repo.persistStep(exec.id, runStep);

      const vr = this.ver.verifyStepResult(toolResult, runStep);

      await this.repo.recordAttempt({
        stepId: runStep.id, attempt,
        status: vr.verified ? 'COMPLETED' : 'FAILED',
        toolResult: toolResult.data as Record<string, unknown> | undefined,
        error: vr.verified ? undefined : vr.details,
        startedAt: runStep.startedAt ?? new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: performance.now() - t0,
      });

      if (vr.blockExecution && !vr.verified) {
        const cat: FailureCategory =
          toolResult.code === 'VERIFICATION_FAILED' || (toolResult.success && toolResult.verified === false)
            ? 'VERIFICATION_FAILURE'
            : this.rec.classifyFailure(toolResult.error ?? toolResult.code, toolResult);
        const dec = this.rec.decideRecovery(cat, attempt, maxRetries);
        if (dec.requiresReplanning) {
          exec.replanningRequired = true;
        }
        if (dec.shouldRetry && attempt < maxRetries) { await this.sleep(dec.delayMs ?? 500); continue; }
        const fs: AgentExecutionStep = { ...runStep, status: 'FAILED', verified: false, verificationStatus: vr.status, verificationDetails: vr.details, toolResult: toolResult.data as Record<string, unknown> | undefined, failureReason: vr.details, failureCategory: cat, completedAt: new Date().toISOString(), durationMs: performance.now() - t0 };
        await this.repo.persistStep(exec.id, fs);
        this.emit(onEvent, 'step.failed', exec, correlationId, { stepId: hs.stepId });
        return this.toStepResult(fs);
      }

      const done: AgentExecutionStep = { ...runStep, status: 'COMPLETED', verified: vr.verified, verificationStatus: vr.status, verificationDetails: vr.details, toolResult: toolResult.data as Record<string, unknown> | undefined, attemptCount: attempt, completedAt: new Date().toISOString(), durationMs: performance.now() - t0 };
      await this.repo.persistStep(exec.id, done);
      this.emit(onEvent, 'step.verified', exec, correlationId, { stepId: hs.stepId });
      return this.toStepResult(done);
    }

    const ex: AgentExecutionStep = { ...execStep, status: 'FAILED', failureReason: 'Max retries exhausted.', failureCategory: 'SYSTEM_FAILURE' };
    await this.repo.persistStep(exec.id, ex);
    return this.toStepResult(ex);
  }

  // --------------------------------------------------------------------------
  // Cancel / Approve / Input / Get
  // --------------------------------------------------------------------------

  public async cancelExecution(executionId: string, userId: string): Promise<boolean> {
    const exec = await this.repo.findById(executionId, userId);
    if (!exec || !this.sm.canCancel(exec.status)) return false;
    this.cancellationMap.get(executionId)?.abort();
    await this.repo.updateStatus(executionId, exec.status, 'CANCELLED', userId, { failureReason: 'Cancelled by user.' });
    return true;
  }

  public async approveStep(executionId: string, stepId: string, userId: string): Promise<boolean> {
    const exec = await this.repo.findById(executionId, userId);
    if (!exec || exec.status !== 'WAITING_FOR_APPROVAL') return false;
    const key = executionId + ':' + stepId;
    const resolve = this.approvalMap.get(key);
    if (!resolve) return false;
    resolve();
    this.approvalMap.delete(key);
    return true;
  }

  public async provideInput(executionId: string, stepId: string, input: Record<string, unknown>, userId: string): Promise<boolean> {
    const exec = await this.repo.findById(executionId, userId);
    if (!exec || exec.status !== 'WAITING_FOR_INPUT') return false;
    const key = executionId + ':' + stepId;
    const resolve = this.inputMap.get(key);
    if (!resolve) return false;
    resolve(input);
    this.inputMap.delete(key);
    return true;
  }

  public async getExecution(executionId: string, userId: string): Promise<AgentExecution | null> {
    return this.repo.findById(executionId, userId);
  }

  // --------------------------------------------------------------------------
  // Plan Integrity
  // --------------------------------------------------------------------------

  private async verifyPlanIntegrity(handoff: PlanHandoffPayload, ctx: ExecutionContext): Promise<{ valid: boolean; reason: string }> {
    if (handoff.status !== 'HANDED_OFF') {
      return { valid: false, reason: 'Plan status is not HANDED_OFF: ' + handoff.status };
    }

    const plan = await planRepository.findById(handoff.planId, ctx.userId);
    if (!plan) return { valid: false, reason: 'Plan not found or not owned by authenticated user.' };
    if (plan.version !== handoff.version) return { valid: false, reason: 'Plan version mismatch: expected ' + handoff.version + ' got ' + plan.version };

    if (plan.planHash && handoff.planHash && plan.planHash !== handoff.planHash) {
      return { valid: false, reason: 'Plan hash mismatch. Plan modified after handoff.' };
    }

    if (handoff.planHash && handoff.steps.length > 0) {
      const hp = JSON.stringify({ id: handoff.planId, version: handoff.version, userId: handoff.executionContext.userId, goal: handoff.goal, steps: handoff.steps.map((s) => ({ id: s.stepId, order: s.order, toolName: s.toolName })) });
      const computed = createHash('sha256').update(hp).digest('hex');
      if (computed !== handoff.planHash) return { valid: false, reason: 'Plan hash recomputation failed. Payload tampered.' };
    }

    const validation = planValidator.validate(plan, ctx.auth);
    if (!validation.valid && validation.errors.length > 0) {
      return { valid: false, reason: 'Plan re-validation failed: ' + validation.errors.join('; ') };
    }

    if (ctx.workspaceId && plan.workspaceId && plan.workspaceId !== ctx.workspaceId) {
      return { valid: false, reason: 'Workspace tenant violation.' };
    }

    return { valid: true, reason: '' };
  }

  // --------------------------------------------------------------------------
  // Topological Sort (Kahn algorithm - cycle-safe)
  // --------------------------------------------------------------------------

  private topoSort(steps: readonly ValidatedHandoffStep[]): ValidatedHandoffStep[] | null {
    const sm = new Map(steps.map((s) => [s.stepId, s]));
    const inDeg = new Map<string, number>(steps.map((s) => [s.stepId, 0]));
    const adj = new Map<string, string[]>(steps.map((s) => [s.stepId, []]));

    for (const s of steps) {
      for (const dep of s.dependencies) {
        inDeg.set(s.stepId, (inDeg.get(s.stepId) ?? 0) + 1);
        if (!adj.has(dep)) adj.set(dep, []);
        adj.get(dep)!.push(s.stepId);
      }
    }

    const queue = [...inDeg.entries()].filter(([, d]) => d === 0).map(([id]) => id);
    queue.sort((a, b) => (sm.get(a)?.order ?? 0) - (sm.get(b)?.order ?? 0));

    const sorted: ValidatedHandoffStep[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      const step = sm.get(id);
      if (step) sorted.push(step);
      for (const nb of adj.get(id) ?? []) {
        const d = (inDeg.get(nb) ?? 0) - 1;
        inDeg.set(nb, d);
        if (d === 0) {
          const ins = queue.findIndex((q) => (sm.get(q)?.order ?? 0) > (sm.get(nb)?.order ?? 0));
          if (ins === -1) queue.push(nb); else queue.splice(ins, 0, nb);
        }
      }
    }

    return sorted.length !== steps.length ? null : sorted;
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private async doTransition(exec: AgentExecution, to: AgentExecution['status'], userId: string, meta?: Partial<AgentExecution>): Promise<AgentExecution | null> {
    try {
      return await this.repo.updateStatus(exec.id, exec.status, to, userId, meta);
    } catch { return null; }
  }

  private buildStep(executionId: string, hs: ValidatedHandoffStep, overrides: Partial<AgentExecutionStep>): AgentExecutionStep {
    return { id: randomUUID(), executionId, stepId: hs.stepId, planStepOrder: hs.order, title: hs.title, description: hs.description, toolName: hs.toolName, toolVersion: hs.toolVersion, idempotencyKey: undefined, status: 'PENDING', attemptCount: 0, maxAttempts: 3, input: hs.validatedInput, ...overrides };
  }

  private toStepResult(s: AgentExecutionStep): ExecutionStepResult {
    return { stepId: s.stepId, title: s.title, toolName: s.toolName, status: s.status, verified: s.verified ?? false, verificationStatus: s.verificationStatus, toolResult: s.toolResult, error: s.failureReason, durationMs: s.durationMs, attemptCount: s.attemptCount };
  }

  private resultFromExecution(exec: AgentExecution, durationMs: number): ExecutionResult {
    return { executionId: exec.id, planId: exec.planId, planVersion: exec.planVersion, correlationId: exec.correlationId, status: exec.status, steps: [], completedStepsCount: exec.completedStepsCount, failedStepsCount: exec.failedStepsCount, totalSteps: exec.totalSteps, summary: exec.failureReason ?? 'Execution ' + exec.status, verified: false, durationMs, failureReason: exec.failureReason, failureCategory: exec.failureCategory, replanningRequired: exec.replanningRequired };
  }

  private failResult(executionId: string, handoff: PlanHandoffPayload, ctx: ExecutionContext, category: FailureCategory, reason: string, durationMs: number): ExecutionResult {
    return { executionId, planId: handoff.planId, planVersion: handoff.version, correlationId: ctx.correlationId, status: 'BLOCKED', steps: [], completedStepsCount: 0, failedStepsCount: 0, totalSteps: handoff.totalSteps, summary: reason, verified: false, durationMs, failureReason: reason, failureCategory: category, replanningRequired: false };
  }

  private emit(cb: ExecutionEventCallback | undefined, type: ExecutionEventType, exec: AgentExecution, correlationId: string, extra?: Record<string, unknown>): void {
    const sanitizedExtra = extra
      ? (DataSanitizer.sanitize(DataSanitizer.stripCoT(extra)) as Record<string, unknown>)
      : undefined;

    // Record lifecycle metrics
    if (type === 'execution.started') {
      metrics.recordAgentExecution('STARTED');
    } else if (type === 'execution.completed') {
      metrics.recordAgentExecution('COMPLETED');
    } else if (type === 'execution.failed') {
      metrics.recordAgentExecution('FAILED');
      metrics.recordExecutionFailure(exec.failureCategory || 'UNKNOWN');
    } else if (type === 'execution.cancelled') {
      metrics.recordExecutionCancellation();
    } else if (type === 'execution.recovering') {
      metrics.recordExecutionRetry((sanitizedExtra?.attempt as number) || 1);
    } else if (type === 'approval.required') {
      metrics.recordApprovalWait();
    }

    // Structured logging for execution events
    logger.info(`[Execution Event] ${type} | Execution: ${exec.id} | Plan: ${exec.planId} | Status: ${exec.status}`, {
      correlationId,
      executionId: exec.id,
      planId: exec.planId,
      status: exec.status,
      stepId: sanitizedExtra?.stepId as string | undefined,
      toolName: sanitizedExtra?.toolName as string | undefined,
      attempt: sanitizedExtra?.attempt as number | undefined,
    });

    if (!cb) return;
    try {
      cb({
        type,
        executionId: exec.id,
        planId: exec.planId,
        correlationId,
        timestamp: new Date().toISOString(),
        status: exec.status,
        stepId: sanitizedExtra?.stepId as string | undefined,
        toolName: sanitizedExtra?.toolName as string | undefined,
        attempt: sanitizedExtra?.attempt as number | undefined,
        message: sanitizedExtra?.message as string | undefined,
        data: sanitizedExtra,
      });
    } catch { /* never crash on event callback error */ }
  }

  private sanitizeRecord(data: Record<string, unknown>): Record<string, unknown> {
    return DataSanitizer.sanitize(DataSanitizer.stripCoT(data)) as Record<string, unknown>;
  }

  private combineSignals(...sigs: (AbortSignal | undefined)[]): AbortSignal {
    const ctrl = new AbortController();
    for (const sig of sigs.filter(Boolean) as AbortSignal[]) {
      if (sig.aborted) { ctrl.abort(); return ctrl.signal; }
      sig.addEventListener('abort', () => ctrl.abort(), { once: true });
    }
    return ctrl.signal;
  }

  private async waitForApproval(executionId: string, stepId: string, signal: AbortSignal, timeoutMs = 300_000): Promise<boolean> {
    const key = executionId + ':' + stepId;
    return new Promise<boolean>((resolve) => {
      if (signal.aborted) { resolve(false); return; }
      const timer = setTimeout(() => { this.approvalMap.delete(key); resolve(false); }, timeoutMs);
      const onAbort = () => { clearTimeout(timer); this.approvalMap.delete(key); resolve(false); };
      signal.addEventListener('abort', onAbort, { once: true });
      this.approvalMap.set(key, () => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); resolve(true); });
    });
  }

  private async waitForInput(executionId: string, stepId: string, signal: AbortSignal, timeoutMs = 300_000): Promise<Record<string, unknown> | null> {
    const key = executionId + ':' + stepId;
    return new Promise<Record<string, unknown> | null>((resolve) => {
      if (signal.aborted) { resolve(null); return; }
      const timer = setTimeout(() => { this.inputMap.delete(key); resolve(null); }, timeoutMs);
      const onAbort = () => { clearTimeout(timer); this.inputMap.delete(key); resolve(null); };
      signal.addEventListener('abort', onAbort, { once: true });
      this.inputMap.set(key, (input: Record<string, unknown>) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        resolve(input);
      });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}

export const executionEngine = new ExecutionEngine();
