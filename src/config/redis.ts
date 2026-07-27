import { RedisOptions } from 'ioredis';
import { env } from './env';

export interface ExtendedRedisConfig {
  options: RedisOptions;
  url?: string;
  keyPrefix: string;
}

export const redisConfig: ExtendedRedisConfig = {
  url: env.REDIS_URL,
  options: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    db: env.REDIS_DB,
    enableReadyCheck: true,
    maxRetriesPerRequest: null, // Required for BullMQ
    retryStrategy(times: number): number | null {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    reconnectOnError(err: Error): boolean {
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        return true;
      }
      return false;
    },
  },
  keyPrefix: 'aether:',
};
