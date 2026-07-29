import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    execArgv: ['--preserve-symlinks', '--preserve-symlinks-main'],
  },
});
