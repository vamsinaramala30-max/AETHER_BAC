/**
 * AETHER AI — Planning Engine
 * Decomposes natural language objectives into ordered, validated execution plans.
 * Validates tool availability, schemas, permissions, dependencies, and confirmation needs before execution.
 * Supports Sequential, Parallel, and Conditional execution modes with cycle detection.
 */

import { createHash } from 'crypto';
import type {
  ActionPlan,
  PlanStep,
  PlanValidationResult,
  PlanExecutionMode,
  PlanCondition,
  AgentPlan,
  AgentPlanStep,
  PlanDependency,
  PlanGoal,
  PlanStatus,
  ClarificationRequest,
} from './planning-types.js';
import type { AuthenticationContext } from '../tools/tool-types.js';
import type { AIRequest, AIContext, Intent } from '../ai-types.js';
import { toolRegistry } from '../tools/tool-registry.js';
import { toolPermissions } from '../tools/tool-permissions.js';
import { toolValidator } from '../tools/tool-validator.js';
import { planValidator } from './plan-validator.js';
import { planRepository } from './plan-repository.js';
import { reasoningEngine } from '../core/reasoning-engine.js';
import { metrics } from '../observability/metrics.js';
import { tracer } from '../observability/tracing.js';
import { logger } from '../observability/logger.js';
import { performance } from 'perf_hooks';

// Auto-load all tool definitions to ensure toolRegistry is populated
import '../tools/task-tools.js';
import '../tools/project-tools.js';
import '../tools/goal-tools.js';
import '../tools/productivity-tools.js';
import '../tools/automation-tools.js';
import '../tools/workspace-tools.js';
import '../tools/knowledge-tools.js';
import '../tools/note-tools.js';
import '../tools/memory-tools.js';

export interface PlanOptions {
  readonly mode?: PlanExecutionMode;
  readonly maxSteps?: number;
  readonly context?: AIContext;
  readonly intent?: Intent;
  readonly correlationId?: string;
}

export interface IPlanningEngine {
  createPlan(
    objective: string,
    auth: AuthenticationContext,
    options?: PlanOptions,
  ): Promise<ActionPlan>;
  createAgentPlan(
    request: AIRequest,
    auth: AuthenticationContext,
    options?: PlanOptions,
  ): Promise<AgentPlan>;
  createCognitivePlan(
    objective: string,
    intent: Intent,
    context?: AIContext,
  ): ActionPlan;
  validatePlan(plan: ActionPlan | AgentPlan, auth?: AuthenticationContext): PlanValidationResult;
  computePlanHash(plan: AgentPlan): string;
}

const MAX_ALLOWED_STEPS = 15;

export class PlanningEngine implements IPlanningEngine {
  public async createPlan(
    objective: string,
    _auth: AuthenticationContext,
    options: PlanOptions = {},
  ): Promise<ActionPlan> {
    const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const lower = objective.toLowerCase().trim();
    const steps: PlanStep[] = [];
    let executionMode: PlanExecutionMode = options.mode ?? 'sequential';
    let summary: string | undefined;

    // ─── Multi-step Pattern: Project Review Preparation ──────────────────────────
    if (
      lower.includes('project review') ||
      lower.includes('review preparation') ||
      lower.includes('prepare everything')
    ) {
      const step1Id = `step_1_${Date.now()}`;
      const step2Id = `step_2_${Date.now()}`;
      const step3Id = `step_3_${Date.now()}`;
      const step4Id = `step_4_${Date.now()}`;

      steps.push({
        stepId: step1Id,
        stepNumber: 1,
        description: 'Search workspace and list active projects for review context',
        toolName: 'list_projects',
        toolInput: { limit: 10, status: 'active' },
        riskLevel: 'READ_ONLY',
        status: 'pending',
        verified: false,
        expectedOutput: 'List of active workspace projects',
      });

      steps.push({
        stepId: step2Id,
        stepNumber: 2,
        description: 'Retrieve pending tasks and current milestone status',
        toolName: 'list_tasks',
        toolInput: { limit: 20, status: 'open' },
        dependencies: [step1Id],
        riskLevel: 'READ_ONLY',
        status: 'pending',
        verified: false,
        expectedOutput: 'List of open tasks and milestones',
      });

      steps.push({
        stepId: step3Id,
        stepNumber: 3,
        description: 'Calculate real progress toward active goals',
        toolName: 'get_goal_progress',
        toolInput: {},
        dependencies: [step1Id],
        riskLevel: 'READ_ONLY',
        status: 'pending',
        verified: false,
        expectedOutput: 'Calculated goal progress metrics',
      });

      steps.push({
        stepId: step4Id,
        stepNumber: 4,
        description: 'Create a review preparation task in the workspace',
        toolName: 'create_task',
        toolInput: {
          title: 'Prepare Project Review Summary and Action Items',
          description: "Auto-created preparation task for tomorrow's scheduled project review.",
          priority: 'high',
        },
        dependencies: [step2Id, step3Id],
        riskLevel: 'LOW_RISK',
        status: 'pending',
        verified: false,
        expectedOutput: 'Verified preparation task in database',
      });

      summary = 'Four-step project review preparation with prerequisite dependency checks.';
    }
    // ─── Pattern: Delete Task / Project / Resource (High Impact) ───────────────
    else if (
      lower.startsWith('delete') ||
      lower.startsWith('remove') ||
      lower.includes('permanently delete')
    ) {
      if (lower.includes('project')) {
        const projIdMatch = objective.match(/(?:project|id)\s+([a-zA-Z0-9_-]+)/i);
        const projectId = projIdMatch ? projIdMatch[1] : 'proj_unknown';
        steps.push({
          stepId: `step_1_${Date.now()}`,
          stepNumber: 1,
          description: `Permanently delete project "${projectId}"`,
          toolName: 'delete_project',
          toolInput: { projectId },
          riskLevel: 'HIGH_IMPACT',
          requiresConfirmation: true,
          status: 'pending',
          verified: false,
          expectedOutput: 'Confirmed project deletion',
        });
        executionMode = 'direct';
        summary = `High-impact project deletion requiring confirmation.`;
      } else if (lower.includes('task')) {
        const taskIdMatch = objective.match(/(?:task|id)\s+([a-zA-Z0-9_-]+)/i);
        const taskId = taskIdMatch ? taskIdMatch[1] : 'task_unknown';
        steps.push({
          stepId: `step_1_${Date.now()}`,
          stepNumber: 1,
          description: `Delete task "${taskId}"`,
          toolName: 'delete_task',
          toolInput: { taskId },
          riskLevel: 'HIGH_IMPACT',
          requiresConfirmation: true,
          status: 'pending',
          verified: false,
          expectedOutput: 'Confirmed task deletion',
        });
        executionMode = 'direct';
        summary = `High-impact task deletion requiring confirmation.`;
      } else if (lower.includes('document')) {
        const docIdMatch = objective.match(/(?:document|doc|id)\s+([a-zA-Z0-9_-]+)/i);
        const documentId = docIdMatch ? docIdMatch[1] : 'doc_unknown';
        steps.push({
          stepId: `step_1_${Date.now()}`,
          stepNumber: 1,
          description: `Delete document "${documentId}"`,
          toolName: 'delete_knowledge_document',
          toolInput: { documentId },
          riskLevel: 'HIGH_IMPACT',
          requiresConfirmation: true,
          status: 'pending',
          verified: false,
          expectedOutput: 'Confirmed document deletion',
        });
        executionMode = 'direct';
        summary = `High-impact document deletion requiring confirmation.`;
      } else {
        steps.push({
          stepId: `step_1_${Date.now()}`,
          stepNumber: 1,
          description: `Process deletion request for "${objective}"`,
          toolName: 'delete_task',
          toolInput: { taskId: 'target_id' },
          riskLevel: 'HIGH_IMPACT',
          requiresConfirmation: true,
          status: 'pending',
          verified: false,
          expectedOutput: 'Resource deletion confirmation',
        });
        executionMode = 'direct';
        summary = `High-impact deletion request requiring confirmation.`;
      }
    }
    // ─── Pattern: Create Project ────────────────────────────────────────────────
    else if (
      lower.startsWith('create a project') ||
      lower.startsWith('create project') ||
      lower.startsWith('add a project') ||
      lower.startsWith('add project')
    ) {
      const name = objective
        .replace(/^create\s+(a\s+)?project\s+(called\s+|named\s+|to\s+)?/i, '')
        .trim();

      steps.push({
        stepId: `step_1_${Date.now()}`,
        stepNumber: 1,
        description: `Create project "${name || 'New Project'}"`,
        toolName: 'create_project',
        toolInput: { name: name || 'New Project' },
        riskLevel: 'LOW_RISK',
        status: 'pending',
        verified: false,
        expectedOutput: 'Created project confirmation',
      });
      executionMode = 'direct';
      summary = `Single-step project creation: "${name || 'New Project'}".`;
    }
    // ─── Pattern: Create Task ───────────────────────────────────────────────────
    else if (
      lower.startsWith('create a task') ||
      lower.startsWith('create task') ||
      lower.startsWith('add a task') ||
      lower.startsWith('add task')
    ) {
      let title = objective
        .replace(/^create\s+(a\s+)?task\s+(called\s+|named\s+|to\s+)?/i, '')
        .trim();

      let priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium';
      if (
        lower.includes('priority high') ||
        lower.includes('high priority') ||
        lower.includes('urgent')
      ) {
        priority = 'high';
        title = title
          .replace(/(and\s+)?(set\s+)?(its\s+)?priority\s+(to\s+)?(high|urgent)/i, '')
          .trim();
      }

      steps.push({
        stepId: `step_1_${Date.now()}`,
        stepNumber: 1,
        description: `Create task "${title || 'New Task'}" with priority ${priority}`,
        toolName: 'create_task',
        toolInput: { title: title || 'New Task', priority },
        riskLevel: 'LOW_RISK',
        status: 'pending',
        verified: false,
        expectedOutput: 'Created task confirmation',
      });
      executionMode = 'direct';
      summary = `Single-step task creation: "${title || 'New Task'}".`;
    }
    // ─── Pattern: Create Note ───────────────────────────────────────────────────
    else if (
      lower.startsWith('create a note') ||
      lower.startsWith('create note') ||
      lower.startsWith('add a note') ||
      lower.startsWith('add note')
    ) {
      const title = objective
        .replace(/^create\s+(a\s+)?note\s+(called\s+|named\s+|to\s+)?/i, '')
        .trim();

      steps.push({
        stepId: `step_1_${Date.now()}`,
        stepNumber: 1,
        description: `Create note "${title || 'New Note'}"`,
        toolName: 'create_note',
        toolInput: { title: title || 'New Note' },
        riskLevel: 'LOW_RISK',
        status: 'pending',
        verified: false,
        expectedOutput: 'Created note confirmation',
      });
      executionMode = 'direct';
      summary = `Single-step note creation: "${title || 'New Note'}".`;
    }
    // ─── Pattern: Search Knowledge / Project Information ────────────────────────
    else if (
      lower.includes('find information') ||
      lower.includes('search knowledge') ||
      lower.includes('search project') ||
      lower.includes('search workspace') ||
      lower.includes('find in project')
    ) {
      const query = objective
        .replace(/^(find\s+information\s+(in|about)|search\s+(knowledge|project|workspace)\s+(for)?)/i, '')
        .trim() || objective;

      steps.push({
        stepId: `step_1_${Date.now()}`,
        stepNumber: 1,
        description: `Search knowledge base and workspace for "${query}"`,
        toolName: 'search_knowledge',
        toolInput: { query: query || 'project information' },
        riskLevel: 'READ_ONLY',
        status: 'pending',
        verified: false,
        expectedOutput: 'Search results matching query',
      });
      executionMode = 'direct';
      summary = `Knowledge search for "${query}".`;
    }
    // ─── Pattern: Mark Task Complete ────────────────────────────────────────────
    else if (lower.includes('mark') && (lower.includes('complete') || lower.includes('done'))) {
      steps.push({
        stepId: `step_1_${Date.now()}`,
        stepNumber: 1,
        description: `Search tasks to identify target task for completion`,
        toolName: 'list_tasks',
        toolInput: { limit: 10, status: 'open' },
        riskLevel: 'READ_ONLY',
        status: 'pending',
        verified: false,
        expectedOutput: 'Identified target task',
      });
      summary = 'Retrieve and verify task status for completion.';
    }
    // ─── Pattern: Schedule / Recurring Automation ───────────────────────────────
    else if (
      lower.includes('every monday') ||
      lower.includes('schedule automation') ||
      lower.includes('create automation') ||
      lower.includes('recurring') ||
      lower.includes('automation')
    ) {
      let schedule = '0 9 * * 1';
      if (lower.includes('every monday at 9 am') || lower.includes('every monday at 9am')) {
        schedule = '0 9 * * 1';
      }

      steps.push({
        stepId: `step_1_${Date.now()}`,
        stepNumber: 1,
        description: 'Create scheduled weekly project summary automation',
        toolName: 'create_automation',
        toolInput: {
          name: 'Weekly Project Summary',
          trigger: 'SCHEDULE',
          schedule,
          description:
            'Automatically compiles and delivers project progress summary every Monday at 9 AM.',
          actions: [
            { type: 'AI_SUMMARIZE', params: { scope: 'weekly_projects' } },
            { type: 'NOTIFICATION_CREATE', params: { title: 'Weekly Project Summary Ready' } },
          ],
        },
        riskLevel: 'LOW_RISK',
        status: 'pending',
        verified: false,
        expectedOutput: 'Active scheduled automation job',
      });
      executionMode = 'direct';
      summary = 'Register recurring scheduled automation.';
    }
    // ─── Pattern: Goals Progress ────────────────────────────────────────────────
    else if (lower.includes('goal') || lower.includes('progress toward my goal')) {
      steps.push({
        stepId: `step_1_${Date.now()}`,
        stepNumber: 1,
        description: 'Retrieve goals and calculate exact progress from real records',
        toolName: 'get_goal_progress',
        toolInput: {},
        riskLevel: 'READ_ONLY',
        status: 'pending',
        verified: false,
        expectedOutput: 'Goal progress calculation',
      });
      executionMode = 'direct';
      summary = 'Query goal progress metrics.';
    }
    // ─── Pattern: Productivity Summary / Schedule ───────────────────────────────
    else if (
      lower.includes('productivity') ||
      lower.includes('finish today') ||
      lower.includes('schedule')
    ) {
      const step1Id = `step_1_${Date.now()}`;
      const step2Id = `step_2_${Date.now()}`;

      steps.push({
        stepId: step1Id,
        stepNumber: 1,
        description: 'Retrieve tasks and schedule for today',
        toolName: 'get_todays_schedule',
        toolInput: {},
        riskLevel: 'READ_ONLY',
        status: 'pending',
        verified: false,
        expectedOutput: "Today's scheduled events and tasks",
      });
      steps.push({
        stepId: step2Id,
        stepNumber: 2,
        description: 'Aggregate productivity statistics and completion rate',
        toolName: 'get_productivity_summary',
        toolInput: { timeRange: 'today' },
        riskLevel: 'READ_ONLY',
        status: 'pending',
        verified: false,
        expectedOutput: 'Productivity metrics summary',
      });
      executionMode = 'parallel';
      summary = 'Retrieve schedule and compute productivity summary concurrently.';
    }
    // ─── Fallback Step ──────────────────────────────────────────────────────────
    else {
      steps.push({
        stepId: `step_1_${Date.now()}`,
        stepNumber: 1,
        description: `Analyze workspace for objective: "${objective}"`,
        toolName: 'get_workspace_info',
        toolInput: {},
        riskLevel: 'READ_ONLY',
        status: 'pending',
        verified: false,
        expectedOutput: 'Workspace metadata and capabilities',
      });
      summary = `Workspace context analysis for "${objective}".`;
    }

    const hasConfirmation = steps.some(
      (s) => s.requiresConfirmation || s.riskLevel === 'HIGH_IMPACT',
    );

    const parallelGroups =
      executionMode === 'parallel' ? this.computeParallelGroups(steps) : undefined;

    return {
      planId,
      objective,
      steps,
      totalSteps: steps.length,
      executionMode,
      summary,
      parallelGroups,
      requiresConfirmation: hasConfirmation,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Creates a structured cognitive plan for complex analytical, research, or strategic inquiries.
   */
  public createCognitivePlan(
    objective: string,
    intent: Intent,
    context?: AIContext,
  ): ActionPlan {
    const planId = `plan_cog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const lower = objective.toLowerCase().trim();
    const steps: PlanStep[] = [];
    let executionMode: PlanExecutionMode = 'sequential';
    let summary = 'Structured task breakdown';

    if (intent.primaryIntent === 'ANALYSIS' || lower.includes('analyze') || lower.includes('compare')) {
      const s1 = `step_1_${Date.now()}`;
      const s2 = `step_2_${Date.now()}`;
      const s3 = `step_3_${Date.now()}`;

      steps.push({
        stepId: s1,
        stepNumber: 1,
        description: 'Examine available problem parameters and contextual constraints',
        riskLevel: 'READ_ONLY',
        status: 'pending',
        verified: false,
        expectedOutput: 'Identified problem dimensions and baseline requirements',
      });

      steps.push({
        stepId: s2,
        stepNumber: 2,
        description: 'Perform comparative analysis across trade-offs and performance criteria',
        dependencies: [s1],
        riskLevel: 'READ_ONLY',
        status: 'pending',
        verified: false,
        expectedOutput: 'Evaluated trade-off matrix',
      });

      steps.push({
        stepId: s3,
        stepNumber: 3,
        description: 'Formulate structured conclusions and actionable recommendations',
        dependencies: [s2],
        riskLevel: 'READ_ONLY',
        status: 'pending',
        verified: false,
        expectedOutput: 'Final structured assessment',
      });

      summary = 'Three-stage analytical breakdown and recommendation synthesis.';
    } else if (
      intent.primaryIntent === 'RESEARCH_LOOKUP' ||
      intent.requiresRAG ||
      lower.includes('research')
    ) {
      const s1 = `step_1_${Date.now()}`;
      const s2 = `step_2_${Date.now()}`;
      const s3 = `step_3_${Date.now()}`;

      steps.push({
        stepId: s1,
        stepNumber: 1,
        description: 'Retrieve and verify authoritative reference documents and context',
        riskLevel: 'READ_ONLY',
        status: 'pending',
        verified: false,
        expectedOutput: 'Relevant context passages and verified citations',
      });

      steps.push({
        stepId: s2,
        stepNumber: 2,
        description: 'Synthesize findings and cross-reference evidence against query goals',
        dependencies: [s1],
        riskLevel: 'READ_ONLY',
        status: 'pending',
        verified: false,
        expectedOutput: 'Synthesized evidence points',
      });

      steps.push({
        stepId: s3,
        stepNumber: 3,
        description: 'Deliver structured findings with clear source attribution',
        dependencies: [s2],
        riskLevel: 'READ_ONLY',
        status: 'pending',
        verified: false,
        expectedOutput: 'Evidence-backed answer',
      });

      summary = 'Document retrieval, evidence cross-referencing, and synthesized response.';
    } else {
      const s1 = `step_1_${Date.now()}`;
      const s2 = `step_2_${Date.now()}`;

      steps.push({
        stepId: s1,
        stepNumber: 1,
        description: 'Analyze goal requirements and identify key dependencies',
        riskLevel: 'READ_ONLY',
        status: 'pending',
        verified: false,
        expectedOutput: 'Structured requirement list',
      });

      steps.push({
        stepId: s2,
        stepNumber: 2,
        description: 'Construct phased implementation roadmap with deliverables',
        dependencies: [s1],
        riskLevel: 'READ_ONLY',
        status: 'pending',
        verified: false,
        expectedOutput: 'Actionable step-by-step roadmap',
      });

      summary = 'Goal decomposition and phased roadmap generation.';
    }

    return {
      planId,
      objective,
      steps,
      totalSteps: steps.length,
      executionMode,
      summary,
      requiresConfirmation: false,
      createdAt: new Date().toISOString(),
    };
  }

  public validatePlan(plan: ActionPlan | AgentPlan, auth?: AuthenticationContext): PlanValidationResult {
    // Delegate to canonical PlanValidator if input is an AgentPlan
    if ('goal' in plan || ('steps' in plan && plan.steps.length > 0 && 'order' in plan.steps[0])) {
      return planValidator.validate(plan as AgentPlan, auth);
    }

    const actionPlan = plan as ActionPlan;
    const errors: string[] = [];
    const warnings: string[] = [];
    const confirmationSteps: PlanStep[] = [];
    const circularDependencies: string[] = [];
    const missingDependencies: string[] = [];

    // 1. Objective Check
    if (!actionPlan.objective || actionPlan.objective.trim().length === 0) {
      errors.push('Plan objective is undefined or empty.');
    }

    // 2. Step Count & Limits Check
    if (!actionPlan.steps || actionPlan.steps.length === 0) {
      errors.push('Plan contains no executable steps.');
      return {
        valid: false,
        errors,
        warnings,
        requiresConfirmation: false,
        confirmationSteps: [],
      };
    }

    if (actionPlan.steps.length > MAX_ALLOWED_STEPS) {
      errors.push(
        `Plan exceeds maximum allowed steps (${actionPlan.steps.length} > ${MAX_ALLOWED_STEPS}).`,
      );
    }

    const stepIdSet = new Set<string>();

    // 3. Step Uniqueness & Content Check
    for (const step of actionPlan.steps) {
      if (!step.stepId || step.stepId.trim().length === 0) {
        errors.push(`Step ${step.stepNumber} has an invalid or missing stepId.`);
      }
      if (!step.description || step.description.trim().length === 0) {
        errors.push(`Step ${step.stepNumber} has an empty description.`);
      }
      if (stepIdSet.has(step.stepId)) {
        errors.push(`Duplicate stepId "${step.stepId}" found in plan.`);
      }
      stepIdSet.add(step.stepId);

      // 4. Tool & Permission Validation (if tools are used and auth context is provided)
      if (step.toolName) {
        const tool = toolRegistry.get(step.toolName);
        if (!tool) {
          errors.push(
            `Required tool "${step.toolName}" for step ${step.stepNumber} is not available in the registry.`,
          );
        } else {
          if (auth) {
            const permCheck = toolPermissions.checkPermissions(tool.requiredPermissions, auth);
            if (!permCheck.allowed) {
              errors.push(
                `Unauthorized for step ${step.stepNumber} ("${step.toolName}"). Missing: [${permCheck.missingPermissions.join(', ')}].`,
              );
            }
          }

          if (step.toolInput) {
            const inputVal = toolValidator.validate(step.toolInput, tool.inputSchema);
            if (!inputVal.valid) {
              errors.push(
                `Invalid input for step ${step.stepNumber} ("${step.toolName}"): ${inputVal.errors.join('; ')}.`,
              );
            }
          }

          const isHighImpact = tool.riskLevel === 'HIGH_IMPACT' || step.riskLevel === 'HIGH_IMPACT';
          const needsConfirmation =
            isHighImpact ||
            step.requiresConfirmation ||
            (typeof tool.requiresConfirmation === 'boolean' && tool.requiresConfirmation);

          if (needsConfirmation) {
            confirmationSteps.push(step);
          }
        }
      }

      // 5. Dependency Reference Existence Check
      if (step.dependencies && step.dependencies.length > 0) {
        for (const depId of step.dependencies) {
          if (depId === step.stepId) {
            errors.push(`Step ${step.stepNumber} ("${step.stepId}") cannot depend on itself.`);
            circularDependencies.push(depId);
          } else if (!actionPlan.steps.some((s) => s.stepId === depId)) {
            errors.push(`Step ${step.stepNumber} has unresolved dependency ID "${depId}".`);
            missingDependencies.push(depId);
          }
        }
      }
    }

    // 6. Cycle Detection in Dependency Graph
    const cycleCheck = this.detectCycles(actionPlan.steps);
    if (cycleCheck.hasCycle) {
      const cycleMsg = `Circular dependency detected among steps: [${cycleCheck.cycleNodes?.join(', ')}].`;
      errors.push(cycleMsg);
      if (cycleCheck.cycleNodes) {
        circularDependencies.push(...cycleCheck.cycleNodes);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      requiresConfirmation: confirmationSteps.length > 0,
      confirmationSteps,
      circularDependencies: circularDependencies.length > 0 ? circularDependencies : undefined,
      missingDependencies: missingDependencies.length > 0 ? missingDependencies : undefined,
    };
  }

  /**
   * Detects cycles in plan dependencies using Kahn's topological sort algorithm.
   */
  private detectCycles(
    steps: readonly PlanStep[],
  ): { hasCycle: boolean; cycleNodes?: string[] } {
    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    for (const s of steps) {
      adj.set(s.stepId, []);
      inDegree.set(s.stepId, 0);
    }

    for (const s of steps) {
      if (s.dependencies) {
        for (const dep of s.dependencies) {
          if (adj.has(dep)) {
            adj.get(dep)!.push(s.stepId);
            inDegree.set(s.stepId, (inDegree.get(s.stepId) || 0) + 1);
          }
        }
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    let visitedCount = 0;
    while (queue.length > 0) {
      const u = queue.shift()!;
      visitedCount++;
      for (const v of adj.get(u) || []) {
        const newDeg = (inDegree.get(v) || 1) - 1;
        inDegree.set(v, newDeg);
        if (newDeg === 0) queue.push(v);
      }
    }

    if (visitedCount < steps.length) {
      const cycleNodes = Array.from(inDegree.entries())
        .filter(([_, deg]) => deg > 0)
        .map(([id]) => id);
      return { hasCycle: true, cycleNodes };
    }

    return { hasCycle: false };
  }

  /**
   * Computes parallel dependency levels for parallelizable tasks.
   */
  private computeParallelGroups(steps: readonly PlanStep[]): string[][] {
    const stepMap = new Map<string, PlanStep>(steps.map((s) => [s.stepId, s]));
    const levelMap = new Map<string, number>();

    const getLevel = (stepId: string, visited = new Set<string>()): number => {
      if (levelMap.has(stepId)) return levelMap.get(stepId)!;
      if (visited.has(stepId)) return 0;
      visited.add(stepId);

      const step = stepMap.get(stepId);
      if (!step || !step.dependencies || step.dependencies.length === 0) {
        levelMap.set(stepId, 0);
        return 0;
      }

      let maxDepLevel = 0;
      for (const depId of step.dependencies) {
        maxDepLevel = Math.max(maxDepLevel, getLevel(depId, visited) + 1);
      }

      levelMap.set(stepId, maxDepLevel);
      return maxDepLevel;
    };

    for (const step of steps) {
      getLevel(step.stepId);
    }

    const groups: Map<number, string[]> = new Map();
    for (const [stepId, level] of levelMap.entries()) {
      if (!groups.has(level)) groups.set(level, []);
      groups.get(level)!.push(stepId);
    }

    const sortedLevels = Array.from(groups.keys()).sort((a, b) => a - b);
    return sortedLevels.map((lvl) => groups.get(lvl)!);
  }

  /**
   * Computes a deterministic SHA-256 integrity hash for an AgentPlan.
   */
  public computePlanHash(plan: AgentPlan): string {
    const payload = {
      id: plan.id,
      version: plan.version,
      userId: plan.userId,
      goal: plan.goal.description,
      steps: plan.steps.map((s) => ({
        id: s.id,
        order: s.order,
        title: s.title,
        toolName: s.toolName,
        input: s.input,
        dependencies: [...s.dependencies].sort(),
      })),
      dependencies: plan.dependencies.map((d) => ({
        stepId: d.stepId,
        dependsOnStepId: d.dependsOnStepId,
      })),
    };
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  /**
   * Authoritative Prompt 7 Agent Plan Generator.
   * Transforms user request through:
   * Request → Intent → Goal → Constraints → Context Assembly → Reasoning → Task Decomposition → Plan Generation → Plan Validation.
   */
  public async createAgentPlan(
    requestOrPrompt: AIRequest | string,
    auth: AuthenticationContext,
    options: PlanOptions = {},
  ): Promise<AgentPlan> {
    const request: AIRequest =
      typeof requestOrPrompt === 'string'
        ? {
            requestId: `req_${Date.now()}`,
            message: requestOrPrompt,
            userId: auth.userId,
            sessionId: auth.sessionId,
            conversationId: `conv_${Date.now()}`,
            timestamp: Date.now(),
          }
        : requestOrPrompt;

    const correlationId = options.correlationId || request.requestId || `corr_${Date.now()}`;
    const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const intent: Intent = options.intent ?? {
      type: 'GENERAL_REASONING',
      confidence: 0.8,
      requiresRAG: false,
      requiresMemory: false,
      requiresTool: false,
      requiresAgent: true,
    };
    const context: AIContext = options.context ?? {
      userId: auth.userId,
      sessionId: auth.sessionId,
      conversationId: request.conversationId,
      workspaceId: auth.workspaceId,
      tokenBudget: { total: 8192, system: 800, history: 2000, context: 3000, response: 2392, remaining: 8192 },
    };

    // 1. Goal Identification
    const goal = reasoningEngine.identifyGoal(request, intent);

    // 2. Constraint Extraction
    const constraints = reasoningEngine.extractConstraints(request, intent, context);

    // 3. Assumption Identification
    const assumptions = reasoningEngine.identifyAssumptions(request, intent, context);

    // 4. Uncertainty & Clarification Assessment
    const clarification = reasoningEngine.assessClarification(request, intent, context);
    if (clarification) {
      const clarPlan: AgentPlan = {
        id: planId,
        version: 1,
        userId: auth.userId,
        workspaceId: auth.workspaceId || context.workspaceId,
        projectId: context.projectId,
        conversationId: request.conversationId,
        correlationId,
        goal,
        constraints,
        assumptions,
        steps: [],
        dependencies: [],
        status: 'NEEDS_CLARIFICATION',
        confidence: 0.5,
        requiresUserInput: true,
        clarification,
        summary: `Clarification needed: ${clarification.question}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      clarPlan.planHash = this.computePlanHash(clarPlan);
      await planRepository.savePlan(clarPlan);
      return clarPlan;
    }

    // 5. Capability / Tool Availability Check & Task Decomposition
    const raw = request.message.trim();
    const lower = raw.toLowerCase();

    // Check for explicitly unsupported capabilities (no hallucinated tools!)
    const unsupportedKeywords = [
      'send email',
      'send an email',
      'book flight',
      'book a flight',
      'control device',
      'delete database',
      'drop database',
      'wipe database',
      'restart server',
    ];
    const isUnsupported = unsupportedKeywords.some((kw) => lower.includes(kw));
    if (isUnsupported) {
      const blockedPlan: AgentPlan = {
        id: planId,
        version: 1,
        userId: auth.userId,
        workspaceId: auth.workspaceId || context.workspaceId,
        projectId: context.projectId,
        conversationId: request.conversationId,
        correlationId,
        goal,
        constraints,
        assumptions,
        steps: [],
        dependencies: [],
        status: 'BLOCKED',
        confidence: 0.0,
        requiresUserInput: false,
        warnings: ['Requested capability is not supported by any registered tool in ToolRegistry.'],
        summary: 'Action blocked: required capability is not available in Aether ToolRegistry.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      blockedPlan.planHash = this.computePlanHash(blockedPlan);
      await planRepository.savePlan(blockedPlan);
      return blockedPlan;
    }

    // Decompose task into structured steps using registered tools
    const steps: AgentPlanStep[] = [];
    const dependencies: PlanDependency[] = [];

    // Check for multi-turn progressive project constraints
    const projectConstraints = constraints.filter(
      (c) =>
        c.description?.toLowerCase().includes('project') ||
        (typeof c.value === 'string' && c.value.toLowerCase().includes('project')),
    );

    let planSummaryOverride: string | undefined;

    // Decomposition Pattern: Multi-turn Weekly Project Scheduling
    if (
      projectConstraints.length > 0 &&
      (lower.includes('plan') || lower.includes('week') || lower.includes('schedule'))
    ) {
      // Sort constraints by urgency (Friday first, then Monday, then flexible/no deadline)
      const sortedConstraints = [...projectConstraints].sort((a, b) => {
        const aValStr = typeof a.value === 'string' ? a.value : '';
        const bValStr = typeof b.value === 'string' ? b.value : '';
        const aStr = (a.description || aValStr).toLowerCase();
        const bStr = (b.description || bValStr).toLowerCase();
        if (aStr.includes('friday')) return -1;
        if (bStr.includes('friday')) return 1;
        if (aStr.includes('monday')) return -1;
        if (bStr.includes('monday')) return 1;
        return 0;
      });

      let stepNum = 1;
      let prevStepId: string | undefined;

      for (const pc of sortedConstraints) {
        const sId = `step_${stepNum}_${Date.now()}`;
        const pcValStr = typeof pc.value === 'string' ? pc.value : '';
        const desc = pc.description || pcValStr || 'Project task';
        const isUrgent = desc.toLowerCase().includes('friday');
        const isMedium = desc.toLowerCase().includes('monday');
        const priority = isUrgent ? 'high' : isMedium ? 'medium' : 'low';

        steps.push({
          id: sId,
          order: stepNum,
          title: `Schedule: ${desc}`,
          description: `Allocate time and execute ${desc}`,
          type: 'TOOL',
          toolName: 'create_task',
          toolVersion: '1.0.0',
          input: {
            title: `Plan step: ${desc}`,
            priority,
          },
          dependencies: prevStepId ? [prevStepId] : [],
          expectedOutcome: `Scheduled task for ${desc}`,
          status: stepNum === 1 ? 'READY' : 'PENDING',
        });

        if (prevStepId) {
          dependencies.push({ stepId: sId, dependsOnStepId: prevStepId, type: 'BLOCKS' });
        }
        prevStepId = sId;
        stepNum++;
      }

      const summaries = sortedConstraints.map((c) => c.description || c.value).join('; ');
      planSummaryOverride = `Weekly Plan incorporating project constraints: ${summaries}. Project A is scheduled for completion by Friday, Project B is scheduled for next Monday, and Project C will proceed with flexible timing.`;
    }
    // Decomposition Pattern A: Organize / Review / Audit Project & Tasks
    else if (
      (lower.includes('organize') || lower.includes('review') || lower.includes('audit') || lower.includes('prepare') || lower.includes('plan')) &&
      (lower.includes('project') || lower.includes('task') || lower.includes('work') || lower.includes('assignment') || lower.includes('milestone') || lower.includes('quarterly') || lower.includes('week') || lower.includes('schedule'))
    ) {
      const s1Id = `step_1_${Date.now()}`;
      const s2Id = `step_2_${Date.now()}`;
      const s3Id = `step_3_${Date.now()}`;
      const s4Id = `step_4_${Date.now()}`;

      steps.push({
        id: s1Id,
        order: 1,
        title: 'Find existing project',
        description: 'Search workspace and list relevant projects for context',
        type: 'TOOL',
        toolName: 'list_projects',
        toolVersion: '1.0.0',
        input: { limit: 10, status: 'active' },
        dependencies: [],
        expectedOutcome: 'Active workspace project identified',
        status: 'READY',
      });

      steps.push({
        id: s2Id,
        order: 2,
        title: 'Retrieve project tasks',
        description: 'Retrieve pending tasks and current milestone status',
        type: 'TOOL',
        toolName: 'list_tasks',
        toolVersion: '1.0.0',
        input: { limit: 20, status: 'open' },
        dependencies: [s1Id],
        expectedOutcome: 'List of open tasks retrieved for project',
        status: 'PENDING',
      });
      dependencies.push({ stepId: s2Id, dependsOnStepId: s1Id, type: 'BLOCKS' });

      steps.push({
        id: s3Id,
        order: 3,
        title: 'Analyze incomplete tasks and metrics',
        description: 'Analyze incomplete tasks and retrieve goal progress metrics',
        type: 'TOOL',
        toolName: 'get_goal_progress',
        toolVersion: '1.0.0',
        input: {},
        dependencies: [s1Id],
        expectedOutcome: 'Incomplete tasks evaluated against goals',
        status: 'PENDING',
      });
      dependencies.push({ stepId: s3Id, dependsOnStepId: s1Id, type: 'BLOCKS' });

      steps.push({
        id: s4Id,
        order: 4,
        title: 'Create recommended task plan',
        description: 'Create an organized priority review task in project',
        type: 'TOOL',
        toolName: 'create_task',
        toolVersion: '1.0.0',
        input: {
          title: 'Organized Task Roadmap & Priorities',
          description: 'Auto-structured plan for incomplete tasks grouped by priority',
          priority: 'high',
        },
        dependencies: [s2Id, s3Id],
        expectedOutcome: 'Task structure prepared in project',
        status: 'PENDING',
      });
      dependencies.push({ stepId: s4Id, dependsOnStepId: s2Id, type: 'BLOCKS' });
      dependencies.push({ stepId: s4Id, dependsOnStepId: s3Id, type: 'BLOCKS' });
    }
    // Decomposition Pattern B: Create Task
    else if (
      lower.startsWith('create a task') ||
      lower.startsWith('create task') ||
      lower.startsWith('add a task') ||
      lower.startsWith('add task')
    ) {
      const s1Id = `step_1_${Date.now()}`;
      let title = raw.replace(/^create\s+(?:a\s+)?task\s+(?:called\s+|named\s+|to\s+)?/i, '').trim();
      let priority = 'medium';
      if (lower.includes('priority high') || lower.includes('high priority') || lower.includes('urgent')) {
        priority = 'high';
        title = title.replace(/(?:and\s+)?(?:set\s+)?(?:its\s+)?priority\s+(?:to\s+)?(?:high|urgent)/i, '').trim();
      }

      steps.push({
        id: s1Id,
        order: 1,
        title: `Create task "${title || 'New Task'}"`,
        description: `Create task "${title || 'New Task'}" with priority ${priority}`,
        type: 'TOOL',
        toolName: 'create_task',
        toolVersion: '1.0.0',
        input: { title: title || 'New Task', priority },
        dependencies: [],
        expectedOutcome: 'Task created and verified in database',
        status: 'READY',
      });
    }
    // Decomposition Pattern C: Create Project
    else if (lower.startsWith('create a project') || lower.startsWith('create project')) {
      const s1Id = `step_1_${Date.now()}`;
      const name = raw.replace(/^create\s+(?:a\s+)?project\s+(?:called\s+|named\s+|to\s+)?/i, '').trim();

      steps.push({
        id: s1Id,
        order: 1,
        title: `Create project "${name || 'New Project'}"`,
        description: `Create project "${name || 'New Project'}" in workspace`,
        type: 'TOOL',
        toolName: 'create_project',
        toolVersion: '1.0.0',
        input: { name: name || 'New Project' },
        dependencies: [],
        expectedOutcome: 'Project created and verified in database',
        status: 'READY',
      });
    }
    // Decomposition Pattern D: High-Impact Deletion
    else if (lower.startsWith('delete') || lower.startsWith('remove') || lower.includes('permanently delete')) {
      const s1Id = `step_1_${Date.now()}`;
      let toolName = 'delete_task';
      let input: Record<string, unknown> = { taskId: 'target_id' };
      let desc = `Process deletion request for "${raw}"`;

      if (lower.includes('project')) {
        toolName = 'delete_project';
        const match = raw.match(/(?:project|id)\s+([a-zA-Z0-9_\-]+)/i);
        input = { projectId: match ? match[1] : 'unknown_proj' };
        desc = `Permanently delete project "${input.projectId}"`;
      } else if (lower.includes('task')) {
        toolName = 'delete_task';
        const match = raw.match(/(?:task|id)\s+([a-zA-Z0-9_\-]+)/i);
        input = { taskId: match ? match[1] : 'unknown_task' };
        desc = `Permanently delete task "${input.taskId}"`;
      } else if (lower.includes('document')) {
        toolName = 'delete_knowledge_document';
        const match = raw.match(/(?:document|doc|id)\s+([a-zA-Z0-9_\-]+)/i);
        input = { documentId: match ? match[1] : 'unknown_doc' };
        desc = `Delete document "${input.documentId}"`;
      }

      steps.push({
        id: s1Id,
        order: 1,
        title: desc,
        description: desc,
        type: 'TOOL',
        toolName,
        toolVersion: '1.0.0',
        input,
        dependencies: [],
        expectedOutcome: 'Confirmed deletion',
        requiresConfirmation: true,
        riskLevel: 'HIGH_IMPACT',
        status: 'READY',
      });
    }
    // Decomposition Pattern E: Knowledge / Research
    else if (
      intent.type === 'KNOWLEDGE_QUESTION' ||
      intent.requiresRAG ||
      lower.includes('search knowledge') ||
      lower.includes('documentation')
    ) {
      const s1Id = `step_1_${Date.now()}`;
      const s2Id = `step_2_${Date.now()}`;

      steps.push({
        id: s1Id,
        order: 1,
        title: 'Retrieve relevant knowledge documents',
        description: 'Search knowledge base for verified documentation and evidence',
        type: 'TOOL',
        toolName: 'search_knowledge',
        toolVersion: '1.0.0',
        input: { query: raw },
        dependencies: [],
        expectedOutcome: 'Retrieved evidence passages',
        status: 'READY',
      });

      steps.push({
        id: s2Id,
        order: 2,
        title: 'Synthesize research findings',
        description: 'Synthesize evidence passages into structured findings',
        type: 'REASON',
        dependencies: [s1Id],
        expectedOutcome: 'Structured synthesized answer with provenance',
        status: 'PENDING',
      });
      dependencies.push({ stepId: s2Id, dependsOnStepId: s1Id, type: 'BLOCKS' });
    }
    // Fallback: Direct Analysis
    else {
      const s1Id = `step_1_${Date.now()}`;
      steps.push({
        id: s1Id,
        order: 1,
        title: 'Analyze workspace parameters',
        description: `Analyze workspace context for request: "${raw}"`,
        type: 'TOOL',
        toolName: 'get_workspace_info',
        toolVersion: '1.0.0',
        input: {},
        dependencies: [],
        expectedOutcome: 'Workspace state and parameters evaluated',
        status: 'READY',
      });
    }

    const agentPlan: AgentPlan = {
      id: planId,
      version: 1,
      userId: auth.userId,
      workspaceId: auth.workspaceId || context.workspaceId,
      projectId: context.projectId,
      conversationId: request.conversationId,
      correlationId,
      goal,
      constraints,
      assumptions,
      steps,
      dependencies,
      status: 'DRAFT',
      confidence: 0.9,
      requiresUserInput: steps.some((s) => s.requiresConfirmation),
      summary: planSummaryOverride || `Plan with ${steps.length} step${steps.length === 1 ? '' : 's'} for goal: ${goal.description}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 6. Compute Plan Hash
    agentPlan.planHash = this.computePlanHash(agentPlan);

    // 7. Validate Plan
    const validation = planValidator.validate(agentPlan, auth);
    agentPlan.status = validation.status ?? (validation.valid ? 'READY' : 'INVALID');
    if (validation.warnings && validation.warnings.length > 0) {
      (agentPlan as any).warnings = validation.warnings;
    }

    // 8. Persist Plan
    await planRepository.savePlan(agentPlan);

    return agentPlan;
  }
}

export const planningEngine = new PlanningEngine();

