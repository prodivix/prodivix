import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@prodivix/pir',
        replacement: fileURLToPath(new URL('../pir/src', import.meta.url)),
      },
      {
        find: '@prodivix/router',
        replacement: fileURLToPath(new URL('../router/src', import.meta.url)),
      },
      {
        find: '@prodivix/shared',
        replacement: fileURLToPath(new URL('../shared/src', import.meta.url)),
      },
      {
        find: '@prodivix/ui',
        replacement: fileURLToPath(new URL('../ui/src', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
