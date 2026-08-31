# Shared Assets API

Download host-provisioned asset bundles that are shared across titles or reused within your game. Shared assets reduce bundle size and keep large media up to date without shipping updates.

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

const bundleBuffer = await RundotGameAPI.sharedAssets.loadAssetsBundle(
  'burger-time',
  'characters',
)
console.log('Bundle bytes:', bundleBuffer.byteLength)
```

## API Reference

### `loadAssetsBundle(game: string, bundleKey: string, fileType?: string): Promise<ArrayBuffer>`

Resolves with raw bundle bytes (`ArrayBuffer`). Hand them to your own decompressor, asset loader, etc.

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `game` | `string` | Yes | - | The CDN namespace for the bundle (typically the game that owns the assets). Only used to build the CDN fallback URL; see the hint below. |
| `bundleKey` | `string` | Yes | - | Identifies the bundle. On the RPC path this is the only field the host uses to resolve the asset; it is also the filename stem in the CDN fallback URL. |
| `fileType` | `string` | No | `'stow'` | File extension used when building the CDN fallback URL (`{game}/{bundleKey}.{fileType}`). |

Host implementations attempt to load via RPC first and fall back to the CDN when the RPC lookup fails. Keep CDN and embedded assets in sync.

{% hint style="info" %}
Both `game` and `fileType` only affect the CDN fallback path. When the bundle resolves over RPC, the host sends just `{ assetKey: bundleKey }` and ignores both: the bytes you get back are resolved by `bundleKey` alone. So for same-game assets you can usually pass any truthy `game` and omit `fileType`, relying on the `'stow'` default. The `game` namespace matters only when the RPC lookup misses and the CDN fallback runs (see Third-Party Developer Use Case below).
{% endhint %}

{% hint style="warning" %}
If both the RPC and CDN paths fail, the promise rejects with a generic `Error: Failed to load <bundleKey>`. The underlying RPC and CDN errors are not chained onto it, so you cannot inspect the original cause. Wrap the call in `try`/`catch` and treat any rejection as a load failure (fall back to a placeholder asset).
{% endhint %}

## Base64 Helpers

`loadAssetsBundle` already hands you an `ArrayBuffer`, but if you receive raw base64 asset data yourself (for example a base64 payload from another host message or a text manifest), the SDK ships two decoding helpers. They are plain function exports, not methods on the `sharedAssets` namespace, so import them directly:

```typescript
import { base64ToArrayBuffer, base64ToUtf8 } from '@series-inc/rundot-game-sdk'
```

### `base64ToArrayBuffer(base64: string): ArrayBuffer`

Decodes a base64 string into an `ArrayBuffer` using native `atob()`. Use it for binary assets (images, audio, packed bundles).

```typescript
const buffer = base64ToArrayBuffer(base64Payload)
const bytes = new Uint8Array(buffer)
```

### `base64ToUtf8(base64: string): string`

Decodes a base64 string into a UTF-8 string. Use it for text-based shared assets (JSON manifests, ink scripts). It tries `TextDecoder` first, then `Buffer`, then a legacy `atob` / `decodeURIComponent` fallback, so it works across runtimes.

```typescript
const manifestJson = base64ToUtf8(base64Payload)
const manifest = JSON.parse(manifestJson)
```

## Third-Party Developer Use Case

Shared assets enable cross-game asset sharing. For example, a first-party game can upload assets that third-party developers can use in their own games:

```typescript
// Example: Rush uploads Rush character assets
// A 3P developer can then use those assets in their game

const rushCharacters = await RundotGameAPI.sharedAssets.loadAssetsBundle(
  'rush-game',        // Game that owns the assets (CDN namespace)
  'CharacterSprites', // Bundle key
)

// Process the bundle (e.g., decompress, parse)
const sprites = await processCharacterBundle(rushCharacters)

// Use in your game
displayCharacter(sprites.hero)
```

{% hint style="info" %}
Cross-game loads resolve through the CDN fallback. When you pass another game's `game` namespace, the per-game RPC manifest lookup for that `bundleKey` misses and the host fetches `{game}/{bundleKey}.{fileType}` from the CDN instead (this fetch bypasses the manifest). For another game to load a bundle this way, the owning game must publish it to the CDN at exactly `{game}/{bundleKey}.{fileType}` (the `fileType` defaults to `'stow'`).
{% endhint %}

This pattern allows:
- First-party games to publish reusable assets
- Third-party developers to incorporate those assets
- Consistent character/asset appearance across games
- Reduced bundle sizes for all games using shared assets

## Available Bundles

Currently available shared asset bundles:

| Game | Bundle Key | Description |
|------|------------|-------------|
| `burger-time` | `characters` | Character sprites and animations |
| `burger-time` | `burgershop` | Core game assets |
| `burger-time` | `vfx` | Visual effects assets |

## Best Practices

- Use the embedded bundles to reduce on-demand loading, speeding up app start.
- Cache loaded bundles locally if you'll need them multiple times.
- Handle loading failures gracefully: fall back to placeholder assets if needed.
- Keep CDN and embedded assets in sync for consistent behavior.
