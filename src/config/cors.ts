import { CorsOptions } from 'cors';
import { env } from './env';

const allowedOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

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

    const isProduction = process.env.NODE_ENV === 'production';

    // In production, strictly reject wildcard origins when credentials are enabled
    if (isProduction) {
      const isAllowed = allowedOrigins.some(
        (o) => o !== '*' && (o === origin || new RegExp(`^${o.replace(/\*/g, '.*')}$`).test(origin)),
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
        origin,
      );

    const isLocalhost =
      origin.startsWith('http://localhost') ||
      origin.startsWith('http://127.0.0.1');

    if (
      allowedOrigins.includes(origin) ||
      isLocalhost ||
      isLocalNetworkIp ||
      allowedOrigins.some(
        (o) => o !== '*' && new RegExp(`^${o.replace(/\*/g, '.*')}$`).test(origin),
      )
    ) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Workspace-ID',
    'x-workspace-id',
    'Accept',
    'X-Correlation-ID',
    'x-correlation-id',
    'traceparent',
    'tracestate',
    'Idempotency-Key',
    'idempotency-key',
    'X-Session-ID',
    'x-session-id',
    'X-User-ID',
    'x-user-id',
  ],
  exposedHeaders: [
    'Content-Range',
    'X-Total-Count',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-Correlation-ID',
    'x-correlation-id',
    'traceparent',
  ],
  maxAge: 86400, // 24 hours
};
