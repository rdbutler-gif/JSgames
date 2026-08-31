import { defineConfig } from 'vite';

// RUN.world serves games from a subdirectory, so all asset paths must be
// relative (base: './'). The existing images/ folder is used as-is via
// publicDir, so its contents are copied straight into dist/ and served at
// the site root (e.g. images/Corkboard.png -> ./Corkboard.png) without
// having to relocate 22MB of art.
export default defineConfig({
  base: './',
  publicDir: 'images',
  build: {
    outDir: 'dist',
    // The RUN.world SDK uses top-level await internally, which needs a
    // newer build target than Vite's default browser list supports.
    target: 'es2022',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
    },
  },
});
