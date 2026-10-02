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

  // AI Providers & Model Service
  AI_PRIMARY_PROVIDER: z.string().default('aether'),
  AI_FALLBACK_PROVIDER: z.string().default('none'),
  AETHER_MODEL_BASE_URL: z.string().default('http://localhost:5002'),
  AETHER_MODEL_URL: z.string().default('http://localhost:5002'),
  AETHER_MODEL_API_KEY: z.string().optional(),
  AETHER_MODEL_TIMEOUT_MS: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('60000'),
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

  // Observability & Telemetry (Prompt 9)
  PROMPTS_LOGGED: z.string().transform((v) => v === 'true').default('false'),
  OUTPUTS_LOGGED: z.string().transform((v) => v === 'true').default('false'),
  TRACE_SAMPLE_RATE: z.string().transform((v) => parseFloat(v)).default('1.0'),
});

type EnvConfig = z.infer<typeof envSchema>;

const parseEnv = (): EnvConfig => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errorDetails = result.error.errors.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
    }));
    console.error('❌ FATAL: Environment Variable Validation Error:');
    errorDetails.forEach((err) => {
      console.error(`   - ${err.field}: ${err.message}`);
    });
    throw new Error(
      `Invalid environment configuration. Missing or invalid variables: ${errorDetails.map((e) => e.field).join(', ')}`,
    );
  }

  // Production security checks
  if (result.data.NODE_ENV === 'production') {
    const insecureSecrets = [
      'aether-session-secret-change-in-production',
      'your-jwt-secret-key-at-least-32-chars',
      'your-jwt-refresh-secret-key',
      'super_secret_aether_jwt_key_change_me_in_production_32bytes',
      'super_secret_aether_refresh_jwt_key_change_me_in_production_32bytes',
    ];

    if (insecureSecrets.includes(result.data.JWT_SECRET)) {
      console.error('❌ FATAL: Insecure default JWT_SECRET detected in production environment.');
      throw new Error('Insecure JWT_SECRET detected in production. Production deployment halted.');
    }
    if (insecureSecrets.includes(result.data.JWT_REFRESH_SECRET)) {
      console.error('❌ FATAL: Insecure default JWT_REFRESH_SECRET detected in production environment.');
      throw new Error('Insecure JWT_REFRESH_SECRET detected in production. Production deployment halted.');
    }
    if (insecureSecrets.includes(result.data.SESSION_SECRET)) {
      console.error('❌ FATAL: Insecure default SESSION_SECRET detected in production environment.');
      throw new Error('Insecure SESSION_SECRET detected in production. Production deployment halted.');
    }
    if (result.data.JWT_SECRET === result.data.JWT_REFRESH_SECRET) {
      console.error('❌ FATAL: JWT_SECRET and JWT_REFRESH_SECRET must be distinct keys in production.');
      throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be distinct in production. Deployment halted.');
    }
    if (result.data.CORS_ORIGIN === '*' || result.data.CORS_ORIGIN.includes('*')) {
      console.error('❌ FATAL: Wildcard CORS_ORIGIN is not permitted in production with credentials.');
      throw new Error('Wildcard CORS_ORIGIN is forbidden in production. Provide explicit allowed origins.');
    }
    const modelUrl = result.data.AETHER_MODEL_URL || result.data.AETHER_MODEL_BASE_URL;
    const isLocalhostModel =
      modelUrl.includes('localhost') ||
      modelUrl.includes('127.0.0.1') ||
      modelUrl.includes(':5002');
    if (isLocalhostModel && !process.env['ALLOW_LOCAL_MODEL_IN_PROD']) {
      console.error(
        '❌ FATAL: Production AETHER_BAC cannot silently fall back to localhost / 127.0.0.1 / :5002 for AETHER_MODEL_URL.',
      );
      throw new Error(
        'AETHER_MODEL_URL must point to an authorized production cloud model endpoint in production. Silent fallback to localhost/5002 is forbidden.',
      );
    }
  }

  return result.data;
};

export const env: EnvConfig = parseEnv();
export const validateEnv = (): EnvConfig => parseEnv();
