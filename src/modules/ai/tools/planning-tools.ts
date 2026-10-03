/**
 * AETHER AI — Planning Tools
 * Authoritative tool definitions for generating structured, multi-step action plans.
 * Decomposes complex objectives into validated, topological step sequences.
 */

import type { ToolDefinition, ToolExecutionContext, ToolVerificationResult } from './tool-types.js';
import { toolRegistry } from './tool-registry.js';
import { planningEngine } from '../planning/planning-engine.js';

// ─── Generate Plan Tool ──────────────────────────────────────────────────────

export interface GeneratePlanInput extends Record<string, unknown> {
  readonly objective: string;
  readonly projectId?: string;
  readonly mode?: 'sequential' | 'parallel' | 'conditional';
}

export interface GeneratedPlanStepSummary {
  readonly order: number;
  readonly toolName: string;
  readonly description: string;
  readonly riskLevel?: string;
}

export interface GeneratePlanOutput {
  readonly planId: string;
  readonly objective: string;
  readonly mode: string;
  readonly stepsCount: number;
  readonly steps: readonly GeneratedPlanStepSummary[];
  readonly createdAt: string;
}

export const generatePlanTool: ToolDefinition<GeneratePlanInput, GeneratePlanOutput> = {
  id: 'tool_generate_plan',
  name: 'generate_plan',
  description:
    'Generates a validated, multi-step execution plan from an objective statement or prompt.',
  category: 'analysis',
  riskLevel: 'READ_ONLY',
  inputSchema: {
    type: 'object',
    properties: {
      objective: {
        type: 'string',
        description: 'The primary goal or objective to decompose into actionable steps',
        minLength: 3,
        maxLength: 2000,
      },
      projectId: {
        type: 'string',
        description: 'Optional project ID to associate context with the plan',
      },
      mode: {
        type: 'string',
        enum: ['sequential', 'parallel', 'conditional'],
        description: 'Plan execution mode (defaults to sequential)',
      },
    },
    required: ['objective'],
  },
  requiredPermissions: [],
  handler: async (
    input: GeneratePlanInput,
    context: ToolExecutionContext,
  ): Promise<GeneratePlanOutput> => {
    const plan = await planningEngine.createPlan(input.objective, context.auth, {
      mode: input.mode,
      context: { projectId: input.projectId } as any,
    });

    const stepSummaries: GeneratedPlanStepSummary[] = plan.steps.map((s) => ({
      order: s.stepNumber ?? (s as any).order ?? 1,
      toolName: s.toolName || 'custom_step',
      description: s.description,
      riskLevel: s.riskLevel,
    }));

    const planId = plan.planId || (plan as any).id || 'plan_' + Date.now();
    return {
      planId,
      objective: plan.objective,
      mode: plan.executionMode || (plan as any).mode || 'sequential',
      stepsCount: plan.steps.length,
      steps: stepSummaries,
      createdAt: new Date(plan.createdAt || Date.now()).toISOString(),
    };
  },
  verify: async (output: GeneratePlanOutput): Promise<ToolVerificationResult> => {
    if (!output || !output.planId) {
      return {
        verified: false,
        error: 'Generated plan failed verification: invalid plan ID or step structure.',
      };
    }
    return {
      verified: true,
      details: `Generated plan "${output.planId}" verified with ${output.stepsCount} steps.`,
      verifiedObject: output,
    };
  },
};

// ─── All Planning Tools ──────────────────────────────────────────────────────

export const planningTools = [generatePlanTool] as const;

// Auto-register tools on load
for (const tool of planningTools) {
  try {
    if (!toolRegistry.has(tool.name)) {
      toolRegistry.register(tool as any);
    }
  } catch {
    // Already registered
  }
}
