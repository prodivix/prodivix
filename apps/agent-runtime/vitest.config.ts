import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^#src\/(.+)\.js$/u,
        replacement: `${fileURLToPath(new URL('./src', import.meta.url))}/$1.ts`,
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Each file loads the public corpus; bound its worker pool on shared CI runners.
    maxWorkers: 1,
    fileParallelism: false,
    isolate: true,
  },
});
