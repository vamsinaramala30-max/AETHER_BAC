-- Safe, idempotent column addition for conversations
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "workspace_id" UUID;

-- Add index if not exists
CREATE INDEX IF NOT EXISTS "conversations_workspace_id_user_id_idx" ON "conversations"("workspace_id", "user_id");

-- Ensure foreign keys exist if possible
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversations_workspace_id_fkey'
  ) THEN
    ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_fkey" 
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN null;
END $$;
