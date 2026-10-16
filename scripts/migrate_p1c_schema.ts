import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Applying P1C Database Schema Updates...');

  try {
    // 1. Ensure pgvector extension
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS "vector";`);
    console.log('✓ pgvector extension ensured');

    // 2. Documents table scoping columns
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "documents" 
      ADD COLUMN IF NOT EXISTS "workspaceId" UUID REFERENCES "workspaces"("id") ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS "projectId" UUID REFERENCES "projects"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "userId" UUID REFERENCES "users"("id") ON DELETE SET NULL;
    `);
    console.log('✓ documents scoping columns added');

    // 3. Documents indexes
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "documents_workspace_idx" ON "documents"("workspaceId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "documents_project_idx" ON "documents"("projectId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "documents_user_idx" ON "documents"("userId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "documents_status_idx" ON "documents"("status");`);
    console.log('✓ documents indexes created');

    // 4. Document chunks pgvector column and indexes
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "document_chunks" 
      ADD COLUMN IF NOT EXISTS "embedding" vector(768);
    `);
    console.log('✓ document_chunks embedding vector column added');

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "document_chunks_embedding_hnsw_idx" 
      ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops);
    `);
    console.log('✓ document_chunks HNSW vector index created');

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "document_chunks_workspace_project_idx" 
      ON "document_chunks"("workspaceId", "projectId");
    `);
    console.log('✓ document_chunks scope indexes created');

    // 5. Backfill existing documents workspaceId from knowledgeBase if available
    await prisma.$executeRawUnsafe(`
      UPDATE "documents" d
      SET "workspaceId" = kb."workspaceId"
      FROM "knowledge_base" kb
      WHERE d."knowledgeBaseId" = kb."id"
        AND d."workspaceId" IS NULL;
    `);
    console.log('✓ documents workspaceId backfilled');

    // 6. Backfill existing document_chunks embedding from metadata if present
    const chunksWithMeta: any = await prisma.$queryRawUnsafe(`
      SELECT id, metadata->'embedding' as emb
      FROM "document_chunks"
      WHERE "embedding" IS NULL
        AND metadata->'embedding' IS NOT NULL;
    `);

    console.log(`Found ${chunksWithMeta.length} chunks with JSON embeddings to migrate to pgvector`);
    for (const chunk of chunksWithMeta) {
      if (Array.isArray(chunk.emb) && chunk.emb.length === 768) {
        const vecStr = `[${chunk.emb.join(',')}]`;
        await prisma.$executeRawUnsafe(
          `UPDATE "document_chunks" SET "embedding" = $1::vector WHERE id = $2::uuid`,
          vecStr,
          chunk.id,
        );
      }
    }
    console.log('✓ Existing embeddings migrated to pgvector column');

    console.log('P1C Database Migration Completed Successfully!');
  } catch (err: any) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
