import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Node 25 ships its own global `localStorage` (a stub without
// --localstorage-file) that shadows jsdom's, so tests turn it off. The flag
// only exists from Node 22.4 — older 22.x (allowed by `engines`) rejects it —
// and below 25 Web Storage is off anyway, so pass it only where it exists.
const [nodeMajor = 0, nodeMinor = 0] = process.versions.node.split('.').map(Number);
const nodeHasWebstorageFlag = nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 4);

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
        execArgv: nodeHasWebstorageFlag ? ['--no-experimental-webstorage'] : [],
      },
    },
  },
});
