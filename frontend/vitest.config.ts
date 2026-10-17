import { defineConfig } from 'vitest/config';
import path from 'node:path';

// No @vitejs/plugin-react here: vitest 2 ships its own vite 5 whose plugin
// types clash with the app's vite 6, and tests need no Fast Refresh —
// esbuild's automatic JSX runtime is all that's required.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    pool: 'forks',
    poolOptions: {
      forks: {
        // Node 25 ships its own global `localStorage` (a stub without
        // --localstorage-file) that shadows jsdom's; turn it off so tests get
        // jsdom's working Storage.
        execArgv: ['--no-experimental-webstorage'],
      },
    },
  },
});
