import { CorsOptions } from 'cors';
import { env } from './env';

const allowedOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());

export const corsConfig: CorsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean | string) => void,
  ) => {
    // If no origin (e.g. mobile apps, curl, server-to-server) or wildcard configured, allow
    if (!origin || allowedOrigins.includes('*')) {
      callback(null, true);
      return;
    }

    // Allow local network IP addresses in development mode (for mobile device testing)
    const isLocalNetworkIp =
      process.env.NODE_ENV !== 'production' &&
      /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(
        origin,
      );

    if (
      allowedOrigins.includes(origin) ||
      isLocalNetworkIp ||
      allowedOrigins.some(
        (o) => o !== '*' && new RegExp(`^${o.replace(/\*/g, '.*')}$`).test(origin),
      )
    ) {
      callback(null, true);
    } else {
      // Return true if Vercel app or fallback domain matches, or log CORS rejection
      if (origin.endsWith('.vercel.app') || origin.includes('localhost')) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Workspace-ID', 'Accept'],
  exposedHeaders: ['Content-Range', 'X-Total-Count', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  maxAge: 86400, // 24 hours
};
