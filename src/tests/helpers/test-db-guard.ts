/**
 * AETHER Database Safety & Test Isolation Guard
 * Enforces strict isolation boundaries: unit tests must never connect to live production.
 * Database-dependent integration tests require an explicitly configured disposable local target.
 */

export interface DisposableDatabaseGuardResult {
  readonly isAllowed: boolean;
  readonly reason?: string;
  readonly url?: string;
  readonly host?: string;
  readonly port?: string;
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

/**
 * Validates whether a database connection URL is permitted for integration tests.
 * Only local, disposable instances (localhost / 127.0.0.1) are permitted.
 * Remote cloud hosts (especially Tokyo Supabase) are strictly rejected.
 */
export const validateDisposableTestDatabaseUrl = (
  rawUrl?: string,
): DisposableDatabaseGuardResult => {
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    return {
      isAllowed: false,
      reason:
        'DISPOSABLE_TEST_DATABASE_URL is not set. Database integration tests require an explicitly configured disposable local database.',
    };
  }

  let cleanUrl = rawUrl.trim();
  if (
    (cleanUrl.startsWith('"') && cleanUrl.endsWith('"')) ||
    (cleanUrl.startsWith("'") && cleanUrl.endsWith("'"))
  ) {
    cleanUrl = cleanUrl.slice(1, -1);
  }

  let parsed: URL;
  try {
    parsed = new URL(cleanUrl);
  } catch {
    return {
      isAllowed: false,
      reason: 'DISPOSABLE_TEST_DATABASE_URL is not a valid PostgreSQL URL format.',
    };
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    return {
      isAllowed: false,
      reason: `Invalid protocol "${parsed.protocol}". Expected "postgresql:" or "postgres:".`,
    };
  }

  const host = (parsed.hostname || '').toLowerCase();

  for (const forbidden of FORBIDDEN_HOST_PATTERNS) {
    if (host.includes(forbidden)) {
      return {
        isAllowed: false,
        host,
        reason: `Target host "${host}" matches forbidden pattern "${forbidden}". Database integration tests strictly prohibit remote/production cloud targets.`,
      };
    }
  }

  if (!PERMITTED_LOCAL_HOSTS.includes(host)) {
    return {
      isAllowed: false,
      host,
      reason: `Target host "${host}" is not an authorized local disposable target. Only localhost or 127.0.0.1 are permitted.`,
    };
  }

  return {
    isAllowed: true,
    url: cleanUrl,
    host,
    port: parsed.port || '5432',
  };
};
