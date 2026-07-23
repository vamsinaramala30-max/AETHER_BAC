import { Router, Request, Response } from 'express';
import { db } from '../database/client';
import { redisConfig } from '../config/redis';
import Redis from 'ioredis';

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Healthcheck endpoint for readiness and liveness probes
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: System components are fully operational
 *       503:
 *         description: One or more critical services are unhealthy
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const healthStatus = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: 'down',
      redis: 'down',
    },
  };

  try {
    await db.$queryRaw`SELECT 1`;
    healthStatus.services.database = 'up';
  } catch {
    healthStatus.status = 'degraded';
  }

  try {
    const redisClient = new Redis(redisConfig.options);
    await redisClient.ping();
    healthStatus.services.redis = 'up';
    await redisClient.quit();
  } catch {
    healthStatus.status = 'degraded';
  }

  const statusCode = healthStatus.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(healthStatus);
});

export const healthRoutes = router;