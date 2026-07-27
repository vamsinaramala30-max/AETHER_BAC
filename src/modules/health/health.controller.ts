import { Request, Response } from 'express';
import { db } from '../../database/client';

export class HealthController {
  public async checkHealth(_req: Request, res: Response): Promise<void> {
    let dbStatus = 'down';
    try {
      await db.$queryRaw`SELECT 1`;
      dbStatus = 'up';
    } catch {
      dbStatus = 'down';
    }

    const isHealthy = dbStatus === 'up';

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: dbStatus,
      },
    });
  }
}

export const healthController = new HealthController();
