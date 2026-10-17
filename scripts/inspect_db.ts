import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';

const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url: directUrl } } });

async function main() {
  await prisma.$executeRawUnsafe('ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "formattedContent" TEXT;');
  console.log('formattedContent column added to notes.');

  const tests = [
    { name: 'userFavorite', fn: () => (prisma as any).userFavorite.findMany() },
    { name: 'calendarEvent', fn: () => (prisma as any).calendarEvent.findMany() },
    { name: 'userCalendar', fn: () => (prisma as any).userCalendar.findMany() },
    { name: 'task', fn: () => (prisma as any).task.findMany() },
    { name: 'project', fn: () => (prisma as any).project.findMany() },
    { name: 'automation', fn: () => (prisma as any).automation.findMany() },
    { name: 'note', fn: () => (prisma as any).note.findMany() },
    { name: 'folder', fn: () => (prisma as any).folder.findMany() },
    { name: 'file', fn: () => (prisma as any).file.findMany() },
  ];

  for (const t of tests) {
    try {
      const res = await t.fn();
      console.log(`${t.name}: SUCCESS (count=${res.length})`);
    } catch (err: any) {
      console.log(`${t.name}: ERROR - ${err.message?.split('\n')[0] || err}`);
    }
  }

  await prisma.$disconnect();
}

main();
