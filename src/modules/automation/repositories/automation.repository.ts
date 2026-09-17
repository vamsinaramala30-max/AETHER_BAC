import { PrismaService } from '../../../database/prisma';
import { Prisma, AutomationStatus } from '@prisma/client';
import { CreateAutomationInput, UpdateAutomationInput } from '../automation.types';

export class AutomationRepository extends PrismaService {
  public async create(input: CreateAutomationInput) {
    const actionsJson = (input.actions || []) as unknown as Prisma.InputJsonValue;
    const conditionsJson = input.conditions
      ? (input.conditions as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull;

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
        conditions: conditionsJson,
        actions: actionsJson,
        schedule: input.schedule,
        isEnabled: input.isEnabled ?? true,
        status: AutomationStatus.ACTIVE,
      },
    });
  }

  public async findById(id: string) {
    return this.prisma.automation.findFirst({
      where: { id, deletedAt: null },
    });
  }

  public async findByWorkspaceId(workspaceId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    let [total, items] = await Promise.all([
      this.prisma.automation.count({
        where: { deletedAt: null },
      }),
      this.prisma.automation.findMany({
        where: { deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  public async findByUserId(userId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    let [total, items] = await Promise.all([
      this.prisma.automation.count({
        where: { deletedAt: null },
      }),
      this.prisma.automation.findMany({
        where: { deletedAt: null },
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
    if (input.conditions !== undefined) {
      updateData.conditions = input.conditions
        ? (input.conditions as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull;
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
        status: AutomationStatus.PAUSED,
      },
    });
  }
}
