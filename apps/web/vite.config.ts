import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'node:path';

/**
 * Vite build + bundle-analysis config.
 *
 * Pass `ANALYZE=1 npm run build` to emit `dist/bundle-report.html` — a
 * zoomable sunburst of every chunk. Use it when a release feels sluggish
 * or before/after any upgrade that touches a heavy dep (recharts, maps).
 *
 * Chunking strategy: the goal isn't minimum bundle size, it's **maximum
 * cache hit rate on re-deploy**. Split anything rarely-changed (vendor
 * libs) from frequently-changed (app code) so returning users only
 * re-download the delta:
 *   - `react-vendor`   — React, ReactDOM, React Router, @tanstack/*
 *   - `ui-vendor`      — Radix UI + shadcn primitives
 *   - `charts-vendor`  — recharts (big + rarely changes)
 *   - `i18n-vendor`    — i18next + react-i18next
 *   - `motion-vendor`  — framer-motion
 *   - everything else  — default route-based chunks (already lazy via router)
 */
export default defineConfig((): UserConfig => {
  const analyze = process.env.ANALYZE === '1';
  return {
    plugins: [
      react(),
      tailwindcss(),
      analyze &&
        visualizer({
          filename: 'dist/bundle-report.html',
          template: 'sunburst',
          gzipSize: true,
          brotliSize: true,
          open: false,
        }),
    ].filter(Boolean) as UserConfig['plugins'],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      host: true,
      // Forward static-file requests to the API in dev. The API serves payslips,
      // backups, attachments, etc. under `/uploads/<key>` — without this proxy
      // the dev server (5173) would 404 on those paths.
      proxy: {
        '/uploads': {
          target: 'http://localhost:4000',
          changeOrigin: true,
        },
      },
    },
    build: {
      // Warn when any chunk > 600kb gzipped — pushes us to investigate
      // before the bundle gets out of hand.
      chunkSizeWarningLimit: 600,
      // Emit sourcemaps so Sentry stack traces remain interpretable.
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (!id.includes('node_modules')) return undefined;
            if (id.match(/\breact(-dom|-router.*|-i18next)?\b/) || id.includes('@tanstack')) {
              return 'react-vendor';
            }
            if (id.includes('@radix-ui') || id.includes('lucide-react')) return 'ui-vendor';
            if (id.includes('recharts') || id.includes('d3-')) return 'charts-vendor';
            if (id.includes('i18next')) return 'i18n-vendor';
            if (id.includes('framer-motion') || id.includes('motion-')) return 'motion-vendor';
            if (id.includes('date-fns') || id.includes('luxon') || id.includes('dayjs')) {
              return 'date-vendor';
            }
            if (id.includes('zod') || id.includes('react-hook-form')) return 'form-vendor';
            return 'vendor';
          },
        },
      },
    },
  };
});
