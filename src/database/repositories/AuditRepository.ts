import { AuditLog, Prisma } from '@prisma/client';
import { PrismaService, TransactionClient } from '../prisma';

export class AuditRepository extends PrismaService {
  public async create(data: Prisma.AuditLogCreateInput, tx?: TransactionClient): Promise<AuditLog> {
    const client = tx || this.prisma;
    return client.auditLog.create({
      data,
    });
  }

  public async findByWorkspace(
    workspaceId: string,
    limit: number = 50,
    skip: number = 0
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.auditLog.count({ where: { workspaceId } }),
    ]);

    return { logs, total };
  }
}