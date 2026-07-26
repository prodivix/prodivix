import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const externalPackages = [
  '@prodivix/router',
  '@prodivix/shared',
  '@prodivix/themes',
  // Every Radix primitive that reaches dist must be external. Radix layer
  // primitives keep module-level singletons (the dismissable-layer stack and
  // the body pointer-events snapshot), so an inlined copy gives consumers two
  // uncoordinated layer stacks and a Select inside a Modal stops closing.
  '@radix-ui/react-dialog',
  '@radix-ui/react-popover',
  '@radix-ui/react-select',
  '@radix-ui/react-tooltip',
  'lucide-react',
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react-router',
];

export default defineConfig({
  plugins: [react()],
  build: {
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: (id) =>
        externalPackages.some(
          (packageName) =>
            id === packageName || id.startsWith(`${packageName}/`)
        ),
      output: {
        assetFileNames: (assetInfo) =>
          assetInfo.name?.endsWith('.css')
            ? 'style.css'
            : 'assets/[name][extname]',
        entryFileNames: '[name].js',
        preserveModules: true,
        preserveModulesRoot: 'src',
      },
    },
  },
});
