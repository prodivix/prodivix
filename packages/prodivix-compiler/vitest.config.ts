import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '#src': resolve(__dirname, 'src'),
      '@prodivix/authoring': resolve(__dirname, '../authoring/src'),
      '@prodivix/data': resolve(__dirname, '../data/src'),
      '@prodivix/pir': resolve(__dirname, '../pir/src'),
      '@prodivix/nodegraph': resolve(__dirname, '../nodegraph/src'),
      '@prodivix/runtime-core': resolve(__dirname, '../runtime-core/src'),
      '@prodivix/server-runtime': resolve(__dirname, '../server-runtime/src'),
      '@prodivix/shared': resolve(__dirname, '../shared/src'),
      '@prodivix/workspace': resolve(__dirname, '../workspace/src'),
    },
  },
});
