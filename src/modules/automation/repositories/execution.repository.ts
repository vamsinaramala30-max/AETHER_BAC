import { PrismaService } from '../../../database/prisma';
import { Prisma, AutomationStatus } from '@prisma/client';
import { ExecutionStepResult, ExecutionSnapshot } from '../automation.types';

export class ExecutionRepository extends PrismaService {
  /**
   * Creates an execution record with authoritative snapshot and trigger data in PostgreSQL.
   */
  public async createExecution(
    automationIdOrData:
      | string
      | {
          automationId: string;
          workspaceId?: string;
          userId?: string | null;
          triggerData?: Record<string, unknown>;
          snapshot?: ExecutionSnapshot;
          status?: AutomationStatus;
          startedAt?: Date;
          completedAt?: Date;
        },
    workspaceId?: string,
    userId?: string | null,
    triggerData?: Record<string, unknown>,
    snapshot?: ExecutionSnapshot,
  ) {
    if (typeof automationIdOrData === 'object') {
      const d = automationIdOrData;
      let wsId = d.workspaceId;
      if (!wsId) {
        const auto = await this.prisma.automation.findUnique({
          where: { id: d.automationId },
          select: { workspaceId: true },
        });
        wsId = auto?.workspaceId || '00000000-0000-0000-0000-000000000000';
      }
      return this.prisma.automationExecution.create({
        data: {
          automationId: d.automationId,
          workspaceId: wsId,
          userId: d.userId || null,
          status: d.status || AutomationStatus.RUNNING,
          triggerData: (d.triggerData || {}) as Prisma.InputJsonValue,
          currentStep: 0,
          stepResults: [] as Prisma.InputJsonValue,
          startedAt: d.startedAt || new Date(),
          completedAt: d.completedAt || null,
        },
      });
    }

    const automationId = automationIdOrData;
    const combinedTriggerData = {
      ...(triggerData || {}),
      ...(snapshot ? { snapshot } : {}),
    };

    return this.prisma.automationExecution.create({
      data: {
        automationId,
        workspaceId: workspaceId || '00000000-0000-0000-0000-000000000000',
        userId: userId || null,
        status: AutomationStatus.RUNNING,
        triggerData: combinedTriggerData as Prisma.InputJsonValue,
        currentStep: 0,
        stepResults: [] as Prisma.InputJsonValue,
        startedAt: new Date(),
      },
    });
  }

  public async updateExecution(
    executionId: string,
    data: {
      status?: AutomationStatus;
      currentStep?: number;
      stepResults?: ExecutionStepResult[];
      result?: Record<string, unknown>;
      error?: Record<string, unknown> | string;
      retryCount?: number;
      completedAt?: Date | null;
    },
  ) {
    const updateData: Prisma.AutomationExecutionUpdateInput = {};

    if (data.status !== undefined) updateData.status = data.status;
    if (data.currentStep !== undefined) updateData.currentStep = data.currentStep;
    if (data.stepResults !== undefined) {
      updateData.stepResults = data.stepResults as unknown as Prisma.InputJsonValue;
    }
    if (data.result !== undefined) {
      updateData.result = data.result ? (data.result as Prisma.InputJsonValue) : Prisma.JsonNull;
    }
    if (data.error !== undefined) {
      updateData.error = data.error
        ? ((typeof data.error === 'string'
            ? { message: data.error }
            : data.error) as Prisma.InputJsonValue)
        : Prisma.JsonNull;
    }
    if (data.retryCount !== undefined) updateData.retryCount = data.retryCount;
    if (data.completedAt !== undefined) updateData.completedAt = data.completedAt;

    return this.prisma.automationExecution.update({
      where: { id: executionId },
      data: updateData,
    });
  }

  public async findById(executionId: string) {
    return this.prisma.automationExecution.findUnique({
      where: { id: executionId },
      include: {
        automation: true,
      },
    });
  }

  public async findByAutomationId(automationId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [total, items] = await Promise.all([
      this.prisma.automationExecution.count({ where: { automationId } }),
      this.prisma.automationExecution.findMany({
        where: { automationId },
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  /**
   * Finds currently running executions for a specific automation (Concurrency Policy).
   */
  public async findActiveExecutions(automationId: string) {
    return this.prisma.automationExecution.findMany({
      where: {
        automationId,
        status: AutomationStatus.RUNNING,
      },
    });
  }

  /**
   * Stuck Execution Recovery (Phase 5.34).
   * Finds executions that have been RUNNING for longer than the timeout threshold.
   */
  public async findStuckExecutions(timeoutThresholdMs: number = 300_000) {
    const thresholdDate = new Date(Date.now() - timeoutThresholdMs);
    return this.prisma.automationExecution.findMany({
      where: {
        status: AutomationStatus.RUNNING,
        startedAt: { lte: thresholdDate },
      },
      include: {
        automation: true,
      },
    });
  }

  /**
   * Duplicate Occurrence Protection (Phase 5.8).
   * Verifies if an execution with the given occurrence/execution key already exists.
   */
  public async findByExecutionKey(automationId: string, executionKey: string) {
    const candidates = await this.prisma.automationExecution.findMany({
      where: {
        automationId,
      },
      take: 50,
      orderBy: { startedAt: 'desc' },
    });

    for (const exec of candidates) {
      const td = (exec.triggerData as Record<string, any>) || {};
      if (
        td.executionKey === executionKey ||
        td.idempotencyKey === executionKey ||
        td.scheduledOccurrence === executionKey
      ) {
        return exec;
      }
    }

    return null;
  }

  public async findPendingApprovals(workspaceId?: string, userId?: string) {
    const where: Prisma.AutomationExecutionWhereInput = {
      status: AutomationStatus.NEEDS_APPROVAL,
    };
    if (workspaceId) where.workspaceId = workspaceId;
    if (userId) where.userId = userId;

    return this.prisma.automationExecution.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      include: {
        automation: true,
      },
    });
  }
}
