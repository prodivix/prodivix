import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@prodivix/shared/canonical': fileURLToPath(
        new URL('../shared/src/canonical/index.ts', import.meta.url)
      ),
      '@prodivix/shared/safety': fileURLToPath(
        new URL('../shared/src/safety/index.ts', import.meta.url)
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
