/**
 * AETHER AI — Plan Express Controller
 * REST API Controller for Agent Reasoning + Planning operations:
 * - POST /api/v1/ai/plans           (Create structured plan)
 * - GET  /api/v1/ai/plans/:id       (Retrieve plan with tenant isolation)
 * - POST /api/v1/ai/plans/:id/validate (Validate plan)
 * - POST /api/v1/ai/plans/:id/cancel   (Cancel plan)
 */

import type { Request, Response, NextFunction } from 'express';
import { planningEngine } from '../../planning/planning-engine.js';
import { planRepository } from '../../planning/plan-repository.js';
import { planValidator } from '../../planning/plan-validator.js';
import type { AuthenticationContext } from '../../tools/tool-types.js';
import type { AIRequest } from '../../ai-types.js';

export class PlanExpressController {
  public async createPlan(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const body = req.body || {};
      const message = body.message || body.objective || body.content || '';

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'Missing or empty plan message/objective.' },
        });
        return;
      }

      const correlationId =
        (req.headers['x-correlation-id'] as string) ||
        (req.headers['x-request-id'] as string) ||
        body.correlationId ||
        `corr_${Date.now()}`;

      const auth: AuthenticationContext = {
        userId,
        sessionId: (req.user as any)?.sessionId || (req as any).sessionID || `sess_${userId}`,
        roles: (req.user as any)?.roles || ['user'],
        permissions: (req.user as any)?.permissions || ['*'],
        workspaceId: body.workspaceId || (req.user as any)?.workspaceId,
      };

      const aiRequest: AIRequest = {
        requestId: correlationId,
        userId,
        sessionId: auth.sessionId,
        conversationId: body.conversationId,
        message,
        timestamp: Date.now(),
      };

      const plan = await planningEngine.createAgentPlan(aiRequest, auth, {
        correlationId,
        context: {
          userId,
          sessionId: auth.sessionId,
          conversationId: body.conversationId,
          workspaceId: auth.workspaceId,
          projectId: body.projectId,
          tokenBudget: {
            total: 8192,
            system: 800,
            history: 2000,
            context: 3000,
            response: 2392,
            remaining: 8192,
          },
        },
      });

      res.status(201).json({
        success: true,
        data: plan,
        correlationId,
      });
    } catch (err) {
      if (next) {
        next(err);
      } else {
        res.status(500).json({ success: false, error: (err as Error).message });
      }
    }
  }

  public async getPlanById(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_ID', message: 'Missing plan ID.' },
        });
        return;
      }

      const plan = await planRepository.findById(id, userId);
      if (!plan) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Plan "${id}" not found or unauthorized.` },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: plan,
      });
    } catch (err) {
      if (next) {
        next(err);
      } else {
        res.status(500).json({ success: false, error: (err as Error).message });
      }
    }
  }

  public async validatePlan(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_ID', message: 'Missing plan ID.' },
        });
        return;
      }

      const plan = await planRepository.findById(id, userId);
      if (!plan) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Plan "${id}" not found or unauthorized.` },
        });
        return;
      }

      const auth: AuthenticationContext = {
        userId,
        sessionId: (req.user as any)?.sessionId || `sess_${userId}`,
        roles: (req.user as any)?.roles || ['user'],
        permissions: (req.user as any)?.permissions || ['*'],
        workspaceId: plan.workspaceId,
      };

      const result = planValidator.validate(plan, auth);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      if (next) {
        next(err);
      } else {
        res.status(500).json({ success: false, error: (err as Error).message });
      }
    }
  }

  public async cancelPlan(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_ID', message: 'Missing plan ID.' },
        });
        return;
      }

      const plan = await planRepository.findById(id, userId);
      if (!plan) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Plan "${id}" not found or unauthorized.` },
        });
        return;
      }

      const cancelled = await planRepository.updateStatus(id, 'CANCELLED', userId);
      res.status(200).json({
        success: true,
        data: cancelled,
      });
    } catch (err) {
      if (next) {
        next(err);
      } else {
        res.status(500).json({ success: false, error: (err as Error).message });
      }
    }
  }
}

export const planExpressController = new PlanExpressController();
