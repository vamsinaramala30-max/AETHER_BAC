import { PrismaService } from '../../database/prisma';
import { Prisma } from '@prisma/client';

export class AutomationRepository extends PrismaService {
  public async create(
    workspaceId: string,
    name: string,
    trigger: string,
    actions: Prisma.InputJsonValue,
  ) {
    return this.prisma.automation.create({
      data: { workspaceId, name, trigger, actions },
    });
  }

  public async findById(id: string) {
    return this.prisma.automation.findUnique({ where: { id } });
  }

  public async findByWorkspaceId(workspaceId: string) {
    return this.prisma.automation.findMany({ where: { workspaceId } });
  }

  public async update(
    id: string,
    data: { name?: string; isEnabled?: boolean; actions?: Prisma.InputJsonValue },
  ) {
    return this.prisma.automation.update({ where: { id }, data });
  }

  public async delete(id: string) {
    return this.prisma.automation.delete({ where: { id } });
  }
}
