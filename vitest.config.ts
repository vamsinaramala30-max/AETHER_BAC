import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/tests/unit/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'src/tests/integration/**',
      '**/stage3-schema-persistence-verification.test.ts',
      '**/*.integration.test.ts',
      '**/action-planning-e2e.test.ts',
      '**/streaming-tools-e2e.test.ts',
      '**/phase4-autonomous-execution.test.ts',
      '**/phase5-automation-scheduler.test.ts',
      '**/tools-controlled-actions.test.ts',
      '**/phase3-rag-memory-production.test.ts',
    ],
    globals: true,
    hookTimeout: 60000,
    testTimeout: 180000,
    fileParallelism: false,
  },
});
