/**
 * AETHER AI — Rate Limiting Middleware
 * Per-user rate limiting guard to prevent resource exhaustion.
 */

export interface RateLimitStatus {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetMs: number;
}

export class RateLimiter {
  private readonly requests = new Map<string, number[]>();

  constructor(
    private readonly windowMs = 60_000,
    private readonly maxRequests = 60,
  ) {}

  public check(userId: string): RateLimitStatus {
    const now = Date.now();
    const timestamps = (this.requests.get(userId) ?? []).filter((ts) => now - ts < this.windowMs);

    if (timestamps.length >= this.maxRequests) {
      const oldest = timestamps[0]!;
      return {
        allowed: false,
        remaining: 0,
        resetMs: oldest + this.windowMs - now,
      };
    }

    timestamps.push(now);
    this.requests.set(userId, timestamps);

    return {
      allowed: true,
      remaining: this.maxRequests - timestamps.length,
      resetMs: this.windowMs,
    };
  }
}

export const rateLimiter = new RateLimiter();
