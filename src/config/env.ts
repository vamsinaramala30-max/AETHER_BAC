import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('5001'),
  API_PREFIX: z.string().default('/api/v1'),
  APP_NAME: z.string().default('AETHER'),
  APP_URL: z.string().url().default('http://localhost:5001'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().optional(),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('0'),
  REDIS_URL: z.string().optional(),

  // Authentication & Security
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters long'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  BCRYPT_SALT_ROUNDS: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('12'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters long'),

  // OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),

  // Frontend URL for OAuth redirects
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  // Supabase
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default('aether-assets'),

  // AI Providers
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // Storage local/cloud
  STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
  UPLOAD_MAX_SIZE_MB: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('25'),

  // CORS & Security
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_WINDOW_MS: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('900000'), // 15 mins
  RATE_LIMIT_MAX_REQUESTS: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('100'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
});

type EnvConfig = z.infer<typeof envSchema>;

const parseEnv = (): EnvConfig => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Environment Variable Validation Error:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    throw new Error('Invalid environment variables provided.');
  }

  return result.data;
};

export const env: EnvConfig = parseEnv();
