import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createWebResolveAliases } from './config/resolveAliases.ts';
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
    alias: createWebResolveAliases(),
  },
  // optimizeDeps: {
  //   // 关键：排除 mitosis，防止 Vite 损坏它的内部依赖
  //   exclude: ['@builder.io/mitosis']
  // },
  server: {
    port: 5173,
  },
});
