import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 120000,
    // One Mongo memory server + one Mongoose connection per worker process;
    // forks + no file parallelism keeps suites isolated and deterministic.
    pool: 'forks',
    fileParallelism: false,
  },
});
