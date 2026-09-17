import crypto from 'node:crypto';

export function generateExecutionKey(
  automationId: string,
  triggerType: string,
  timestampMs: number = Math.floor(Date.now() / 1000),
): string {
  const raw = `${automationId}:${triggerType}:${timestampMs}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function isValidUuid(id: string): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function sanitizeMetadata(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || data === null) return {};
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    // Redact sensitive keys according to requirement 32
    if (
      /password|secret|token|authorization|apikey|api_key|access_token|refresh_token|credential|private_key|session_secret|jwt/i.test(
        key,
      )
    ) {
      cleaned[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      cleaned[key] = sanitizeMetadata(value);
    } else if (typeof value === 'function') {
      cleaned[key] = '[Function]';
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}
