import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "users", "Workspace" CASCADE;`);

  const passwordHash = await bcrypt.hash('Password123!', 10);

  const user = await prisma.user.create({
    data: {
      email: 'admin@enterprise.com',
      fullName: 'System Admin',
      passwordHash,
      role: Role.ADMIN,
    },
  });

  const calendar = await (prisma as any).calendar.create({
    data: {
      name: 'Primary Work Calendar',
      description: 'Default calendar for primary operations',
      color: '#039BE5',
      timeZone: 'America/New_York',
      type: 'PERSONAL',
      isPrimary: true,
      members: {
        create: {
          userId: user.id,
          accessRole: 'OWNER',
        },
      },
    },
  });

  console.log(`Seeded User: ${user.id} and Primary Calendar: ${calendar.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
