import { env } from './env';

export interface DatabaseConfig {
  url: string;
  directUrl?: string;
  maxConnections: number;
  idleTimeoutMs: number;
  connectionTimeoutMs: number;
}

export const databaseConfig: DatabaseConfig = {
  url: env.DATABASE_URL,
  directUrl: env.DIRECT_URL,
  maxConnections: env.NODE_ENV === 'production' ? 20 : 5,
  idleTimeoutMs: 30000,
  connectionTimeoutMs: 5000,
};
