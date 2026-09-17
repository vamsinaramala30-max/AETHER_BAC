import { Router, Request, Response } from 'express';
import { db } from '../database/client';
import { redisConfig } from '../config/redis';
import { emailService } from '../modules/notification/email.service';
import { healthController } from '../modules/health/health.controller';
import Redis from 'ioredis';

const router = Router();

/**
 * Standard Prompt 9 Liveness Probe: GET /health/live
 */
router.get('/live', (req: Request, res: Response) => healthController.getLiveness(req, res));

/**
 * Standard Prompt 9 Readiness Probe: GET /health/ready
 */
router.get('/ready', (req: Request, res: Response) => healthController.getReadiness(req, res));

/**
 * Healthcheck endpoint for readiness and liveness probes
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const healthStatus = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: 'down',
      redis: 'down',
      email: 'down',
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
    // Redis optional fallback
  }

  const emailHealth = await emailService.checkHealth();
  if (emailHealth.configured) {
    healthStatus.services.email = 'up';
  } else {
    healthStatus.status = healthStatus.status === 'ok' ? 'degraded' : healthStatus.status;
  }

  const statusCode = healthStatus.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(healthStatus);
});

/**
 * GET /api/v1/health/email
 * Email provider diagnostic health check (never returns secrets)
 */
router.get('/email', async (_req: Request, res: Response): Promise<void> => {
  try {
    const emailHealth = await emailService.checkHealth();
    res.status(200).json({
      success: true,
      data: emailHealth,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to perform email health check',
    });
  }
});

/**
 * GET /api/v1/health/diagnostics
 * Safe system component diagnostics
 */
router.get('/diagnostics', async (_req: Request, res: Response): Promise<void> => {
  try {
    let dbStatus = false;
    try {
      await db.$queryRaw`SELECT 1`;
      dbStatus = true;
    } catch {
      dbStatus = false;
    }

    const emailHealth = await emailService.checkHealth();
    const googleClientId = Boolean(process.env.GOOGLE_CLIENT_ID?.trim());
    const googleClientSecret = Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim());
    const supabaseConfigured = Boolean(
      process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_ANON_KEY?.trim(),
    );

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      diagnostics: {
        database: {
          connected: dbStatus,
        },
        authentication: {
          jwtConfigured: Boolean(process.env.JWT_SECRET?.trim()),
          sessionConfigured: Boolean(process.env.SESSION_SECRET?.trim()),
        },
        googleOAuth: {
          configured: googleClientId && googleClientSecret,
          callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'Default Render URL',
        },
        email: emailHealth,
        storage: {
          configured: supabaseConfigured,
          bucket: process.env.SUPABASE_STORAGE_BUCKET || 'aether-uploads',
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to generate diagnostics report',
    });
  }
});

/**
 * GET /api/v1/health/liveness
 * Kubernetes / Infrastructure Liveness Probe
 */
router.get('/liveness', (_req: Request, res: Response): void => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * GET /api/v1/health/readiness
 * Kubernetes / Load Balancer Readiness Probe
 * Verifies DB, Redis, and AETHER_MODEL availability
 */
router.get('/readiness', async (_req: Request, res: Response): Promise<void> => {
  const readiness = {
    status: 'ready',
    timestamp: new Date().toISOString(),
    components: {
      database: 'down',
      redis: 'down',
      aetherModel: 'down',
    },
  };

  let isReady = true;

  // 1. Database Check
  try {
    await db.$queryRaw`SELECT 1`;
    readiness.components.database = 'up';
  } catch {
    readiness.components.database = 'down';
    isReady = false;
  }

  // 2. Redis Check
  try {
    const redisClient = new Redis(redisConfig.options);
    await redisClient.ping();
    readiness.components.redis = 'up';
    await redisClient.quit();
  } catch {
    readiness.components.redis = 'degraded'; // Non-critical
  }

  // 3. AETHER_MODEL Health Check
  try {
    const modelUrl = process.env['AETHER_MODEL_URL'] || 'http://localhost:5002';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(`${modelUrl}/health`, { signal: controller.signal });
    clearTimeout(timer);

    if (resp.ok) {
      const data = (await resp.json()) as any;
      if (
        data.loaded ||
        data.has_trained_weights ||
        data.status === 'READY' ||
        data.status === 'ok' ||
        data.status === 'available'
      ) {
        readiness.components.aetherModel = 'up';
      } else {
        readiness.components.aetherModel = 'unweighted';
      }
    } else {
      readiness.components.aetherModel = 'down';
      isReady = false;
    }
  } catch {
    readiness.components.aetherModel = 'down';
    isReady = false;
  }

  readiness.status = isReady ? 'ready' : 'not_ready';
  res.status(isReady ? 200 : 503).json(readiness);
});

export const healthRoutes: Router = router;
