/**
 * AETHER AI — Plan Handoff Contract
 * Prepares a fully validated AgentPlan for handoff to Prompt 8's autonomous execution loop.
 * Strictly adheres to architectural boundary:
 * Prompt 7 prepares, validates, and freezes the plan; Prompt 8 consumes and executes it.
 */

import { createHash } from 'crypto';
import type { AgentPlan, AgentPlanStep, PlanGoal } from './planning-types.js';
import type { AuthenticationContext } from '../tools/tool-types.js';
import type { IPlanRepository } from './plan-repository.js';
import type { IPlanValidator } from './plan-validator.js';

export interface ValidatedHandoffStep {
  readonly stepId: string;
  readonly order: number;
  readonly title: string;
  readonly description: string;
  readonly toolName?: string;
  readonly toolVersion?: string;
  readonly validatedInput?: Record<string, unknown>;
  readonly dependencies: readonly string[];
  readonly expectedOutcome?: string;
  readonly requiresConfirmation: boolean;
  readonly isHighImpact: boolean;
}

export interface PlanHandoffPayload {
  readonly handoffId: string;
  readonly planId: string;
  readonly version: number;
  readonly planHash: string;
  readonly correlationId: string;
  readonly goal: PlanGoal;
  readonly executionContext: {
    readonly userId: string;
    readonly workspaceId?: string;
    readonly projectId?: string;
    readonly conversationId?: string;
    readonly authContext?: AuthenticationContext;
  };
  readonly auth?: AuthenticationContext;
  readonly steps: readonly ValidatedHandoffStep[];
  readonly topologicalStepIds?: readonly string[];
  readonly totalSteps: number;
  readonly requiresUserConfirmation: boolean;
  readonly confirmationStepsCount: number;
  readonly status: 'READY' | 'HANDED_OFF';
  readonly handedOffAt: string;
  readonly handoffTimestamp?: string;
}

export class PlanHandoffService {
  constructor(
    private readonly repository?: IPlanRepository,
    private readonly validator?: IPlanValidator,
  ) {}

  /**
   * Prepares and seals a validated plan for handoff to Prompt 8.
   */
  public async prepareHandoff(
    planOrId: AgentPlan | string,
    authContext?: AuthenticationContext,
  ): Promise<PlanHandoffPayload> {
    let plan: AgentPlan;
    if (typeof planOrId === 'string') {
      if (!this.repository) {
        throw new Error(`PlanRepository is required to resolve planId "${planOrId}".`);
      }
      const found = await this.repository.findById(planOrId, authContext?.userId, authContext?.workspaceId);
      if (!found) {
        throw new Error(`Plan "${planOrId}" not found or unauthorized.`);
      }
      plan = found;
    } else {
      plan = planOrId;
    }

    if (this.validator) {
      const validation = this.validator.validate(plan, authContext);
      if (!validation.valid) {
        throw new Error(`Cannot hand off plan: ${validation.errors.join('; ')}`);
      }
    }

    if (plan.status !== 'VALID' && plan.status !== 'READY') {
      throw new Error(
        `Cannot prepare handoff for plan with status "${plan.status}". Plan must be VALID or READY.`,
      );
    }

    const handoffId = `handoff_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const confirmationSteps: AgentPlanStep[] = [];

    const orderedSteps: ValidatedHandoffStep[] = plan.steps
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((s) => {
        const needsConfirmation = Boolean(s.requiresConfirmation || s.riskLevel === 'HIGH_IMPACT');
        if (needsConfirmation) {
          confirmationSteps.push(s);
        }

        return {
          stepId: s.id,
          order: s.order,
          title: s.title,
          description: s.description,
          toolName: s.toolName,
          toolVersion: s.toolVersion ?? '1.0.0',
          validatedInput: s.input ? { ...s.input } : undefined,
          dependencies: [...s.dependencies],
          expectedOutcome: s.expectedOutcome,
          requiresConfirmation: needsConfirmation,
          isHighImpact: s.riskLevel === 'HIGH_IMPACT' || needsConfirmation,
        };
      });

    // Mark plan status as HANDED_OFF
    plan.status = 'HANDED_OFF';
    plan.updatedAt = new Date().toISOString();
    if (this.repository) {
      await this.repository.savePlan(plan);
    }

    const now = new Date().toISOString();

    let computedHash = plan.planHash;
    if (!computedHash || computedHash === 'unhashed') {
      const hashPayload = JSON.stringify({
        id: plan.id,
        version: plan.version,
        userId: plan.userId,
        goal: plan.goal,
        steps: orderedSteps.map((s) => ({ id: s.stepId, order: s.order, toolName: s.toolName })),
      });
      computedHash = createHash('sha256').update(hashPayload).digest('hex');
      plan.planHash = computedHash;
    }

    return {
      handoffId,
      planId: plan.id,
      version: plan.version,
      planHash: computedHash,
      correlationId: plan.correlationId,
      goal: plan.goal,
      executionContext: {
        userId: plan.userId,
        workspaceId: plan.workspaceId,
        projectId: plan.projectId,
        conversationId: plan.conversationId,
        authContext,
      },
      auth: authContext,
      steps: orderedSteps,
      topologicalStepIds: orderedSteps.map((s) => s.stepId),
      totalSteps: orderedSteps.length,
      requiresUserConfirmation: confirmationSteps.length > 0,
      confirmationStepsCount: confirmationSteps.length,
      status: 'HANDED_OFF',
      handedOffAt: now,
      handoffTimestamp: now,
    };
  }
}

export const planHandoffService = new PlanHandoffService();
