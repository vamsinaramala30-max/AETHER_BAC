import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlanRepository } from '../../modules/ai/planning/plan-repository.js';
import { PlanningEngine } from '../../modules/ai/planning/planning-engine.js';
import { db } from '../../database/client.js';
import { AppError } from '../../middleware/error.middleware.js';
import type { AgentPlan } from '../../modules/ai/planning/planning-types.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('DATA-01: AgentPlan Persistence & UUID Correctness', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const planId = '22222222-2222-4222-8222-222222222222';
  const stepId1 = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('PlanningEngine ID Generation', () => {
    it('generates standard RFC 4122 UUIDs for plan IDs and step IDs', async () => {
      const engine = new PlanningEngine();
      const plan = await engine.createPlan(
        'project review preparation and team sync',
        {
          userId,
          workspaceId: '00000000-0000-0000-0000-000000000000',
          sessionId: 'sess-1',
          roles: ['user'],
          permissions: [],
        } as any,
      );

      expect(plan.planId).toBeDefined();
      expect(UUID_REGEX.test(plan.planId)).toBe(true);

      expect(plan.steps.length).toBeGreaterThan(0);
      for (const step of plan.steps) {
        expect(step.stepId).toBeDefined();
        expect(UUID_REGEX.test(step.stepId)).toBe(true);
      }
    });
  });

  describe('PlanRepository PostgreSQL Authority & Error Truthfulness', () => {
    let repo: PlanRepository;

    beforeEach(() => {
      repo = new PlanRepository();
    });

    it('persists plan and steps to PostgreSQL via Prisma upsert when UUIDs are present', async () => {
      const mockPersistedPrismaRecord = {
        id: planId,
        version: 1,
        userId,
        workspaceId: null,
        projectId: null,
        conversationId: null,
        correlationId: 'corr-1',
        status: 'READY',
        goal: { text: 'Deploy service' },
        constraints: [],
        assumptions: [],
        confidence: 0.95,
        planHash: 'hash123',
        requiresUserInput: false,
        metadata: { summary: 'Plan summary' },
        createdAt: new Date(),
        updatedAt: new Date(),
        steps: [
          {
            id: stepId1,
            planId,
            order: 0,
            title: 'Build project',
            description: 'Run build script',
            type: 'EXECUTE_TOOL',
            toolName: 'shell',
            toolVersion: '1.0',
            input: {},
            expectedOutcome: 'Zero exit code',
            requiresConfirmation: false,
            status: 'PENDING',
          },
        ],
        dependencies: [],
      };

      const upsertSpy = vi
        .spyOn((db as any).agentPlan, 'upsert')
        .mockResolvedValue(mockPersistedPrismaRecord);

      const testPlan: AgentPlan = {
        id: planId,
        version: 1,
        userId,
        correlationId: 'corr-1',
        status: 'READY',
        goal: { text: 'Deploy service' } as any,
        constraints: [],
        assumptions: [],
        confidence: 0.95,
        planHash: 'hash123',
        requiresUserInput: false,
        summary: 'Plan summary',
        steps: [
          {
            id: stepId1,
            order: 0,
            title: 'Build project',
            description: 'Run build script',
            type: 'EXECUTE_TOOL' as any,
            status: 'PENDING',
            dependencies: [],
          },
        ],
        dependencies: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await repo.savePlan(testPlan);

      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(result.id).toBe(planId);
      expect(result.steps[0].id).toBe(stepId1);
    });

    it('fails truthfully with AppError 500 when PostgreSQL persistence fails (NO silent memory deception)', async () => {
      vi.spyOn((db as any).agentPlan, 'upsert').mockRejectedValue(
        new Error('Connection to database timed out'),
      );

      const testPlan: AgentPlan = {
        id: planId,
        version: 1,
        userId,
        correlationId: 'corr-1',
        status: 'READY',
        goal: { text: 'Deploy service' } as any,
        constraints: [],
        assumptions: [],
        requiresUserInput: false,
        summary: 'Test summary',
        steps: [],
        dependencies: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await expect(repo.savePlan(testPlan)).rejects.toThrow(AppError);
      await expect(repo.savePlan(testPlan)).rejects.toThrowError(
        /Database persistence failed for AgentPlan: Connection to database timed out/,
      );
    });

    it('permits non-UUID test fixture strings to utilize isolated test cache without database errors', async () => {
      const fixturePlan: AgentPlan = {
        id: 'plan_fixture_test_only',
        version: 1,
        userId: 'user_fixture_test',
        correlationId: 'corr-test',
        status: 'READY',
        goal: { text: 'Test fixture goal' } as any,
        constraints: [],
        assumptions: [],
        requiresUserInput: false,
        summary: 'Fixture summary',
        steps: [],
        dependencies: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const saved = await repo.savePlan(fixturePlan);
      expect(saved.id).toBe('plan_fixture_test_only');

      const retrieved = await repo.findById('plan_fixture_test_only');
      expect((retrieved?.goal as any)?.text).toBe('Test fixture goal');
    });
  });
});
