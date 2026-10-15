-- ============================================================================
-- AETHER Platform Migration: 20261013000000_f01_agent_planner_focus_persistence
-- Phase 1: F-01 Database Schema and Migration Integrity
-- Models:
--   - AgentPlan (agent_plans)
--   - AgentPlanStep (agent_plan_steps)
--   - AgentPlanDependency (agent_plan_dependencies)
--   - AgentExecution (agent_executions)
--   - AgentExecutionStep (agent_execution_steps)
--   - AgentExecutionAttempt (agent_execution_attempts)
--   - PlannerBlock (planner_blocks)
--   - FocusSession (focus_sessions)
-- Enums:
--   - AgentExecutionStatus
--   - AgentExecutionStepStatus
-- Idempotent & non-destructive release gate compliance
-- ============================================================================

-- 1. Create Enums
DO $$ BEGIN
    CREATE TYPE "AgentExecutionStatus" AS ENUM (
        'PENDING',
        'VALIDATING',
        'AUTHORIZED',
        'RUNNING',
        'WAITING_FOR_INPUT',
        'WAITING_FOR_APPROVAL',
        'VERIFYING',
        'RECOVERING',
        'COMPLETED',
        'PARTIALLY_COMPLETED',
        'FAILED',
        'TIMED_OUT',
        'CANCELLED',
        'BLOCKED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "AgentExecutionStepStatus" AS ENUM (
        'PENDING',
        'RUNNING',
        'WAITING_FOR_INPUT',
        'WAITING_FOR_APPROVAL',
        'VERIFYING',
        'COMPLETED',
        'FAILED',
        'TIMED_OUT',
        'CANCELLED',
        'BLOCKED',
        'SKIPPED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Agent Planning Tables
CREATE TABLE IF NOT EXISTS "agent_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version" INTEGER NOT NULL DEFAULT 1,
    "userId" UUID NOT NULL,
    "workspaceId" UUID,
    "projectId" UUID,
    "conversationId" UUID,
    "correlationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "goal" JSONB NOT NULL,
    "constraints" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "assumptions" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "confidence" DOUBLE PRECISION,
    "planHash" TEXT,
    "requiresUserInput" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "agent_plan_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "planId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TOOL',
    "toolName" TEXT,
    "toolVersion" TEXT,
    "input" JSONB,
    "expectedOutcome" TEXT,
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_plan_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "agent_plan_dependencies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "planId" UUID NOT NULL,
    "stepId" TEXT NOT NULL,
    "dependsOnStepId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BLOCKS',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_plan_dependencies_pkey" PRIMARY KEY ("id")
);

-- 3. Agent Execution Tables
CREATE TABLE IF NOT EXISTS "agent_executions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "planId" UUID NOT NULL,
    "planVersion" INTEGER NOT NULL,
    "planHash" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "handoffId" TEXT,
    "userId" UUID NOT NULL,
    "workspaceId" UUID,
    "projectId" UUID,
    "conversationId" UUID,
    "status" "AgentExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "currentStepId" TEXT,
    "completedStepIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "failedStepIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "blockedStepIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "failureReason" TEXT,
    "failureCategory" TEXT,
    "replanningRequired" BOOLEAN NOT NULL DEFAULT false,
    "previousExecutionId" UUID,
    "idempotencyKey" TEXT,
    "totalSteps" INTEGER NOT NULL DEFAULT 0,
    "completedStepsCount" INTEGER NOT NULL DEFAULT 0,
    "failedStepsCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(6),

    CONSTRAINT "agent_executions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "agent_execution_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "executionId" UUID NOT NULL,
    "stepId" TEXT NOT NULL,
    "planStepOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "toolName" TEXT,
    "toolVersion" TEXT,
    "idempotencyKey" TEXT,
    "status" "AgentExecutionStepStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "input" JSONB,
    "toolResult" JSONB,
    "verified" BOOLEAN,
    "verificationStatus" TEXT,
    "verificationDetails" TEXT,
    "failureReason" TEXT,
    "failureCategory" TEXT,
    "startedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "durationMs" DOUBLE PRECISION,

    CONSTRAINT "agent_execution_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "agent_execution_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stepId" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "toolResult" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(6),
    "durationMs" DOUBLE PRECISION,

    CONSTRAINT "agent_execution_attempts_pkey" PRIMARY KEY ("id")
);

-- 4. Productivity: Planner & Focus Persistence Tables
CREATE TABLE IF NOT EXISTS "planner_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "workspaceId" UUID,
    "dayKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start" DOUBLE PRECISION NOT NULL,
    "duration" INTEGER NOT NULL,
    "startTime" TIMESTAMPTZ(6),
    "endTime" TIMESTAMPTZ(6),
    "bucket" TEXT NOT NULL DEFAULT 'other',
    "kind" TEXT NOT NULL DEFAULT 'flexible',
    "subject" TEXT,
    "priority" TEXT,
    "energy" TEXT,
    "revision" JSONB,
    "groupId" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "taskId" UUID,
    "calendarEventId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planner_blocks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "focus_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "workspaceId" UUID,
    "projectId" UUID,
    "taskId" UUID,
    "type" TEXT NOT NULL DEFAULT 'focus',
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "durationMinutes" INTEGER NOT NULL DEFAULT 25,
    "actualDurationSeconds" INTEGER NOT NULL DEFAULT 0,
    "distractionsCount" INTEGER NOT NULL DEFAULT 0,
    "startTime" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMPTZ(6),
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "focus_sessions_pkey" PRIMARY KEY ("id")
);

-- 5. Unique Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "agent_executions_idempotencyKey_key" ON "agent_executions"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_execution_steps_executionId_stepId_key" ON "agent_execution_steps"("executionId", "stepId");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_execution_attempts_stepId_attempt_key" ON "agent_execution_attempts"("stepId", "attempt");

-- 6. Query & Performance Indexes
CREATE INDEX IF NOT EXISTS "agent_plans_userId_status_idx" ON "agent_plans"("userId", "status");
CREATE INDEX IF NOT EXISTS "agent_plans_workspaceId_userId_idx" ON "agent_plans"("workspaceId", "userId");
CREATE INDEX IF NOT EXISTS "agent_plans_correlationId_idx" ON "agent_plans"("correlationId");

CREATE INDEX IF NOT EXISTS "agent_plan_steps_planId_order_idx" ON "agent_plan_steps"("planId", "order");
CREATE INDEX IF NOT EXISTS "agent_plan_dependencies_planId_idx" ON "agent_plan_dependencies"("planId");

CREATE INDEX IF NOT EXISTS "agent_executions_userId_status_idx" ON "agent_executions"("userId", "status");
CREATE INDEX IF NOT EXISTS "agent_executions_workspaceId_userId_idx" ON "agent_executions"("workspaceId", "userId");
CREATE INDEX IF NOT EXISTS "agent_executions_projectId_idx" ON "agent_executions"("projectId");
CREATE INDEX IF NOT EXISTS "agent_executions_planId_idx" ON "agent_executions"("planId");
CREATE INDEX IF NOT EXISTS "agent_executions_correlationId_idx" ON "agent_executions"("correlationId");
CREATE INDEX IF NOT EXISTS "agent_executions_status_idx" ON "agent_executions"("status");
CREATE INDEX IF NOT EXISTS "agent_executions_startedAt_idx" ON "agent_executions"("startedAt");

CREATE INDEX IF NOT EXISTS "agent_execution_steps_executionId_idx" ON "agent_execution_steps"("executionId");
CREATE INDEX IF NOT EXISTS "agent_execution_steps_executionId_status_idx" ON "agent_execution_steps"("executionId", "status");
CREATE INDEX IF NOT EXISTS "agent_execution_attempts_stepId_idx" ON "agent_execution_attempts"("stepId");

CREATE INDEX IF NOT EXISTS "planner_blocks_userId_dayKey_idx" ON "planner_blocks"("userId", "dayKey");
CREATE INDEX IF NOT EXISTS "planner_blocks_userId_createdAt_idx" ON "planner_blocks"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "planner_blocks_taskId_idx" ON "planner_blocks"("taskId");
CREATE INDEX IF NOT EXISTS "planner_blocks_calendarEventId_idx" ON "planner_blocks"("calendarEventId");

CREATE INDEX IF NOT EXISTS "focus_sessions_userId_status_idx" ON "focus_sessions"("userId", "status");
CREATE INDEX IF NOT EXISTS "focus_sessions_userId_createdAt_idx" ON "focus_sessions"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "focus_sessions_workspaceId_userId_idx" ON "focus_sessions"("workspaceId", "userId");
CREATE INDEX IF NOT EXISTS "focus_sessions_taskId_idx" ON "focus_sessions"("taskId");
CREATE INDEX IF NOT EXISTS "focus_sessions_projectId_idx" ON "focus_sessions"("projectId");

-- 7. Foreign Key Constraints (Protected with DO blocks for idempotency)
DO $$ BEGIN
    ALTER TABLE "agent_plans" ADD CONSTRAINT "agent_plans_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "agent_plan_steps" ADD CONSTRAINT "agent_plan_steps_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "agent_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "agent_plan_dependencies" ADD CONSTRAINT "agent_plan_dependencies_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "agent_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "agent_executions" ADD CONSTRAINT "agent_executions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "agent_execution_steps" ADD CONSTRAINT "agent_execution_steps_executionId_fkey"
    FOREIGN KEY ("executionId") REFERENCES "agent_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "agent_execution_attempts" ADD CONSTRAINT "agent_execution_attempts_stepId_fkey"
    FOREIGN KEY ("stepId") REFERENCES "agent_execution_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "planner_blocks" ADD CONSTRAINT "planner_blocks_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'workspaces') THEN
        ALTER TABLE "planner_blocks" ADD CONSTRAINT "planner_blocks_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'tasks') THEN
        ALTER TABLE "planner_blocks" ADD CONSTRAINT "planner_blocks_taskId_fkey"
        FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'calendar_events') THEN
        ALTER TABLE "planner_blocks" ADD CONSTRAINT "planner_blocks_calendarEventId_fkey"
        FOREIGN KEY ("calendarEventId") REFERENCES "calendar_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'workspaces') THEN
        ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'projects') THEN
        ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'tasks') THEN
        ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_taskId_fkey"
        FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
