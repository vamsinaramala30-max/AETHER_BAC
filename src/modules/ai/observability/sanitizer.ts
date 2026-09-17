/**
 * AETHER AI — Security-First Data Sanitizer & Redaction Engine (Prompt 9)
 * Canonical sensitive-data redactor and Chain-of-Thought (CoT) privacy guard.
 *
 * Rules:
 * - Recursively redacts passwords, tokens, API keys, credentials, cookies, JWTs.
 * - Strips all private Chain-of-Thought / internal deliberation fields from telemetry.
 * - Handles circular object references safely.
 * - Never throws or disrupts execution.
 */

export const SENSITIVE_KEY_PATTERNS = [
  'password',
  'passwd',
  'pwd',
  'apikey',
  'api_key',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'authorization',
  'auth_header',
  'cookie',
  'session',
  'sessionid',
  'session_id',
  'sessiontoken',
  'session_token',
  'jwt',
  'bearer',
  'secret',
  'client_secret',
  'clientsecret',
  'privatekey',
  'private_key',
  'privkey',
  'database_url',
  'databaseurl',
  'connectionstring',
  'credentials',
  'usercredentials',
  'user_credentials',
  'rawdocumentcontent',
  'rawcontent',
  'toolsecrets',
  'tool_secrets',
];

export const COT_KEYS = new Set([
  'chainofthought',
  'chain_of_thought',
  'cot',
  'deliberation',
  'inner_deliberation',
  'innerdeliberation',
  'internal_deliberation',
  'internaldeliberation',
  'internal_reasoning',
  'internalreasoning',
  'internal_rationale',
  'internalrationale',
  'thought_process',
  'thoughtprocess',
  'reasoning_trace',
  'reasoningtrace',
  'hidden_reasoning',
  'hiddenreasoning',
  'private_reasoning',
  'privatereasoning',
  'private_deliberation',
  'privatedeliberation',
]);

const JWT_REGEX = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;
const BEARER_REGEX = /^Bearer\s+[A-Za-z0-9-._~+/]+=*$/i;
const DB_CONN_REGEX = /^(postgres|postgresql|mysql|mongodb|redis):\/\/[^\s]+$/i;
const API_KEY_PREFIX_REGEX = /^(sk-[A-Za-z0-9]{20,}|AIzaSy[A-Za-z0-9_-]{33}|ghp_[A-Za-z0-9]{36})$/;

export class DataSanitizer {
  /**
   * Recursively redacts sensitive keys and values from any object, array, or primitive.
   */
  public static sanitize<T = any>(value: T, depth = 0, seen = new WeakSet<object>()): any {
    if (depth > 12) {
      return '[MAX_DEPTH_REACHED]';
    }

    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'function') {
      return '[FUNCTION]';
    }

    if (typeof value !== 'object') {
      return String(value);
    }

    // Handle circular references
    if (seen.has(value as object)) {
      return '[CIRCULAR]';
    }
    seen.add(value as object);

    // Handle Error objects
    if (value instanceof Error) {
      return {
        name: value.name,
        message: this.sanitizeString(value.message),
        // Exclude stack trace from standard telemetry
      };
    }

    // Handle Date objects
    if (value instanceof Date) {
      return value.toISOString();
    }

    // Handle Arrays
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item, depth + 1, seen));
    }

    // Handle standard Objects
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const lowerKey = key.toLowerCase().replace(/[-_]/g, '');

      // Check for Chain-of-Thought keys — Strip completely
      if (COT_KEYS.has(key.toLowerCase()) || COT_KEYS.has(lowerKey)) {
        continue;
      }

      // Check for sensitive keys
      if (this.isSensitiveKey(lowerKey)) {
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          sanitized[key] = this.sanitize(val, depth + 1, seen);
        } else if (typeof val === 'string') {
          const cleanStr = this.sanitizeString(val);
          sanitized[key] = cleanStr !== val ? cleanStr : '[REDACTED]';
        } else {
          sanitized[key] = '[REDACTED]';
        }
      } else {
        sanitized[key] = this.sanitize(val, depth + 1, seen);
      }
    }

    return sanitized;
  }

  /**
   * Checks if a key indicates sensitive data.
   */
  public static isSensitiveKey(normalizedKey: string): boolean {
    return SENSITIVE_KEY_PATTERNS.some((pattern) => {
      const cleanPattern = pattern.replace(/[-_]/g, '');
      return normalizedKey.includes(cleanPattern);
    });
  }

  /**
   * Checks and sanitizes sensitive string content (like tokens or connection strings).
   */
  public static sanitizeString(text: string): string {
    if (!text || text.length === 0) return text;

    // Direct Bearer token match
    if (BEARER_REGEX.test(text)) {
      return 'Bearer [REDACTED]';
    }

    // Direct database connection string match
    if (DB_CONN_REGEX.test(text)) {
      return '[REDACTED_URI]';
    }

    // Direct API key or JWT token match
    if (JWT_REGEX.test(text) || API_KEY_PREFIX_REGEX.test(text)) {
      return '[REDACTED]';
    }

    // Embedded connection string redaction
    let sanitized = text.replace(
      /(postgres|postgresql|mysql|mongodb|redis):\/\/[^\s]+/gi,
      '[REDACTED_URI]',
    );

    // Embedded Bearer token redaction
    sanitized = sanitized.replace(
      /Bearer\s+[A-Za-z0-9-._~+/]+=*/gi,
      'Bearer [REDACTED]',
    );

    return sanitized;
  }

  /**
   * Strips Chain-of-Thought and internal reasoning fields from a payload.
   */
  public static stripCoT(value: unknown, seen = new WeakSet<object>()): unknown {
    if (value === null || typeof value !== 'object') {
      return value;
    }

    if (seen.has(value)) {
      return '[CIRCULAR_REFERENCE]';
    }
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item) => this.stripCoT(item, seen));
    }

    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const lowerKey = key.toLowerCase().replace(/[-_]/g, '');
      if (COT_KEYS.has(key.toLowerCase()) || COT_KEYS.has(lowerKey)) {
        continue;
      }
      cleaned[key] = this.stripCoT(val, seen);
    }

    return cleaned;
  }
}

export const redactSensitive = (data: unknown): unknown => DataSanitizer.sanitize(data);
export const stripChainOfThought = (data: unknown): unknown => DataSanitizer.stripCoT(data);
export const sanitizePayload = (data: unknown): unknown => DataSanitizer.sanitize(data);
