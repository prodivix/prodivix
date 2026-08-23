import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // G4 V8 evidence tests materialize the full probe/qualification corpus
    // per test; CI runners can take 2-4x longer than local machines.
    testTimeout: 300_000,
    hookTimeout: 120_000,
  },
});
