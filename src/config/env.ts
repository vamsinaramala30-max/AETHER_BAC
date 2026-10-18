
    import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

/**
 * Environment loading
 *
 * Existing process.env values take precedence over .env files.
 * This is important for Render and other production environments.
 */
dotenv.config({
  path: path.resolve(process.cwd(), '.env.local'),
});

dotenv.config({
  path: path.resolve(process.cwd(), '.env'),
});

/**
 * Environment schema
 *
 * All environment-variable names from the original file are preserved.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  PORT: z
    .string()
    .transform((value, context) => {
      const parsed = Number(value);

      if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65535) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'PORT must be an integer between 1 and 65535',
        });

        return z.NEVER;
      }

      return parsed;
    })
    .default('5001'),

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

  REDIS_PORT: z
    .string()
    .transform((value, context) => {
      const parsed = Number(value);

      if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65535) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'REDIS_PORT must be between 1 and 65535',
        });

        return z.NEVER;
      }

      return parsed;
    })
    .default('6379'),

  REDIS_PASSWORD: z.string().optional(),

  REDIS_DB: z
    .string()
    .transform((value, context) => {
      const parsed = Number(value);

      if (!Number.isSafeInteger(parsed) || parsed < 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'REDIS_DB must be a non-negative integer',
        });

        return z.NEVER;
      }

      return parsed;
    })
    .default('0'),

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

  BCRYPT_SALT_ROUNDS: z
    .string()
    .transform((value, context) => {
      const parsed = Number(value);

      if (!Number.isSafeInteger(parsed) || parsed < 10 || parsed > 31) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'BCRYPT_SALT_ROUNDS must be an integer between 10 and 31',
        });

        return z.NEVER;
      }

      return parsed;
    })
    .default('12'),

  SESSION_SECRET: z
    .string()
    .min(
      32,
      'SESSION_SECRET must be at least 32 characters long',
    ),

  // OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),

  GOOGLE_CLIENT_SECRET: z.string().optional(),

  GOOGLE_CALLBACK_URL: z
    .string()
    .url()
    .optional(),

  // Frontend URL
  FRONTEND_URL: z
    .string()
    .url()
    .default('http://localhost:5173'),

  // Supabase
  SUPABASE_URL: z
    .string()
    .url()
    .optional(),

  SUPABASE_ANON_KEY: z.string().optional(),

  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  SUPABASE_STORAGE_BUCKET: z
    .string()
    .default('aether-assets'),

  // AI providers and model service
  AI_PRIMARY_PROVIDER: z
    .string()
    .default('aether'),

  AI_FALLBACK_PROVIDER: z
    .string()
    .default('none'),

  AETHER_MODEL_BASE_URL: z
    .string()
    .url()
    .default('http://localhost:5002'),

  AETHER_MODEL_URL: z
    .string()
    .url()
    .default('http://localhost:5002'),

  AETHER_MODEL_API_KEY: z.string().optional(),

  AETHER_MODEL_TIMEOUT_MS: z
    .string()
    .transform((value, context) => {
      const parsed = Number(value);

      if (!Number.isSafeInteger(parsed) || parsed < 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'AETHER_MODEL_TIMEOUT_MS must be a positive integer',
        });

        return z.NEVER;
      }

      return parsed;
    })
    .default('60000'),

  GEMINI_API_KEY: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),

  // Storage
  STORAGE_DRIVER: z
    .enum(['local', 'supabase'])
    .default('local'),

  UPLOAD_MAX_SIZE_MB: z
    .string()
    .transform((value, context) => {
      const parsed = Number(value);

      if (!Number.isSafeInteger(parsed) || parsed < 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'UPLOAD_MAX_SIZE_MB must be a positive integer',
        });

        return z.NEVER;
      }

      return parsed;
    })
    .default('25'),

  // CORS and security
  CORS_ORIGIN: z.string().default('*'),

  RATE_LIMIT_WINDOW_MS: z
    .string()
    .transform((value, context) => {
      const parsed = Number(value);

      if (!Number.isSafeInteger(parsed) || parsed < 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'RATE_LIMIT_WINDOW_MS must be a positive integer',
        });

        return z.NEVER;
      }

      return parsed;
    })
    .default('900000'),

  RATE_LIMIT_MAX_REQUESTS: z
    .string()
    .transform((value, context) => {
      const parsed = Number(value);

      if (!Number.isSafeInteger(parsed) || parsed < 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'RATE_LIMIT_MAX_REQUESTS must be a positive integer',
        });

        return z.NEVER;
      }

      return parsed;
    })
    .default('100'),

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

  // Observability and telemetry
  PROMPTS_LOGGED: z
    .string()
    .transform((value) => value === 'true')
    .default('false'),

  OUTPUTS_LOGGED: z
    .string()
    .transform((value) => value === 'true')
    .default('false'),

  TRACE_SAMPLE_RATE: z
    .string()
    .transform((value, context) => {
      const parsed = Number(value);

      if (
        !Number.isFinite(parsed) ||
        parsed < 0 ||
        parsed > 1
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'TRACE_SAMPLE_RATE must be between 0 and 1',
        });

        return z.NEVER;
      }

      return parsed;
    })
    .default('1.0'),

  ALLOW_LOCAL_MODEL_IN_PROD: z
    .string()
    .transform((value) => value === 'true' || value === '1')
    .default('false'),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Known insecure example secrets.
 *
 * These values are rejected in production.
 */
const insecureSecrets = new Set<string>([
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
 * Production-only security validation.
 *
 * Never logs actual secret values.
 */
const validateProductionSecurity = (config: EnvConfig): void => {
  if (config.NODE_ENV !== 'production') {
    return;
  }

  const secrets = [
    {
      name: 'SESSION_SECRET',
      value: config.SESSION_SECRET,
    },
    {
      name: 'JWT_SECRET',
      value: config.JWT_SECRET,
    },
    {
      name: 'JWT_REFRESH_SECRET',
      value: config.JWT_REFRESH_SECRET,
    },
  ];

  // Reject known insecure example values.
  for (const secret of secrets) {
    if (insecureSecrets.has(secret.value)) {
      throw new Error(
        `Insecure example value detected for ${secret.name}. Configure a secure production secret.`,
      );
    }
  }

  /**
   * Compare each pair of secrets.
   *
   * If this check fails, the current process has received equal
   * values. It does not reveal why the values became equal.
   */
  const secretPairs: Array<
    [string, string, string, string]
  > = [
    [
      'SESSION_SECRET',
      config.SESSION_SECRET,
      'JWT_SECRET',
      config.JWT_SECRET,
    ],
    [
      'SESSION_SECRET',
      config.SESSION_SECRET,
      'JWT_REFRESH_SECRET',
      config.JWT_REFRESH_SECRET,
    ],
    [
      'JWT_SECRET',
      config.JWT_SECRET,
      'JWT_REFRESH_SECRET',
      config.JWT_REFRESH_SECRET,
    ],
  ];

  for (const [
    firstName,
    firstValue,
    secondName,
    secondValue,
  ] of secretPairs) {
    if (firstValue === secondValue) {
      console.error(
        `[SECURITY_CONFIG] Duplicate production secrets detected: ${firstName} and ${secondName}. Secret values have not been logged.`,
      );

      throw new Error(
        `Production security validation failed: ${firstName} and ${secondName} must contain different values.`,
      );
    }
  }

  /**
   * Validate production CORS configuration.
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
      'Wildcard CORS_ORIGIN is forbidden in production. Configure explicit frontend origins.',
    );
  }

  /**
   * Validate the production AI model endpoint.
   *
   * A local model endpoint is allowed only when explicitly
   * enabled for an authorized deployment.
   */
  let modelUrl: URL;

  try {
    modelUrl = new URL(config.AETHER_MODEL_URL);
  } catch {
    throw new Error(
      'AETHER_MODEL_URL must be a valid URL.',
    );
  }

  const hostname = modelUrl.hostname.toLowerCase();

  const isLocalhostModel =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    modelUrl.port === '5002';

  if (
    isLocalhostModel &&
    !config.ALLOW_LOCAL_MODEL_IN_PROD
  ) {
    throw new Error(
      'AETHER_MODEL_URL points to a local model endpoint in production. Configure a production endpoint or explicitly enable ALLOW_LOCAL_MODEL_IN_PROD for an authorized on-premises deployment.',
    );
  }
};

/**
 * Parse and validate environment variables.
 */
const parseEnv = (): EnvConfig => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errorDetails = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    console.error(
      '[ENV_VALIDATION] Environment variable validation failed:',
      JSON.stringify(errorDetails, null, 2),
    );

    throw new Error(
      `Invalid environment configuration. Check these variables: ${errorDetails
        .map((error) => error.field)
        .join(', ')}`,
    );
  }

  /**
   * Safe diagnostics.
   *
   * These report equality only, never the actual secret values.
   */
  if (result.data.NODE_ENV === 'production') {
    const sessionSecret = result.data.SESSION_SECRET;
    const jwtSecret = result.data.JWT_SECRET;
    const refreshSecret = result.data.JWT_REFRESH_SECRET;

    console.info('[AUTH_CONFIG] Secret configuration check:', {
      sessionPresent: Boolean(sessionSecret),
      jwtPresent: Boolean(jwtSecret),
      refreshPresent: Boolean(refreshSecret),
      sessionEqualsJwt: sessionSecret === jwtSecret,
      sessionEqualsRefresh: sessionSecret === refreshSecret,
      jwtEqualsRefresh: jwtSecret === refreshSecret,
    });
  }

  validateProductionSecurity(result.data);

  return result.data;
};

/**
 * Validate configuration when this module is imported.
 */
export const env: EnvConfig = parseEnv();

/**
 * Revalidate configuration when explicitly requested.
 */
export const validateEnv = (): EnvConfig => parseEnv();