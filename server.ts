import express, { Request, Response, NextFunction } from 'express';
import http from 'node:http';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import winston from 'winston';
import 'winston-daily-rotate-file';
import helmet from 'helmet';
import session from 'express-session';
import passport from 'passport';

// Load environment files before validation
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Strict environment configuration validation
import { validateEnv, env } from './src/config/env';
import { connectDatabase, disconnectDatabase } from './src/database/client';
import { cronScheduler } from './src/cron/scheduler';

// Validate required environment variables at launch
validateEnv();

const PORT = env.PORT || parseInt(process.env.PORT || '5001', 10);
const HOST = process.env.HOST || '0.0.0.0';
const LOG_DIR = path.join(process.cwd(), 'logs');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

export const logger = winston.createLogger({
  level: env.LOG_LEVEL || process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    new winston.transports.DailyRotateFile({
      filename: path.join(LOG_DIR, 'app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
    }),
    new winston.transports.DailyRotateFile({
      level: 'error',
      filename: path.join(LOG_DIR, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
    }),
  ],
});

export const auditLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: [
    new winston.transports.DailyRotateFile({
      filename: path.join(LOG_DIR, 'audit-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '90d',
    }),
  ],
});

const app: express.Express = express();

// ============================================================================
// Security & Parsing Middleware
// ============================================================================
app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: process.env.NODE_ENV === 'production',
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// CORS configuration
import { corsMiddleware } from './src/middleware/cors.middleware';
app.use(corsMiddleware);

app.use(express.json({ limit: `${env.UPLOAD_MAX_SIZE_MB || 25}mb` }));
app.use(express.urlencoded({ extended: true, limit: `${env.UPLOAD_MAX_SIZE_MB || 25}mb` }));

// ============================================================================
// Session Configuration (required by Passport)
// ============================================================================
app.use(
  session({
    secret: env.SESSION_SECRET || env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax',
    },
  }),
);

// ============================================================================
// Passport Initialization
// ============================================================================
import './src/auth/passport';
app.use(passport.initialize());
app.use(passport.session());

// ============================================================================
// Correlation & Distributed Tracing Middleware (Prompt 9)
// ============================================================================
import { correlationMiddleware } from './src/middleware/correlation.middleware';
import { healthController } from './src/modules/health/health.controller';
import { metrics } from './src/modules/ai/observability/metrics';

app.use(correlationMiddleware);

// ============================================================================
// Standard Health Check & Metrics Endpoints (Prompt 9)
// ============================================================================
app.get('/health/live', (req: Request, res: Response) => healthController.getLiveness(req, res));
app.get('/health/ready', (req: Request, res: Response) => healthController.getReadiness(req, res));
app.get('/health', (req: Request, res: Response) => healthController.checkHealth(req, res));

app.get('/metrics', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.status(200).send(metrics.toPrometheus());
});

// ============================================================================
// API Routes & Rate Limiting
// ============================================================================
import { apiRoutes } from './src/routes/index';
import { authModuleRoutes } from './src/modules/auth/auth.routes';
import { globalRateLimiter } from './src/middleware/rateLimit.middleware';

// Apply global rate limiter across all API routes
app.use('/api', globalRateLimiter);

// Mount module routes directly at /api/auth for OAuth
app.use('/api/auth', authModuleRoutes);

// Mount all other API routes under /api/v1 prefix
app.use('/api/v1', apiRoutes);

// Also mount auth at /api/v1/auth for backwards compatibility
app.use('/api/v1/auth', authModuleRoutes);

// ============================================================================
// 404 Handler & Canonical Error Handling Middleware
// ============================================================================
import { errorHandler } from './src/middleware/error.middleware';

// 404 handler (after all valid routes)
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found or module uninitialized' });
});

// Canonical error handler (maps exceptions to safe 17-class error taxonomy)
app.use(errorHandler);

// Global unhandled fallback error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled Exception in pipeline:', err);
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

// ============================================================================
// Server Initialization & Graceful Lifecycle
// ============================================================================
const server = http.createServer(app);
let isShuttingDown = false;

export const startServer = async (): Promise<http.Server> => {
  try {
    logger.info('Verifying authoritative PostgreSQL connectivity before startup...');
    await connectDatabase();
    logger.info('PostgreSQL connection verified.');

    return new Promise((resolve) => {
      server.listen(PORT, HOST, () => {
        logger.info(
          `AETHER Backend Server successfully initialized and running at http://${HOST}:${PORT}`,
        );
        logger.info(`API available at http://${HOST}:${PORT}/api/v1`);
        logger.info(`OAuth routes available at http://${HOST}:${PORT}/api/auth`);
        logger.info(`Health checks available at http://${HOST}:${PORT}/health, /health/live, /health/ready`);
        resolve(server);
      });
    });
  } catch (error) {
    logger.error('FATAL: Database connection failed during server startup. Aborting initialization.', error);
    process.exit(1);
  }
};

export const gracefulShutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.warn(`Received ${signal}. Starting graceful shutdown...`);

  const forceTimeout = setTimeout(() => {
    logger.error('Forced shutdown invoked due to timeout');
    process.exit(1);
  }, 10000);

  server.close(async () => {
    logger.info('HTTP server closed. Cleaning up background resources...');
    try {
      cronScheduler.stopAll();
      await disconnectDatabase();
      logger.info('All resources cleanly terminated.');
      clearTimeout(forceTimeout);
      process.exit(0);
    } catch (err) {
      logger.error('Error during resource cleanup:', err);
      clearTimeout(forceTimeout);
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled Rejection at Promise:', { reason });
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception thrown:', error);
  process.exit(1);
});

// Start listening if not running in a test harness
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app, server };
