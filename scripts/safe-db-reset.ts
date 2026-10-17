/**
 * AETHER Enterprise Platform — Safe Database Reset Guard (F-01 Remediation)
 * Strictly intercepts and blocks destructive database reset attempts.
 *
 * Safety Constraints:
 * - Refuses execution if NODE_ENV === 'production'.
 * - Refuses execution against default DATABASE_URL or remote cloud/Supabase databases.
 * - Requires explicit --confirm-destructive-reset flag.
 * - Restricts execution strictly to localhost or 127.0.0.1 disposable test databases.
 * - Validates BOTH target DATABASE_URL and DIRECT_URL to prevent silent production leaks.
 * - Enforces that both URLs match the same authorized local disposable database.
 */

import { execSync } from 'child_process';

export interface SafeDbResetOptions {
  readonly argv?: string[];
  readonly nodeEnv?: string;
  readonly databaseUrl?: string;
  readonly directUrl?: string;
  readonly targetUrl?: string;
  readonly disposableResetDatabaseUrl?: string;
  readonly disposableResetDirectUrl?: string;
}

export interface SafeDbResetValidation {
  readonly isAllowed: boolean;
  readonly reason: string;
  readonly safeTargetUrl?: string;
  readonly safeDirectUrl?: string;
}

const FORBIDDEN_HOST_PATTERNS = [
  'supabase.co',
  'supabase.com',
  'pooler.supabase.com',
  'rds.amazonaws.com',
  '.internal',
  '.prod',
  'production',
];

const PERMITTED_LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];

export const sanitizeCredentials = (msg: string): string => {
  if (!msg || typeof msg !== 'string') return '';
  return msg
    // Redact password in user:password@host
    .replace(/(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/gi, '$1***$3')
    // Redact query parameter values in postgres URLs
    .replace(/(postgres(?:ql)?:\/\/[^\s"'<>]+)(\?[^\s"'<>]+)/gi, (_match, prefix, query) => {
      const redactedQuery = query.replace(/([?&][^=]+)=([^&]*)/g, '$1=***');
      return `${prefix}${redactedQuery}`;
    })
    // Redact sensitive key=value pairs
    .replace(/((?:password|pwd|secret|token|apikey|api_key|access_token)[=:]\s*)[^\s&;'"<]+/gi, '$1***')
    // Redact standalone query parameters matching credential keys
    .replace(/([?&](?:apikey|api_key|token|password|secret|key)=)[^&\s"'<>]+/gi, '$1***');
};

const cleanUrlString = (urlStr: string): string => {
  let clean = urlStr.trim();
  if (
    (clean.startsWith('"') && clean.endsWith('"')) ||
    (clean.startsWith("'") && clean.endsWith("'"))
  ) {
    clean = clean.slice(1, -1);
  }
  return clean.trim();
};

export const validateSafeDbReset = (options: SafeDbResetOptions = {}): SafeDbResetValidation => {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  if (nodeEnv === 'production') {
    return {
      isAllowed: false,
      reason: 'FATAL: Database reset is strictly prohibited in production environment (NODE_ENV=production).',
    };
  }

  const argv = options.argv ?? process.argv;
  const hasConfirmation =
    argv.includes('--confirm-destructive-reset') ||
    process.env.CONFIRM_DESTRUCTIVE_RESET === 'true';

  if (!hasConfirmation) {
    return {
      isAllowed: false,
      reason:
        "SAFETY_BLOCKED: Destructive database reset requires explicit confirmation flag '--confirm-destructive-reset'.",
    };
  }

  // 1. Determine target URL: must be explicitly supplied as target or disposable reset URL.
  // Ambient DATABASE_URL fallback is strictly removed to prevent accidental resets.
  const targetUrlIdx = argv.indexOf('--target-url');
  let explicitTarget: string | undefined;
  if (targetUrlIdx !== -1 && argv[targetUrlIdx + 1] && !argv[targetUrlIdx + 1].startsWith('--')) {
    explicitTarget = argv[targetUrlIdx + 1];
  } else if (options.targetUrl && options.targetUrl.trim() !== '') {
    explicitTarget = options.targetUrl;
  } else if (
    options.disposableResetDatabaseUrl &&
    options.disposableResetDatabaseUrl.trim() !== ''
  ) {
    explicitTarget = options.disposableResetDatabaseUrl;
  } else if (
    process.env.DISPOSABLE_RESET_DATABASE_URL &&
    process.env.DISPOSABLE_RESET_DATABASE_URL.trim() !== ''
  ) {
    explicitTarget = process.env.DISPOSABLE_RESET_DATABASE_URL;
  } else if (options.databaseUrl && options.databaseUrl.trim() !== '') {
    explicitTarget = options.databaseUrl;
  }

  if (!explicitTarget || typeof explicitTarget !== 'string' || explicitTarget.trim() === '') {
    return {
      isAllowed: false,
      reason:
        "SAFETY_BLOCKED: No disposable database target URL provided for reset. Reset requires an explicitly supplied '--target-url <url>' or dedicated 'DISPOSABLE_RESET_DATABASE_URL'. Fallback to ambient DATABASE_URL is strictly prohibited.",
    };
  }

  // 2. Determine DIRECT_URL for Prisma Migrate Reset
  const directUrlIdx = argv.indexOf('--direct-url');
  let explicitDirect: string | undefined;
  if (directUrlIdx !== -1 && argv[directUrlIdx + 1] && !argv[directUrlIdx + 1].startsWith('--')) {
    explicitDirect = argv[directUrlIdx + 1];
  } else if (options.directUrl !== undefined) {
    explicitDirect = options.directUrl;
  } else if (
    options.disposableResetDirectUrl &&
    options.disposableResetDirectUrl.trim() !== ''
  ) {
    explicitDirect = options.disposableResetDirectUrl;
  } else if (
    process.env.DISPOSABLE_RESET_DIRECT_URL &&
    process.env.DISPOSABLE_RESET_DIRECT_URL.trim() !== ''
  ) {
    explicitDirect = process.env.DISPOSABLE_RESET_DIRECT_URL;
  } else if (process.env.DIRECT_URL && process.env.DIRECT_URL.trim() !== '') {
    explicitDirect = process.env.DIRECT_URL;
  } else {
    // If no distinct direct URL is supplied or set, default to explicitTarget
    explicitDirect = explicitTarget;
  }

  // Check if DIRECT_URL was provided as empty string
  if (!explicitDirect || typeof explicitDirect !== 'string' || explicitDirect.trim() === '') {
    return {
      isAllowed: false,
      reason: 'SAFETY_BLOCKED: DIRECT_URL is missing or empty. Both target and direct URLs must be specified.',
    };
  }

  const cleanTarget = cleanUrlString(explicitTarget);
  const cleanDirect = cleanUrlString(explicitDirect);

  // 3. Parse URLs
  let parsedTarget: URL;
  let parsedDirect: URL;
  try {
    parsedTarget = new URL(cleanTarget);
  } catch {
    return {
      isAllowed: false,
      reason: 'SAFETY_BLOCKED: Target URL is not a valid PostgreSQL URL format.',
    };
  }

  try {
    parsedDirect = new URL(cleanDirect);
  } catch {
    return {
      isAllowed: false,
      reason: 'SAFETY_BLOCKED: DIRECT_URL is not a valid PostgreSQL URL format.',
    };
  }

  // 4. Protocol validation
  if (parsedTarget.protocol !== 'postgresql:' && parsedTarget.protocol !== 'postgres:') {
    return {
      isAllowed: false,
      reason: `SAFETY_BLOCKED: Invalid protocol "${parsedTarget.protocol}". Expected "postgresql:" or "postgres:".`,
    };
  }

  if (parsedDirect.protocol !== 'postgresql:' && parsedDirect.protocol !== 'postgres:') {
    return {
      isAllowed: false,
      reason: `SAFETY_BLOCKED: Invalid DIRECT_URL protocol "${parsedDirect.protocol}". Expected "postgresql:" or "postgres:".`,
    };
  }

  const targetHost = (parsedTarget.hostname || '').toLowerCase();
  const directHost = (parsedDirect.hostname || '').toLowerCase();

  if (!targetHost) {
    return {
      isAllowed: false,
      reason: 'SAFETY_BLOCKED: Target URL is missing a valid hostname.',
    };
  }

  if (!directHost) {
    return {
      isAllowed: false,
      reason: 'SAFETY_BLOCKED: DIRECT_URL is missing a valid hostname.',
    };
  }

  // 5. Forbidden patterns check
  for (const forbidden of FORBIDDEN_HOST_PATTERNS) {
    if (targetHost.includes(forbidden)) {
      return {
        isAllowed: false,
        reason: `FATAL: Target host "${targetHost}" matches forbidden pattern "${forbidden}". Resetting remote or production databases is strictly prohibited.`,
      };
    }
    if (directHost.includes(forbidden)) {
      return {
        isAllowed: false,
        reason: `FATAL: DIRECT_URL host "${directHost}" matches forbidden pattern "${forbidden}". Resetting remote or production databases is strictly prohibited.`,
      };
    }
  }

  // 6. Local host check
  if (!PERMITTED_LOCAL_HOSTS.includes(targetHost)) {
    return {
      isAllowed: false,
      reason: `FATAL: Target host "${targetHost}" is not an authorized local disposable target. Resets are only permitted against localhost or 127.0.0.1.`,
    };
  }

  if (!PERMITTED_LOCAL_HOSTS.includes(directHost)) {
    return {
      isAllowed: false,
      reason: `FATAL: DIRECT_URL host "${directHost}" is not an authorized local disposable target. Resets are only permitted against localhost or 127.0.0.1.`,
    };
  }

  // 7. Mismatch check between Target URL and DIRECT_URL
  if (targetHost !== directHost) {
    return {
      isAllowed: false,
      reason: `SAFETY_BLOCKED: Target host ("${targetHost}") and DIRECT_URL host ("${directHost}") do not match. Both must point to the same local disposable database.`,
    };
  }

  const targetPort = parsedTarget.port || '5432';
  const directPort = parsedDirect.port || '5432';
  if (targetPort !== directPort) {
    return {
      isAllowed: false,
      reason: `SAFETY_BLOCKED: Target port ("${targetPort}") and DIRECT_URL port ("${directPort}") do not match. Both must point to the same local disposable database.`,
    };
  }

  const targetDb = (parsedTarget.pathname || '').replace(/^\//, '');
  const directDb = (parsedDirect.pathname || '').replace(/^\//, '');
  if (targetDb !== directDb) {
    return {
      isAllowed: false,
      reason: `SAFETY_BLOCKED: Target database ("${targetDb}") and DIRECT_URL database ("${directDb}") do not match. Both must point to the same local disposable database.`,
    };
  }

  return {
    isAllowed: true,
    reason: 'Target is an authorized local disposable test database.',
    safeTargetUrl: cleanTarget,
    safeDirectUrl: cleanDirect,
  };
};

export const runSafeDbReset = (options: SafeDbResetOptions = {}): void => {
  const validation = validateSafeDbReset(options);

  if (!validation.isAllowed) {
    console.error(`
================================================================================
[AETHER SAFETY GUARD] DESTRUCTIVE DATABASE RESET BLOCKED
================================================================================
${sanitizeCredentials(validation.reason)}

To prevent catastrophic data loss, resets are disabled by default.
Destructive resets are only permitted when:
  1. Target is strictly an isolated local disposable database (localhost / 127.0.0.1)
  2. Both DATABASE_URL and DIRECT_URL point to the same verified local disposable database
  3. Explicit confirmation flag '--confirm-destructive-reset' is supplied
  4. NODE_ENV is NOT 'production'

Safe usage:
  npx tsx scripts/safe-db-reset.ts --confirm-destructive-reset --target-url postgresql://postgres:postgres@127.0.0.1:5433/aether_disposable
================================================================================
`);
    process.exit(1);
  }

  console.log(`[AETHER Safe Reset] Authorized local disposable reset proceeding for target: ${sanitizeCredentials(validation.safeTargetUrl!)}`);
  // Execute reset strictly against verified local target, binding BOTH DATABASE_URL and DIRECT_URL
  execSync('npx prisma migrate reset --force', {
    env: {
      ...process.env,
      DATABASE_URL: validation.safeTargetUrl,
      DIRECT_URL: validation.safeDirectUrl,
    },
    stdio: 'inherit',
  });
};

if (process.argv[1] && process.argv[1].endsWith('safe-db-reset.ts')) {
  runSafeDbReset();
}
