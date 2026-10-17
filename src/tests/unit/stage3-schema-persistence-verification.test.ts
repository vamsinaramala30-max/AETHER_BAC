import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { validateDisposableTestDatabaseUrl } from '../helpers/test-db-guard.js';

// Strict Safety Guard: Never execute against default DATABASE_URL or remote production
const guardResult = validateDisposableTestDatabaseUrl(process.env.DISPOSABLE_TEST_DATABASE_URL);

if (!guardResult.isAllowed) {
  describe.skip('Step 3: Database Schema Drift & Persistence Verification (AUDIT-CRIT-01)', () => {
    it(`SKIPPED: ${guardResult.reason}`, () => {
      // Skipped safely: protects live production database from test queries
    });
  });
} else {
  // Only executed when a verified, isolated local test database is provided
  describe('Step 3: Database Schema Drift & Persistence Verification (AUDIT-CRIT-01)', () => {
    let testDb: any;
    const targetTables = [
      'agent_plans',
      'agent_plan_steps',
      'agent_plan_dependencies',
      'agent_executions',
      'agent_execution_steps',
      'agent_execution_attempts',
      'planner_blocks',
      'focus_sessions',
    ];

    beforeAll(async () => {
      const { PrismaClient } = await import('@prisma/client');
      testDb = new PrismaClient({
        datasources: {
          db: {
            url: guardResult.url!,
          },
        },
      });
      await testDb.$connect();
    });

    afterAll(async () => {
      if (testDb) {
        await testDb.$disconnect().catch(() => {});
      }
    });

    it('confirms all 8 core tables exist in the public PostgreSQL schema', async () => {
      const rows = (await testDb.$queryRaw`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name = ANY(${targetTables})
        ORDER BY table_name;
      `) as { table_name: string }[];

      const foundTables = rows.map((r) => r.table_name);
      console.log('Verified database tables present:', foundTables);

      for (const table of targetTables) {
        expect(
          foundTables,
          `Expected table "${table}" to exist in PostgreSQL public schema`,
        ).toContain(table);
      }
    });

    it('verifies read/count persistence queries on agentPlan table', async () => {
      const planCount = await (testDb as any).agentPlan.count();
      expect(typeof planCount).toBe('number');
      expect(planCount).toBeGreaterThanOrEqual(0);
    });

    it('verifies read/count persistence queries on agentExecution table', async () => {
      const execCount = await (testDb as any).agentExecution.count();
      expect(typeof execCount).toBe('number');
      expect(execCount).toBeGreaterThanOrEqual(0);
    });

    it('verifies read/count persistence queries on plannerBlock table', async () => {
      const blockCount = await (testDb as any).plannerBlock.count();
      expect(typeof blockCount).toBe('number');
      expect(blockCount).toBeGreaterThanOrEqual(0);
    });

    it('verifies read/count persistence queries on focusSession table', async () => {
      const sessionCount = await (testDb as any).focusSession.count();
      expect(typeof sessionCount).toBe('number');
      expect(sessionCount).toBeGreaterThanOrEqual(0);
    });
  });
}
