import { db } from '../../database/client';

export class AdminService {
  public async getSystemUsers(limit: number = 50, skip: number = 0) {
    const [users, total] = await Promise.all([
      db.user.findMany({ take: limit, skip, orderBy: { createdAt: 'desc' } }),
      db.user.count(),
    ]);

    const sanitized = users.map(({ passwordHash, ...u }) => ({ ...u }));
    return { users: sanitized, total };
  }

  public async getAuditLogs(limit: number = 50, skip: number = 0) {
    const [logs, total] = await Promise.all([
      db.auditLog.findMany({ take: limit, skip, orderBy: { createdAt: 'desc' } }),
      db.auditLog.count(),
    ]);
    return { logs, total };
  }

  public async getSystemMetrics() {
    return {
      memoryUsage: process.memoryUsage(),
      cpuUptime: process.uptime(),
      nodeVersion: process.version,
    };
  }
}