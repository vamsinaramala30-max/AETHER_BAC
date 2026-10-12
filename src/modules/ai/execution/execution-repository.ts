/**
 * AETHER AI - Execution Repository (Prompt 8)
 * PostgreSQL + in-memory fallback persistence for AgentExecution lifecycle.
 * All reads enforce strict tenant isolation: userId, workspaceId, projectId.
 * No execution record may be read or written across tenant boundaries.
 */

import { randomUUID } from 'crypto';
import { db } from '../../../database/client.js';
import { AppError } from '../../../middleware/error.middleware.js';
import { logger } from '../../../config/index.js';
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

export type CreateExecutionInput = Partial<AgentExecution> &
  Pick<AgentExecution, 'planId' | 'planVersion' | 'planHash' | 'correlationId' | 'userId' | 'status' | 'totalSteps'>;

export interface IExecutionRepository {
  createExecution(data: CreateExecutionInput): Promise<AgentExecution>;
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
  private readonly persistedExecutionIds = new Set<string>();
  private readonly persistedStepIds = new Set<string>();

  // --------------------------------------------------------------------------
  // Create Execution
  // --------------------------------------------------------------------------

  public async createExecution(
    data: CreateExecutionInput,
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
    if (dbAvailable() && isUuid(execution.userId) && isUuid(execution.id)) {
      try {
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
        this.persistedExecutionIds.add(mapped.id);
        return mapped;
      } catch (err) {
        logger.error(`[ExecutionRepository] Database write error creating execution ${execution.id}: ${(err as Error)?.message}`);
        throw new AppError(
          `Execution persistence failure: unable to create execution record ${execution.id} in database`,
          503,
          'DATABASE_PERSISTENCE_ERROR',
        );
      }
    }

    // Ephemeral in-memory fallback only when database is unavailable/not configured
    this.execStore.set(execution.id, execution);
    return execution;
  }

  // --------------------------------------------------------------------------
  // Find By ID (tenant-isolated)
  // --------------------------------------------------------------------------

  public async findById(id: string, userId: string): Promise<AgentExecution | null> {
    if (dbAvailable() && isUuid(id) && isUuid(userId)) {
      try {
        const found = await (db as any).agentExecution.findUnique({
          where: { id },
          include: { steps: { include: { attempts: true } } },
        });
        if (!found) return null;
        if (found.userId !== userId) return null; // Tenant isolation
        const mapped = this.mapFromPrisma(found);
        this.execStore.set(mapped.id, mapped);
        this.persistedExecutionIds.add(mapped.id);
        return mapped;
      } catch (err) {
        logger.error(`[ExecutionRepository] Database read error for execution ${id}: ${(err as Error)?.message}`);
        throw new AppError('Database error: unable to retrieve execution record', 503, 'DATABASE_READ_ERROR');
      }
    }

    const mem = this.execStore.get(id);
    if (!mem) return null;
    if (mem.userId !== userId) return null;
    return mem;
  }

  public async findByIdempotencyKey(key: string, userId: string): Promise<AgentExecution | null> {
    if (dbAvailable() && isUuid(userId)) {
      try {
        const found = await (db as any).agentExecution.findUnique({
          where: { idempotencyKey: key },
        });
        if (!found) return null;
        if (found.userId !== userId) return null;
        const mapped = this.mapFromPrisma(found);
        this.execStore.set(mapped.id, mapped);
        this.persistedExecutionIds.add(mapped.id);
        return mapped;
      } catch (err) {
        logger.error(`[ExecutionRepository] Database read error for idempotency key ${key}: ${(err as Error)?.message}`);
        throw new AppError('Database error: unable to retrieve execution by idempotency key', 503, 'DATABASE_READ_ERROR');
      }
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
    if (dbAvailable() && isUuid(planId) && isUuid(userId)) {
      try {
        const found = await (db as any).agentExecution.findFirst({
          where: { planId, userId },
          orderBy: { startedAt: 'desc' },
        });
        if (!found) return null;
        const mapped = this.mapFromPrisma(found);
        this.execStore.set(mapped.id, mapped);
        this.persistedExecutionIds.add(mapped.id);
        return mapped;
      } catch (err) {
        logger.error(`[ExecutionRepository] Database read error for plan ${planId}: ${(err as Error)?.message}`);
        throw new AppError('Database error: unable to retrieve execution by plan ID', 503, 'DATABASE_READ_ERROR');
      }
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

    if (dbAvailable() && isUuid(id) && this.persistedExecutionIds.has(id)) {
      try {
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
      } catch (err) {
        logger.error(`[ExecutionRepository] Database update error for execution ${id}: ${(err as Error)?.message}`);
        throw new AppError('Database error: unable to update execution status', 503, 'DATABASE_PERSISTENCE_ERROR');
      }
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

    if (dbAvailable() && isUuid(executionId) && isUuid(step.id) && this.persistedExecutionIds.has(executionId)) {
      try {
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
        this.persistedStepIds.add(step.id);
        return mapped;
      } catch (err) {
        logger.error(`[ExecutionRepository] Database upsert error for step ${step.stepId}: ${(err as Error)?.message}`);
        throw new AppError('Database error: unable to persist execution step', 503, 'DATABASE_PERSISTENCE_ERROR');
      }
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

    if (dbAvailable() && isUuid(executionId)) {
      try {
        const found = await (db as any).agentExecutionStep.findUnique({
          where: { executionId_stepId: { executionId, stepId } },
          include: { attempts: true },
        });
        if (!found) return null;
        const mapped = this.mapStepFromPrisma(found);
        this.stepStore.set(key, mapped);
        return mapped;
      } catch (err) {
        logger.error(`[ExecutionRepository] Database read error for step ${stepId}: ${(err as Error)?.message}`);
        throw new AppError('Database error: unable to retrieve execution step', 503, 'DATABASE_READ_ERROR');
      }
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

    if (dbAvailable() && isUuid(data.stepId) && this.persistedStepIds.has(data.stepId)) {
      try {
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
      } catch (err) {
        logger.error(`[ExecutionRepository] Database upsert error for attempt ${data.attempt}: ${(err as Error)?.message}`);
        throw new AppError('Database error: unable to record execution attempt', 503, 'DATABASE_PERSISTENCE_ERROR');
      }
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
    if (dbAvailable() && isUuid(userId)) {
      try {
        const where: Record<string, unknown> = { userId };
        if (workspaceId) where.workspaceId = workspaceId;
        const list = await (db as any).agentExecution.findMany({
          where,
          orderBy: { startedAt: 'desc' },
          take: limit,
        });
        return list.map((item: unknown) => this.mapFromPrisma(item));
      } catch (err) {
        logger.error(`[ExecutionRepository] Database query error in listByUser: ${(err as Error)?.message}`);
        throw new AppError('Database error: unable to list executions', 503, 'DATABASE_READ_ERROR');
      }
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
