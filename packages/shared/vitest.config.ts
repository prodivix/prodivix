import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The safety module's SVG sanitizer is built on DOMParser/XMLSerializer and
    // fails closed (returns null) where they are absent, so a node environment
    // would exercise only the rejection path.
    environment: 'jsdom',
  },
});
