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

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const PORT = parseInt(process.env.PORT || '5001', 10);
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
  level: process.env.LOG_LEVEL || 'info',
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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================================================
// Session Configuration (required by Passport)
// ============================================================================
app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      process.env.JWT_SECRET ||
      'aether-session-secret-change-in-production',
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
// Error Handling Middleware
// ============================================================================
import { errorHandler } from './src/middleware/error.middleware';
app.use(errorHandler);

// 404 handler (after all routes)
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found or module uninitialized' });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled Exception:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ============================================================================
// Server Initialization
// ============================================================================
const server = http.createServer(app);

server.listen(PORT, HOST, () => {
  logger.info(
    `AETHER Backend Server successfully initialized and running at http://${HOST}:${PORT}`,
  );
  logger.info(`API available at http://${HOST}:${PORT}/api/v1`);
  logger.info(`OAuth routes available at http://${HOST}:${PORT}/api/auth`);
});

const gracefulShutdown = (signal: string) => {
  logger.warn(`Received ${signal}. Starting graceful shutdown...`);

  server.close(() => {
    logger.info('HTTP server closed. Cleaning up background resources...');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown invoked due to timeout');
    process.exit(1);
  }, 10000);
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

export { app, server };
