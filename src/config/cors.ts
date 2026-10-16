import { CorsOptions } from 'cors';
import { env } from './env';

const configuredOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const frontendOrigin = env.FRONTEND_URL ? env.FRONTEND_URL.trim().replace(/\/+$/, '') : null;
const allowedOrigins = Array.from(
  new Set([...configuredOrigins, ...(frontendOrigin ? [frontendOrigin] : [])]),
);

export const corsConfig: CorsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean | string) => void,
  ) => {
    // If no origin (e.g. mobile apps, curl, server-to-server), allow
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = origin.replace(/\/+$/, '');
    const isProduction = process.env.NODE_ENV === 'production';

    // In production, strictly reject wildcard origins when credentials are enabled
    if (isProduction) {
      // Must not allow wildcards (*, *.vercel.app, etc.) with credentials: true
      const isAllowed = allowedOrigins.some(
        (o) => o && !o.includes('*') && o === normalizedOrigin,
      );

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(null, false);
      }
      return;
    }

    // In development / test mode:
    if (allowedOrigins.includes('*')) {
      callback(null, true);
      return;
    }

    const isLocalNetworkIp =
      /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(
        normalizedOrigin,
      );

    const isLocalhost =
      normalizedOrigin.startsWith('http://localhost') ||
      normalizedOrigin.startsWith('http://127.0.0.1');

    if (
      allowedOrigins.includes(normalizedOrigin) ||
      isLocalhost ||
      isLocalNetworkIp ||
      allowedOrigins.some(
        (o) => o !== '*' && new RegExp(`^${o.replace(/\*/g, '.*')}$`).test(normalizedOrigin),
      )
    ) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'content-type',
    'Authorization',
    'authorization',
    'Accept',
    'accept',
    'Origin',
    'origin',
    'X-Requested-With',
    'x-requested-with',
    'X-Folder-ID',
    'x-folder-id',
    'X-Project-ID',
    'x-project-id',
    'X-Workspace-ID',
    'x-workspace-id',
    'X-User-ID',
    'x-user-id',
    'X-Correlation-ID',
    'x-correlation-id',
    'X-Request-ID',
    'x-request-id',
    'X-Session-ID',
    'x-session-id',
    'traceparent',
    'tracestate',
    'Idempotency-Key',
    'idempotency-key',
    'Content-Disposition',
    'content-disposition',
  ],
  exposedHeaders: [
    'Content-Range',
    'content-range',
    'X-Total-Count',
    'x-total-count',
    'X-RateLimit-Limit',
    'x-ratelimit-limit',
    'X-RateLimit-Remaining',
    'x-ratelimit-remaining',
    'X-Correlation-ID',
    'x-correlation-id',
    'X-Request-ID',
    'x-request-id',
    'traceparent',
    'Content-Disposition',
    'content-disposition',
  ],
  maxAge: 86400, // 24 hours
};
