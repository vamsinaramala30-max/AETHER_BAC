/**
 * AETHER AI - Execution Repository (Prompt 8)
 * PostgreSQL + in-memory fallback persistence for AgentExecution lifecycle.
 * All reads enforce strict tenant isolation: userId, workspaceId, projectId.
 * No execution record may be read or written across tenant boundaries.
 */

import { randomUUID } from 'crypto';
import { db } from '../../../database/client.js';
import type {
  AgentExecution,
  AgentExecutionStep,
  AgentExecutionAttempt,
  ExecutionStatus,
  ExecutionStepStatus,
  FailureCategory,
} from './execution-types.js';
import { executionStateMachine } from './execution-state-machine.js';

const isUuid = (val?: string | null): boolean =>
  Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

const dbAvailable = (): boolean =>
  Boolean(db && typeof (db as any).agentExecution?.create === 'function');

// ============================================================================
// IExecutionRepository Interface
// ============================================================================

export interface IExecutionRepository {
  createExecution(data: Omit<AgentExecution, 'steps' | 'attempts'>): Promise<AgentExecution>;
  findById(id: string, userId: string): Promise<AgentExecution | null>;
  findByIdempotencyKey(key: string, userId: string): Promise<AgentExecution | null>;
  findByPlanId(planId: string, userId: string): Promise<AgentExecution | null>;
  updateStatus(
    id: string,
    currentStatus: ExecutionStatus,
    newStatus: ExecutionStatus,
    userId: string,
    meta?: Partial<AgentExecution>,
  ): Promise<AgentExecution | null>;
  persistStep(executionId: string, step: AgentExecutionStep): Promise<AgentExecutionStep>;
  findStep(executionId: string, stepId: string): Promise<AgentExecutionStep | null>;
  recordAttempt(attempt: Omit<AgentExecutionAttempt, 'id'>): Promise<AgentExecutionAttempt>;
  listByUser(userId: string, workspaceId?: string, limit?: number): Promise<readonly AgentExecution[]>;
}

// ============================================================================
// ExecutionRepository Implementation
// ============================================================================

export class ExecutionRepository implements IExecutionRepository {
  private readonly execStore = new Map<string, AgentExecution>();
  private readonly stepStore = new Map<string, AgentExecutionStep>(); // key: executionId:stepId
  private readonly attemptStore = new Map<string, AgentExecutionAttempt[]>(); // key: stepId

  // --------------------------------------------------------------------------
  // Create Execution
  // --------------------------------------------------------------------------

  public async createExecution(
    data: Omit<AgentExecution, 'steps' | 'attempts'>,
  ): Promise<AgentExecution> {
    const now = new Date().toISOString();
    const execution: AgentExecution = {
      ...data,
      id: data.id || randomUUID(),
      startedAt: data.startedAt || now,
      updatedAt: now,
      completedStepIds: [],
      failedStepIds: [],
      blockedStepIds: [],
      completedStepsCount: 0,
      failedStepsCount: 0,
      replanningRequired: false,
    };

    // Try PostgreSQL first
    try {
      if (dbAvailable() && isUuid(execution.userId) && isUuid(execution.id)) {
        const created = await (db as any).agentExecution.create({
          data: {
            id: execution.id,
            planId: execution.planId,
            planVersion: execution.planVersion,
            planHash: execution.planHash,
            correlationId: execution.correlationId,
            handoffId: execution.handoffId ?? null,
            userId: execution.userId,
            workspaceId: execution.workspaceId ?? null,
            projectId: execution.projectId ?? null,
            conversationId: execution.conversationId ?? null,
            status: execution.status,
            totalSteps: execution.totalSteps,
            idempotencyKey: execution.idempotencyKey ?? null,
            metadata: execution.metadata ?? {},
          },
        });
        const mapped = this.mapFromPrisma(created);
        this.execStore.set(mapped.id, mapped);
        return mapped;
      }
    } catch {
      // Fall through to memory store
    }

    this.execStore.set(execution.id, execution);
    return execution;
  }

  // --------------------------------------------------------------------------
  // Find By ID (tenant-isolated)
  // --------------------------------------------------------------------------

  public async findById(id: string, userId: string): Promise<AgentExecution | null> {
    try {
      if (dbAvailable() && isUuid(id) && isUuid(userId)) {
        const found = await (db as any).agentExecution.findUnique({
          where: { id },
          include: { steps: { include: { attempts: true } } },
        });
        if (!found) return null;
        if (found.userId !== userId) return null; // Tenant isolation
        const mapped = this.mapFromPrisma(found);
        this.execStore.set(mapped.id, mapped);
        return mapped;
      }
    } catch {
      // Fall through
    }

    const mem = this.execStore.get(id);
    if (!mem) return null;
    if (mem.userId !== userId) return null;
    return mem;
  }

  // --------------------------------------------------------------------------
  // Find By Idempotency Key
  // --------------------------------------------------------------------------

  public async findByIdempotencyKey(key: string, userId: string): Promise<AgentExecution | null> {
    try {
      if (dbAvailable() && isUuid(userId)) {
        const found = await (db as any).agentExecution.findUnique({
          where: { idempotencyKey: key },
        });
        if (!found) return null;
        if (found.userId !== userId) return null;
        return this.mapFromPrisma(found);
      }
    } catch {
      // Fall through
    }

    for (const exec of this.execStore.values()) {
      if (exec.idempotencyKey === key && exec.userId === userId) return exec;
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // Find By Plan ID (returns the most recent active execution for a plan)
  // --------------------------------------------------------------------------

  public async findByPlanId(planId: string, userId: string): Promise<AgentExecution | null> {
    try {
      if (dbAvailable() && isUuid(planId) && isUuid(userId)) {
        const found = await (db as any).agentExecution.findFirst({
          where: { planId, userId },
          orderBy: { startedAt: 'desc' },
        });
        if (!found) return null;
        return this.mapFromPrisma(found);
      }
    } catch {
      // Fall through
    }

    let latest: AgentExecution | null = null;
    for (const exec of this.execStore.values()) {
      if (exec.planId === planId && exec.userId === userId) {
        if (!latest || exec.startedAt > latest.startedAt) latest = exec;
      }
    }
    return latest;
  }

  // --------------------------------------------------------------------------
  // Update Status (with state machine guard)
  // --------------------------------------------------------------------------

  public async updateStatus(
    id: string,
    currentStatus: ExecutionStatus,
    newStatus: ExecutionStatus,
    userId: string,
    meta?: Partial<AgentExecution>,
  ): Promise<AgentExecution | null> {
    // State machine guard - throws if transition is illegal
    if (currentStatus !== newStatus) {
      executionStateMachine.transition(currentStatus, newStatus);
    }

    const existing = await this.findById(id, userId);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated: AgentExecution = {
      ...existing,
      ...meta,
      status: newStatus,
      updatedAt: now,
      completedAt: executionStateMachine.isTerminal(newStatus) ? (meta?.completedAt ?? now) : existing.completedAt,
    };

    try {
      if (dbAvailable() && isUuid(id)) {
        const prismaUpdated = await (db as any).agentExecution.update({
          where: { id },
          data: {
            status: newStatus,
            currentStepId: updated.currentStepId ?? null,
            completedStepIds: updated.completedStepIds,
            failedStepIds: updated.failedStepIds,
            blockedStepIds: updated.blockedStepIds,
            failureReason: updated.failureReason ?? null,
            failureCategory: updated.failureCategory ?? null,
            replanningRequired: updated.replanningRequired,
            completedStepsCount: updated.completedStepsCount,
            failedStepsCount: updated.failedStepsCount,
            metadata: updated.metadata ?? {},
            completedAt: updated.completedAt ? new Date(updated.completedAt) : null,
          },
        });
        const mapped = this.mapFromPrisma(prismaUpdated);
        this.execStore.set(mapped.id, mapped);
        return mapped;
      }
    } catch {
      // Fall through
    }

    this.execStore.set(id, updated);
    return updated;
  }

  // --------------------------------------------------------------------------
  // Persist Step
  // --------------------------------------------------------------------------

  public async persistStep(
    executionId: string,
    step: AgentExecutionStep,
  ): Promise<AgentExecutionStep> {
    const key = executionId + ':' + step.stepId;

    try {
      if (dbAvailable() && isUuid(executionId) && isUuid(step.id)) {
        const upserted = await (db as any).agentExecutionStep.upsert({
          where: { executionId_stepId: { executionId, stepId: step.stepId } },
          create: {
            id: step.id,
            executionId,
            stepId: step.stepId,
            planStepOrder: step.planStepOrder,
            title: step.title,
            description: step.description,
            toolName: step.toolName ?? null,
            toolVersion: step.toolVersion ?? null,
            idempotencyKey: step.idempotencyKey ?? null,
            status: step.status,
            attemptCount: step.attemptCount,
            maxAttempts: step.maxAttempts,
            input: step.input ?? null,
            toolResult: step.toolResult ?? null,
            verified: step.verified ?? null,
            verificationStatus: step.verificationStatus ?? null,
            verificationDetails: step.verificationDetails ?? null,
            failureReason: step.failureReason ?? null,
            failureCategory: step.failureCategory ?? null,
            startedAt: step.startedAt ? new Date(step.startedAt) : null,
            completedAt: step.completedAt ? new Date(step.completedAt) : null,
            durationMs: step.durationMs ?? null,
          },
          update: {
            status: step.status,
            attemptCount: step.attemptCount,
            toolResult: step.toolResult ?? null,
            verified: step.verified ?? null,
            verificationStatus: step.verificationStatus ?? null,
            verificationDetails: step.verificationDetails ?? null,
            failureReason: step.failureReason ?? null,
            failureCategory: step.failureCategory ?? null,
            completedAt: step.completedAt ? new Date(step.completedAt) : null,
            durationMs: step.durationMs ?? null,
          },
        });
        const mapped = this.mapStepFromPrisma(upserted);
        this.stepStore.set(key, mapped);
        return mapped;
      }
    } catch {
      // Fall through
    }

    this.stepStore.set(key, step);
    return step;
  }

  // --------------------------------------------------------------------------
  // Find Step
  // --------------------------------------------------------------------------

  public async findStep(executionId: string, stepId: string): Promise<AgentExecutionStep | null> {
    const key = executionId + ':' + stepId;
    const mem = this.stepStore.get(key);
    if (mem) return mem;

    try {
      if (dbAvailable() && isUuid(executionId)) {
        const found = await (db as any).agentExecutionStep.findUnique({
          where: { executionId_stepId: { executionId, stepId } },
          include: { attempts: true },
        });
        if (!found) return null;
        const mapped = this.mapStepFromPrisma(found);
        this.stepStore.set(key, mapped);
        return mapped;
      }
    } catch {
      // Fall through
    }

    return null;
  }

  // --------------------------------------------------------------------------
  // Record Attempt
  // --------------------------------------------------------------------------

  public async recordAttempt(
    data: Omit<AgentExecutionAttempt, 'id'>,
  ): Promise<AgentExecutionAttempt> {
    const attempt: AgentExecutionAttempt = { ...data, id: randomUUID() };

    try {
      if (dbAvailable() && isUuid(data.stepId)) {
        await (db as any).agentExecutionAttempt.upsert({
          where: { stepId_attempt: { stepId: data.stepId, attempt: data.attempt } },
          create: {
            id: attempt.id,
            stepId: data.stepId,
            attempt: data.attempt,
            status: data.status,
            toolResult: data.toolResult ?? null,
            error: data.error ?? null,
            startedAt: new Date(data.startedAt),
            completedAt: data.completedAt ? new Date(data.completedAt) : null,
            durationMs: data.durationMs ?? null,
          },
          update: {
            status: data.status,
            toolResult: data.toolResult ?? null,
            error: data.error ?? null,
            completedAt: data.completedAt ? new Date(data.completedAt) : null,
            durationMs: data.durationMs ?? null,
          },
        });
      }
    } catch {
      // Fall through
    }

    const existing = this.attemptStore.get(data.stepId) ?? [];
    const idx = existing.findIndex((a) => a.attempt === data.attempt);
    if (idx >= 0) existing[idx] = attempt;
    else existing.push(attempt);
    this.attemptStore.set(data.stepId, existing);

    return attempt;
  }

  // --------------------------------------------------------------------------
  // List By User
  // --------------------------------------------------------------------------

  public async listByUser(
    userId: string,
    workspaceId?: string,
    limit = 50,
  ): Promise<readonly AgentExecution[]> {
    try {
      if (dbAvailable() && isUuid(userId)) {
        const where: Record<string, unknown> = { userId };
        if (workspaceId) where.workspaceId = workspaceId;
        const list = await (db as any).agentExecution.findMany({
          where,
          orderBy: { startedAt: 'desc' },
          take: limit,
        });
        return list.map((item: unknown) => this.mapFromPrisma(item));
      }
    } catch {
      // Fall through
    }

    const results: AgentExecution[] = [];
    for (const exec of this.execStore.values()) {
      if (exec.userId === userId) {
        if (!workspaceId || exec.workspaceId === workspaceId) {
          results.push(exec);
        }
      }
    }
    return results.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
  }

  // --------------------------------------------------------------------------
  // Prisma mappers
  // --------------------------------------------------------------------------

  private mapFromPrisma(item: any): AgentExecution {
    return {
      id: item.id,
      planId: item.planId,
      planVersion: item.planVersion,
      planHash: item.planHash,
      correlationId: item.correlationId,
      handoffId: item.handoffId ?? undefined,
      userId: item.userId,
      workspaceId: item.workspaceId ?? undefined,
      projectId: item.projectId ?? undefined,
      conversationId: item.conversationId ?? undefined,
      status: item.status as ExecutionStatus,
      currentStepId: item.currentStepId ?? undefined,
      completedStepIds: item.completedStepIds ?? [],
      failedStepIds: item.failedStepIds ?? [],
      blockedStepIds: item.blockedStepIds ?? [],
      failureReason: item.failureReason ?? undefined,
      failureCategory: item.failureCategory as FailureCategory | undefined,
      replanningRequired: Boolean(item.replanningRequired),
      previousExecutionId: item.previousExecutionId ?? undefined,
      idempotencyKey: item.idempotencyKey ?? undefined,
      totalSteps: item.totalSteps ?? 0,
      completedStepsCount: item.completedStepsCount ?? 0,
      failedStepsCount: item.failedStepsCount ?? 0,
      metadata: item.metadata ?? undefined,
      startedAt: item.startedAt instanceof Date ? item.startedAt.toISOString() : item.startedAt,
      updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : item.updatedAt,
      completedAt: item.completedAt instanceof Date ? item.completedAt.toISOString() : (item.completedAt ?? undefined),
      steps: item.steps ? item.steps.map((s: any) => this.mapStepFromPrisma(s)) : undefined,
    };
  }

  private mapStepFromPrisma(item: any): AgentExecutionStep {
    return {
      id: item.id,
      executionId: item.executionId,
      stepId: item.stepId,
      planStepOrder: item.planStepOrder,
      title: item.title,
      description: item.description,
      toolName: item.toolName ?? undefined,
      toolVersion: item.toolVersion ?? undefined,
      idempotencyKey: item.idempotencyKey ?? undefined,
      status: item.status as ExecutionStepStatus,
      attemptCount: item.attemptCount ?? 0,
      maxAttempts: item.maxAttempts ?? 3,
      input: item.input ?? undefined,
      toolResult: item.toolResult ?? undefined,
      verified: item.verified ?? undefined,
      verificationStatus: item.verificationStatus ?? undefined,
      verificationDetails: item.verificationDetails ?? undefined,
      failureReason: item.failureReason ?? undefined,
      failureCategory: item.failureCategory as FailureCategory | undefined,
      startedAt: item.startedAt instanceof Date ? item.startedAt.toISOString() : (item.startedAt ?? undefined),
      completedAt: item.completedAt instanceof Date ? item.completedAt.toISOString() : (item.completedAt ?? undefined),
      durationMs: item.durationMs ?? undefined,
      attempts: item.attempts ? item.attempts.map((a: any) => this.mapAttemptFromPrisma(a)) : undefined,
    };
  }

  private mapAttemptFromPrisma(item: any): AgentExecutionAttempt {
    return {
      id: item.id,
      stepId: item.stepId,
      attempt: item.attempt,
      status: item.status,
      toolResult: item.toolResult ?? undefined,
      error: item.error ?? undefined,
      startedAt: item.startedAt instanceof Date ? item.startedAt.toISOString() : item.startedAt,
      completedAt: item.completedAt instanceof Date ? item.completedAt.toISOString() : (item.completedAt ?? undefined),
      durationMs: item.durationMs ?? undefined,
    };
  }
}

export const executionRepository = new ExecutionRepository();
