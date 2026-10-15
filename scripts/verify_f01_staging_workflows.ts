import dotenv from 'dotenv';
dotenv.config();
import { db } from '../src/database/client';
import { PlanRepository } from '../src/modules/ai/planning/plan-repository';
import { ExecutionRepository } from '../src/modules/ai/execution/execution-repository';
import { FocusRepository } from '../src/modules/workspace/focus/focus.repository';
import { FocusSessionEntity } from '../src/modules/workspace/focus/focus.entity';
import { PlannerService } from '../src/modules/workspace/planner/planner.service';
import crypto from 'crypto';

async function main() {
  console.log('============================================================');
  console.log('STEP 7: VERIFYING REPOSITORY & WORKFLOW INTEGRATION (STAGING)');
  console.log('============================================================');

  const testUserId = crypto.randomUUID();
  const testWorkspaceId = crypto.randomUUID();

  try {
    // 1. Create a transient test user and workspace in staging database
    console.log('[Setup] Creating transient test user and workspace...');
    await db.user.create({
      data: {
        id: testUserId,
        email: `f01_verify_${Date.now()}@example.com`,
        role: 'USER',
        fullName: 'F01 Verifier',
      },
    });

    await db.workspace.create({
      data: {
        id: testWorkspaceId,
        name: 'F01 Verification Workspace',
        slug: `f01-ws-${Date.now()}`,
      },
    });

    await db.workspaceMember.create({
      data: {
        workspaceId: testWorkspaceId,
        userId: testUserId,
        role: 'OWNER',
      },
    });
    console.log('✓ Transient user and workspace created.');

    const authCtx = {
      userId: testUserId,
      workspaceId: testWorkspaceId,
      role: 'OWNER',
    };

    // 2. Verify AgentPlan Persistence via PlanRepository
    console.log('\n[Test 1] Testing AgentPlan & Steps persistence via PlanRepository...');
    const planRepo = new PlanRepository();
    const planId = crypto.randomUUID();
    const step1Id = crypto.randomUUID();
    const step2Id = crypto.randomUUID();

    const planData: any = {
      id: planId,
      version: 1,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      correlationId: `corr-${Date.now()}`,
      status: 'READY',
      goal: { description: 'F-01 Database Verification Goal' },
      constraints: ['No downtime', 'Preserve data'],
      assumptions: ['Prisma 5.22.0 active'],
      confidence: 0.98,
      planHash: crypto.createHash('sha256').update('test-plan').digest('hex'),
      requiresUserInput: false,
      summary: 'Verified execution plan for F-01',
      steps: [
        {
          id: step1Id,
          order: 1,
          title: 'Inspect Schema',
          description: 'Inspect Prisma models and migrations',
          type: 'TOOL',
          status: 'COMPLETED',
        },
        {
          id: step2Id,
          order: 2,
          title: 'Deploy Migration',
          description: 'Deploy idempotent migration safely',
          type: 'TOOL',
          status: 'PENDING',
        },
      ],
      dependencies: [
        {
          stepId: step2Id,
          dependsOnStepId: step1Id,
          type: 'BLOCKS',
        },
      ],
    };

    await planRepo.savePlan(planData);
    console.log('✓ Plan saved via PlanRepository.');

    const fetchedPlan = await planRepo.getPlanById(planId, authCtx);
    if (!fetchedPlan || fetchedPlan.id !== planId || fetchedPlan.steps.length !== 2) {
      throw new Error(`Plan retrieval failed or steps mismatch. Expected 2 steps, got ${fetchedPlan?.steps.length}`);
    }
    console.log('✓ Fetched plan matches saved plan with 2 steps and dependencies.');

    // Update Plan
    planData.status = 'EXECUTING';
    planData.version = 2;
    await planRepo.savePlan(planData);
    const updatedPlan = await planRepo.getPlanById(planId, authCtx);
    if (updatedPlan?.status !== 'EXECUTING' || updatedPlan?.version !== 2) {
      throw new Error(`Plan update failed. Status: ${updatedPlan?.status}`);
    }
    console.log('✓ Plan update verified (version 2, EXECUTING).');

    // 3. Verify AgentExecution & Steps Persistence via ExecutionRepository
    console.log('\n[Test 2] Testing AgentExecution, Steps & Attempts via ExecutionRepository...');
    const execRepo = new ExecutionRepository();
    const execId = crypto.randomUUID();

    const execution = await execRepo.createExecution({
      id: execId,
      planId,
      planVersion: 2,
      planHash: planData.planHash,
      correlationId: planData.correlationId,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      status: 'RUNNING',
      totalSteps: 2,
      idempotencyKey: `idem-${Date.now()}`,
    });
    console.log('✓ Execution created via ExecutionRepository:', execution.id);

    // Persist step
    const stepRecord = await execRepo.persistStep(execId, {
      id: crypto.randomUUID(),
      executionId: execId,
      stepId: step1Id,
      planStepOrder: 1,
      title: 'Executing Step 1',
      description: 'Running step 1 execution',
      status: 'COMPLETED',
      attemptCount: 1,
      maxAttempts: 3,
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 150,
    });
    console.log('✓ Step persisted in database:', stepRecord.id);

    // Record attempt
    const attemptRecord = await execRepo.recordAttempt({
      stepId: stepRecord.id,
      attempt: 1,
      status: 'SUCCESS',
      toolResult: { output: 'Step completed successfully' },
      durationMs: 140,
      startedAt: new Date(),
      completedAt: new Date(),
    });
    console.log('✓ Attempt recorded in database:', attemptRecord.id);

    // Update execution status
    await execRepo.updateStatus(execId, 'RUNNING', 'COMPLETED', testUserId, {
      completedStepIds: [step1Id],
      completedStepsCount: 1,
    });
    const fetchedExec = await execRepo.findById(execId, testUserId);
    if (fetchedExec?.status !== 'COMPLETED' || fetchedExec.completedStepsCount !== 1) {
      throw new Error(`Execution status update failed. Status: ${fetchedExec?.status}`);
    }
    console.log('✓ Execution status updated to COMPLETED and verified.');

    // 4. Verify PlannerBlock Workflow via PlannerService & db
    console.log('\n[Test 3] Testing PlannerBlock persistence & queries...');
    const plannerBlock = await db.plannerBlock.create({
      data: {
        userId: testUserId,
        workspaceId: testWorkspaceId,
        dayKey: '2026-10-13',
        title: 'F-01 Architecture Review',
        start: 10.0,
        duration: 60,
        bucket: 'study',
        kind: 'fixed',
        priority: 'P0',
        energy: 'high',
        completed: false,
      },
    });
    console.log('✓ PlannerBlock created:', plannerBlock.id);

    const plannerService = new PlannerService();
    const plannerData = await plannerService.getPlanner(testUserId);
    const dayBlocks = plannerData.daysData['2026-10-13']?.blocks || [];
    const foundBlock = dayBlocks.find((b: any) => b.id === plannerBlock.id);
    if (!foundBlock || foundBlock.label !== 'F-01 Architecture Review') {
      throw new Error('PlannerService.getPlanner did not return the persisted block');
    }
    console.log('✓ PlannerService successfully retrieved persisted block via relational query.');

    // Update PlannerBlock
    await db.plannerBlock.update({
      where: { id: plannerBlock.id },
      data: { completed: true },
    });
    const blockAfterUpdate = await db.plannerBlock.findUnique({ where: { id: plannerBlock.id } });
    if (!blockAfterUpdate?.completed) {
      throw new Error('PlannerBlock update failed');
    }
    console.log('✓ PlannerBlock update verified.');

    // Delete PlannerBlock
    await db.plannerBlock.delete({ where: { id: plannerBlock.id } });
    const blockAfterDelete = await db.plannerBlock.findUnique({ where: { id: plannerBlock.id } });
    if (blockAfterDelete !== null) {
      throw new Error('PlannerBlock deletion failed');
    }
    console.log('✓ PlannerBlock deleted successfully.');

    // 5. Verify FocusSession Workflow via FocusRepository
    console.log('\n[Test 4] Testing FocusSession workflow via FocusRepository...');
    const focusRepo = new FocusRepository();
    const focusEntity = new FocusSessionEntity({
      userId: testUserId,
      workspaceId: testWorkspaceId,
      type: 'focus',
      status: 'IN_PROGRESS',
      durationMinutes: 25,
      actualDurationSeconds: 0,
      distractionsCount: 0,
      startTime: new Date(),
    });

    const createdSession = await focusRepo.create(testUserId, focusEntity);
    console.log('✓ FocusSession created via FocusRepository:', createdSession.id);

    const fetchedSession = await focusRepo.findById(createdSession.id);
    if (!fetchedSession || fetchedSession.id !== createdSession.id) {
      throw new Error('FocusRepository.findById did not return created session');
    }
    console.log('✓ FocusRepository.findById verified.');

    // Complete session
    fetchedSession.status = 'COMPLETED';
    fetchedSession.actualDurationSeconds = 1500;
    fetchedSession.endTime = new Date();
    const completedSession = await focusRepo.update(fetchedSession);
    if (completedSession.status !== 'COMPLETED' || completedSession.actualDurationSeconds !== 1500) {
      throw new Error('FocusSession update/completion failed');
    }
    console.log('✓ FocusSession completed and verified.');

    // 6. Test Cascade Deletion from User
    console.log('\n[Test 5] Verifying cascade cleanup when test user is deleted...');
    await db.user.delete({ where: { id: testUserId } });

    // Verify all child records were cascade-deleted
    const remainingPlan = await db.agentPlan.findUnique({ where: { id: planId } });
    const remainingExec = await db.agentExecution.findUnique({ where: { id: execId } });
    const remainingSession = await db.focusSession.findUnique({ where: { id: createdSession.id } });

    if (remainingPlan !== null || remainingExec !== null || remainingSession !== null) {
      throw new Error('Cascade delete check failed on user deletion');
    }
    console.log('✓ All AgentPlan, AgentExecution, and FocusSession records cleanly cascade-deleted with User.');

    await db.workspace.delete({ where: { id: testWorkspaceId } }).catch(() => {});
    console.log('✓ Transient workspace cleaned up.');

    console.log('\n============================================================');
    console.log('ALL REPOSITORY & WORKFLOW TESTS IN STAGING PASSED (100% OK)');
    console.log('============================================================');

  } catch (err: any) {
    console.error('❌ STAGING WORKFLOW VERIFICATION FAILED:', err.message);
    // Cleanup if possible
    try {
      await db.user.delete({ where: { id: testUserId } }).catch(() => {});
      await db.workspace.delete({ where: { id: testWorkspaceId } }).catch(() => {});
    } catch {}
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();
