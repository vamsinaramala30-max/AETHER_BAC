import { Options } from 'express-rate-limit';
import { env } from './env';

export interface RateLimitConfigOptions extends Partial<Options> {
  windowMs: number;
  max: number;
}

export const rateLimitConfig: RateLimitConfigOptions = {
  windowMs: env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000,
  max: env.RATE_LIMIT_MAX_REQUESTS || 1000,
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

export const aiRateLimitConfig: RateLimitConfigOptions = {
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 AI requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many AI requests. Please slow down.',
    },
  },
};

export const uploadRateLimitConfig: RateLimitConfigOptions = {
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 file uploads per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Upload rate limit exceeded. Please wait a moment.',
    },
  },
};

export const automationRateLimitConfig: RateLimitConfigOptions = {
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 automation triggers per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Automation execution rate limit exceeded. Please wait a moment.',
    },
  },
};

export const searchRateLimitConfig: RateLimitConfigOptions = {
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 search queries per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Search rate limit exceeded. Please wait a moment.',
    },
  },
};

