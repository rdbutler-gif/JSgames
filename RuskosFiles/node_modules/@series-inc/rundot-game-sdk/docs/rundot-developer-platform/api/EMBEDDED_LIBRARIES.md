# Embedded Libraries

Reduce your game's bundle size by using RUN.world embedded libraries. Supported libraries are automatically loaded from the RUN.world host instead of being bundled into your game.

## Benefits

- **Smaller bundle size**: ~1.1MB savings for Phaser games
- **Faster load times**: Libraries are cached and pre-loaded
- **No code changes**: Works with your existing imports

## Quick Start

### 1. Add the Vite Plugin

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { rundotGameLibrariesPlugin } from '@series-inc/rundot-game-sdk/vite';

export default defineConfig({
  plugins: [rundotGameLibrariesPlugin()],
  build: { target: 'es2022' } // Required for top-level await
});
```

{% hint style="warning" %}
The generated bootstrap loader uses top-level `await` to fetch each embedded library before your game runs, so your `build.target` must support it. Use `'es2022'` (or any target with top-level-await support). If the target is too low (for example `'es2015'`), the build fails or the loader never resolves and your game stays blank.
{% endhint %}

### 2. Use Libraries Normally

```typescript
// Import as usual - the plugin handles the rest
import Phaser from 'phaser';
import { create } from 'zustand';
import * as THREE from 'three';
import React from 'react';
import { Story, Compiler } from 'inkjs/full';
```

### 3. Build

```bash
# For RUN.world deployment (embedded libraries)
npm run build

# For standalone deployment (bundled libraries)
RUNDOT_GAME_DISABLE_EMBEDDED_LIBS=true npm run build
```

## Plugin Options

`rundotGameLibrariesPlugin()` accepts an optional options object. The Quick Start calls it with no arguments, which is fine for most games. Pass options when you serve local game assets from a `cdn/` folder in dev mode, or when you want bootstrap debug logging.

### `rundotGameLibrariesPlugin(options?): Plugin`

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { rundotGameLibrariesPlugin } from '@series-inc/rundot-game-sdk/vite';

export default defineConfig({
  plugins: [
    rundotGameLibrariesPlugin({
      appName: 'my-game',
      cdnDir: './cdn',
      debug: false,
    }),
  ],
  build: { target: 'es2022' }
});
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `appName` | `string` | No | auto-detected | Your app name. The dev-server middleware uses it to serve local `cdn/` assets under `/<appName>/...`. If omitted, it is auto-detected from an `H5/<appName>` directory segment in the Vite root. |
| `cdnDir` | `string` | No | `./cdn` | Path to the local `cdn/` folder (relative to the current working directory, normally your project root), served in dev mode. Resolved via `path.resolve`. |
| `debug` | `boolean` | No | `false` | Enable debug logging in the generated bootstrap loader. |

{% hint style="info" %}
For backwards compatibility, the `@series-inc/rundot-game-sdk/vite` entry point also re-exports `rundotGameLibrariesPlugin` as `venusLibrariesPlugin`. The alias is identical to `rundotGameLibrariesPlugin`; use the `rundotGame` name for new configs.
{% endhint %}

## Removing dev `cdn/` assets from production builds

`@series-inc/rundot-game-sdk/vite` also exports `cdnPlugin`, a build-only companion. During dev the libraries plugin serves local assets from your `cdn/` folder (see the `cdnDir` option above). If your build copies that folder into the output directory, `cdnPlugin` deletes `<outDir>/cdn` after the bundle is written, so dev-only assets don't ship to production.

### `cdnPlugin(): Plugin`

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { rundotGameLibrariesPlugin, cdnPlugin } from '@series-inc/rundot-game-sdk/vite';

export default defineConfig({
  plugins: [
    rundotGameLibrariesPlugin(),
    cdnPlugin(),
  ],
  build: { target: 'es2022' }
});
```

`cdnPlugin` takes no options. It runs only on `build` (its `closeBundle` hook removes `<build.outDir>/cdn` when that folder exists) and is a no-op during dev. Add it only if you actually emit a `cdn/` folder into your output directory; otherwise you don't need it.

## Supported Libraries

| Library | Version(s) | Supported Imports |
|---------|------------|-------------------|
| Phaser | 3.90.0 | `phaser` |
| React | 18.3.1, 19.2.4 | `react`, `react/jsx-runtime`, `react/jsx-dev-runtime` |
| ReactDOM | 18.3.1, 19.2.4 | `react-dom`, `react-dom/client` |
| Three.js | 0.170.0, 0.183.2 | `three` |
| Matter.js | 0.19.0 | `matter-js` |
| Ink.js | 2.2.0, 2.3.2 | `inkjs`, `inkjs/full` |
| Zustand | 5.0.3 | `zustand`, `zustand/middleware` |

> **Version matching**: The plugin only externalizes a library when your installed version **exactly matches** one of the supported versions above. If your version differs, the library is bundled normally, no code changes needed.

### Ink.js Usage

You can import Ink.js from either `inkjs` or `inkjs/full`:

```typescript
// Story runtime for running pre-compiled ink JSON
import { Story } from 'inkjs';

// Compiler available for runtime ink compilation
import { Story, Compiler } from 'inkjs/full';
```

{% hint style="info" %}
Under embedded libraries, both `inkjs` and `inkjs/full` resolve to the same full build, which includes the Compiler. There is no separate runtime-only embedded asset, so importing from `inkjs` does not yield a smaller download on the host. Pick the specifier that matches the exports you use.
{% endhint %}

## Troubleshooting

### Build without embedded libraries

If you want to bundle all libraries into your game, you can set the `RUNDOT_GAME_DISABLE_EMBEDDED_LIBS` environment variable to `true`.

```bash
RUNDOT_GAME_DISABLE_EMBEDDED_LIBS=true npm run build
```

This bundles all libraries (larger size, but guaranteed to work).

### Need a different library version?

Pin the exact supported version in your `package.json`. If you need a version that isn't listed above, the library will be bundled into your game automatically.

To request a new library or version for the embedded system, contact the team.
