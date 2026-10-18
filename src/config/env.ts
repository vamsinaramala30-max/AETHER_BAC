import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

/**
 * Environment configuration
 *
 * Existing deployment environment variables take precedence over
 * values loaded from local .env files.
 *
 * dotenv does not override existing process.env values by default.
 */
dotenv.config({
  path: path.resolve(process.cwd(), '.env.local'),
});

dotenv.config({
  path: path.resolve(process.cwd(), '.env'),
});

/**
 * Parse integer environment variables safely.
 */
const integerFromEnv = (defaultValue: number, minimum = 0) =>
  z
    .string()
    .default(String(defaultValue))
    .transform((value, context) => {
      const parsed = Number(value);

      if (!Number.isSafeInteger(parsed) || parsed < minimum) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Must be an integer greater than or equal to ${minimum}`,
        });

        return z.NEVER;
      }

      return parsed;
    });

/**
 * Parse floating-point environment variables safely.
 */
const numberFromEnv = (defaultValue: number, minimum = 0, maximum = 1) =>
  z
    .string()
    .default(String(defaultValue))
    .transform((value, context) => {
      const parsed = Number(value);

      if (
        !Number.isFinite(parsed) ||
        parsed < minimum ||
        parsed > maximum
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Must be a number between ${minimum} and ${maximum}`,
        });

        return z.NEVER;
      }

      return parsed;
    });

/**
 * Environment schema.
 *
 * Existing environment-variable names are preserved.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  PORT: integerFromEnv(5001, 1),

  API_PREFIX: z.string().default('/api/v1'),

  APP_NAME: z.string().default('AETHER'),

  APP_URL: z
    .string()
    .url()
    .default('http://localhost:5001'),

  // Database
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required'),

  DIRECT_URL: z.string().optional(),

  // Redis
  REDIS_HOST: z.string().default('localhost'),

  REDIS_PORT: integerFromEnv(6379, 1),

  REDIS_PASSWORD: z.string().optional(),

  REDIS_DB: integerFromEnv(0, 0),

  REDIS_URL: z.string().optional(),

  // Authentication and security
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters long'),

  JWT_EXPIRES_IN: z.string().default('7d'),

  JWT_REFRESH_SECRET: z
    .string()
    .min(
      32,
      'JWT_REFRESH_SECRET must be at least 32 characters long',
    ),

  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  BCRYPT_SALT_ROUNDS: integerFromEnv(12, 10),

  SESSION_SECRET: z
    .string()
    .min(
      32,
      'SESSION_SECRET must be at least 32 characters long',
    ),

  // OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),

  GOOGLE_CLIENT_SECRET: z.string().optional(),

  GOOGLE_CALLBACK_URL: z.string().url().optional(),

  // Frontend URL
  FRONTEND_URL: z
    .string()
    .url()
    .default('http://localhost:5173'),

  // Supabase
  SUPABASE_URL: z.string().url().optional(),

  SUPABASE_ANON_KEY: z.string().optional(),

  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  SUPABASE_STORAGE_BUCKET: z
    .string()
    .default('aether-assets'),

  // AI providers and model service
  AI_PRIMARY_PROVIDER: z.string().default('aether'),

  AI_FALLBACK_PROVIDER: z.string().default('none'),

  AETHER_MODEL_BASE_URL: z
    .string()
    .url()
    .default('http://localhost:5002'),

  AETHER_MODEL_URL: z
    .string()
    .url()
    .default('http://localhost:5002'),

  AETHER_MODEL_API_KEY: z.string().optional(),

  AETHER_MODEL_TIMEOUT_MS: integerFromEnv(60000, 1),

  GEMINI_API_KEY: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),

  // Storage
  STORAGE_DRIVER: z
    .enum(['local', 'supabase'])
    .default('local'),

  UPLOAD_MAX_SIZE_MB: integerFromEnv(25, 1),

  // CORS and rate limiting
  CORS_ORIGIN: z.string().default('*'),

  RATE_LIMIT_WINDOW_MS: integerFromEnv(900000, 1),

  RATE_LIMIT_MAX_REQUESTS: integerFromEnv(100, 1),

  // Logging
  LOG_LEVEL: z
    .enum([
      'error',
      'warn',
      'info',
      'http',
      'verbose',
      'debug',
      'silly',
    ])
    .default('info'),

  // Observability
  PROMPTS_LOGGED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  OUTPUTS_LOGGED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  TRACE_SAMPLE_RATE: numberFromEnv(1, 0, 1),

  ALLOW_LOCAL_MODEL_IN_PROD: z
    .enum(['true', 'false', '1', '0'])
    .default('false')
    .transform((value) => value === 'true' || value === '1'),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Insecure development/example secrets that must never be used
 * in production.
 */
const insecureProductionSecrets = new Set([
  'aether-session-secret-change-in-production',
  'your-jwt-secret-key-at-least-32-chars',
  'your-jwt-refresh-secret-key',
  'your-session-secret-key',
  'super_secret_aether_jwt_key_change_me_in_production_32bytes',
  'super_secret_aether_refresh_jwt_key_change_me_in_production_32bytes',
  'super_secret_aether_session_key_change_me_32bytes',
  'replace_with_cryptographically_secure_jwt_secret_32bytes_min',
  'replace_with_distinct_refresh_jwt_secret_32bytes_min',
  'replace_with_distinct_session_cookie_secret_32bytes_min',
]);

/**
 * Safe production security validation.
 *
 * Never logs actual secret values.
 */
const validateProductionSecurity = (config: EnvConfig): void => {
  if (config.NODE_ENV !== 'production') {
    return;
  }

  const {
    SESSION_SECRET,
    JWT_SECRET,
    JWT_REFRESH_SECRET,
  } = config;

  const secretEntries = [
    ['SESSION_SECRET', SESSION_SECRET],
    ['JWT_SECRET', JWT_SECRET],
    ['JWT_REFRESH_SECRET', JWT_REFRESH_SECRET],
  ] as const;

  for (const [name, value] of secretEntries) {
    if (insecureProductionSecrets.has(value)) {
      throw new Error(
        `Insecure default ${name} detected in production.`,
      );
    }
  }

  /**
   * Compare all three pairs.
   *
   * This diagnostic identifies the conflicting variable names
   * without disclosing the actual secret values.
   */
  const secretPairs: Array<[string, string, string, string]> = [
    [
      'SESSION_SECRET',
      SESSION_SECRET,
      'JWT_SECRET',
      JWT_SECRET,
    ],
    [
      'SESSION_SECRET',
      SESSION_SECRET,
      'JWT_REFRESH_SECRET',
      JWT_REFRESH_SECRET,
    ],
    [
      'JWT_SECRET',
      JWT_SECRET,
      'JWT_REFRESH_SECRET',
      JWT_REFRESH_SECRET,
    ],
  ];

  for (const [firstName, firstValue, secondName, secondValue] of secretPairs) {
    if (firstValue === secondValue) {
      throw new Error(
        `Production security validation failed: ${firstName} and ${secondName} must contain different values.`,
      );
    }
  }

  /**
   * Production CORS must not allow every origin.
   */
  const allowedOrigins = config.CORS_ORIGIN
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (
    allowedOrigins.length === 0 ||
    allowedOrigins.some((origin) => origin === '*')
  ) {
    throw new Error(
      'Wildcard or empty CORS_ORIGIN is not permitted in production. Configure explicit frontend origins.',
    );
  }

  /**
   * Prevent accidental use of the default local model endpoint
   * in production unless explicitly permitted.
   */
  const modelUrl = config.AETHER_MODEL_URL;

  let parsedModelUrl: URL;

  try {
    parsedModelUrl = new URL(modelUrl);
  } catch {
    throw new Error(
      'AETHER_MODEL_URL must be a valid URL.',
    );
  }

  const hostname = parsedModelUrl.hostname.toLowerCase();

  const isLocalhostModel =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    parsedModelUrl.port === '5002';

  if (
    isLocalhostModel &&
    !config.ALLOW_LOCAL_MODEL_IN_PROD
  ) {
    throw new Error(
      'AETHER_MODEL_URL points to a local endpoint in production. Configure a production model endpoint or explicitly enable ALLOW_LOCAL_MODEL_IN_PROD for an authorized on-premises deployment.',
    );
  }
};

/**
 * Parse and validate all environment variables.
 */
const parseEnv = (): EnvConfig => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errorDetails = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    console.error(
      'Environment variable validation failed:',
      JSON.stringify(errorDetails, null, 2),
    );

    throw new Error(
      `Invalid environment configuration. Check these variables: ${errorDetails
        .map((error) => error.field)
        .join(', ')}`,
    );
  }

  validateProductionSecurity(result.data);

  return result.data;
};

/**
 * Validate configuration when this module is imported.
 */
export const env: EnvConfig = parseEnv();

/**
 * Allow explicit revalidation where required by existing code.
 */
export const validateEnv = (): EnvConfig => parseEnv();