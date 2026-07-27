import { Options } from 'express-rate-limit';
import { env } from './env';

export interface RateLimitConfigOptions extends Partial<Options> {
  windowMs: number;
  max: number;
}

export const rateLimitConfig: RateLimitConfigOptions = {
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests from this IP, please try again later.',
    },
  },
};

export const strictRateLimitConfig: RateLimitConfigOptions = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // strict limit for auth routes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_AUTH_ATTEMPTS',
      message: 'Too many authentication attempts. Please try again after 15 minutes.',
    },
  },
};
