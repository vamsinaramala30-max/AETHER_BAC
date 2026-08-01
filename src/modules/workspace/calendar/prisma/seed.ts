import { PrismaClient, Role, AccessRole, CalendarType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Calendar" CASCADE;`);

  const passwordHash = await bcrypt.hash('Password123!', 10);

  const user = await prisma.user.create({
    data: {
      email: 'admin@enterprise.com',
      name: 'System Admin',
      passwordHash,
      role: Role.ADMIN,
      timeZone: 'America/New_York',
    },
  });

  const calendar = await prisma.calendar.create({
    data: {
      name: 'Primary Work Calendar',
      description: 'Default calendar for primary operations',
      color: '#039BE5',
      timeZone: 'America/New_York',
      type: CalendarType.PERSONAL,
      isPrimary: true,
      members: {
        create: {
          userId: user.id,
          accessRole: AccessRole.OWNER,
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