import { AuditLog, Prisma } from '@prisma/client';
import { PrismaService, TransactionClient } from '../prisma';

export class AuditRepository extends PrismaService {
  public async create(data: Prisma.AuditLogCreateInput, tx?: TransactionClient): Promise<AuditLog> {
    const client = tx || this.prisma;
    return client.auditLog.create({
      data,
    });
  }

  public async findPaginated(
    skip: number = 0,
    limit: number = 50
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.auditLog.count(),
    ]);

    return { logs, total };
  }
}