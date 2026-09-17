import { describe, it, expect } from 'vitest';
import { PlanningEngine } from '../../modules/ai/planning/planning-engine.js';
import type { ActionPlan, PlanStep } from '../../modules/ai/planning/planning-types.js';
import type { AuthenticationContext } from '../../modules/ai/tools/tool-types.js';
import type { Intent } from '../../modules/ai/ai-types.js';

describe('PlanningEngine — Multi-Mode Planning, Decomposition & Dependency Graph Validation', () => {
  const planningEngine = new PlanningEngine();
  const authContext: AuthenticationContext = {
    userId: 'user_test_1',
    sessionId: 'sess_test_1',
    roles: ['user'],
    permissions: ['*'],
  };

  describe('Sequential Plan Generation', () => {
    it('should generate a sequential multi-step plan with valid dependencies for project review preparation', async () => {
      const plan = await planningEngine.createPlan(
        'Prepare everything I need for tomorrow project review',
        authContext,
      );

      expect(plan.planId).toBeDefined();
      expect(plan.steps.length).toBe(4);
      expect(plan.executionMode).toBe('sequential');

      // Verify dependency chain
      const step1 = plan.steps[0];
      const step2 = plan.steps[1];
      const step3 = plan.steps[2];
      const step4 = plan.steps[3];

      expect(step1.stepNumber).toBe(1);
      expect(step1.toolName).toBe('list_projects');
      expect(step1.dependencies).toBeUndefined();

      expect(step2.stepNumber).toBe(2);
      expect(step2.toolName).toBe('list_tasks');
      expect(step2.dependencies).toContain(step1.stepId);

      expect(step3.stepNumber).toBe(3);
      expect(step3.toolName).toBe('get_goal_progress');
      expect(step3.dependencies).toContain(step1.stepId);

      expect(step4.stepNumber).toBe(4);
      expect(step4.toolName).toBe('create_task');
      expect(step4.dependencies).toContain(step2.stepId);
      expect(step4.dependencies).toContain(step3.stepId);

      // Validate the generated plan
      const validation = planningEngine.validatePlan(plan, authContext);
      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });
  });

  describe('Parallel Plan Generation & Grouping', () => {
    it('should generate a parallel plan with independent subtask levels for productivity analysis', async () => {
      const plan = await planningEngine.createPlan(
        'What is my productivity summary and schedule today?',
        authContext,
      );

      expect(plan.steps.length).toBe(2);
      expect(plan.executionMode).toBe('parallel');
      expect(plan.parallelGroups).toBeDefined();
      expect(plan.parallelGroups?.length).toBe(1);
      expect(plan.parallelGroups?.[0].length).toBe(2);

      const validation = planningEngine.validatePlan(plan, authContext);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Cognitive Plan Generation', () => {
    it('should create a 3-phase cognitive plan for analytical comparative queries', () => {
      const intent: Intent = {
        type: 'ANALYTICAL',
        primaryIntent: 'ANALYSIS',
        confidence: 0.9,
        requiresRAG: false,
        requiresMemory: false,
        requiresTool: false,
        requiresAgent: true,
      };

      const plan = planningEngine.createCognitivePlan(
        'Analyze and compare Redis vs Memcached for session storage',
        intent,
      );

      expect(plan.steps.length).toBe(3);
      expect(plan.executionMode).toBe('sequential');
      expect(plan.steps[1].dependencies).toContain(plan.steps[0].stepId);
      expect(plan.steps[2].dependencies).toContain(plan.steps[1].stepId);

      const validation = planningEngine.validatePlan(plan);
      expect(validation.valid).toBe(true);
    });

    it('should create an evidence-oriented cognitive plan for research inquiries', () => {
      const intent: Intent = {
        type: 'KNOWLEDGE_QUESTION',
        primaryIntent: 'RESEARCH_LOOKUP',
        confidence: 0.9,
        requiresRAG: true,
        requiresMemory: false,
        requiresTool: false,
        requiresAgent: false,
      };

      const plan = planningEngine.createCognitivePlan(
        'Research our compliance policies in the security document',
        intent,
      );

      expect(plan.steps.length).toBe(3);
      expect(plan.summary).toContain('retrieval');
      const validation = planningEngine.validatePlan(plan);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Dependency & Plan Validation', () => {
    it('should reject plans with circular dependencies (A -> B -> A)', () => {
      const step1Id = 'step_circ_1';
      const step2Id = 'step_circ_2';

      const invalidPlan: ActionPlan = {
        planId: 'plan_invalid_circ',
        objective: 'Test circular dependency rejection',
        steps: [
          {
            stepId: step1Id,
            stepNumber: 1,
            description: 'Step 1 depends on Step 2',
            toolName: 'list_tasks',
            dependencies: [step2Id],
            riskLevel: 'READ_ONLY',
            status: 'pending',
            verified: false,
          },
          {
            stepId: step2Id,
            stepNumber: 2,
            description: 'Step 2 depends on Step 1',
            toolName: 'get_workspace_info',
            dependencies: [step1Id],
            riskLevel: 'READ_ONLY',
            status: 'pending',
            verified: false,
          },
        ],
        totalSteps: 2,
        requiresConfirmation: false,
        createdAt: new Date().toISOString(),
      };

      const validation = planningEngine.validatePlan(invalidPlan, authContext);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.toLowerCase().includes('circular'))).toBe(true);
      expect(validation.circularDependencies).toBeDefined();
    });

    it('should reject plans where a step depends on itself', () => {
      const step1Id = 'step_self_dep';

      const selfDepPlan: ActionPlan = {
        planId: 'plan_invalid_self_dep',
        objective: 'Test self dependency rejection',
        steps: [
          {
            stepId: step1Id,
            stepNumber: 1,
            description: 'Step 1 depends on itself',
            toolName: 'list_tasks',
            dependencies: [step1Id],
            riskLevel: 'READ_ONLY',
            status: 'pending',
            verified: false,
          },
        ],
        totalSteps: 1,
        requiresConfirmation: false,
        createdAt: new Date().toISOString(),
      };

      const validation = planningEngine.validatePlan(selfDepPlan, authContext);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('cannot depend on itself'))).toBe(true);
    });

    it('should reject plans referencing non-existent dependency IDs', () => {
      const missingDepPlan: ActionPlan = {
        planId: 'plan_missing_dep',
        objective: 'Test missing dependency reference',
        steps: [
          {
            stepId: 'step_1',
            stepNumber: 1,
            description: 'Step 1 depends on ghost step',
            toolName: 'list_tasks',
            dependencies: ['non_existent_step_999'],
            riskLevel: 'READ_ONLY',
            status: 'pending',
            verified: false,
          },
        ],
        totalSteps: 1,
        requiresConfirmation: false,
        createdAt: new Date().toISOString(),
      };

      const validation = planningEngine.validatePlan(missingDepPlan, authContext);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('unresolved dependency'))).toBe(true);
      expect(validation.missingDependencies).toContain('non_existent_step_999');
    });

    it('should reject plans that exceed the maximum allowed step limit', () => {
      const steps: PlanStep[] = [];
      for (let i = 1; i <= 20; i++) {
        steps.push({
          stepId: `step_${i}`,
          stepNumber: i,
          description: `Step ${i}`,
          toolName: 'get_workspace_info',
          riskLevel: 'READ_ONLY',
          status: 'pending',
          verified: false,
        });
      }

      const excessivePlan: ActionPlan = {
        planId: 'plan_excessive_steps',
        objective: 'Test excessive steps limit',
        steps,
        totalSteps: 20,
        requiresConfirmation: false,
        createdAt: new Date().toISOString(),
      };

      const validation = planningEngine.validatePlan(excessivePlan, authContext);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('maximum allowed steps'))).toBe(true);
    });

    it('should reject plans with empty objective or no steps', () => {
      const emptyPlan: ActionPlan = {
        planId: 'plan_empty',
        objective: '',
        steps: [],
        totalSteps: 0,
        requiresConfirmation: false,
        createdAt: new Date().toISOString(),
      };

      const validation = planningEngine.validatePlan(emptyPlan, authContext);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });
});
