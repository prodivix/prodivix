import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const externalPackages = [
  '@prodivix/router',
  '@prodivix/shared',
  '@prodivix/themes',
  '@radix-ui/react-dialog',
  '@radix-ui/react-popover',
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
