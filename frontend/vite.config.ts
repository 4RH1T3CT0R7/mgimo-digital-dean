/// <reference types="vitest/config" />
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaOptions } from './src/features/pwa/config.ts';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA(pwaOptions),
    {
      // Воркер MSW нужен только в режиме моков — в сборку для прода не кладём
      name: 'drop-mock-worker',
      apply: 'build',
      closeBundle() {
        rmSync(fileURLToPath(new URL('./dist/mockServiceWorker.js', import.meta.url)), { force: true });
      },
    },
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // npm run dev: API — через шлюз Caddy (make up). Другой адрес: VITE_API_TARGET=http://… npm run dev
    proxy: {
      '/api': { target: process.env.VITE_API_TARGET ?? 'https://localhost', changeOrigin: true, secure: false },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
