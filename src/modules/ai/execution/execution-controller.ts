/**
 * AETHER AI - Execution Controller (Prompt 8)
 * REST Express controller for the autonomous agent execution loop.
 *
 * Routes:
 *   POST /api/v1/ai/agent/execute              - Start execution from a HANDED_OFF plan
 *   GET  /api/v1/ai/agent/executions/:id       - Get execution status (tenant-isolated)
 *   POST /api/v1/ai/agent/executions/:id/cancel   - Cancel a running execution
 *   POST /api/v1/ai/agent/executions/:id/approve  - Approve a step awaiting approval
 *   POST /api/v1/ai/agent/executions/:id/input    - Provide user input for a paused step
 *
 * Security invariants:
 *   - userId ALWAYS comes from req.user (authenticated middleware), never req.body.
 *   - Tenant isolation: users can only read/act on their own executions.
 *   - ExecutionContext is constructed by ExecutionContextBuilder from server auth only.
 */

import type { Request, Response, NextFunction } from 'express';
import type { PlanHandoffPayload } from '../planning/plan-handoff.js';
import type { IExecutionEngine } from './execution-engine.js';
import { executionEngine } from './execution-engine.js';
import { executionContextBuilder } from './execution-context.js';

export class ExecutionController {
  constructor(private readonly engine: IExecutionEngine = executionEngine) {}

  // --------------------------------------------------------------------------
  // POST /api/v1/ai/agent/execute
  // --------------------------------------------------------------------------
  public async startExecution(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
      const body = req.body ?? {};
      const handoff: PlanHandoffPayload | undefined = body.handoffPayload ?? body.handoff;

      if (!handoff || !handoff.planId || !handoff.version) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'Missing or malformed handoffPayload.' },
        });
        return;
      }

      // ExecutionContext built server-side only
      const ctx = executionContextBuilder.fromRequest(req, {
        conversationId: body.conversationId,
        projectId: body.projectId,
      });

      const options = body.options ?? {};

      // Prevent skip of approval gates even if client sends it
      const safeOptions = {
        executionTimeoutMs: typeof options.executionTimeoutMs === 'number' ? options.executionTimeoutMs : undefined,
        stepTimeoutMs: typeof options.stepTimeoutMs === 'number' ? options.stepTimeoutMs : undefined,
        maxRetries: typeof options.maxRetries === 'number' ? options.maxRetries : undefined,
        idempotencyKey: typeof options.idempotencyKey === 'string' ? options.idempotencyKey : undefined,
        // skipApprovalGates intentionally excluded
      };

      const result = await this.engine.startExecution(handoff, ctx, safeOptions);

      const statusCode =
        result.status === 'COMPLETED' ? 200 :
        result.status === 'PARTIALLY_COMPLETED' ? 207 :
        result.status === 'WAITING_FOR_APPROVAL' ? 202 :
        result.status === 'WAITING_FOR_INPUT' ? 202 :
        result.status === 'CANCELLED' ? 200 :
        result.status === 'FAILED' || result.status === 'BLOCKED' ? 422 :
        200;

      res.status(statusCode).json({ success: true, data: result });
    } catch (err) {
      if (next) next(err);
      else res.status(500).json({ success: false, error: (err as Error).message });
    }
  }

  // --------------------------------------------------------------------------
  // GET /api/v1/ai/agent/executions/:id
  // --------------------------------------------------------------------------
  public async getExecution(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id ?? 'anonymous';
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Missing execution ID.' } });
        return;
      }

      const execution = await this.engine.getExecution(id, userId);
      if (!execution) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Execution not found or unauthorized.' } });
        return;
      }

      res.status(200).json({ success: true, data: execution });
    } catch (err) {
      if (next) next(err);
      else res.status(500).json({ success: false, error: (err as Error).message });
    }
  }

  // --------------------------------------------------------------------------
  // POST /api/v1/ai/agent/executions/:id/cancel
  // --------------------------------------------------------------------------
  public async cancelExecution(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id ?? 'anonymous';
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Missing execution ID.' } });
        return;
      }

      const cancelled = await this.engine.cancelExecution(id, userId);
      if (!cancelled) {
        res.status(409).json({ success: false, error: { code: 'CANNOT_CANCEL', message: 'Execution not found or cannot be cancelled in its current state.' } });
        return;
      }

      res.status(200).json({ success: true, data: { executionId: id, status: 'CANCELLED' } });
    } catch (err) {
      if (next) next(err);
      else res.status(500).json({ success: false, error: (err as Error).message });
    }
  }

  // --------------------------------------------------------------------------
  // POST /api/v1/ai/agent/executions/:id/approve
  // --------------------------------------------------------------------------
  public async approveStep(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id ?? 'anonymous';
      const { id } = req.params;
      const { stepId } = req.body ?? {};

      if (!id || !stepId) {
        res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'Missing execution ID or stepId.' } });
        return;
      }

      const approved = await this.engine.approveStep(id, stepId, userId);
      if (!approved) {
        res.status(409).json({ success: false, error: { code: 'CANNOT_APPROVE', message: 'Execution not found, not awaiting approval, or step ID mismatch.' } });
        return;
      }

      res.status(200).json({ success: true, data: { executionId: id, stepId, approved: true } });
    } catch (err) {
      if (next) next(err);
      else res.status(500).json({ success: false, error: (err as Error).message });
    }
  }

  // --------------------------------------------------------------------------
  // POST /api/v1/ai/agent/executions/:id/input
  // --------------------------------------------------------------------------
  public async provideInput(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id ?? 'anonymous';
      const { id } = req.params;
      const { stepId, input } = req.body ?? {};

      if (!id || !stepId || typeof input !== 'object' || input === null) {
        res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'Missing executionId, stepId, or input object.' } });
        return;
      }

      const accepted = await this.engine.provideInput(id, stepId, input as Record<string, unknown>, userId);
      if (!accepted) {
        res.status(409).json({ success: false, error: { code: 'CANNOT_PROVIDE_INPUT', message: 'Execution not found, not awaiting input, or step ID mismatch.' } });
        return;
      }

      res.status(200).json({ success: true, data: { executionId: id, stepId, inputAccepted: true } });
    } catch (err) {
      if (next) next(err);
      else res.status(500).json({ success: false, error: (err as Error).message });
    }
  }
}

export const executionController = new ExecutionController();
