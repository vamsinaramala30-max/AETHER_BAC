import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globals: true,
    hookTimeout: 60000,
    testTimeout: 180000,
    fileParallelism: false,
  },
});
