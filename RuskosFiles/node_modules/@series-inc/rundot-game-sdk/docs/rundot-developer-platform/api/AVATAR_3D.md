# Avatar 3D API

Open the native RUN.world 3D avatar editor, load and save player avatars, and pull the avatar asset manifest so your game can render the same characters players build platform-wide.

{% hint style="warning" %}
All SDK methods can reject; unhandled rejections crash the app. Always wrap SDK calls in `try/catch` or attach a `.catch()` handler. See [Error Handling](../error-handling.md) for details.
{% endhint %}

The Avatar 3D methods are top-level on `RundotGameAPI` (for example `RundotGameAPI.loadAvatar3dAsync()`), not under an `avatar3d` namespace.

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

// Load the current player's saved avatar (null if they have none yet)
const avatar = await RundotGameAPI.loadAvatar3dAsync()

// Open the native editor seeded with the current config
const edits = await RundotGameAPI.showAvatar3dEditorAsync({ currentAvatar: avatar })

if (edits.wasChanged && edits.config) {
  // The player saved a new look; edits.savedAvatarId is the new id
  renderAvatar(edits.config)
}
```

## Editing an avatar

### `showAvatar3dEditorAsync(options): Promise<Avatar3dEdits>`

Opens the native RUN.world 3D avatar editor as a pushed app. The editor takes over the screen, and the promise resolves once the player closes it. When the player saves, the host persists the new avatar and the result reports the change.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `options.currentAvatar` | `any` | No | Seed the editor with an existing avatar (typically the `Avatar3dConfig` from `loadAvatar3dAsync()`). |
| `options.contextData` | `any` | No | Arbitrary data passed through to the editor app. |

Returns an [`Avatar3dEdits`](#avatar3dedits) object. When the player cancels without saving, `wasChanged` is `false` and both `config` and `savedAvatarId` are `null`.

```typescript
const current = await RundotGameAPI.loadAvatar3dAsync()

const edits = await RundotGameAPI.showAvatar3dEditorAsync({
  currentAvatar: current,
  contextData: { source: 'character_screen' },
})

if (edits.wasChanged) {
  console.log('New avatar id:', edits.savedAvatarId)
}
```

## Loading and saving

{% hint style="info" %}
On the published `RundotGameAPI` surface these two methods are typed loosely: `loadAvatar3dAsync` resolves to `Promise<any>` and `saveAvatar3dAsync` accepts `config: any`. The runtime values still follow the [`Avatar3dConfig`](#avatar3dconfig) shape documented here (or `null` when loading an avatar that does not exist), but your editor will not autocomplete the fields and the compiler will not enforce them. Cast or annotate against `Avatar3dConfig` yourself if you want type safety at the call site.
{% endhint %}

### `loadAvatar3dAsync(avatarId?): Promise<Avatar3dConfig | null>`

Loads an avatar configuration. With no argument, loads the current player's saved avatar. Pass an `avatarId` to load a specific avatar (for example, one belonging to another player). Resolves to `null` when there is no matching avatar.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `avatarId` | `string` | No | Load a specific avatar by id. Omit to load the current player's avatar. |

```typescript
// Current player's avatar
const mine = await RundotGameAPI.loadAvatar3dAsync()

// A specific avatar (e.g. an opponent in a match)
const opponent = await RundotGameAPI.loadAvatar3dAsync(opponentAvatarId)
```

### `saveAvatar3dAsync(config): Promise<string>`

Persists the given [`Avatar3dConfig`](#avatar3dconfig) for the current player and resolves with the new avatar id string. Use this when your game lets players assemble avatars outside the native editor.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `config` | `Avatar3dConfig` | Yes | The avatar configuration to persist. |

```typescript
const newId = await RundotGameAPI.saveAvatar3dAsync({
  headAsset: 'head_round.glb',
  outfitAsset: 'outfit_explorer.glb',
  hatAsset: null,
  hairAsset: 'hair_short.glb',
  faceAccessoryAsset: null,
  animationAsset: 'idle_wave.glb',
  skinColor: '#d8a06b',
})
```

### `deleteAvatar3dAsync(): Promise<void>`

Deletes the current player's saved avatar. Resolves with `void`.

```typescript
await RundotGameAPI.deleteAvatar3dAsync()
```

## Asset manifest

The avatar asset manifest (`assets.json`) lives on the RUN.world CDN and lists every avatar mesh available, grouped by category (head, outfit, hat, hair, face accessory, animation). Use it to render avatars yourself or to preload meshes before a match.

### `downloadAvatar3dManifestAsync(): Promise<AssetManifest>`

Fetches the full [`AssetManifest`](#assetmanifest) from the CDN: version, generation timestamp, and the per-category asset list.

```typescript
const manifest = await RundotGameAPI.downloadAvatar3dManifestAsync()

for (const [categoryKey, category] of Object.entries(manifest.categories)) {
  console.log(categoryKey, category.assets.length, 'assets')
}
```

### `downloadAvatar3dAssetPathsAsync(): Promise<Record<string, string[]>>`

Convenience over `downloadAvatar3dManifestAsync()` for preloading. Resolves to a map of category key to an array of fully-resolved CDN asset URLs, so you can hand the URLs straight to a loader without joining paths yourself.

```typescript
const paths = await RundotGameAPI.downloadAvatar3dAssetPathsAsync()

// e.g. { head: ['https://cdn.../head/head_round.glb', ...], outfit: [...] }
await Promise.all(paths.head.map((url) => myMeshLoader.preload(url)))
```

## API Reference

| Method | Returns | Description |
|--------|---------|-------------|
| `showAvatar3dEditorAsync(options)` | `Promise<Avatar3dEdits>` | Open the native avatar editor; resolves when it closes. |
| `loadAvatar3dAsync(avatarId?)` | `Promise<Avatar3dConfig \| null>` | Load the current player's avatar, or a specific avatar by id. |
| `saveAvatar3dAsync(config)` | `Promise<string>` | Persist an avatar config; resolves with the new avatar id. |
| `deleteAvatar3dAsync()` | `Promise<void>` | Delete the current player's saved avatar. |
| `downloadAvatar3dManifestAsync()` | `Promise<AssetManifest>` | Fetch the full avatar asset manifest from the CDN. |
| `downloadAvatar3dAssetPathsAsync()` | `Promise<Record<string, string[]>>` | Fetch category-to-URL paths for preloading meshes. |

## Types

### `Avatar3dEdits`

The resolved shape of `showAvatar3dEditorAsync`.

| Field | Type | Description |
|-------|------|-------------|
| `wasChanged` | `boolean` | `true` if the player saved a new look; `false` if they cancelled. |
| `config` | `Avatar3dConfig \| null` | The saved configuration, or `null` when cancelled. |
| `savedAvatarId` | `string \| null` | The new avatar id, or `null` when cancelled. |

### `Avatar3dConfig`

The avatar configuration returned by `loadAvatar3dAsync` and accepted by `saveAvatar3dAsync`. Each `*Asset` field holds an asset filename (matching `Asset.filename` in the manifest) or `null` when that slot is empty.

| Field | Type | Description |
|-------|------|-------------|
| `headAsset` | `string \| null` | Head mesh filename. |
| `outfitAsset` | `string \| null` | Outfit mesh filename. |
| `hatAsset` | `string \| null` | Hat mesh filename. |
| `hairAsset` | `string \| null` | Hair mesh filename. |
| `faceAccessoryAsset` | `string \| null` | Face accessory mesh filename. |
| `animationAsset` | `string \| null` | Animation asset filename. |
| `skinColor` | `string \| null` | Skin color (e.g. a hex string). |

### `AssetManifest`

The return shape of `downloadAvatar3dManifestAsync`.

| Field | Type | Description |
|-------|------|-------------|
| `version` | `string` | Manifest version. |
| `generatedAt` | `string` | Timestamp the manifest was generated. |
| `categories` | `Record<string, Category>` | Map of category key (e.g. `head`, `outfit`, `hat`, `hair`, `face-accessory`, `animation`) to a `Category`. |

### `Category`

A single category within `AssetManifest.categories`.

| Field | Type | Description |
|-------|------|-------------|
| `displayName` | `string` (optional) | Human-readable category name. |
| `type` | `'mesh'` | Asset type for the category (always `'mesh'`). |
| `assets` | `Asset[]` | The assets in this category. |

### `Asset`

A single avatar asset entry. `filename` is what `Avatar3dConfig` fields store and what `downloadAvatar3dAssetPathsAsync` resolves against the CDN.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Stable asset id. |
| `filename` | `string` | Asset filename (e.g. `head_round.glb`). |
| `displayName` | `string` | Human-readable asset name. |
| `preload` | `boolean` (optional) | Whether the asset should be preloaded. |
| `tags` | `string[]` (optional) | Arbitrary tags for filtering. |
| `metadata` | `Record<string, any>` (optional) | Arbitrary per-asset metadata. |

### `ShowEditorOptions`

Options accepted by the underlying avatar editor. The top-level `showAvatar3dEditorAsync` signature exposes only `currentAvatar` and `contextData`.

| Field | Type | Description |
|-------|------|-------------|
| `currentAvatar` | `any` (optional) | Seed the editor with an existing avatar. |
| `contextData` | `any` (optional) | Arbitrary data passed through to the editor app. |
| `onSave` | `() => void` (optional) | Internal callback forwarded to the editor app; not part of the top-level method signature. |
| `onCancel` | `() => void` (optional) | Internal callback forwarded to the editor app; not part of the top-level method signature. |
