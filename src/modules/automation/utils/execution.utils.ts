import { ExecutionStepResult } from '../automation.types';
import { sanitizeMetadata } from './automation.utils';

export function formatStepResult(
  stepIndex: number,
  actionType: string,
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'WAITING_APPROVAL',
  input?: Record<string, unknown>,
  output?: unknown,
  error?: unknown,
  startedAt?: Date,
  actionId?: string,
): ExecutionStepResult {
  const start = startedAt || new Date();
  const completed = new Date();
  const durationMs = completed.getTime() - start.getTime();

  let formattedError: string | undefined;
  if (error) {
    formattedError = error instanceof Error ? error.message : String(error);
  }

  return {
    stepIndex,
    actionId,
    actionType,
    status,
    input: input ? sanitizeMetadata(input) : undefined,
    output: typeof output === 'object' && output !== null ? sanitizeMetadata(output) : output,
    error: formattedError,
    startedAt: start.toISOString(),
    completedAt: completed.toISOString(),
    durationMs,
  };
}

export function parsePaginationParams(query: { page?: unknown; limit?: unknown }) {
  const page = Math.max(1, parseInt(String(query.page || 1), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || 20), 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}
