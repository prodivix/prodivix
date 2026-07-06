import { coverageConfigDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { createWebResolveAliases } from './config/resolveAliases.ts';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: createWebResolveAliases(),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-utils/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        ...coverageConfigDefaults.exclude,
        'src/editor/features/blueprint/external/libraries/antdProfile.tsx',
        'src/editor/features/blueprint/external/libraries/muiProfile.tsx',
        'src/editor/features/blueprint/editor/inspector/components/AlignItemsIcons.tsx',
        'src/editor/features/blueprint/editor/inspector/components/FlexDirectionIcons.tsx',
        'src/editor/features/blueprint/editor/inspector/components/JustifyContentIcons.tsx',
      ],
      thresholds: {
        'src/editor/features/blueprint/**': {
          statements: 80,
          branches: 60,
          functions: 60,
          lines: 80,
        },
      },
    },
  },
});
