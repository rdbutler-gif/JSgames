import { defineConfig } from 'vite';
import { rundotGameLibrariesPlugin } from '@series-inc/rundot-game-sdk/vite';

// RUN.world deploys your game from a subdirectory, so paths must be relative
// (base: './'), and the build must land in ./dist -- that's where `rundot
// deploy` looks by default. See: getting-started.md / deploying-your-game.md
export default defineConfig({
  plugins: [rundotGameLibrariesPlugin()],
  base: './',
  server: {
    allowedHosts: true,
  },
  esbuild: {
    target: 'es2022',
  },
  build: {
    target: 'es2022',
  },
});
