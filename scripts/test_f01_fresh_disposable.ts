import dotenv from 'dotenv';
dotenv.config();
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

async function main() {
  const schemaName = 'test_disposable_f01_fresh';
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('============================================================');
    console.log('TEST SUITE 1: FRESH DISPOSABLE DATABASE MIGRATION & INTEGRITY');
    console.log('============================================================');

    await client.connect();
    console.log(`[Step 1] Initializing fresh isolated schema: ${schemaName}...`);
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE;`);
    await client.query(`CREATE SCHEMA "${schemaName}";`);
    await client.query(`SET search_path TO "${schemaName}", public;`);
    console.log(`✓ Fresh schema ${schemaName} ready.`);

    // 1. Apply baseline migration: 20261010000000_init
    console.log('\n[Step 2] Applying baseline migration (20261010000000_init)...');
    const initSql = fs.readFileSync(
      path.join(process.cwd(), 'prisma/migrations/20261010000000_init/migration.sql'),
      'utf-8'
    );
    await client.query(initSql);
    console.log('✓ Baseline migration applied successfully.');

    // 2. Apply F-01 migration: 20261013000000_f01_agent_planner_focus_persistence
    console.log('\n[Step 3] Applying F-01 migration (20261013000000_f01_agent_planner_focus_persistence)...');
    const f01Sql = fs.readFileSync(
      path.join(process.cwd(), 'prisma/migrations/20261013000000_f01_agent_planner_focus_persistence/migration.sql'),
      'utf-8'
    );
    await client.query(f01Sql);
    console.log('✓ F-01 migration applied cleanly.');

    // 3. Test IDEMPOTENCY: Re-apply F-01 migration immediately
    console.log('\n[Step 4] Testing Idempotency (re-applying F-01 migration without error)...');
    await client.query(f01Sql);
    console.log('✓ Idempotency verified: re-application succeeded without any constraint or relation collisions.');

    // 4. Verify all tables exist in fresh schema
    console.log('\n[Step 5] Verifying schema objects in fresh database...');
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

    const tablesRes = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name;`,
      [schemaName]
    );
    const existingTableNames = new Set(tablesRes.rows.map(r => r.table_name));

    for (const tbl of targetTables) {
      if (!existingTableNames.has(tbl)) {
        throw new Error(`CRITICAL: Table ${tbl} missing after migration!`);
      }
      console.log(`  ✓ Table exists: ${tbl}`);
    }

    // 5. Test CRUD & Foreign Key Integrity for AgentPlan & Execution & Planner & Focus
    console.log('\n[Step 6] Testing CRUD & Cascading Foreign Key Integrity...');

    // A. Create test user
    const userId = crypto.randomUUID();
    await client.query(`
      INSERT INTO "users" (id, email, password_hash, first_name, last_name, role)
      VALUES ($1, 'f01_tester@example.com', 'hashed_pwd', 'F01', 'Tester', 'USER');
    `, [userId]);
    console.log('  ✓ Created test user:', userId);

    // B. Create AgentPlan, Step, Dependency
    const planId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    const depStepId = crypto.randomUUID();
    const depId = crypto.randomUUID();

    await client.query(`
      INSERT INTO "agent_plans" (id, "userId", "correlationId", status, goal, constraints, assumptions)
      VALUES ($1, $2, 'corr-001', 'READY', '{"description":"Test Goal"}'::jsonb, '[]'::jsonb, '[]'::jsonb);
    `, [planId, userId]);

    await client.query(`
      INSERT INTO "agent_plan_steps" (id, "planId", "order", title, description, status)
      VALUES ($1, $2, 1, 'Analyze Context', 'Analyze available resources', 'PENDING');
    `, [stepId, planId]);

    await client.query(`
      INSERT INTO "agent_plan_dependencies" (id, "planId", "stepId", "dependsOnStepId", type)
      VALUES ($1, $2, $3, $4, 'BLOCKS');
    `, [depId, planId, stepId, depStepId]);
    console.log('  ✓ Created AgentPlan, Step, and Dependency');

    // C. Read AgentPlan with step and dependency
    const planRead = await client.query(`SELECT * FROM "agent_plans" WHERE id = $1;`, [planId]);
    const stepRead = await client.query(`SELECT * FROM "agent_plan_steps" WHERE "planId" = $1;`, [planId]);
    const depRead = await client.query(`SELECT * FROM "agent_plan_dependencies" WHERE "planId" = $1;`, [planId]);
    if (planRead.rows.length !== 1 || stepRead.rows.length !== 1 || depRead.rows.length !== 1) {
      throw new Error('Read verification failed for AgentPlan hierarchy');
    }
    console.log('  ✓ Read AgentPlan hierarchy successfully verified');

    // D. Update AgentPlan
    await client.query(`
      UPDATE "agent_plans" SET status = 'EXECUTING', confidence = 0.95 WHERE id = $1;
    `, [planId]);
    const planUpdated = await client.query(`SELECT status, confidence FROM "agent_plans" WHERE id = $1;`, [planId]);
    if (planUpdated.rows[0].status !== 'EXECUTING' || planUpdated.rows[0].confidence !== 0.95) {
      throw new Error('Update verification failed for AgentPlan');
    }
    console.log('  ✓ Update AgentPlan verified');

    // E. Create AgentExecution, Step, Attempt
    const executionId = crypto.randomUUID();
    const execStepId = crypto.randomUUID();
    const attemptId = crypto.randomUUID();

    await client.query(`
      INSERT INTO "agent_executions" (id, "planId", "planVersion", "planHash", "correlationId", "userId", status, "totalSteps")
      VALUES ($1, $2, 1, 'hash_abc123', 'corr-001', $3, 'RUNNING'::"AgentExecutionStatus", 3);
    `, [executionId, planId, userId]);

    await client.query(`
      INSERT INTO "agent_execution_steps" (id, "executionId", "stepId", "planStepOrder", title, description, status)
      VALUES ($1, $2, 'step-1', 1, 'Step 1 Title', 'Step 1 Desc', 'RUNNING'::"AgentExecutionStepStatus");
    `, [execStepId, executionId]);

    await client.query(`
      INSERT INTO "agent_execution_attempts" (id, "stepId", attempt, status)
      VALUES ($1, $2, 1, 'IN_PROGRESS');
    `, [attemptId, execStepId]);
    console.log('  ✓ Created AgentExecution, Step, and Attempt hierarchy');

    // Read execution
    const execRead = await client.query(`SELECT * FROM "agent_executions" WHERE id = $1;`, [executionId]);
    const execStepRead = await client.query(`SELECT * FROM "agent_execution_steps" WHERE "executionId" = $1;`, [executionId]);
    const attemptRead = await client.query(`SELECT * FROM "agent_execution_attempts" WHERE "stepId" = $1;`, [execStepId]);
    if (execRead.rows.length !== 1 || execStepRead.rows.length !== 1 || attemptRead.rows.length !== 1) {
      throw new Error('Read verification failed for AgentExecution hierarchy');
    }
    console.log('  ✓ Read AgentExecution hierarchy verified');

    // F. Create PlannerBlock
    const plannerBlockId = crypto.randomUUID();
    await client.query(`
      INSERT INTO "planner_blocks" (id, "userId", "dayKey", title, start, duration, bucket, kind)
      VALUES ($1, $2, '2026-10-13', 'Deep Work Block', 9.0, 90, 'study', 'fixed');
    `, [plannerBlockId, userId]);

    const blockRead = await client.query(`SELECT * FROM "planner_blocks" WHERE id = $1;`, [plannerBlockId]);
    if (blockRead.rows.length !== 1 || blockRead.rows[0].title !== 'Deep Work Block') {
      throw new Error('PlannerBlock CRUD verification failed');
    }
    console.log('  ✓ Created and verified PlannerBlock');

    // G. Create FocusSession
    const focusSessionId = crypto.randomUUID();
    await client.query(`
      INSERT INTO "focus_sessions" (id, "userId", type, status, "durationMinutes", "actualDurationSeconds")
      VALUES ($1, $2, 'focus', 'COMPLETED', 25, 1500);
    `, [focusSessionId, userId]);

    const sessionRead = await client.query(`SELECT * FROM "focus_sessions" WHERE id = $1;`, [focusSessionId]);
    if (sessionRead.rows.length !== 1 || sessionRead.rows[0].status !== 'COMPLETED') {
      throw new Error('FocusSession CRUD verification failed');
    }
    console.log('  ✓ Created and verified FocusSession');

    // H. Cascade Deletion Verification:
    // Delete AgentPlan -> steps and dependencies must be deleted cascade
    await client.query(`DELETE FROM "agent_plans" WHERE id = $1;`, [planId]);
    const orphanSteps = await client.query(`SELECT * FROM "agent_plan_steps" WHERE "planId" = $1;`, [planId]);
    const orphanDeps = await client.query(`SELECT * FROM "agent_plan_dependencies" WHERE "planId" = $1;`, [planId]);
    if (orphanSteps.rows.length !== 0 || orphanDeps.rows.length !== 0) {
      throw new Error('Cascade delete failure on agent_plans');
    }
    console.log('  ✓ AgentPlan CASCADE delete successfully verified (steps & dependencies removed)');

    // Delete AgentExecution -> execution steps and attempts must be deleted cascade
    await client.query(`DELETE FROM "agent_executions" WHERE id = $1;`, [executionId]);
    const orphanExecSteps = await client.query(`SELECT * FROM "agent_execution_steps" WHERE "executionId" = $1;`, [executionId]);
    const orphanAttempts = await client.query(`SELECT * FROM "agent_execution_attempts" WHERE "stepId" = $1;`, [execStepId]);
    if (orphanExecSteps.rows.length !== 0 || orphanAttempts.rows.length !== 0) {
      throw new Error('Cascade delete failure on agent_executions');
    }
    console.log('  ✓ AgentExecution CASCADE delete successfully verified (steps & attempts removed)');

    // Delete User -> PlannerBlock and FocusSession must be deleted cascade
    await client.query(`DELETE FROM "users" WHERE id = $1;`, [userId]);
    const orphanBlocks = await client.query(`SELECT * FROM "planner_blocks" WHERE id = $1;`, [plannerBlockId]);
    const orphanSessions = await client.query(`SELECT * FROM "focus_sessions" WHERE id = $1;`, [focusSessionId]);
    if (orphanBlocks.rows.length !== 0 || orphanSessions.rows.length !== 0) {
      throw new Error('Cascade delete failure from users table');
    }
    console.log('  ✓ User CASCADE delete successfully verified (planner_blocks & focus_sessions removed)');

    console.log('\n============================================================');
    console.log('ALL TESTS IN FRESH DISPOSABLE DATABASE PASSED (100% OK)');
    console.log('============================================================');

  } catch (err: any) {
    console.error('❌ FRESH DATABASE TEST FAILED:', err.message);
    process.exit(1);
  } finally {
    try {
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE;`);
      console.log(`✓ Cleaned up test schema ${schemaName}`);
    } catch {}
    await client.end();
  }
}

main();
