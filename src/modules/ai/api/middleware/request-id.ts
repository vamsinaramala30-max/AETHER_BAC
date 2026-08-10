/**
 * AETHER AI — Request ID Middleware
 * Generates or extracts unique request identifiers for end-to-end tracing.
 */

export interface RequestIdContext {
  readonly requestId: string;
}

export function extractOrCreateRequestId(incomingId?: string): RequestIdContext {
  if (incomingId && incomingId.trim().length > 0) {
    return { requestId: incomingId.trim() };
  }
  return {
    requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
  };
}
