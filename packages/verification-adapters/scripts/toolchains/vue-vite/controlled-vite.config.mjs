import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    execArgv: ['--preserve-symlinks', '--preserve-symlinks-main'],
  },
});
