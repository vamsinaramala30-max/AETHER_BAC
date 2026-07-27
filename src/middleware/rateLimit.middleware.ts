import rateLimit from 'express-rate-limit';
import { rateLimitConfig, strictRateLimitConfig } from '../config';

/**
 * Standard global rate limiter middleware.
 */
export const globalRateLimiter = rateLimit(rateLimitConfig);

/**
 * Strict rate limiter middleware intended for authentication, password resets, and high-security endpoints.
 */
export const strictRateLimiter = rateLimit(strictRateLimitConfig);
