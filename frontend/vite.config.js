import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
  },
  server: {
    port: 3000,
  },
  build: {
    rollupOptions: {
      external: ['rough-viz'],
    },
  },
});
