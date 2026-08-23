import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    maxWorkers: 4,
    // Fixtures materialize the full G4 V8 evaluation case corpus per test;
    // single tests legitimately take >5s locally and longer on CI runners.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
