/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_API_BASE_URL may only name a public origin (no path, no credentials).
// The dev server proxies /api and /health to it so the browser stays same-origin.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const target = env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
  const proxy = {
    '/api': { target, changeOrigin: true },
    '/health': { target, changeOrigin: true },
  };
  return {
    plugins: [react()],
    server: { port: 5173, strictPort: true, proxy },
    preview: { port: 4173, strictPort: true, proxy },
    build: { sourcemap: false, chunkSizeWarningLimit: 1500 },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
