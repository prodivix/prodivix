import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  define: {
    process: { cwd: () => '/' },
    'process.env': {},
    'process.platform': JSON.stringify('browser'),
    global: 'globalThis',
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router'],
    alias: {
      '@': resolve(__dirname, './src'),
      '@prodivix/ai': resolve(__dirname, '../../packages/ai/src'),
      '@prodivix/i18n': resolve(__dirname, '../../packages/i18n/src'),
      '@prodivix/prodivix-compiler': resolve(
        __dirname,
        '../../packages/prodivix-compiler/src'
      ),
      '@prodivix/shared/safety': resolve(
        __dirname,
        '../../packages/shared/src/safety'
      ),
      '@prodivix/shared/package.json': resolve(
        __dirname,
        '../../packages/shared/package.json'
      ),
      '@prodivix/shared': resolve(__dirname, '../../packages/shared/src'),
      '@prodivix/ui/package.json': resolve(
        __dirname,
        '../../packages/ui/package.json'
      ),
      '@prodivix/ui': resolve(__dirname, '../../packages/ui/src'),
      '@prodivix/themes/package.json': resolve(
        __dirname,
        '../../packages/themes/package.json'
      ),
      '@prodivix/themes': resolve(__dirname, '../../packages/themes/src'),
    },
  },
  // optimizeDeps: {
  //   // 关键：排除 mitosis，防止 Vite 损坏它的内部依赖
  //   exclude: ['@builder.io/mitosis']
  // },
  server: {
    port: 5173,
  },
});
