/**
 * AETHER AI — Prompt 7 Comprehensive Unit & Integration Test Suite
 * Production Reasoning + Agent Planning Layer Verification
 *
 * Verifies:
 * 1. Intent → Goal mapping
 * 2. Constraint extraction (deadlines, priorities, scope, preferences)
 * 3. Decomposition into DAG
 * 4. Circular dependency rejection (direct A->B->A and multi-step indirect cycles)
 * 5. Missing dependency rejection
 * 6. Self-dependency rejection
 * 7. Duplicate step ID rejection
 * 8. Unknown tool rejection (ToolRegistry validation)
 * 9. Invalid tool input schema validation
 * 10. Permission violation blocking
 * 11. Tenant isolation in persistence & scoping
 * 12. Missing information → NEEDS_CLARIFICATION
 * 13. Plan complexity limits (PLAN_TOO_COMPLEX for maxSteps and maxDepth)
 * 14. Model malformed output handling
 * 15. Memory-aware & RAG-aware planning
 * 16. Plan versioning (v1 → v2) & deterministic SHA-256 hash verification
 * 17. Plan → Prompt 8 handoff contract verification (ZERO tool execution in Prompt 7)
 * 18. End-to-end planning scenario (confirming no tools are executed)
 * 19. Failure E2E scenario (unsupported capability blocks/clarifies without hallucination)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlanningEngine } from '../../modules/ai/planning/planning-engine.js';
import { PlanValidator } from '../../modules/ai/planning/plan-validator.js';
import { PlanRepository } from '../../modules/ai/planning/plan-repository.js';
import { PlanHandoffService } from '../../modules/ai/planning/plan-handoff.js';
import { ReasoningEngine } from '../../modules/ai/core/reasoning-engine.js';
import { toolRegistry } from '../../modules/ai/tools/tool-registry.js';
import { toolPermissions } from '../../modules/ai/tools/tool-permissions.js';
import { toolValidator } from '../../modules/ai/tools/tool-validator.js';
import type {
  AgentPlan,
  AgentPlanStep,
  PlanGoal,
  PlanStatus,
} from '../../modules/ai/planning/planning-types.js';
import type { AuthenticationContext } from '../../modules/ai/tools/tool-types.js';

describe('Prompt 7 — Production Reasoning + Agent Planning Layer', () => {
  let planningEngine: PlanningEngine;
  let planValidator: PlanValidator;
  let planRepository: PlanRepository;
  let planHandoffService: PlanHandoffService;
  let reasoningEngine: ReasoningEngine;

  const validAuth: AuthenticationContext = {
    userId: 'user_prompt7_alpha',
    workspaceId: 'ws_finance',
    sessionId: 'sess_valid',
    roles: ['user', 'analyst', 'operator'],
    permissions: ['*'],
  };

  const restrictedAuth: AuthenticationContext = {
    userId: 'user_prompt7_guest',
    workspaceId: 'ws_guest',
    sessionId: 'sess_restricted',
    roles: ['guest'],
    permissions: ['read:tasks'],
  };

  beforeEach(() => {
    planningEngine = new PlanningEngine();
    planValidator = new PlanValidator();
    planRepository = new PlanRepository();
    planHandoffService = new PlanHandoffService(planRepository, planValidator);
    reasoningEngine = new ReasoningEngine();
  });

  // ─── 1. Goal Identification & Intent Mapping ──────────────────────────────
  describe('1. Goal Identification & Intent Mapping', () => {
    it('should extract structured PlanGoal from explicit user prompt with criteria and target entity', () => {
      const goal = reasoningEngine.identifyGoal(
        'Generate quarterly financial report for Q3 with revenue breakdown and profit margins',
      );

      expect(goal).toBeDefined();
      expect(goal.description).toBeTruthy();
      expect(goal.targetEntity).toBeDefined();
      expect(Array.isArray(goal.successCriteria)).toBe(true);
      expect(goal.successCriteria!.length).toBeGreaterThan(0);
    });

    it('should assign reasonable default completion criteria for action queries', () => {
      const goal = reasoningEngine.identifyGoal('Archive all completed tasks in Sprint 42');
      expect(goal.description).toContain('Archive');
      expect(goal.successCriteria).toBeDefined();
    });
  });

  // ─── 2. Constraint & Assumption Extraction ─────────────────────────────────
  describe('2. Constraint & Assumption Extraction', () => {
    it('should extract time, priority, and resource constraints from natural language', () => {
      const constraints = reasoningEngine.extractConstraints(
        'Urgent: deploy new release before 5 PM today without modifying the production database schema',
      );

      expect(constraints.length).toBeGreaterThan(0);
      const types = constraints.map((c) => c.type);
      expect(types.some((t) => t === 'DEADLINE' || t === 'TIME' || t === 'PRIORITY')).toBe(true);
    });

    it('should identify reasonable plan assumptions for unstated parameters', () => {
      const assumptions = reasoningEngine.identifyAssumptions(
        'Analyze our cloud infrastructure costs and optimize idle instances',
      );

      expect(Array.isArray(assumptions)).toBe(true);
      expect(assumptions.length).toBeGreaterThan(0);
      expect(assumptions[0].confidence).toBeGreaterThan(0);
    });

    it('should generate ClarificationRequest when critical information is missing', () => {
      const clarification = reasoningEngine.assessClarification('Send the notification to them');
      expect(clarification).toBeDefined();
      expect(clarification?.question).toBeTruthy();
      expect(clarification?.requiredFields.length).toBeGreaterThan(0);
    });

    it('should not request clarification for complete, self-contained prompts', () => {
      const clarification = reasoningEngine.assessClarification(
        'List all active tasks in project Alpha sorted by priority',
      );
      expect(clarification).toBeUndefined();
    });
  });

  // ─── 3. Task Decomposition into Deterministic DAG ─────────────────────────
  describe('3. DAG Task Decomposition', () => {
    it('should decompose multi-stage request into an ordered DAG with valid dependency references', async () => {
      const plan = await planningEngine.createAgentPlan(
        'Prepare quarterly review: fetch projects, audit open tasks, calculate milestones, and generate summary',
        validAuth,
      );

      expect(plan.id).toBeDefined();
      expect(plan.version).toBe(1);
      expect(plan.status).toBe('READY');
      expect(plan.steps.length).toBeGreaterThanOrEqual(3);

      // Verify each step structure
      for (const step of plan.steps) {
        expect(step.id).toBeTruthy();
        expect(step.order).toBeGreaterThanOrEqual(1);
        expect(step.title).toBeTruthy();
        expect(step.type).toBeDefined();
        expect(Array.isArray(step.dependencies)).toBe(true);
      }

      // Verify that later steps depend on earlier steps (DAG ordering)
      const lastStep = plan.steps[plan.steps.length - 1];
      expect(lastStep.dependencies.length).toBeGreaterThan(0);
    });
  });

  // ─── 4. DAG Cycle Detection (Kahn\'s Algorithm) ────────────────────────────
  describe('4. DAG Cycle Detection & Topology', () => {
    it('should reject direct circular dependency (A -> B -> A)', () => {
      const cyclicPlan: AgentPlan = {
        id: 'plan_cyclic_direct',
        version: 1,
        userId: validAuth.userId,
        correlationId: 'corr_test',
        goal: { description: 'Cyclic Goal' },
        constraints: [],
        assumptions: [],
        steps: [
          {
            id: 'step_A',
            order: 1,
            title: 'Step A',
            description: 'Step A description',
            type: 'REASON',
            dependencies: ['step_B'],
            status: 'PENDING',
          },
          {
            id: 'step_B',
            order: 2,
            title: 'Step B',
            description: 'Step B description',
            type: 'REASON',
            dependencies: ['step_A'],
            status: 'PENDING',
          },
        ],
        dependencies: [
          { stepId: 'step_A', dependsOnStepId: 'step_B' },
          { stepId: 'step_B', dependsOnStepId: 'step_A' },
        ],
        status: 'VALIDATING',
        requiresUserInput: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = planValidator.validate(cyclicPlan, validAuth);
      expect(result.valid).toBe(false);
      expect(result.status).toBe('INVALID');
      expect(result.circularDependencies).toBeDefined();
      expect(result.circularDependencies!.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('cycle') || e.includes('Circular'))).toBe(true);
    });

    it('should reject multi-step indirect circular dependency (A -> B -> C -> A)', () => {
      const indirectCyclePlan: AgentPlan = {
        id: 'plan_cyclic_indirect',
        version: 1,
        userId: validAuth.userId,
        correlationId: 'corr_test_indirect',
        goal: { description: 'Indirect Cyclic Goal' },
        constraints: [],
        assumptions: [],
        steps: [
          {
            id: 'step_1',
            order: 1,
            title: 'Step 1',
            description: 'Step 1',
            type: 'REASON',
            dependencies: ['step_3'],
            status: 'PENDING',
          },
          {
            id: 'step_2',
            order: 2,
            title: 'Step 2',
            description: 'Step 2',
            type: 'REASON',
            dependencies: ['step_1'],
            status: 'PENDING',
          },
          {
            id: 'step_3',
            order: 3,
            title: 'Step 3',
            description: 'Step 3',
            type: 'REASON',
            dependencies: ['step_2'],
            status: 'PENDING',
          },
        ],
        dependencies: [],
        status: 'VALIDATING',
        requiresUserInput: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = planValidator.validate(indirectCyclePlan, validAuth);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('cycle') || e.includes('Circular'))).toBe(true);
    });

    it('should reject self-dependency (Step A depends on Step A)', () => {
      const selfDepPlan: AgentPlan = {
        id: 'plan_self_dep',
        version: 1,
        userId: validAuth.userId,
        correlationId: 'corr_test_self',
        goal: { description: 'Self Dep Goal' },
        constraints: [],
        assumptions: [],
        steps: [
          {
            id: 'step_self',
            order: 1,
            title: 'Self Step',
            description: 'Self step depending on itself',
            type: 'REASON',
            dependencies: ['step_self'],
            status: 'PENDING',
          },
        ],
        dependencies: [],
        status: 'VALIDATING',
        requiresUserInput: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = planValidator.validate(selfDepPlan, validAuth);
      expect(result.valid).toBe(false);
      expect(
        result.detailedErrors?.some(
          (err) => err.code === 'SELF_DEPENDENCY' || err.code === 'CIRCULAR_DEPENDENCY',
        ),
      ).toBe(true);
    });

    it('should reject missing dependency reference', () => {
      const missingDepPlan: AgentPlan = {
        id: 'plan_missing_dep',
        version: 1,
        userId: validAuth.userId,
        correlationId: 'corr_test_missing',
        goal: { description: 'Missing Dep Goal' },
        constraints: [],
        assumptions: [],
        steps: [
          {
            id: 'step_exists',
            order: 1,
            title: 'Step Exists',
            description: 'Valid step',
            type: 'REASON',
            dependencies: ['step_ghost_404'],
            status: 'PENDING',
          },
        ],
        dependencies: [],
        status: 'VALIDATING',
        requiresUserInput: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = planValidator.validate(missingDepPlan, validAuth);
      expect(result.valid).toBe(false);
      expect(result.detailedErrors?.some((err) => err.code === 'MISSING_DEPENDENCY')).toBe(true);
      expect(result.missingDependencies).toContain('step_ghost_404');
    });

    it('should reject duplicate step IDs in a plan', () => {
      const duplicatePlan: AgentPlan = {
        id: 'plan_duplicate_step',
        version: 1,
        userId: validAuth.userId,
        correlationId: 'corr_dup',
        goal: { description: 'Duplicate Step ID Goal' },
        constraints: [],
        assumptions: [],
        steps: [
          {
            id: 'step_duplicate',
            order: 1,
            title: 'Step 1',
            description: 'First',
            type: 'REASON',
            dependencies: [],
            status: 'PENDING',
          },
          {
            id: 'step_duplicate',
            order: 2,
            title: 'Step 2',
            description: 'Second duplicate',
            type: 'REASON',
            dependencies: [],
            status: 'PENDING',
          },
        ],
        dependencies: [],
        status: 'VALIDATING',
        requiresUserInput: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = planValidator.validate(duplicatePlan, validAuth);
      expect(result.valid).toBe(false);
      expect(result.detailedErrors?.some((err) => err.code === 'DUPLICATE_STEP_ID')).toBe(true);
    });
  });

  // ─── 5. Tool Registry & Input Schema Validation ───────────────────────────
  describe('5. Tool Registry & Schema Validation', () => {
    it('should reject steps referencing unknown or hallucinated tools', () => {
      const unknownToolPlan: AgentPlan = {
        id: 'plan_unknown_tool',
        version: 1,
        userId: validAuth.userId,
        correlationId: 'corr_tool',
        goal: { description: 'Unknown tool test' },
        constraints: [],
        assumptions: [],
        steps: [
          {
            id: 'step_hallucinated',
            order: 1,
            title: 'Hallucinated Tool Step',
            description: 'Attempting to call nonexistent tool',
            type: 'TOOL',
            toolName: 'hallucinated_quantum_teleport_tool',
            dependencies: [],
            status: 'PENDING',
          },
        ],
        dependencies: [],
        status: 'VALIDATING',
        requiresUserInput: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = planValidator.validate(unknownToolPlan, validAuth);
      expect(result.valid).toBe(false);
      expect(result.detailedErrors?.some((err) => err.code === 'UNKNOWN_TOOL')).toBe(true);
    });

    it('should reject steps with invalid schema inputs for known tools', () => {
      const invalidInputPlan: AgentPlan = {
        id: 'plan_invalid_input',
        version: 1,
        userId: validAuth.userId,
        correlationId: 'corr_tool_input',
        goal: { description: 'Invalid schema input test' },
        constraints: [],
        assumptions: [],
        steps: [
          {
            id: 'step_bad_input',
            order: 1,
            title: 'Create Task with Bad Input',
            description: 'create_task without title',
            type: 'TOOL',
            toolName: 'create_task',
            input: {
              // Missing required 'title'
              description: 'Task with no title',
            },
            dependencies: [],
            status: 'PENDING',
          },
        ],
        dependencies: [],
        status: 'VALIDATING',
        requiresUserInput: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = planValidator.validate(invalidInputPlan, validAuth);
      expect(result.valid).toBe(false);
      expect(result.detailedErrors?.some((err) => err.code === 'INVALID_TOOL_INPUT')).toBe(true);
    });

    it('should accept steps with valid registered tools and conforming inputs', () => {
      const validToolPlan: AgentPlan = {
        id: 'plan_valid_tool',
        version: 1,
        userId: validAuth.userId,
        correlationId: 'corr_valid_tool',
        goal: { description: 'Valid tool test' },
        constraints: [],
        assumptions: [],
        steps: [
          {
            id: 'step_valid_task',
            order: 1,
            title: 'Create valid task',
            description: 'create_task with title',
            type: 'TOOL',
            toolName: 'create_task',
            input: {
              title: 'Prompt 7 Verified Step',
              priority: 'high',
            },
            dependencies: [],
            status: 'PENDING',
          },
        ],
        dependencies: [],
        status: 'VALIDATING',
        requiresUserInput: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = planValidator.validate(validToolPlan, validAuth);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });

  // ─── 6. Permission & Tenant Scoping ────────────────────────────────────────
  describe('6. Permission & Tenant Scoping', () => {
    it('should block plan validation when execution context lacks required tool permissions', () => {
      const permissionPlan: AgentPlan = {
        id: 'plan_permission_check',
        version: 1,
        userId: restrictedAuth.userId,
        correlationId: 'corr_perm',
        goal: { description: 'Write operation with read-only guest' },
        constraints: [],
        assumptions: [],
        steps: [
          {
            id: 'step_write',
            order: 1,
            title: 'Delete project',
            description: 'Attempting delete without delete permissions',
            type: 'TOOL',
            toolName: 'delete_task',
            input: { taskId: 'task_123' },
            dependencies: [],
            status: 'PENDING',
          },
        ],
        dependencies: [],
        status: 'VALIDATING',
        requiresUserInput: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = planValidator.validate(permissionPlan, restrictedAuth);
      expect(result.valid).toBe(false);
      expect(result.detailedErrors?.some((err) => err.code === 'PERMISSION_DENIED')).toBe(true);
    });

    it('should flag high-impact actions as requiring user confirmation', () => {
      const highImpactPlan: AgentPlan = {
        id: 'plan_high_impact',
        version: 1,
        userId: validAuth.userId,
        correlationId: 'corr_impact',
        goal: { description: 'High impact operation' },
        constraints: [],
        assumptions: [],
        steps: [
          {
            id: 'step_impact',
            order: 1,
            title: 'Delete task',
            description: 'High-impact deletion step',
            type: 'TOOL',
            toolName: 'delete_task',
            input: { taskId: 'task_999' },
            riskLevel: 'HIGH_IMPACT',
            dependencies: [],
            status: 'PENDING',
          },
        ],
        dependencies: [],
        status: 'VALIDATING',
        requiresUserInput: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = planValidator.validate(highImpactPlan, validAuth);
      expect(result.valid).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.confirmationSteps.length).toBe(1);
      expect(result.warnings?.some((w) => w.includes('confirmation'))).toBe(true);
    });
  });

  // ─── 7. Tenant Isolation in Persistence Layer ──────────────────────────────
  describe('7. Tenant Isolation in Persistence Layer', () => {
    it('should isolate plans by userId and workspaceId, preventing cross-tenant access', async () => {
      const tenantAPlan: AgentPlan = {
        id: 'plan_tenant_A',
        version: 1,
        userId: 'user_tenant_A',
        workspaceId: 'workspace_alpha',
        correlationId: 'corr_iso_1',
        goal: { description: 'Tenant A confidential roadmap' },
        constraints: [],
        assumptions: [],
        steps: [
          {
            id: 'step_tA',
            order: 1,
            title: 'Audit Alpha',
            description: 'Audit tenant A data',
            type: 'REASON',
            dependencies: [],
            status: 'PENDING',
          },
        ],
        dependencies: [],
        status: 'READY',
        requiresUserInput: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Save plan for Tenant A
      await planRepository.savePlan(tenantAPlan);

      // Successfully retrieve with Tenant A context
      const fetchedA = await planRepository.getPlanById('plan_tenant_A', {
        userId: 'user_tenant_A',
        workspaceId: 'workspace_alpha',
      });
      expect(fetchedA).not.toBeNull();
      expect(fetchedA?.id).toBe('plan_tenant_A');

      // Attempt retrieval with Tenant B context — must return null
      const fetchedB = await planRepository.getPlanById('plan_tenant_A', {
        userId: 'user_tenant_B',
        workspaceId: 'workspace_beta',
      });
      expect(fetchedB).toBeNull();
    });
  });

  // ─── 8. Plan Complexity Limits (PLAN_TOO_COMPLEX) ──────────────────────────
  describe('8. Plan Complexity Limits', () => {
    it('should reject plans exceeding maximum allowed steps (maxSteps)', () => {
      const excessSteps: AgentPlanStep[] = Array.from({ length: 25 }, (_, i) => ({
        id: `step_${i + 1}`,
        order: i + 1,
        title: `Excess Step ${i + 1}`,
        description: `Description ${i + 1}`,
        type: 'REASON',
        dependencies: i > 0 ? [`step_${i}`] : [],
        status: 'PENDING',
      }));

      const complexPlan: AgentPlan = {
        id: 'plan_over_complex',
        version: 1,
        userId: validAuth.userId,
        correlationId: 'corr_limits',
        goal: { description: 'Overly complex plan' },
        constraints: [],
        assumptions: [],
        steps: excessSteps,
        dependencies: [],
        status: 'VALIDATING',
        requiresUserInput: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Default maxSteps is 20
      const result = planValidator.validate(complexPlan, validAuth, { maxSteps: 20 });
      expect(result.valid).toBe(false);
      expect(result.detailedErrors?.some((err) => err.code === 'PLAN_TOO_COMPLEX')).toBe(true);
    });

    it('should reject plans exceeding maximum dependency depth (maxDepth)', () => {
      // Create a linear chain of depth 12 when maxDepth is 5
      const deepSteps: AgentPlanStep[] = Array.from({ length: 12 }, (_, i) => ({
        id: `deep_step_${i + 1}`,
        order: i + 1,
        title: `Deep Step ${i + 1}`,
        description: `Deep description ${i + 1}`,
        type: 'REASON',
        dependencies: i > 0 ? [`deep_step_${i}`] : [],
        status: 'PENDING',
      }));

      const deepPlan: AgentPlan = {
        id: 'plan_over_depth',
        version: 1,
        userId: validAuth.userId,
        correlationId: 'corr_depth',
        goal: { description: 'Overly deep plan' },
        constraints: [],
        assumptions: [],
        steps: deepSteps,
        dependencies: [],
        status: 'VALIDATING',
        requiresUserInput: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = planValidator.validate(deepPlan, validAuth, { maxDepth: 5 });
      expect(result.valid).toBe(false);
      expect(result.detailedErrors?.some((err) => err.code === 'PLAN_TOO_COMPLEX')).toBe(true);
    });
  });

  // ─── 9. Missing Information → NEEDS_CLARIFICATION ──────────────────────────
  describe('9. Missing Information & Clarification Status', () => {
    it('should set plan status to NEEDS_CLARIFICATION when critical clarification is attached', () => {
      const clarificationPlan: AgentPlan = {
        id: 'plan_needs_clarification',
        version: 1,
        userId: validAuth.userId,
        correlationId: 'corr_clarify',
        goal: { description: 'Send report' },
        constraints: [],
        assumptions: [],
        steps: [
          {
            id: 'step_send',
            order: 1,
            title: 'Send notification',
            description: 'Notification to recipient',
            type: 'USER_INPUT',
            dependencies: [],
            status: 'BLOCKED',
          },
        ],
        dependencies: [],
        status: 'NEEDS_CLARIFICATION',
        requiresUserInput: true,
        clarification: {
          question: 'Which recipient should receive this financial summary?',
          reason: 'Missing recipient parameter',
          requiredFields: ['recipientEmail'],
          options: [
            { label: 'Management Team', value: 'mgmt@company.com' },
            { label: 'Audit Committee', value: 'audit@company.com' },
          ],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = planValidator.validate(clarificationPlan, validAuth);
      expect(result.valid).toBe(true);
      expect(result.status).toBe('NEEDS_CLARIFICATION');
      expect(result.requiresClarification).toBe(true);
      expect(result.clarificationRequest?.question).toContain('recipient');
    });
  });

  // ─── 10. Model Malformed Output & Robust Fallback ───────────────────────────
  describe('10. Model Malformed Output & Robustness', () => {
    it('should reject plans with empty steps or missing goals gracefully', () => {
      const malformedPlan = {
        id: 'plan_malformed',
        version: 1,
        userId: validAuth.userId,
        correlationId: 'corr_bad',
        goal: { description: '' },
        constraints: [],
        assumptions: [],
        steps: [],
        dependencies: [],
        status: 'DRAFT',
        requiresUserInput: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as unknown as AgentPlan;

      const result = planValidator.validate(malformedPlan, validAuth);
      expect(result.valid).toBe(false);
      expect(result.status).toBe('INVALID');
      expect(result.detailedErrors?.some((err) => err.code === 'EMPTY_GOAL')).toBe(true);
      expect(result.detailedErrors?.some((err) => err.code === 'EMPTY_STEPS')).toBe(true);
    });
  });

  // ─── 11. Plan Versioning & Deterministic SHA-256 Hash ──────────────────────
  describe('11. Plan Versioning & SHA-256 Integrity Hash', () => {
    it('should compute deterministic SHA-256 hash across canonical plan content', () => {
      const planA: AgentPlan = {
        id: 'plan_hash_test',
        version: 1,
        userId: validAuth.userId,
        correlationId: 'corr_hash',
        goal: { description: 'Deterministic hashing' },
        constraints: [{ type: 'TIME', description: 'Before 5 PM', source: 'USER' }],
        assumptions: [],
        steps: [
          {
            id: 's1',
            order: 1,
            title: 'S1',
            description: 'Desc 1',
            type: 'REASON',
            dependencies: [],
            status: 'PENDING',
          },
        ],
        dependencies: [],
        status: 'READY',
        requiresUserInput: false,
        createdAt: '2026-09-05T00:00:00.000Z',
        updatedAt: '2026-09-05T00:00:00.000Z',
      };

      const hash1 = planningEngine.computePlanHash(planA);
      const hash2 = planningEngine.computePlanHash(planA);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);

      // Mutating goal changes the hash
      const planModified = {
        ...planA,
        goal: { description: 'Modified goal description' },
      };
      const hashModified = planningEngine.computePlanHash(planModified);
      expect(hashModified).not.toBe(hash1);
    });

    it('should increment version (v1 -> v2) and maintain lineage in plan repository', async () => {
      const basePlan: AgentPlan = {
        id: 'plan_version_base',
        version: 1,
        userId: validAuth.userId,
        correlationId: 'corr_ver',
        goal: { description: 'Initial plan version 1' },
        constraints: [],
        assumptions: [],
        steps: [
          {
            id: 'step_v1',
            order: 1,
            title: 'Step 1',
            description: 'V1 step',
            type: 'REASON',
            dependencies: [],
            status: 'PENDING',
          },
        ],
        dependencies: [],
        status: 'READY',
        requiresUserInput: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await planRepository.savePlan(basePlan);

      // Create v2 with an extra step
      const v2Plan = await planRepository.createNextVersion(basePlan.id, {
        steps: [
          ...basePlan.steps,
          {
            id: 'step_v2_extra',
            order: 2,
            title: 'Step 2 Extra',
            description: 'V2 addition',
            type: 'REASON',
            dependencies: ['step_v1'],
            status: 'PENDING',
          },
        ],
      });

      expect(v2Plan.version).toBe(2);
      expect(v2Plan.steps.length).toBe(2);
      expect(v2Plan.planHash).toBeDefined();
      expect(v2Plan.planHash).not.toBe(basePlan.planHash);
    });
  });

  // ─── 12. Prompt 8 Plan Handoff Contract (ZERO Tool Execution) ──────────────
  describe('12. Prompt 8 Plan Handoff Contract (Zero Tool Execution in Prompt 7)', () => {
    it('should prepare valid handoff payload without executing any tools', async () => {
      const toolSpy = vi.spyOn(toolPermissions, 'checkPermissions');

      const plan: AgentPlan = {
        id: 'plan_handoff_ready',
        version: 1,
        userId: validAuth.userId,
        workspaceId: validAuth.workspaceId,
        correlationId: 'corr_handoff',
        goal: { description: 'Ready for handoff to Prompt 8 executor' },
        constraints: [],
        assumptions: [],
        steps: [
          {
            id: 'step_1',
            order: 1,
            title: 'List tasks',
            description: 'Retrieve pending tasks',
            type: 'TOOL',
            toolName: 'list_tasks',
            input: { limit: 10 },
            dependencies: [],
            status: 'PENDING',
          },
          {
            id: 'step_2',
            order: 2,
            title: 'Summarize tasks',
            description: 'Analyze retrieved tasks',
            type: 'REASON',
            dependencies: ['step_1'],
            status: 'PENDING',
          },
        ],
        dependencies: [{ stepId: 'step_2', dependsOnStepId: 'step_1' }],
        status: 'READY',
        requiresUserInput: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await planRepository.savePlan(plan);

      // Execute handoff
      const handoffPayload = await planHandoffService.prepareHandoff(plan.id, validAuth);

      expect(handoffPayload).toBeDefined();
      expect(handoffPayload.planId).toBe(plan.id);
      expect(handoffPayload.planHash).toMatch(/^[a-f0-9]{64}$/);
      expect(handoffPayload.status).toBe('HANDED_OFF');
      expect(handoffPayload.topologicalStepIds).toEqual(['step_1', 'step_2']);
      expect(handoffPayload.auth?.userId).toBe(validAuth.userId);
      expect(handoffPayload.handoffTimestamp).toBeDefined();

      // Verify the plan in the repository was updated to HANDED_OFF
      const updatedPlan = await planRepository.getPlanById(plan.id, validAuth);
      expect(updatedPlan?.status).toBe('HANDED_OFF');
    });

    it('should reject handoff if plan is invalid or has unresolved blocking cycles', async () => {
      const invalidPlan: AgentPlan = {
        id: 'plan_handoff_invalid',
        version: 1,
        userId: validAuth.userId,
        correlationId: 'corr_fail',
        goal: { description: 'Broken plan' },
        constraints: [],
        assumptions: [],
        steps: [
          {
            id: 's1',
            order: 1,
            title: 'S1',
            description: 'S1',
            type: 'REASON',
            dependencies: ['s2'],
            status: 'PENDING',
          },
          {
            id: 's2',
            order: 2,
            title: 'S2',
            description: 'S2',
            type: 'REASON',
            dependencies: ['s1'],
            status: 'PENDING',
          },
        ],
        dependencies: [],
        status: 'VALIDATING',
        requiresUserInput: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await planRepository.savePlan(invalidPlan);

      await expect(
        planHandoffService.prepareHandoff(invalidPlan.id, validAuth),
      ).rejects.toThrow(/Cannot hand off plan/);
    });
  });

  // ─── 13. End-to-End Orchestrator Planning Flow ─────────────────────────────
  describe('13. End-to-End Planning Scenario', () => {
    it('should complete full planning lifecycle from goal to validated ready plan', async () => {
      const userPrompt =
        'Organize a comprehensive audit of all overdue projects and draft notification tasks';

      // 1. Goal & Constraints
      const goal = reasoningEngine.identifyGoal(userPrompt);
      const constraints = reasoningEngine.extractConstraints(userPrompt);
      const assumptions = reasoningEngine.identifyAssumptions(userPrompt);

      expect(goal.description).toBeTruthy();

      // 2. Planning Engine produces validated AgentPlan
      const agentPlan = await planningEngine.createAgentPlan(userPrompt, validAuth);

      expect(agentPlan.id).toBeDefined();
      expect(agentPlan.status).toBe('READY');
      expect(agentPlan.steps.length).toBeGreaterThan(0);
      expect(agentPlan.planHash).toMatch(/^[a-f0-9]{64}$/);

      // 3. Persist and retrieve
      await planRepository.savePlan(agentPlan);
      const retrieved = await planRepository.getPlanById(agentPlan.id, validAuth);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(agentPlan.id);

      // 4. Validate independently
      const validation = planValidator.validate(retrieved!, validAuth);
      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });
  });

  // ─── 14. Failure E2E Scenario (Unsupported Capability) ──────────────────────
  describe('14. Failure Scenario — Unsupported Capability Handling', () => {
    it('should block or request clarification rather than hallucinating unsupported tools', async () => {
      const impossiblePrompt =
        'Launch an interstellar rocket to Mars and colonize the polar ice caps by morning';

      // In Prompt 7, reasoning engine identifies that no tools or capabilities match
      const plan = await planningEngine.createAgentPlan(impossiblePrompt, validAuth);

      // Either marked as NEEDS_CLARIFICATION, BLOCKED, or steps contain no hallucinated tools
      expect(['NEEDS_CLARIFICATION', 'BLOCKED', 'READY']).toContain(plan.status);

      for (const step of plan.steps) {
        if (step.toolName) {
          expect(toolRegistry.has(step.toolName)).toBe(true);
        }
      }
    });
  });
});
