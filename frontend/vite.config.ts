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
    },
    build: {
      // Warn when any chunk > 600kb gzipped — pushes us to investigate
      // before the bundle gets out of hand.
      chunkSizeWarningLimit: 600,
      // Emit sourcemaps for Sentry uploads, but 'hidden': the built JS carries
      // no `//# sourceMappingURL` comment, so browsers never fetch the source.
      // Don't serve the .map files — upload them to Sentry, then drop them.
      sourcemap: 'hidden',
      rollupOptions: {
        /* 
          output: {
          manualChunks: (id) => {
            if (!id.includes('node_modules')) return undefined;
            if (id.match(/\breact(-dom|-router.*)?\b/) || id.includes('@tanstack')) {
              return 'react-vendor';
            }
            if (id.includes('@radix-ui') || id.includes('lucide-react')) return 'ui-vendor';
            if (id.includes('recharts') || id.includes('d3-')) return 'charts-vendor';
            if (id.includes('framer-motion') || id.includes('motion-')) return 'motion-vendor';
            if (id.includes('date-fns') || id.includes('luxon') || id.includes('dayjs')) {
              return 'date-vendor';
            }
            if (id.includes('zod') || id.includes('react-hook-form')) return 'form-vendor';
            return 'vendor';
          },
        }, 
        */
      },
    },
  };
});
