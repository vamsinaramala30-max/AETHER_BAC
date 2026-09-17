/**
 * AETHER AI — Internal Diagnostics Controller (Prompt 9)
 * Authenticated, authorized, and tenant-safe diagnostics endpoints.
 *
 * Invariants:
 * - Never returns passwords, credentials, or internal stack traces.
 * - Enforces tenant isolation (users can only see their own traces).
 * - Exposes bounded diagnostic state only.
 */

import type { Request, Response, NextFunction } from 'express';
import { healthChecker } from './health.js';
import { metrics } from './metrics.js';
import { tracer } from './tracing.js';
import { executionRepository } from '../execution/execution-repository.js';

export class DiagnosticController {
  /**
   * GET /api/v1/internal/health
   * Detailed system component health status.
   */
  public async getHealth(_req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
      const report = await healthChecker.getReport();
      const status = report.status === 'UNAVAILABLE' ? 503 : 200;
      res.status(status).json({
        success: true,
        data: report,
      });
    } catch (err) {
      if (next) next(err);
      else res.status(500).json({ success: false, error: 'Failed to retrieve diagnostics health' });
    }
  }

  /**
   * GET /api/v1/internal/metrics
   * Prometheus exposition text or JSON format.
   */
  public async getMetrics(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
      const format = (req.query['format'] as string) || 'json';

      if (format === 'prometheus' || req.headers.accept?.includes('text/plain')) {
        res.setHeader('Content-Type', 'text/plain; version=0.0.4');
        res.status(200).send(metrics.toPrometheus());
        return;
      }

      res.status(200).json({
        success: true,
        data: metrics.getSummary(),
      });
    } catch (err) {
      if (next) next(err);
      else res.status(500).json({ success: false, error: 'Failed to retrieve metrics' });
    }
  }

  /**
   * GET /api/v1/internal/executions/:id/trace
   * Retrieves the distributed trace tree for a given execution.
   * Enforces tenant isolation: users can only inspect their own traces.
   */
  public async getExecutionTrace(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      const userId: string = user?.id || user?.userId || 'anonymous';
      const role: string = user?.role || (user?.roles && user?.roles[0]) || 'user';

      if (!id) {
        res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Execution ID is required' } });
        return;
      }

      // Check execution ownership
      const execution = await executionRepository.findById(id, userId);
      if (!execution) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Execution not found' } });
        return;
      }

      if (execution.userId !== userId && role !== 'admin') {
        res.status(403).json({
          success: false,
          error: { code: 'TENANT_ISOLATION_ERROR', message: 'Unauthorized: Cross-tenant trace access denied' },
        });
        return;
      }

      const durationMs = execution.completedAt
        ? Math.max(0, new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime())
        : 0;

      // Look up trace by execution correlationId or traceId
      const traceTree =
        tracer.getTrace(execution.correlationId, userId) ??
        tracer.getTrace(id, userId);

      if (!traceTree) {
        // Fallback: reconstruct a minimal synthetic trace tree from execution record
        res.status(200).json({
          success: true,
          data: {
            traceId: execution.correlationId,
            correlationId: execution.correlationId,
            executionId: execution.id,
            status: execution.status,
            durationMs,
            spans: [
              {
                traceId: execution.correlationId,
                spanId: `span_${execution.id}`,
                name: `agent.execution.${execution.status.toLowerCase()}`,
                component: 'ExecutionEngine',
                durationMs,
                status: execution.status === 'COMPLETED' ? 'ok' : 'error',
                attributes: {
                  planId: execution.planId,
                  planVersion: execution.planVersion,
                  userId: execution.userId,
                },
              },
            ],
          },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: traceTree,
      });
    } catch (err) {
      if (next) next(err);
      else res.status(500).json({ success: false, error: 'Failed to retrieve execution trace' });
    }
  }
}

export const diagnosticController = new DiagnosticController();
