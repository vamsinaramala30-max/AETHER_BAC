import { beforeAll, afterAll } from 'vitest';
import { db } from '../database/client';

beforeAll(async () => {
  // Ensure test database connection or mock state is initialized
});

afterAll(async () => {
  await db.$disconnect();
});
