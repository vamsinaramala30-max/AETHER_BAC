/**
 * One-time data migration: existing notes have no notebookId/sectionId yet.
 * This assigns every user's existing notes to a per-user "My Notebook" ->
 * "General" default, so nothing becomes orphaned or invisible after the
 * schema migration lands. Safe to re-run: it only touches notes where
 * notebookId is still null, and never deletes or duplicates rows.
 *
 * Run once, after 001_notebooks_sections.prisma has been applied:
 *   npx ts-node backend/migrations/002_backfill_default_notebook.ts
 */
import { db } from '../../../../database/client';

async function backfillForUser(userId: string): Promise<void> {
  let notebook = await db.notebook.findFirst({ where: { userId, isDefault: true } });
  if (!notebook) {
    notebook = await db.notebook.create({
      data: {
        userId,
        name: 'My Notebook',
        description: 'Automatically created to hold your existing notes.',
        color: 'indigo',
        order: 0,
        isDefault: true,
      },
    });
  }

  let section = await db.section.findFirst({ where: { notebookId: notebook.id, userId } });
  if (!section) {
    section = await db.section.create({
      data: { notebookId: notebook.id, userId, name: 'General', order: 0 },
    });
  }

  const orphaned = await db.note.findMany({
    where: { userId, notebookId: null },
    orderBy: { updatedAt: 'desc' },
  });

  await db.$transaction(
    orphaned.map((note: any, index: number) =>
      db.note.update({
        where: { id: note.id },
        data: { notebookId: notebook!.id, sectionId: section!.id, order: index },
      }),
    ),
  );

  console.log(`[backfill] user ${userId}: filed ${orphaned.length} existing note(s) into "My Notebook / General".`);
}

async function run() {
  const users = await db.user.findMany({ select: { id: true } });
  for (const { id } of users) {
    await backfillForUser(id);
  }
  console.log(`[backfill] done. ${users.length} user(s) processed.`);
}

run()
  .catch((err) => {
    console.error('[backfill] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
