import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '#mui-plugin': resolve(__dirname, 'src'),
      '@prodivix/plugin-package': resolve(__dirname, '../plugin-package/src'),
      '@prodivix/plugin-react-host': resolve(
        __dirname,
        '../plugin-react-host/src'
      ),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
