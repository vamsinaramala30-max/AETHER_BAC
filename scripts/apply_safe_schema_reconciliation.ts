import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';

const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
console.log('Using direct DB URL for DDL:', directUrl?.replace(/:[^:@]+@/, ':***@'));

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: directUrl,
    },
  },
});

const sqlStatements = [
  // 1. Create Enums if not exist
  `DO $$ BEGIN CREATE TYPE "FileStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN CREATE TYPE "ProjectPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN CREATE TYPE "GoalStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'AT_RISK', 'COMPLETED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN CREATE TYPE "MilestoneStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'MISSED'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN CREATE TYPE "FolderType" AS ENUM ('NOTES', 'FILES', 'KNOWLEDGE'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN CREATE TYPE "AutomationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'NEEDS_APPROVAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,

  // 2. Add missing columns to projects
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE';`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "priority" "ProjectPriority" NOT NULL DEFAULT 'MEDIUM';`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "color" TEXT;`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "icon" TEXT;`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "category" TEXT;`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT '{}';`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "isFavorite" BOOLEAN NOT NULL DEFAULT false;`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMPTZ(6);`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMPTZ(6);`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "progress" INTEGER NOT NULL DEFAULT 0;`,

  // 3. Folders table
  `CREATE TABLE IF NOT EXISTS "folders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" UUID,
    "type" "FolderType" NOT NULL DEFAULT 'FILES',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE INDEX IF NOT EXISTS "folders_workspaceId_userId_idx" ON "folders"("workspaceId", "userId");`,

  // 4. Files & File Versions tables
  `CREATE TABLE IF NOT EXISTS "files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING',
    "userId" UUID NOT NULL,
    "workspaceId" UUID,
    "projectId" UUID,
    "folderId" UUID,
    "description" TEXT,
    "isTrash" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "lastAccessedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE INDEX IF NOT EXISTS "files_userId_idx" ON "files"("userId");`,
  `CREATE INDEX IF NOT EXISTS "files_workspaceId_idx" ON "files"("workspaceId");`,
  `CREATE INDEX IF NOT EXISTS "files_projectId_idx" ON "files"("projectId");`,
  `CREATE INDEX IF NOT EXISTS "files_userId_lastAccessedAt_idx" ON "files"("userId", "lastAccessedAt");`,
  `CREATE INDEX IF NOT EXISTS "files_userId_isTrash_idx" ON "files"("userId", "isTrash");`,

  `CREATE TABLE IF NOT EXISTS "file_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fileId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,
    CONSTRAINT "file_versions_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE INDEX IF NOT EXISTS "file_versions_fileId_idx" ON "file_versions"("fileId");`,
  `CREATE INDEX IF NOT EXISTS "file_versions_fileId_version_idx" ON "file_versions"("fileId", "version");`,

  // 5. Tasks table
  `CREATE TABLE IF NOT EXISTS "tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" TIMESTAMPTZ(6),
    "startDate" TIMESTAMPTZ(6),
    "assigneeId" UUID,
    "creatorId" UUID NOT NULL,
    "parentTaskId" UUID,
    "labels" TEXT[] NOT NULL DEFAULT '{}',
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurringRule" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "estimatedHours" DOUBLE PRECISION,
    "loggedMinutes" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMPTZ(6),
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),
    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE INDEX IF NOT EXISTS "tasks_projectId_status_idx" ON "tasks"("projectId", "status");`,
  `CREATE INDEX IF NOT EXISTS "tasks_assigneeId_status_idx" ON "tasks"("assigneeId", "status");`,
  `CREATE INDEX IF NOT EXISTS "tasks_workspaceId_creatorId_idx" ON "tasks"("workspaceId", "creatorId");`,
  `CREATE INDEX IF NOT EXISTS "tasks_dueDate_idx" ON "tasks"("dueDate");`,

  // 6. Task comments & attachments
  `CREATE TABLE IF NOT EXISTS "task_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "taskId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE INDEX IF NOT EXISTS "task_comments_taskId_idx" ON "task_comments"("taskId");`,

  `CREATE TABLE IF NOT EXISTS "task_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "taskId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "task_attachments_taskId_fileId_key" UNIQUE ("taskId", "fileId")
  );`,

  // 7. Goals & Milestones
  `CREATE TABLE IF NOT EXISTS "goals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetDate" TIMESTAMPTZ(6),
    "progress" INTEGER NOT NULL DEFAULT 0,
    "status" "GoalStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),
    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE INDEX IF NOT EXISTS "goals_workspaceId_userId_idx" ON "goals"("workspaceId", "userId");`,
  `CREATE INDEX IF NOT EXISTS "goals_projectId_idx" ON "goals"("projectId");`,

  `CREATE TABLE IF NOT EXISTS "milestones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMPTZ(6),
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE INDEX IF NOT EXISTS "milestones_projectId_idx" ON "milestones"("projectId");`,

  // 8. Calendar Events & User Calendars
  `CREATE TABLE IF NOT EXISTS "user_calendars" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "workspaceId" UUID,
    "title" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#38bdf8',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),
    CONSTRAINT "user_calendars_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE INDEX IF NOT EXISTS "user_calendars_userId_idx" ON "user_calendars"("userId");`,

  `CREATE TABLE IF NOT EXISTS "calendar_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMPTZ(6) NOT NULL,
    "endDate" TIMESTAMPTZ(6) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "recurrence" TEXT,
    "color" TEXT,
    "location" TEXT,
    "reminders" JSONB,
    "projectId" UUID,
    "taskId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),
    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE INDEX IF NOT EXISTS "calendar_events_workspaceId_userId_idx" ON "calendar_events"("workspaceId", "userId");`,
  `CREATE INDEX IF NOT EXISTS "calendar_events_startDate_endDate_idx" ON "calendar_events"("startDate", "endDate");`,

  // 9. Sync Accounts & Sync Jobs
  `CREATE TABLE IF NOT EXISTS "sync_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMPTZ(6),
    "scope" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sync_accounts_userId_provider_key" UNIQUE ("userId", "provider")
  );`,
  `CREATE INDEX IF NOT EXISTS "sync_accounts_userId_idx" ON "sync_accounts"("userId");`,

  `CREATE TABLE IF NOT EXISTS "sync_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "syncAccountId" UUID NOT NULL,
    "calendarId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SYNCING',
    "syncedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "lastSyncedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE INDEX IF NOT EXISTS "sync_jobs_syncAccountId_idx" ON "sync_jobs"("syncAccountId");`,

  // 10. Feedbacks
  `CREATE TABLE IF NOT EXISTS "feedbacks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE INDEX IF NOT EXISTS "feedbacks_userId_idx" ON "feedbacks"("userId");`,
  `CREATE INDEX IF NOT EXISTS "feedbacks_status_idx" ON "feedbacks"("status");`,

  // 11. Notes, Notebooks, Sections
  `CREATE TABLE IF NOT EXISTS "notebooks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT DEFAULT 'indigo',
    "order" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notebooks_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE INDEX IF NOT EXISTS "notebooks_userId_idx" ON "notebooks"("userId");`,

  `CREATE TABLE IF NOT EXISTS "sections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notebookId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE INDEX IF NOT EXISTS "sections_notebookId_idx" ON "sections"("notebookId");`,
  `CREATE INDEX IF NOT EXISTS "sections_userId_idx" ON "sections"("userId");`,

  `CREATE TABLE IF NOT EXISTS "notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "category" TEXT DEFAULT 'General',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "isQuickNote" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] NOT NULL DEFAULT '{}',
    "attachmentIds" TEXT[] NOT NULL DEFAULT '{}',
    "sharedWithUserIds" TEXT[] NOT NULL DEFAULT '{}',
    "aiSummary" TEXT,
    "notebookId" UUID,
    "sectionId" UUID,
    "folderId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),
    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE INDEX IF NOT EXISTS "notes_workspaceId_userId_idx" ON "notes"("workspaceId", "userId");`,
  `CREATE INDEX IF NOT EXISTS "notes_notebookId_idx" ON "notes"("notebookId");`,
  `CREATE INDEX IF NOT EXISTS "notes_sectionId_idx" ON "notes"("sectionId");`,

  // 12. User Favorites (CANONICAL DATABASE TABLE FOR GLOBAL FAVORITES)
  `CREATE TABLE IF NOT EXISTS "user_favorites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "workspaceId" UUID,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "metadata" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_favorites_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_favorites_userId_resourceType_resourceId_key" UNIQUE ("userId", "resourceType", "resourceId")
  );`,
  `CREATE INDEX IF NOT EXISTS "user_favorites_userId_idx" ON "user_favorites"("userId");`,
  `CREATE INDEX IF NOT EXISTS "user_favorites_userId_workspaceId_idx" ON "user_favorites"("userId", "workspaceId");`,

  // 13. Automations, Automation Executions, Automation Activities
  `CREATE TABLE IF NOT EXISTS "automations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" UUID NOT NULL,
    "userId" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "conditions" JSONB,
    "actions" JSONB,
    "schedule" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "AutomationStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastRunAt" TIMESTAMPTZ(6),
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),
    CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE INDEX IF NOT EXISTS "automations_workspaceId_idx" ON "automations"("workspaceId");`,
  `CREATE INDEX IF NOT EXISTS "automations_userId_idx" ON "automations"("userId");`,
  `CREATE INDEX IF NOT EXISTS "automations_status_idx" ON "automations"("status");`,
  `CREATE INDEX IF NOT EXISTS "automations_createdAt_idx" ON "automations"("createdAt");`,

  `CREATE TABLE IF NOT EXISTS "automation_executions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "automationId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID,
    "status" "AutomationStatus" NOT NULL DEFAULT 'RUNNING',
    "triggerData" JSONB,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "stepResults" JSONB,
    "result" JSONB,
    "error" JSONB,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(6),
    CONSTRAINT "automation_executions_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE INDEX IF NOT EXISTS "automation_executions_automationId_idx" ON "automation_executions"("automationId");`,
  `CREATE INDEX IF NOT EXISTS "automation_executions_workspaceId_idx" ON "automation_executions"("workspaceId");`,
  `CREATE INDEX IF NOT EXISTS "automation_executions_userId_idx" ON "automation_executions"("userId");`,
  `CREATE INDEX IF NOT EXISTS "automation_executions_status_idx" ON "automation_executions"("status");`,
  `CREATE INDEX IF NOT EXISTS "automation_executions_startedAt_idx" ON "automation_executions"("startedAt");`,

  `CREATE TABLE IF NOT EXISTS "automation_activities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "automationId" UUID NOT NULL,
    "executionId" UUID,
    "workspaceId" UUID NOT NULL,
    "userId" UUID,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "automation_activities_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE INDEX IF NOT EXISTS "automation_activities_automationId_idx" ON "automation_activities"("automationId");`,
  `CREATE INDEX IF NOT EXISTS "automation_activities_executionId_idx" ON "automation_activities"("executionId");`,
  `CREATE INDEX IF NOT EXISTS "automation_activities_workspaceId_idx" ON "automation_activities"("workspaceId");`,
  `CREATE INDEX IF NOT EXISTS "automation_activities_userId_idx" ON "automation_activities"("userId");`,
  `CREATE INDEX IF NOT EXISTS "automation_activities_createdAt_idx" ON "automation_activities"("createdAt");`,

  // 14. Knowledge Base table (if not exists)
  `CREATE TABLE IF NOT EXISTS "knowledge_base" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" UUID NOT NULL,
    "name" TEXT,
    "title" TEXT,
    "content" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_base_pkey" PRIMARY KEY ("id")
  );`,

  // 15. Safe Foreign Keys (with duplicate_object protection)
  `DO $$ BEGIN ALTER TABLE "folders" ADD CONSTRAINT "folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "folders"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "folders" ADD CONSTRAINT "folders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "files" ADD CONSTRAINT "files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "files" ADD CONSTRAINT "files_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "tasks" ADD CONSTRAINT "tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "tasks" ADD CONSTRAINT "tasks_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "goals" ADD CONSTRAINT "goals_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "goals" ADD CONSTRAINT "goals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "milestones" ADD CONSTRAINT "milestones_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "user_calendars" ADD CONSTRAINT "user_calendars_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "sync_accounts" ADD CONSTRAINT "sync_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_syncAccountId_fkey" FOREIGN KEY ("syncAccountId") REFERENCES "sync_accounts"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "notebooks" ADD CONSTRAINT "notebooks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "sections" ADD CONSTRAINT "sections_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "notes" ADD CONSTRAINT "notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "notes" ADD CONSTRAINT "notes_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "notes" ADD CONSTRAINT "notes_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "notes" ADD CONSTRAINT "notes_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "automations" ADD CONSTRAINT "automations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "automations"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "automation_activities" ADD CONSTRAINT "automation_activities_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "automations"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "automation_activities" ADD CONSTRAINT "automation_activities_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "automation_executions"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "automation_activities" ADD CONSTRAINT "automation_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN ALTER TABLE "knowledge_base" ADD CONSTRAINT "knowledge_base_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
];

async function main() {
  console.log(`Executing ${sqlStatements.length} safe schema reconciliation statements using DIRECT_URL...`);
  let successCount = 0;
  for (let i = 0; i < sqlStatements.length; i++) {
    const stmt = sqlStatements[i];
    try {
      await prisma.$executeRawUnsafe(stmt);
      successCount++;
      if ((i + 1) % 10 === 0 || i === sqlStatements.length - 1) {
        console.log(`Progress: ${i + 1}/${sqlStatements.length} applied`);
      }
    } catch (err: any) {
      console.error(`Statement ${i + 1} failed: ${err.message}`);
      console.error(`SQL snippet: ${stmt.substring(0, 80)}...`);
    }
  }
  console.log(`FINISHED: ${successCount}/${sqlStatements.length} statements succeeded.`);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
