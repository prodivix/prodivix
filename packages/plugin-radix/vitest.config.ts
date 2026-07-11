import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '#radix': resolve(__dirname, 'src'),
      '@prodivix/plugin-contracts': resolve(
        __dirname,
        '../plugin-contracts/src'
      ),
      '@prodivix/plugin-package': resolve(__dirname, '../plugin-package/src'),
      '@prodivix/plugin-react-host': resolve(
        __dirname,
        '../plugin-react-host/src'
      ),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
