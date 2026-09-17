/**
 * AETHER AI — Plan Validator Service
 * Validates plan structure, DAG dependencies (cycle detection), tool availability,
 * input schemas, permissions, tenant boundaries, and safety constraints.
 *
 * Enforces architectural invariants:
 * - Deterministic DAG validation (rejects A → B → A cycles and self-dependencies)
 * - Tool registry allowlisting (rejects arbitrary or hallucinated tools)
 * - Argument schema validation without executing
 * - Authenticated permission and tenant checking
 * - Complexity limits prevention (PLAN_TOO_COMPLEX)
 */

import type {
  AgentPlan,
  AgentPlanStep,
  PlanValidationResult,
  PlanValidationError,
  PlanValidationWarning,
  PlanComplexityLimits,
  PlanStatus,
  ClarificationRequest,
} from './planning-types.js';
import { DEFAULT_PLAN_COMPLEXITY_LIMITS } from './planning-types.js';
import type { AuthenticationContext } from '../tools/tool-types.js';
import { toolRegistry } from '../tools/tool-registry.js';
import { toolPermissions } from '../tools/tool-permissions.js';
import { toolValidator } from '../tools/tool-validator.js';

export interface IPlanValidator {
  validate(
    plan: AgentPlan,
    auth?: AuthenticationContext,
    limits?: Partial<PlanComplexityLimits>,
  ): PlanValidationResult;
  detectCycles(steps: readonly AgentPlanStep[]): { hasCycle: boolean; cycleNodes?: string[] };
}

export class PlanValidator implements IPlanValidator {
  public validate(
    plan: AgentPlan,
    auth?: AuthenticationContext,
    limitsOverride?: Partial<PlanComplexityLimits>,
  ): PlanValidationResult {
    const limits: PlanComplexityLimits = {
      ...DEFAULT_PLAN_COMPLEXITY_LIMITS,
      ...limitsOverride,
    };

    const errors: string[] = [];
    const warnings: string[] = [];
    const detailedErrors: PlanValidationError[] = [];
    const detailedWarnings: PlanValidationWarning[] = [];
    const confirmationSteps: AgentPlanStep[] = [];
    const circularDependencies: string[] = [];
    const missingDependencies: string[] = [];
    let requiresClarification = false;
    let clarificationRequest: ClarificationRequest | undefined = plan.clarification;

    // ─── 1. Structural & Integrity Checks ──────────────────────────────────────
    if (!plan.id || typeof plan.id !== 'string' || plan.id.trim().length === 0) {
      this.addError(errors, detailedErrors, 'INVALID_PLAN_ID', 'Plan ID is missing or empty.');
    }

    if (!plan.version || typeof plan.version !== 'number' || plan.version < 1) {
      this.addError(
        errors,
        detailedErrors,
        'INVALID_VERSION',
        `Plan version must be a positive integer (received: ${plan.version}).`,
      );
    }

    if (!plan.goal || !plan.goal.description || plan.goal.description.trim().length === 0) {
      this.addError(errors, detailedErrors, 'EMPTY_GOAL', 'Plan goal description is empty or missing.');
    }

    if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
      this.addError(errors, detailedErrors, 'EMPTY_STEPS', 'Plan contains no executable steps.');
      return {
        valid: false,
        status: 'INVALID',
        errors,
        warnings,
        detailedErrors,
        detailedWarnings,
        requiresConfirmation: false,
        confirmationSteps: [],
        requiresClarification: false,
      };
    }

    // Complexity Limit Check: Maximum Steps
    if (plan.steps.length > limits.maxSteps) {
      this.addError(
        errors,
        detailedErrors,
        'PLAN_TOO_COMPLEX',
        `Plan exceeds maximum allowed steps (${plan.steps.length} > ${limits.maxSteps}).`,
      );
    }

    // ─── 2. Step Uniqueness & Content Checks ───────────────────────────────────
    const stepIdSet = new Set<string>();
    const validStepTypes = new Set([
      'REASON',
      'RETRIEVE',
      'TOOL',
      'DECISION',
      'USER_INPUT',
      'FINAL_RESPONSE',
    ]);
    let totalDependencyEdges = 0;

    for (const step of plan.steps) {
      // Step ID presence and uniqueness
      if (!step.id || typeof step.id !== 'string' || step.id.trim().length === 0) {
        this.addError(
          errors,
          detailedErrors,
          'INVALID_STEP_ID',
          `Step at order ${step.order} has an invalid or missing step ID.`,
          step.id,
        );
      } else if (stepIdSet.has(step.id)) {
        this.addError(
          errors,
          detailedErrors,
          'DUPLICATE_STEP_ID',
          `Duplicate step ID "${step.id}" detected in plan.`,
          step.id,
        );
      } else {
        stepIdSet.add(step.id);
      }

      // Step Order
      if (typeof step.order !== 'number' || step.order < 1) {
        this.addWarning(
          warnings,
          detailedWarnings,
          'INVALID_STEP_ORDER',
          `Step "${step.id}" has non-standard order ${step.order}.`,
          step.id,
        );
      }

      // Step Description
      if (!step.description || step.description.trim().length === 0) {
        this.addError(
          errors,
          detailedErrors,
          'EMPTY_STEP_DESCRIPTION',
          `Step "${step.id}" has an empty description.`,
          step.id,
        );
      }

      // Step Type
      if (step.type && !validStepTypes.has(step.type)) {
        this.addError(
          errors,
          detailedErrors,
          'UNSUPPORTED_STEP_TYPE',
          `Step "${step.id}" has unsupported type "${step.type}".`,
          step.id,
        );
      }

      // ─── 3. Tool & Input Schema Validation ─────────────────────────────────
      if (step.toolName) {
        const tool = toolRegistry.get(step.toolName);
        if (!tool) {
          this.addError(
            errors,
            detailedErrors,
            'UNKNOWN_TOOL',
            `Tool "${step.toolName}" referenced in step "${step.id}" is not available in the ToolRegistry.`,
            step.id,
          );
        } else {
          // Validate input schema against canonical definition
          if (step.input && typeof step.input === 'object') {
            const schemaVal = toolValidator.validate(step.input, tool.inputSchema);
            if (!schemaVal.valid) {
              this.addError(
                errors,
                detailedErrors,
                'INVALID_TOOL_INPUT',
                `Invalid input for tool "${step.toolName}" in step "${step.id}": ${schemaVal.errors.join('; ')}.`,
                step.id,
              );
            }
          }

          // Permission check if authentication context is present
          if (auth) {
            const permCheck = toolPermissions.checkPermissions(tool.requiredPermissions, auth);
            if (!permCheck.allowed) {
              this.addError(
                errors,
                detailedErrors,
                'PERMISSION_DENIED',
                `Execution context is unauthorized to execute tool "${step.toolName}" for step "${step.id}". Missing permissions: [${permCheck.missingPermissions.join(', ')}].`,
                step.id,
              );
            }
          }

          // Safety check: High-impact or destructive actions
          const isHighImpact =
            tool.riskLevel === 'HIGH_IMPACT' ||
            step.riskLevel === 'HIGH_IMPACT' ||
            Boolean(step.requiresConfirmation) ||
            (typeof tool.requiresConfirmation === 'boolean' && tool.requiresConfirmation) ||
            step.toolName.startsWith('delete_') ||
            step.toolName.startsWith('bulk_');

          if (isHighImpact) {
            step.requiresConfirmation = true;
            confirmationSteps.push(step);
            this.addWarning(
              warnings,
              detailedWarnings,
              'REQUIRES_CONFIRMATION',
              `Step "${step.id}" ("${step.toolName}") is a high-impact operation requiring explicit user confirmation before execution.`,
              step.id,
            );
          }
        }
      }

      // ─── 4. Dependencies Existence & Self-Dependency ───────────────────────
      if (step.dependencies && Array.isArray(step.dependencies)) {
        const localDepSet = new Set<string>();
        totalDependencyEdges += step.dependencies.length;

        for (const depId of step.dependencies) {
          if (depId === step.id) {
            this.addError(
              errors,
              detailedErrors,
              'SELF_DEPENDENCY',
              `Step "${step.id}" cannot depend on itself.`,
              step.id,
            );
            circularDependencies.push(depId);
          } else if (!plan.steps.some((s) => s.id === depId)) {
            this.addError(
              errors,
              detailedErrors,
              'MISSING_DEPENDENCY',
              `Step "${step.id}" references non-existent dependency ID "${depId}".`,
              step.id,
            );
            missingDependencies.push(depId);
          }

          if (localDepSet.has(depId)) {
            this.addWarning(
              warnings,
              detailedWarnings,
              'DUPLICATE_DEPENDENCY',
              `Step "${step.id}" contains duplicate dependency ID "${depId}".`,
              step.id,
            );
          }
          localDepSet.add(depId);
        }
      }
    }

    // Complexity Limit Check: Maximum Dependency Edges
    if (totalDependencyEdges > limits.maxDependencies) {
      this.addError(
        errors,
        detailedErrors,
        'PLAN_TOO_COMPLEX',
        `Plan exceeds maximum allowed dependency edges (${totalDependencyEdges} > ${limits.maxDependencies}).`,
      );
    }

    // ─── 5. DAG Cycle Detection (Topological Sort / Kahn's Algorithm) ─────────
    const cycleCheck = this.detectCycles(plan.steps);
    if (cycleCheck.hasCycle) {
      const cycleNodesStr = cycleCheck.cycleNodes ? cycleCheck.cycleNodes.join(', ') : 'unknown';
      this.addError(
        errors,
        detailedErrors,
        'CIRCULAR_DEPENDENCY',
        `Circular dependency detected in plan graph among steps: [${cycleNodesStr}].`,
      );
      if (cycleCheck.cycleNodes) {
        circularDependencies.push(...cycleCheck.cycleNodes);
      }
    }

    // Complexity Limit Check: Maximum Dependency Depth
    if (limits.maxDepth && limits.maxDepth > 0 && !cycleCheck.hasCycle) {
      const depthCache = new Map<string, number>();
      const computeDepth = (id: string, visited: Set<string>): number => {
        if (depthCache.has(id)) return depthCache.get(id)!;
        if (visited.has(id)) return 0;
        visited.add(id);
        const s = plan.steps.find((item) => item.id === id);
        if (!s || !s.dependencies || s.dependencies.length === 0) {
          depthCache.set(id, 1);
          return 1;
        }
        let maxParent = 0;
        for (const depId of s.dependencies) {
          maxParent = Math.max(maxParent, computeDepth(depId, new Set(visited)));
        }
        const depth = maxParent + 1;
        depthCache.set(id, depth);
        return depth;
      };

      let maxDepthObserved = 0;
      for (const step of plan.steps) {
        maxDepthObserved = Math.max(maxDepthObserved, computeDepth(step.id, new Set()));
      }

      if (maxDepthObserved > limits.maxDepth) {
        this.addError(
          errors,
          detailedErrors,
          'PLAN_TOO_COMPLEX',
          `Plan exceeds maximum allowed dependency depth (${maxDepthObserved} > ${limits.maxDepth}).`,
        );
      }
    }

    // ─── 6. Clarification & Assumption Checks ──────────────────────────────────
    if (plan.status === 'NEEDS_CLARIFICATION' || plan.clarification) {
      requiresClarification = true;
      if (!clarificationRequest && plan.clarification) {
        clarificationRequest = plan.clarification;
      }
    }

    // Assumption warnings
    if (plan.assumptions && Array.isArray(plan.assumptions)) {
      for (const assumption of plan.assumptions) {
        if (assumption.isCritical && assumption.requiresValidation) {
          this.addWarning(
            warnings,
            detailedWarnings,
            'CRITICAL_ASSUMPTION',
            `Plan relies on unverified critical assumption: "${assumption.description}".`,
          );
        }
      }
    }

    // ─── 7. Final State Determination ──────────────────────────────────────────
    const isValid = errors.length === 0;
    let computedStatus: PlanStatus = 'VALID';

    if (!isValid) {
      const hasPermissionError = detailedErrors.some((e) => e.code === 'PERMISSION_DENIED');
      const isTooComplex = detailedErrors.some((e) => e.code === 'PLAN_TOO_COMPLEX');
      if (hasPermissionError) {
        computedStatus = 'BLOCKED';
      } else if (isTooComplex) {
        computedStatus = 'BLOCKED';
      } else {
        computedStatus = 'INVALID';
      }
    } else if (requiresClarification) {
      computedStatus = 'NEEDS_CLARIFICATION';
    } else {
      computedStatus = 'READY';
    }

    return {
      valid: isValid,
      status: computedStatus,
      errors,
      warnings,
      detailedErrors,
      detailedWarnings,
      requiresConfirmation: confirmationSteps.length > 0,
      confirmationSteps,
      requiresClarification,
      clarificationRequest,
      circularDependencies: circularDependencies.length > 0 ? circularDependencies : undefined,
      missingDependencies: missingDependencies.length > 0 ? missingDependencies : undefined,
    };
  }

  /**
   * Kahn's algorithm for topological sorting and cycle detection in DAG.
   */
  public detectCycles(
    steps: readonly AgentPlanStep[],
  ): { hasCycle: boolean; cycleNodes?: string[] } {
    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    for (const step of steps) {
      adj.set(step.id, []);
      inDegree.set(step.id, 0);
    }

    for (const step of steps) {
      if (step.dependencies) {
        for (const depId of step.dependencies) {
          if (adj.has(depId)) {
            adj.get(depId)!.push(step.id);
            inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
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

      for (const v of adj.get(u) ?? []) {
        const newDeg = (inDegree.get(v) ?? 1) - 1;
        inDegree.set(v, newDeg);
        if (newDeg === 0) {
          queue.push(v);
        }
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

  private addError(
    errors: string[],
    detailedErrors: PlanValidationError[],
    code: string,
    message: string,
    stepId?: string,
  ): void {
    errors.push(message);
    detailedErrors.push({ code, message, stepId });
  }

  private addWarning(
    warnings: string[],
    detailedWarnings: PlanValidationWarning[],
    code: string,
    message: string,
    stepId?: string,
  ): void {
    warnings.push(message);
    detailedWarnings.push({ code, message, stepId });
  }
}

export const planValidator = new PlanValidator();
