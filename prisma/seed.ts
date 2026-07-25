import { PrismaClient, Role, WorkspaceRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const systemUser = await prisma.user.upsert({
    where: { email: 'admin@aether.internal' },
    update: {},
    create: {
      email: 'admin@aether.internal',
      fullName: 'AETHER Master Admin',
      role: Role.SUPERADMIN,
      isEmailVerified: true,
      passwordHash: '$2a$12$eImiTXuWVxfM37uY4JANjO.gL.37T6jYjTqO./q2I84GfP0eYf0yC', // bcrypt hash of "admin123"
    },
  });

  const defaultWorkspace = await prisma.workspace.upsert({
    where: { slug: 'aether-core' },
    update: {},
    create: {
      name: 'AETHER Core System',
      slug: 'aether-core',
      description: 'System root workspace',
      members: {
        create: {
          userId: systemUser.id,
          role: WorkspaceRole.OWNER,
        },
      },
    },
  });

  const defaultProject = await prisma.project.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Default Project',
      description: 'System primary project container',
      workspaceId: defaultWorkspace.id,
      ownerId: systemUser.id,
    },
  });

  console.log('Seeding completed successfully.');
  console.log(`  System User: ${systemUser.email} (${systemUser.id})`);
  console.log(`  Workspace: ${defaultWorkspace.name} (${defaultWorkspace.id})`);
  console.log(`  Project: ${defaultProject.name} (${defaultProject.id})`);
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

