import { PrismaService } from '../../../database/prisma';
import { Prisma, AutomationStatus } from '@prisma/client';
import {
  CreateAutomationInput,
  UpdateAutomationInput,
  AutomationMetadata,
  AutomationDTO,
  CircuitBreakerState,
} from '../automation.types';
import { ScheduleManager } from '../scheduler/schedule-manager';

export class AutomationRepository extends PrismaService {
  /**
   * Creates a new automation with authoritative metadata, schedule, and timezone.
   */
  public async create(input: CreateAutomationInput) {
    const actionsJson = (input.actions || []) as unknown as Prisma.InputJsonValue;
    const timezone = ScheduleManager.normalizeTimezone(input.timezone);
    const triggerType = input.triggerType || ScheduleManager.detectTriggerType(input.schedule || input.trigger);

    // Calculate initial nextRunAt if schedule provided
    let nextRunAt: Date | null = null;
    if (input.schedule) {
      nextRunAt = ScheduleManager.calculateNextRun(input.schedule, timezone);
    }

    const metadata: AutomationMetadata = {
      timezone,
      triggerType,
      concurrencyPolicy: input.concurrencyPolicy || 'SKIP_IF_RUNNING',
      missedExecutionPolicy: input.missedExecutionPolicy || 'RUN_ONCE_IMMEDIATELY',
      safetyPolicy: {
        allowedTools: input.safetyPolicy?.allowedTools,
        maxToolCalls: input.safetyPolicy?.maxToolCalls || 20,
        executionTimeoutMs: input.safetyPolicy?.executionTimeoutMs || 60000,
        approvalRequirements: input.safetyPolicy?.approvalRequirements || ['HIGH_IMPACT', 'DESTRUCTIVE'],
      },
      retryPolicy: {
        maxRetries: input.retryPolicy?.maxRetries || 3,
        initialDelayMs: input.retryPolicy?.initialDelayMs || 500,
        maxDelayMs: input.retryPolicy?.maxDelayMs || 10000,
        backoffFactor: input.retryPolicy?.backoffFactor || 2,
        nonRetryableErrors: input.retryPolicy?.nonRetryableErrors || [
          'AUTHORIZATION_FAILED',
          'FORBIDDEN',
          'UNAUTHORIZED',
          'RESOURCE_NOT_FOUND',
          'VALIDATION_ERROR',
          'CONFIRMATION_REQUIRED',
        ],
      },
      circuitBreaker: {
        consecutiveFailures: 0,
        failureThreshold: 5,
        isBroken: false,
      },
      version: 1,
      nextRunAt: nextRunAt ? nextRunAt.toISOString() : null,
      lockedUntil: null,
      lockedBy: null,
    };

    // Merge conditions with automation metadata
    let conditionsData: Record<string, unknown> = { _meta: metadata };
    if (input.conditions && typeof input.conditions === 'object') {
      const inputCond = input.conditions as Record<string, any>;
      if (inputCond._meta) {
        conditionsData._meta = { ...metadata, ...inputCond._meta };
      }
      conditionsData = { ...conditionsData, rules: input.conditions };
    }

    let wsId = input.workspaceId;
    const isUuid = (id?: string) =>
      Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

    if (!isUuid(wsId)) {
      let ws = await this.prisma.workspace.findFirst();
      if (!ws) {
        ws = await this.prisma.workspace.create({
          data: { name: 'Default Workspace', slug: 'default-workspace' },
        });
      }
      wsId = ws.id;
    }

    let validUserId: string | undefined = undefined;
    if (isUuid(input.userId)) {
      let user = await this.prisma.user.findUnique({ where: { id: input.userId } });
      if (!user) {
        try {
          user = await this.prisma.user.create({
            data: {
              id: input.userId!,
              email: `user-${input.userId!.substring(0, 8)}@aether.local`,
              fullName: 'Automation User',
            },
          });
        } catch {
          // ignore
        }
      }
      validUserId = user ? user.id : undefined;
    }

    return this.prisma.automation.create({
      data: {
        workspaceId: wsId!,
        userId: validUserId,
        name: input.name,
        description: input.description,
        trigger: input.trigger,
        conditions: conditionsData as unknown as Prisma.InputJsonValue,
        actions: actionsJson,
        schedule: input.schedule,
        isEnabled: input.isEnabled ?? true,
        status: AutomationStatus.ACTIVE,
      },
    });
  }

  public async createAutomation(input: CreateAutomationInput) {
    return this.create(input);
  }

  public async findById(id: string) {
    return this.prisma.automation.findFirst({
      where: { id, deletedAt: null },
    });
  }

  public async findByWorkspaceId(workspaceId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    const where: Prisma.AutomationWhereInput = {
      workspaceId,
      deletedAt: null,
    };

    const [total, items] = await Promise.all([
      this.prisma.automation.count({ where }),
      this.prisma.automation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  public async findByUserId(userId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    const where: Prisma.AutomationWhereInput = {
      userId,
      deletedAt: null,
    };

    const [total, items] = await Promise.all([
      this.prisma.automation.count({ where }),
      this.prisma.automation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  public async findScheduledAutomations() {
    return this.prisma.automation.findMany({
      where: {
        deletedAt: null,
        isEnabled: true,
        status: AutomationStatus.ACTIVE,
        schedule: { not: null },
      },
    });
  }

  /**
   * Queries automations from PostgreSQL that are currently due for scheduled execution.
   */
  public async findDueAutomations(now: Date = new Date()) {
    const candidates = await this.prisma.automation.findMany({
      where: {
        deletedAt: null,
        isEnabled: true,
        status: AutomationStatus.ACTIVE,
        schedule: { not: null },
      },
    });

    const nowMs = now.getTime();
    const dueAutomations = [];

    for (const auto of candidates) {
      const cond = (auto.conditions as Record<string, any>) || {};
      const meta = cond._meta as AutomationMetadata | undefined;

      let nextRunMs: number | null = null;
      if (meta?.nextRunAt) {
        nextRunMs = new Date(meta.nextRunAt).getTime();
      } else if (auto.schedule) {
        const tz = meta?.timezone || 'UTC';
        const computed = ScheduleManager.calculateNextRun(auto.schedule, tz, auto.lastRunAt || auto.createdAt);
        if (computed) {
          nextRunMs = computed.getTime();
        }
      }

      if (nextRunMs !== null && nextRunMs <= nowMs) {
        dueAutomations.push(auto);
      }
    }

    return dueAutomations;
  }

  /**
   * Safe Atomic Job Claiming (Phase 5.7).
   * Attempts to claim an automation lease lock atomically using a database transaction.
   * Prevents duplicate executions across multiple backend workers.
   */
  public async claimAutomation(
    id: string,
    workerId: string,
    leaseDurationMs: number = 30000,
  ): Promise<boolean> {
    const now = new Date();
    const lockExpiry = new Date(now.getTime() + leaseDurationMs);

    return this.prisma.$transaction(async (tx) => {
      const auto = await tx.automation.findUnique({
        where: { id },
      });

      if (!auto || auto.deletedAt || !auto.isEnabled || auto.status !== AutomationStatus.ACTIVE) {
        return false;
      }

      const cond = (auto.conditions as Record<string, any>) || {};
      const meta = (cond._meta as AutomationMetadata) || {};

      // If already claimed and lease hasn't expired, reject claim
      if (meta.lockedUntil) {
        const currentLockTime = new Date(meta.lockedUntil).getTime();
        if (currentLockTime > now.getTime() && meta.lockedBy !== workerId) {
          return false;
        }
      }

      // Claim lease
      const updatedMeta: AutomationMetadata = {
        ...meta,
        lockedUntil: lockExpiry.toISOString(),
        lockedBy: workerId,
      };

      await tx.automation.update({
        where: { id },
        data: {
          conditions: {
            ...cond,
            _meta: updatedMeta,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return true;
    });
  }

  /**
   * Releases lease lock and atomically advances nextRunAt timestamp and execution stats.
   */
  public async releaseClaim(
    id: string,
    workerId: string,
    nextRunAt: Date | string | null,
    runStatus: AutomationStatus = AutomationStatus.ACTIVE,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const auto = await tx.automation.findUnique({ where: { id } });
      if (!auto) return null;

      const cond = (auto.conditions as Record<string, any>) || {};
      const meta = (cond._meta as AutomationMetadata) || {};

      const nextRunStr = nextRunAt
        ? typeof nextRunAt === 'string'
          ? nextRunAt
          : nextRunAt.toISOString()
        : null;

      const updatedMeta: AutomationMetadata = {
        ...meta,
        lockedUntil: null,
        lockedBy: null,
        nextRunAt: nextRunStr,
      };

      const finalStatus =
        !nextRunAt && meta.triggerType === 'ONE_TIME'
          ? AutomationStatus.COMPLETED
          : runStatus;

      return tx.automation.update({
        where: { id },
        data: {
          lastRunAt: new Date(),
          runCount: { increment: 1 },
          status: finalStatus,
          conditions: {
            ...cond,
            _meta: updatedMeta,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    });
  }

  /**
   * Advances the scheduled nextRunAt without changing other execution locks.
   */
  public async advanceNextRun(id: string, nextRunAt: Date | string | null) {
    const auto = await this.prisma.automation.findUnique({ where: { id } });
    if (!auto) return null;

    const cond = (auto.conditions as Record<string, any>) || {};
    const meta = (cond._meta as AutomationMetadata) || {};

    const nextRunStr = nextRunAt
      ? typeof nextRunAt === 'string'
        ? nextRunAt
        : nextRunAt.toISOString()
      : null;

    const updatedMeta: AutomationMetadata = {
      ...meta,
      nextRunAt: nextRunStr,
    };

    return this.prisma.automation.update({
      where: { id },
      data: {
        conditions: {
          ...cond,
          _meta: updatedMeta,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Updates circuit breaker failure counters. Auto-pauses automation if threshold exceeded.
   */
  public async updateCircuitBreaker(
    id: string,
    consecutiveFailures: number,
    isBroken: boolean,
  ) {
    const auto = await this.prisma.automation.findUnique({ where: { id } });
    if (!auto) return null;

    const cond = (auto.conditions as Record<string, any>) || {};
    const meta = (cond._meta as AutomationMetadata) || {};

    const updatedCb: CircuitBreakerState = {
      consecutiveFailures,
      failureThreshold: meta.circuitBreaker?.failureThreshold || 5,
      isBroken,
      autoPaused: isBroken,
      lastFailureAt: new Date().toISOString(),
      autoPausedAt: isBroken ? new Date().toISOString() : undefined,
    };

    const updatePayload: Prisma.AutomationUpdateInput = {
      conditions: {
        ...cond,
        _meta: {
          ...meta,
          circuitBreaker: updatedCb,
        },
      } as unknown as Prisma.InputJsonValue,
    };

    if (isBroken) {
      updatePayload.status = AutomationStatus.PAUSED;
      updatePayload.isEnabled = false;
    }

    return this.prisma.automation.update({
      where: { id },
      data: updatePayload,
    });
  }

  /**
   * Increments the automation version and snapshots configuration changes.
   */
  public async incrementVersion(id: string) {
    const auto = await this.prisma.automation.findUnique({ where: { id } });
    if (!auto) return 1;

    const cond = (auto.conditions as Record<string, any>) || {};
    const meta = (cond._meta as AutomationMetadata) || {};
    const newVersion = (meta.version || 1) + 1;

    await this.prisma.automation.update({
      where: { id },
      data: {
        conditions: {
          ...cond,
          _meta: {
            ...meta,
            version: newVersion,
          },
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return newVersion;
  }

  public async update(id: string, input: UpdateAutomationInput) {
    const updateData: Prisma.AutomationUpdateInput = {};

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.trigger !== undefined) updateData.trigger = input.trigger;
    if (input.schedule !== undefined) updateData.schedule = input.schedule;
    if (input.isEnabled !== undefined) updateData.isEnabled = input.isEnabled;
    if (input.status !== undefined) updateData.status = input.status as AutomationStatus;
    if (input.actions !== undefined) {
      updateData.actions = input.actions
        ? (input.actions as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull;
    }

    // Preserve metadata and increment version if actions or schedule changed
    const current = await this.findById(id);
    if (current) {
      const cond = (current.conditions as Record<string, any>) || {};
      const meta = (cond._meta as AutomationMetadata) || {};

      const shouldIncrement =
        input.actions !== undefined || input.schedule !== undefined;
      const newVersion = shouldIncrement ? (meta.version || 1) + 1 : (meta.version || 1);

      const timezone = input.timezone
        ? ScheduleManager.normalizeTimezone(input.timezone)
        : meta.timezone || 'UTC';

      let nextRunAt = meta.nextRunAt ? new Date(meta.nextRunAt) : null;
      if (input.schedule !== undefined || input.timezone !== undefined) {
        const sched = input.schedule !== undefined ? input.schedule : current.schedule;
        if (sched) {
          nextRunAt = ScheduleManager.calculateNextRun(sched, timezone);
        } else {
          nextRunAt = null;
        }
      }

      const updatedMeta: AutomationMetadata = {
        ...meta,
        version: newVersion,
        timezone,
        concurrencyPolicy: input.concurrencyPolicy || meta.concurrencyPolicy || 'SKIP_IF_RUNNING',
        missedExecutionPolicy: input.missedExecutionPolicy || meta.missedExecutionPolicy || 'RUN_ONCE_IMMEDIATELY',
        safetyPolicy: input.safetyPolicy || meta.safetyPolicy,
        retryPolicy: input.retryPolicy || meta.retryPolicy,
        nextRunAt: nextRunAt ? nextRunAt.toISOString() : null,
      };

      const mergedConditions = {
        ...cond,
        _meta: updatedMeta,
        ...(input.conditions !== undefined && input.conditions !== null
          ? { rules: input.conditions }
          : {}),
      };

      updateData.conditions = mergedConditions as unknown as Prisma.InputJsonValue;
    }

    return this.prisma.automation.update({
      where: { id },
      data: updateData,
    });
  }

  public async recordRun(id: string, runStatus: AutomationStatus = AutomationStatus.ACTIVE) {
    return this.prisma.automation.update({
      where: { id },
      data: {
        lastRunAt: new Date(),
        runCount: { increment: 1 },
        status: runStatus,
      },
    });
  }

  public async softDelete(id: string) {
    return this.prisma.automation.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isEnabled: false,
        status: AutomationStatus.CANCELLED,
      },
    });
  }
}
