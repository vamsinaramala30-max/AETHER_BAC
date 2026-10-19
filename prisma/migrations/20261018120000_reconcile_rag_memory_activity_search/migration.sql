-- ============================================================================
-- AETHER Platform Migration: 20261018120000_reconcile_rag_memory_activity_search
-- Reconciles missing models from schema.prisma:
--   - ActivityLog (activity_logs)
--   - Document (documents)
--   - DocumentChunk (document_chunks with pgvector embedding)
--   - AIMemory (ai_memories)
--   - SearchIndex (search_index)
-- Safe, idempotent, non-destructive migration.
-- ============================================================================

-- Ensure pgvector extension is available for document_chunks embedding
CREATE EXTENSION IF NOT EXISTS "vector";

-- 1. Activity Logs
CREATE TABLE IF NOT EXISTS "activity_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" UUID NOT NULL,
  "entityName" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "activity_logs_workspaceId_createdAt_idx" ON "activity_logs"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "activity_logs_userId_idx" ON "activity_logs"("userId");

-- 2. Documents
CREATE TABLE IF NOT EXISTS "documents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "knowledgeBaseId" UUID NOT NULL,
  "workspaceId" UUID,
  "projectId" UUID,
  "userId" UUID,
  "fileName" TEXT,
  "fileUrl" TEXT,
  "content" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "documents_knowledgeBaseId_idx" ON "documents"("knowledgeBaseId");
CREATE INDEX IF NOT EXISTS "documents_workspaceId_idx" ON "documents"("workspaceId");
CREATE INDEX IF NOT EXISTS "documents_projectId_idx" ON "documents"("projectId");
CREATE INDEX IF NOT EXISTS "documents_userId_idx" ON "documents"("userId");
CREATE INDEX IF NOT EXISTS "documents_status_idx" ON "documents"("status");

-- 3. Document Chunks
CREATE TABLE IF NOT EXISTS "document_chunks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "documentId" UUID,
  "workspaceId" UUID,
  "projectId" UUID,
  "userId" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "tokenCount" INTEGER NOT NULL DEFAULT 0,
  "chunkIndex" INTEGER NOT NULL DEFAULT 0,
  "embedding" vector,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "document_chunks_userId_idx" ON "document_chunks"("userId");
CREATE INDEX IF NOT EXISTS "document_chunks_workspaceId_userId_idx" ON "document_chunks"("workspaceId", "userId");
CREATE INDEX IF NOT EXISTS "document_chunks_workspaceId_projectId_idx" ON "document_chunks"("workspaceId", "projectId");
CREATE INDEX IF NOT EXISTS "document_chunks_documentId_idx" ON "document_chunks"("documentId");
CREATE INDEX IF NOT EXISTS "document_chunks_projectId_idx" ON "document_chunks"("projectId");

-- 4. AI Memories
CREATE TABLE IF NOT EXISTS "ai_memories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "workspaceId" UUID,
  "projectId" UUID,
  "category" TEXT NOT NULL DEFAULT 'FACT',
  "content" TEXT NOT NULL,
  "importance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "confidence" TEXT NOT NULL DEFAULT 'user_provided',
  "source" TEXT,
  "scope" TEXT NOT NULL DEFAULT 'user',
  "status" TEXT NOT NULL DEFAULT 'active',
  "version" INTEGER NOT NULL DEFAULT 1,
  "metadata" JSONB,
  "accessCount" INTEGER NOT NULL DEFAULT 0,
  "lastAccessedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(6),
  CONSTRAINT "ai_memories_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ai_memories_userId_status_idx" ON "ai_memories"("userId", "status");
CREATE INDEX IF NOT EXISTS "ai_memories_userId_category_idx" ON "ai_memories"("userId", "category");
CREATE INDEX IF NOT EXISTS "ai_memories_userId_projectId_idx" ON "ai_memories"("userId", "projectId");
CREATE INDEX IF NOT EXISTS "ai_memories_userId_workspaceId_status_idx" ON "ai_memories"("userId", "workspaceId", "status");
CREATE INDEX IF NOT EXISTS "ai_memories_userId_scope_status_idx" ON "ai_memories"("userId", "scope", "status");

-- 5. Search Index
CREATE TABLE IF NOT EXISTS "search_index" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "entityType" TEXT NOT NULL,
  "entityId" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "search_index_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "search_index_workspaceId_entityType_idx" ON "search_index"("workspaceId", "entityType");
CREATE INDEX IF NOT EXISTS "search_index_workspaceId_idx" ON "search_index"("workspaceId");

-- 6. Safe Foreign Keys (with duplicate_object protection)
DO $$ BEGIN ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "documents" ADD CONSTRAINT "documents_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "knowledge_base"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "documents" ADD CONSTRAINT "documents_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "documents" ADD CONSTRAINT "documents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "documents" ADD CONSTRAINT "documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
