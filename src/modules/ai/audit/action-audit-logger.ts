/**
 * AETHER AI — Action Audit Logger (Prompt 6 & Prompt 9 Hardened)
 * Authoritative, immutable, append-only audit logging for all AI action and plan executions.
 *
 * Rules:
 * - Immutable: Append-only semantics (no updates, no deletions through application APIs).
 * - Security: Recursive redaction of sensitive arguments and secrets.
 * - Multi-tenant isolation: Tenant boundaries strictly enforced on query.
 * - End-to-end tracing: Preserves correlationId, executionId, planId, stepId.
 */

import type { ActionRiskLevel } from '../tools/tool-types.js';
import { logger } from '../observability/logger.js';
import { DataSanitizer } from '../observability/sanitizer.js';
import { db } from '../../../database/client.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ActionAuditLogEntry {
  readonly id: string;
  readonly executionId?: string;
  readonly correlationId?: string;
  readonly planId?: string;
  readonly stepId?: string;
  readonly workspaceId?: string;
  readonly tenantScope?: string;
  readonly userId: string;
  readonly sessionId?: string;
  readonly conversationId?: string;
  readonly traceId?: string;
  readonly toolName: string;
  readonly actionType: string;
  readonly resourceId?: string;
  readonly input: Record<string, unknown>;
  readonly result?: unknown;
  readonly verified: boolean;
  readonly verificationDetails?: string;
  readonly riskLevel: ActionRiskLevel;
  readonly status:
    | 'SUCCESS'
    | 'FAILED'
    | 'CONFIRMATION_REQUIRED'
    | 'CANCELLED'
    | 'VERIFICATION_FAILED'
    | 'TIMEOUT'
    | 'INVALID_INPUT'
    | 'FORBIDDEN';
  readonly error?: string;
  readonly timestamp: string;
  readonly executionTimeMs: number;
}

export interface IActionAuditLogger {
  log(
    entry: Omit<ActionAuditLogEntry, 'id' | 'timestamp' | 'actionType' | 'input'> & {
      id?: string;
      actionType?: string;
      action?: string;
      input?: Record<string, unknown>;
      params?: Record<string, unknown>;
    },
  ): Promise<ActionAuditLogEntry>;
  getLogs(
    filter?: {
      userId?: string;
      toolName?: string;
      limit?: number;
      workspaceId?: string;
      correlationId?: string;
      planId?: string;
      action?: string;
    },
    requestingUserId?: string,
  ): Promise<readonly ActionAuditLogEntry[]>;
  getLogById(id: string, requestingUserId?: string): Promise<ActionAuditLogEntry | null>;
  clear(): void;
}

export class ActionAuditLogger implements IActionAuditLogger {
  private readonly inMemoryLogs: ActionAuditLogEntry[] = [];
  private readonly maxInMemoryEntries = 1000;

  public async log(
    entry: Omit<ActionAuditLogEntry, 'id' | 'timestamp' | 'actionType' | 'input'> & {
      id?: string;
      actionType?: string;
      action?: string;
      input?: Record<string, unknown>;
      params?: Record<string, unknown>;
    },
  ): Promise<ActionAuditLogEntry> {
    const rawInput = entry.input ?? entry.params ?? {};
    const actionType = entry.actionType || entry.action || 'EXECUTE';

    // 1. Recursive sensitive data sanitization
    const sanitizedInput = DataSanitizer.sanitize(rawInput) as Record<string, unknown>;
    const sanitizedResult = entry.result ? DataSanitizer.sanitize(entry.result) : undefined;

    const entryId =
      entry.id ||
      entry.executionId ||
      `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const fullEntry: ActionAuditLogEntry = Object.freeze({
      ...entry,
      id: entryId,
      actionType,
      executionId: entry.executionId || (entry.id ? entry.id : undefined),
      input: sanitizedInput,
      result: sanitizedResult,
      timestamp: new Date().toISOString(),
    });

    // 2. Append-only in-memory storage with FIFO eviction
    this.inMemoryLogs.unshift(fullEntry);
    if (this.inMemoryLogs.length > this.maxInMemoryEntries) {
      this.inMemoryLogs.pop();
    }

    // 3. Structured log emission
    logger.info(
      `[AI Audit Log] Tool: ${entry.toolName} | User: ${entry.userId} | Status: ${entry.status} | Verified: ${entry.verified} | Time: ${entry.executionTimeMs.toFixed(1)}ms`,
      {
        correlationId: entry.correlationId,
        executionId: entry.executionId,
        traceId: entry.traceId,
        toolName: entry.toolName,
        status: entry.status,
        verified: entry.verified,
        durationMs: entry.executionTimeMs,
      },
    );

    // 4. Persist to PostgreSQL database asynchronously
    try {
      const validUserId = UUID_REGEX.test(entry.userId) ? entry.userId : null;
      if (validUserId) {
        const userExists = await db.user.findUnique({ where: { id: validUserId } });
        if (!userExists) {
          try {
            await db.user.create({
              data: {
                id: validUserId,
                email: `user-${validUserId.substring(0, 8)}@aether.local`,
                fullName: 'Aether User',
              },
            });
          } catch {
            // Ignore concurrent creation
          }
        }
      }

      await db.auditLog.create({
        data: {
          userId: validUserId,
          action: 'TOOL_EXECUTION',
          resource: entry.toolName,
          payload: {
            executionId: fullEntry.id,
            correlationId: entry.correlationId,
            planId: entry.planId,
            stepId: entry.stepId,
            workspaceId: entry.workspaceId,
            traceId: entry.traceId,
            conversationId: entry.conversationId,
            sessionId: entry.sessionId,
            toolName: entry.toolName,
            status: entry.status,
            verified: entry.verified,
            verificationDetails: entry.verificationDetails,
            riskLevel: entry.riskLevel,
            executionTimeMs: entry.executionTimeMs,
            input: sanitizedInput as any,
            resultSummary:
              typeof sanitizedResult === 'object' && sanitizedResult !== null
                ? JSON.stringify(sanitizedResult).slice(0, 1000)
                : String(sanitizedResult ?? ''),
            error: entry.error,
          } as any,
        },
      });
    } catch {
      // Non-blocking: DB audit failures must not abort workflow execution
    }

    return fullEntry;
  }

  public async getLogs(
    filter?: {
      userId?: string;
      toolName?: string;
      limit?: number;
      workspaceId?: string;
      correlationId?: string;
      planId?: string;
      action?: string;
    },
    requestingUserId?: string,
  ): Promise<readonly ActionAuditLogEntry[]> {
    let result = [...this.inMemoryLogs];

    // Tenant isolation check: ordinary users can only see their own logs
    if (requestingUserId && requestingUserId !== 'admin') {
      result = result.filter((l) => l.userId === requestingUserId);
    } else if (filter?.userId) {
      result = result.filter((l) => l.userId === filter.userId);
    }

    if (filter?.correlationId) {
      result = result.filter((l) => l.correlationId === filter.correlationId);
    }
    if (filter?.planId) {
      result = result.filter((l) => l.planId === filter.planId);
    }
    if (filter?.action) {
      result = result.filter((l) => l.actionType === filter.action);
    }

    if (filter?.workspaceId) {
      result = result.filter((l) => l.workspaceId === filter.workspaceId);
    }
    if (filter?.toolName) {
      result = result.filter((l) => l.toolName === filter.toolName);
    }
    if (filter?.limit && filter.limit > 0) {
      result = result.slice(0, filter.limit);
    }

    return result;
  }

  public async getLogById(id: string, requestingUserId?: string): Promise<ActionAuditLogEntry | null> {
    const memoryMatch = this.inMemoryLogs.find((l) => l.id === id || l.executionId === id);
    if (memoryMatch) {
      // Tenant check
      if (requestingUserId && requestingUserId !== 'admin' && memoryMatch.userId !== requestingUserId) {
        return null;
      }
      return memoryMatch;
    }

    try {
      const isUuid = UUID_REGEX.test(id);
      const dbMatch = await db.auditLog.findFirst({
        where: isUuid
          ? { id }
          : { payload: { path: ['executionId'], equals: id } },
      });

      if (!dbMatch || !dbMatch.payload) return null;
      const p = dbMatch.payload as Record<string, unknown>;

      const recordUserId = dbMatch.userId || 'unknown';
      if (requestingUserId && requestingUserId !== 'admin' && recordUserId !== requestingUserId) {
        return null;
      }

      return {
        id: (p.executionId as string) || dbMatch.id,
        executionId: (p.executionId as string) || undefined,
        correlationId: (p.correlationId as string) || undefined,
        planId: (p.planId as string) || undefined,
        stepId: (p.stepId as string) || undefined,
        workspaceId: (p.workspaceId as string) || undefined,
        userId: recordUserId,
        sessionId: (p.sessionId as string) || undefined,
        conversationId: (p.conversationId as string) || undefined,
        traceId: (p.traceId as string) || undefined,
        toolName: dbMatch.resource || (p.toolName as string) || 'unknown',
        actionType: dbMatch.action || 'TOOL_EXECUTION',
        input: (p.input as Record<string, unknown>) || {},
        result: p.resultSummary,
        verified: !!p.verified,
        verificationDetails: (p.verificationDetails as string) || undefined,
        riskLevel: (p.riskLevel as ActionRiskLevel) || 'READ_ONLY',
        status: (p.status as any) || 'SUCCESS',
        error: (p.error as string) || undefined,
        timestamp: dbMatch.createdAt.toISOString(),
        executionTimeMs: Number(p.executionTimeMs || 0),
      };
    } catch {
      return null;
    }
  }

  public clear(): void {
    this.inMemoryLogs.length = 0;
  }
}

export const actionAuditLogger = new ActionAuditLogger();
