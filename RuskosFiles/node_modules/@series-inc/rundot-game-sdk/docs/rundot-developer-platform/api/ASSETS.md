# Assets API

Exceed the 32 MB bundle size limit by serving assets from the RUN.world CDN. The CLI handles uploading, versioning, and cache-busting; you just fetch. Assets can optionally be **protected** behind entitlements so only players who own the right entitlement can access them.

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

const imageBlob = await RundotGameAPI.cdn.fetchAsset('images/logo.png')
const imageUrl = URL.createObjectURL(imageBlob)
document.querySelector('#logo').src = imageUrl
```

## Setting Up Your Assets

Place any assets you want served via CDN in your project's `public/cdn-assets` folder. The RUN.world CLI automatically uploads these files when you deploy.

```
my-game/
├── public/
│   └── cdn-assets/
│       ├── images/
│       │   └── logo.png
│       ├── audio/
│       │   └── background.mp3
│       └── data/
│           └── levels.json
├── src/
│   └── ...
└── game.config.prod.json
```

{% hint style="warning" %}
Only files inside `public/cdn-assets/` are uploaded to the CDN. Files placed elsewhere in `public/` will be bundled into your game but won't be available via the CDN API.
{% endhint %}

## Fetching Assets

Use `cdn.fetchAsset` to load assets from your game's CDN. Paths are relative to the `cdn-assets` folder.

Under the hood, `fetchAsset` resolves each logical path through a **manifest** (generated at deploy time) so that files are content-hashed and cache-busted automatically. For protected assets, the Client App validates the player's entitlements and returns a signed URL.

### Fetch an Image

```typescript
const imageBlob = await RundotGameAPI.cdn.fetchAsset('images/logo.png')
const imageUrl = URL.createObjectURL(imageBlob)
document.querySelector('#logo').src = imageUrl
```

### Fetch JSON Data

```typescript
const dataBlob = await RundotGameAPI.cdn.fetchAsset('data/levels.json')
const levels = JSON.parse(await dataBlob.text())
```

### Fetch Audio with a Custom Timeout

The default timeout is 30 000 ms. Pass `timeout` in milliseconds to override:

```typescript
const audioBlob = await RundotGameAPI.cdn.fetchAsset('audio/background.mp3', {
  timeout: 60000,
})
```

### `fetchFromCdn(subPath, options?): Promise<Blob>`

Fetch a Blob straight from the CDN bucket root. The path is relative to the bucket root, so this is how you reach assets outside your own `cdn-assets` folder (for example another game's `othergame/bundle.stow`). There is no manifest resolution and no entitlement check; you get whatever lives at that path.

Use `fetchAsset` for your own assets (it is manifest-resolved, cache-busted, and entitlement-aware). Reach for `fetchFromCdn` only when you need a raw path against the bucket root.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `subPath` | `string` | yes | Path relative to the CDN bucket root |
| `options.timeout` | `number` | no | Fetch timeout in ms (default `30000`) |

```typescript
const bundleBlob = await RundotGameAPI.cdn.fetchFromCdn('othergame/bundle.stow')
```

## Resolving Asset URLs

If you need the URL of an asset without fetching its contents (e.g., to set an `<img>` src or pass to a third-party library), use `resolveAssetUrl` or `resolveAssetUrls`.

### Resolve a Single URL

```typescript
const url = await RundotGameAPI.cdn.resolveAssetUrl('images/hero.png')
document.querySelector('#hero').src = url
```

### Batch Resolve Multiple URLs

`resolveAssetUrls` resolves multiple paths in a single call. Each result includes a per-path status, so a missing entitlement on one asset does not fail the entire batch.

```typescript
const results = await RundotGameAPI.cdn.resolveAssetUrls([
  'images/hero.png',
  'images/premium-skin.png',
  'audio/theme.mp3',
])

for (const result of results) {
  if (result.status === 'ok') {
    console.log(`${result.path} → ${result.url}`)
  } else {
    console.warn(`${result.path} failed: ${result.error}`)
  }
}
```

Each result in the array has this shape:

```typescript
interface AssetUrlResult {
  path: string                // The path you requested
  status: 'ok' | 'error'
  url?: string                // Resolved URL (when status is 'ok')
  expiresAt?: number          // URL expiry timestamp in ms (for signed URLs)
  error?: string              // Error code (when status is 'error')
}
```

{% hint style="info" %}
`expiresAt` is populated only for signed (protected) URLs. Public assets, plus anything resolved via the legacy fallback path on older Client App versions, come back without it, so treat it as optional and never rely on it for public assets.
{% endhint %}

**Error codes:**

| Code | Meaning |
|------|---------|
| `ENTITLEMENT_REQUIRED` | The asset is protected and the player does not own the required entitlement |
| `ASSET_NOT_FOUND` | The asset path does not exist in the manifest |

### Shared Asset URLs

Two synchronous helpers resolve paths against the **shared** CDN (assets bundled with the platform, not your game). Both return a URL immediately (no `await`) and pass through full `http://` / `https://` URLs unchanged.

#### `resolveAvatarAssetUrl(subPath): string`

Resolve a shared 3D-avatar asset path (served under the `avatar3d/` prefix) to its absolute shared-CDN URL.

```typescript
const url = RundotGameAPI.cdn.resolveAvatarAssetUrl('heads/default.glb')
```

#### `resolveSharedLibUrl(subPath): string`

Resolve a shared library asset path (served under the `libs/` prefix) to its absolute shared-CDN URL.

```typescript
const url = RundotGameAPI.cdn.resolveSharedLibUrl('three/three.module.js')
```

#### `getAssetCdnBaseUrl(): string`

Return the base CDN URL for your game's `cdn-assets` folder (the prefix every `resolveAssetUrl` is built on). The exact shape depends on how your game is hosted: a per-app subdomain returns `<gameId>.h5-apps.<env>.getreel.com/.../cdn-assets`, while the legacy single-host layout returns `<bucket>/<gameId>/cdn-assets`. It throws if called outside a browser window, or from a URL that matches neither hosting shape.

```typescript
const base = RundotGameAPI.cdn.getAssetCdnBaseUrl()
```

## Protected Assets (Entitlement-Gated)

Assets can be marked as **protected** so only players who hold the required entitlements can access them. This is useful for premium content like skins, levels, or audio packs that are unlocked through purchases or rewards.

### How It Works

1. Create a `cdn.config.json` file in your **project root** (next to `game.config.prod.json`) declaring which folders are protected and by which entitlements.
2. On deploy, the CLI reads `cdn.config.json` and generates a v2 manifest that flags protected files.
3. When your game requests a protected asset, the Client App checks the player's entitlements.
4. If the player owns the required entitlements, a **signed URL** is returned.
5. If the player does not own the entitlements, the request fails with an `ENTITLEMENT_REQUIRED` error.

### cdn.config.json

Create a `cdn.config.json` file in your project root to declare which asset folders require entitlements. If this file does not exist, all assets in `cdn-assets/` are served publicly (backwards-compatible).

```
my-game/
├── cdn.config.json        <-- put it here
├── game.config.prod.json
├── public/
│   └── cdn-assets/
│       ├── images/        <-- public (not listed in config)
│       ├── videos/        <-- protected
│       └── audio/         <-- protected
└── src/
```

#### Schema

```json
{
  "version": 1,
  "defaultTtl": 3600,
  "ttlByMimeType": {
    "video/*": 300,
    "audio/*": 600
  },
  "protected": [
    {
      "path": "videos",
      "entitlements": ["gold", "premium"],
      "ttl": 1800,
      "ttlByMimeType": {
        "video/mp4": 120
      }
    },
    {
      "path": "videos",
      "entitlements": ["platinum"]
    },
    {
      "path": "audio",
      "entitlements": ["season-pass"]
    }
  ]
}
```

Only folders that require entitlements need to be listed. Any folder inside `cdn-assets/` that is **not** present in `protected` is treated as public.

#### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `version` | yes | Schema version. Currently `1`. |
| `defaultTtl` | no | Fallback signed URL TTL in seconds for all protected assets. Defaults to `3600`. |
| `ttlByMimeType` | no | Global TTL overrides keyed by MIME type. Supports `*` wildcards (e.g. `"video/*"`). |
| `protected` | yes | Array of protection rules. Each entry maps a folder to a set of required entitlements. |
| `protected[].path` | yes | Top-level folder name inside `cdn-assets/` that requires entitlements (e.g. `"videos"`). |
| `protected[].entitlements` | yes | Array of entitlement IDs required to access this folder. All entitlements in the array are AND'd: the player must hold **all** of them. |
| `protected[].ttl` | no | Per-folder TTL override in seconds. |
| `protected[].ttlByMimeType` | no | Per-folder, per-MIME-type TTL overrides. Same wildcard syntax as the global field. |

#### Entitlement Logic (AND / OR)

Within a single entry, all listed entitlements are **AND'd**: the player needs **all** of them. Multiple entries for the **same path** are **OR'd**: the player needs to satisfy **any one** group.

In the example above, `videos/` is accessible if the player has (`gold` AND `premium`) **OR** `platinum`. `audio/` requires `season-pass`.

#### TTL Resolution

For protected assets, the signed URL TTL is resolved in priority order (most specific wins):

1. Folder-level `ttlByMimeType` match
2. Folder-level `ttl`
3. Global `ttlByMimeType` match
4. Global `defaultTtl`
5. System default (`3600`)

TTL does not apply to public assets.

### Fetching Protected Assets

Protected assets are fetched using the same `fetchAsset` and `resolveAssetUrl` methods as public assets; no special API call is needed. The entitlement check happens automatically.

```typescript
try {
  const skinBlob = await RundotGameAPI.cdn.fetchAsset('skins/dragon.png')
  applySkin(skinBlob)
} catch (error) {
  if (error.message.includes('ENTITLEMENT_REQUIRED')) {
    showPurchasePrompt()
  }
}
```

### Refreshing Entitlements

After a player completes a purchase or receives a reward that grants new entitlements, call `refreshEntitlements()` so the Client App picks up the change immediately. Without this call, newly granted entitlements may not take effect until the next app session.

```typescript
// Player just bought a skin pack
await RundotGameAPI.entitlements.consumeEntitlement('skin_pack_token', 1)

// Refresh so protected assets are now accessible
await RundotGameAPI.cdn.refreshEntitlements()

// Now fetch the newly unlocked asset
const skinBlob = await RundotGameAPI.cdn.fetchAsset('skins/dragon.png')
```

{% hint style="info" %}
`refreshEntitlements()` is a no-op only when the host reports the message as unsupported (older Client App versions without entitlement-gated assets); any other RPC failure is rethrown to you. The same unsupported-message fallback governs `resolveAssetUrl` / `resolveAssetUrls`, which drop to a legacy manifest path that can resolve public assets but throws `ENTITLEMENT_REQUIRED` for protected ones.
{% endhint %}

See the [Entitlements API](ENTITLEMENTS.md) for full details on managing player entitlements.

## Asset Loader (Top-Level Convenience)

The `cdn.*` methods give you Blobs and URLs. For a higher-level loader that resolves the path, fetches it (inside the WebView), caches it, and hands you a ready-to-use value (a blob URL for media, the content string for text/JSON), use the top-level `loadAsset` / `preloadAssets` / `cleanupAssets` methods. These live directly on `RundotGameAPI` (not under `cdn`).

### `loadAsset(url, options?): Promise<string>`

Load a single asset, cache it, and get back a ready-to-use value. The path is resolved through `cdn.resolveAssetUrl` first. What you get back depends on the asset type:

* **`image` / `audio` / `video`** resolve to a **blob object URL** you can drop straight into an `<img>`, `<audio>`, or `<video>` element. Inside the client WebView these are always fetched into a blob (videos in particular are never streamed, to dodge WebView streaming issues), so a large video is fully downloaded into memory. That is why you should call `cleanupAssets()` when you tear a scene down.
* **`text` / `json`** resolve to the asset's **content string** (the raw response body, not a URL). For JSON you call `JSON.parse(result)` on the returned value; you do not fetch it.

Asset type is auto-detected from the file extension (see the mapping below), or you can force it with `options.type`.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | `string` | yes | - | Asset path (resolved via `cdn.resolveAssetUrl`) |
| `options.type` | `string` | no | `'auto'` | Force a type instead of extension-based detection (`image`, `audio`, `video`, `text`, `json`) |
| `options.cache` | `boolean` | no | `true` | Cache the resolved result |
| `options.timeout` | `number` | no | `30000` | Fetch timeout in ms |
| `options.isOptional` | `boolean` | no | `false` | Suppress error logging if the load fails |
| `options.streaming` | `boolean` | no | `false` | Declared on the type but currently ignored: the loader always uses blob fetching in the WebView, so this is a no-op today |

```typescript
// Media: returns a blob object URL
const logoUrl = await RundotGameAPI.loadAsset('images/logo.png')
document.querySelector('#logo').src = logoUrl

// JSON/text: returns the content string, ready to parse
const levelsText = await RundotGameAPI.loadAsset('data/levels.json')
const levels = JSON.parse(levelsText)
```

#### Auto-detected types

When `type` is `'auto'` (the default), the loader maps the file extension as follows. Any extension not listed falls back to `text`, so an unknown or extension-less path is fetched as a plain string.

| Detected type | Extensions |
|---------------|-----------|
| `image` | `jpg`, `jpeg`, `png`, `gif`, `webp`, `svg` |
| `audio` | `mp3`, `wav`, `ogg`, `m4a`, `aac` |
| `video` | `mp4`, `webm`, `mov`, `m4v` |
| `json` | `json` |
| `text` (fallback) | everything else |

{% hint style="warning" %}
After fetching, `image` / `audio` / `video` assets are verified by actually loading them (a real `Image` / `Audio` / `<video>`). This verification has its own fixed **10 second** timeout, independent of the `timeout` option. A media asset that downloads fine but fails to decode (or takes longer than 10s to become ready) rejects `loadAsset` even though the fetch itself succeeded.
{% endhint %}

### `preloadAssets(assets, options?): Promise<Array<{ url: string; success: boolean; isOptional: boolean; result?: string; error?: unknown }>>`

Preload multiple assets in parallel. Pass either plain path strings or `{ url, isOptional }` objects. Use `onProgress` to drive a loading bar. Each asset is loaded with `loadAsset`, so the same caching and type detection apply. Required assets that fail are warned to the console; optional ones (`isOptional: true`) are skipped silently.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `assets` | `Array<string \| { url: string; isOptional?: boolean }>` | yes | Paths to preload |
| `options.onProgress` | `(progress: number, info: { loaded: number; total: number; current: string; error?: unknown }) => void` | no | Progress callback (`progress` is `loaded / total`). `info.error` is present only when the asset that just finished failed. |

Returns an array of per-asset results, one per input asset, in order. Each result has this shape:

```typescript
interface PreloadResult {
  url: string         // The path you passed in
  success: boolean
  isOptional: boolean
  result?: string     // The loaded URL/content (present when success is true)
  error?: unknown     // The thrown error (present when success is false)
}
```

{% hint style="info" %}
The declared TypeScript return type only lists `{ success, isOptional? }`. The runtime objects always include `url` and carry `result` (on success) or `error` (on failure) as shown above.
{% endhint %}

```typescript
const results = await RundotGameAPI.preloadAssets(
  [
    'images/hero.png',
    { url: 'audio/theme.mp3', isOptional: true },
  ],
  {
    onProgress: (progress, info) => {
      console.log(`${Math.round(progress * 100)}% (${info.loaded}/${info.total})`)
    },
  },
)
```

### `cleanupAssets(): void`

Revoke every blob URL the asset loader created and clear its cache to free memory. This is the batch equivalent of calling `URL.revokeObjectURL()` on each URL yourself; call it when you tear down a scene or no longer need any loaded assets.

```typescript
RundotGameAPI.cleanupAssets()
```

### `assetLoader.getCached(url): Promise<string | undefined>`

`loadAsset`, `preloadAssets`, and `cleanupAssets` are thin convenience wrappers over the `RundotGameAPI.assetLoader` object. The one extra method that object exposes is `getCached`: it resolves the path through `cdn.resolveAssetUrl` and returns the previously cached value (a blob object URL for media, or the content string for text/JSON) without re-fetching. It resolves to `undefined` if nothing for that path is in the cache yet.

```typescript
const cached = await RundotGameAPI.assetLoader.getCached('images/logo.png')
if (cached) {
  document.querySelector('#logo').src = cached
} else {
  const url = await RundotGameAPI.loadAsset('images/logo.png')
  document.querySelector('#logo').src = url
}
```

{% hint style="info" %}
The published TypeScript declaration types this as synchronous (`getCached(url: string): string | null`), but the runtime implementation is `async` and returns a `Promise` that resolves to `undefined` (not `null`) on a cache miss. Always `await` it.
{% endhint %}

## API Reference

| Method | Returns | Description |
|--------|---------|-------------|
| `cdn.fetchAsset(path, options?)` | `Promise<Blob>` | Fetch a game asset from the CDN (manifest-resolved, cache-busted). Works for both public and protected assets. |
| `cdn.fetchFromCdn(subPath, options?)` | `Promise<Blob>` | Fetch a Blob from the CDN bucket root by raw path (no manifest, no entitlement check) |
| `cdn.resolveAssetUrl(path)` | `Promise<string>` | Resolve a single asset path to its CDN URL (signed if protected) |
| `cdn.resolveAssetUrls(paths)` | `Promise<AssetUrlResult[]>` | Batch resolve multiple asset paths with per-path error handling |
| `cdn.resolveAvatarAssetUrl(subPath)` | `string` | Synchronously resolve a shared 3D-avatar asset path (`avatar3d/` prefix) to its shared-CDN URL |
| `cdn.resolveSharedLibUrl(subPath)` | `string` | Synchronously resolve a shared library asset path (`libs/` prefix) to its shared-CDN URL |
| `cdn.refreshEntitlements()` | `Promise<void>` | Refresh the Client App's entitlement cache (call after purchases or rewards) |
| `cdn.getAssetCdnBaseUrl()` | `string` | Get the base CDN URL for your game's assets |
| `loadAsset(url, options?)` | `Promise<string>` | Load a single asset (resolved, fetched, cached). Resolves to a blob object URL for media, or the content string for text/JSON |
| `preloadAssets(assets, options?)` | `Promise<Array<{ url, success, isOptional, result?, error? }>>` | Preload multiple assets in parallel with an `onProgress` callback |
| `cleanupAssets()` | `void` | Revoke all asset-loader blob URLs and clear its cache |
| `assetLoader.getCached(url)` | `Promise<string \| undefined>` | Return the already-cached value for a path (blob URL or content string) without re-fetching; `undefined` on a cache miss |

## Versioning & Deployment

Asset versioning is handled automatically by the RUN.world CLI:

* On each deploy, the CLI generates a manifest of your `cdn-assets` folder.
* Only files that have changed since the last deploy are uploaded.
* Cache-busting is managed for you; no need to manually version filenames.
* Protected assets are flagged in the manifest and served via signed URLs at runtime.

## Best Practices

- Store all CDN assets in `public/cdn-assets/` to ensure they are uploaded on deploy.
- Pair with the [Preloader API](PRELOADER.md) to keep the host splash visible while fetching heavy assets.
- Remember to revoke blob URLs with `URL.revokeObjectURL()` when you no longer need them, to free memory. If you loaded assets through `loadAsset` / `preloadAssets`, call `cleanupAssets()` to revoke them all at once.
- Use `resolveAssetUrls` for batch operations instead of calling `resolveAssetUrl` in a loop.
- Always call `refreshEntitlements()` after a purchase or reward grant; otherwise protected assets may remain inaccessible until the next app session.
- Use `resolveAssetUrls` to pre-check which protected assets a player can access, and show lock/unlock UI accordingly.

