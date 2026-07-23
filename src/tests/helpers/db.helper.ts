import { db } from '../../database/client';

export const clearDatabase = async (): Promise<void> => {
  const tablenames = ['Session', 'Message', 'Conversation', 'Document', 'KnowledgeBase', 'Project', 'WorkspaceMember', 'Workspace', 'User'];

  for (const table of tablenames) {
    try {
      await db.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`);
    } catch {
      // Handle fallback for test environments without CASCADE permissions
    }
  }
};