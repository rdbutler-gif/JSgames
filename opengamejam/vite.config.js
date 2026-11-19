import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 1500 },
  server: { host: '127.0.0.1', port: 5173 }
});
