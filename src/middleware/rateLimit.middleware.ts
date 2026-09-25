import rateLimit from 'express-rate-limit';
import { Request } from 'express';
import {
  rateLimitConfig,
  strictRateLimitConfig,
  aiRateLimitConfig,
  uploadRateLimitConfig,
  automationRateLimitConfig,
  searchRateLimitConfig,
} from '../config';

/**
 * Key generator that uses authenticated user ID if available, falling back to IP.
 * This prevents multi-tenant collisions on shared IP gateways while ensuring strict per-user quotas.
 */
export const userAwareKeyGenerator = (req: Request): string => {
  const userId = (req as any).user?.id || (req as any).user?.userId;
  if (userId) return `user_${userId}`;
  return req.ip || req.socket.remoteAddress || 'anonymous_ip';
};

/**
 * Standard global rate limiter middleware.
 */
export const globalRateLimiter = rateLimit({
  ...rateLimitConfig,
  keyGenerator: userAwareKeyGenerator,
});

/**
 * Strict rate limiter middleware intended for authentication, password resets, and high-security endpoints.
 */
export const strictRateLimiter = rateLimit(strictRateLimitConfig);

/**
 * AI endpoint rate limiter (protects LLM and model inference CPU/GPU from abuse).
 */
export const aiRateLimiter = rateLimit({
  ...aiRateLimitConfig,
  keyGenerator: userAwareKeyGenerator,
});

/**
 * Upload endpoint rate limiter (protects disk storage and multipart parsing).
 */
export const uploadRateLimiter = rateLimit({
  ...uploadRateLimitConfig,
  keyGenerator: userAwareKeyGenerator,
});

/**
 * Automation execution and management rate limiter.
 */
export const automationRateLimiter = rateLimit({
  ...automationRateLimitConfig,
  keyGenerator: userAwareKeyGenerator,
});

/**
 * Search and RAG retrieval rate limiter.
 */
export const searchRateLimiter = rateLimit({
  ...searchRateLimitConfig,
  keyGenerator: userAwareKeyGenerator,
});

