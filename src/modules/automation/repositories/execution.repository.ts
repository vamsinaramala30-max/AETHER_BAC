import { PrismaService } from '../../../database/prisma';
import { Prisma, AutomationStatus } from '@prisma/client';
import { ExecutionStepResult } from '../automation.types';

export class ExecutionRepository extends PrismaService {
  public async createExecution(
    automationId: string,
    workspaceId: string,
    userId?: string | null,
    triggerData?: Record<string, unknown>,
  ) {
    return this.prisma.automationExecution.create({
      data: {
        automationId,
        workspaceId,
        userId: userId || null,
        status: AutomationStatus.RUNNING,
        triggerData: triggerData ? (triggerData as Prisma.InputJsonValue) : Prisma.JsonNull,
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
        ? (typeof data.error === 'string' ? { message: data.error } : data.error) as Prisma.InputJsonValue
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
