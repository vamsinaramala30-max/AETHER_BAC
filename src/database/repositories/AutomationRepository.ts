import { Automation, Prisma } from '@prisma/client';
import { PrismaService, TransactionClient } from '../prisma';

export class AutomationRepository extends PrismaService {
  public async findById(id: string, tx?: TransactionClient): Promise<Automation | null> {
    const client = tx || this.prisma;
    return client.automation.findUnique({
      where: { id },
    });
  }

  public async findByWorkspaceId(workspaceId: string): Promise<Automation[]> {
    return this.prisma.automation.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  public async create(data: Prisma.AutomationCreateInput, tx?: TransactionClient): Promise<Automation> {
    const client = tx || this.prisma;
    return client.automation.create({
      data,
    });
  }

  public async update(id: string, data: Prisma.AutomationUpdateInput, tx?: TransactionClient): Promise<Automation> {
    const client = tx || this.prisma;
    return client.automation.update({
      where: { id },
      data,
    });
  }

  public async delete(id: string, tx?: TransactionClient): Promise<Automation> {
    const client = tx || this.prisma;
    return client.automation.delete({
      where: { id },
    });
  }
}