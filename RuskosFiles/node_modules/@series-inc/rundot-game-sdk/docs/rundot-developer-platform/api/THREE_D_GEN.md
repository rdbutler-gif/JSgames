# 3D Generation API (BETA)

Generate 3D models from images or text, then remesh, rig, and animate them for use in your game.

---

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

const result = await RundotGameAPI.threeDGen.generate({
  provider: 'hunyuan3d-v3.1-pro',
  mode: 'image-to-3d',
  imageUrl: 'https://cdn.example.com/character-front.png',
  quality: 'standard',
})

console.log(result.modelUrl)    // GLB model URL (Draco + WebP compressed)
console.log(result.rawModelUrl) // Uncompressed GLB (optional)
```

## Pipeline Architecture

The 3D generation system uses two provider layers:

| Stage | Providers | Via | Purpose |
|-------|-----------|-----|---------|
| **Generate** | `pixal3d`, `hunyuan3d-v3.1-pro`, `trellis-2`, `meshy` | fal.ai | Create base 3D model from image or text |
| **Post-process** | Meshy | fal.ai | Remesh, rig, and animate existing models |

The `generate()` call creates a raw 3D model. The `remesh()` → `rig()` → `animate()` pipeline uses Meshy's proprietary rigging and animation system to make the model game-ready.

## Providers

| Provider | Modes | Best For |
|----------|-------|----------|
| `hunyuan3d-v3.1-pro` | image-to-3d, text-to-3d | High-quality PBR models, multi-view input support |
| `pixal3d` | image-to-3d | Fast single-image generation with PBR materials |
| `trellis-2` | image-to-3d | Lightweight models, fastest generation |
| `meshy` | image-to-3d, text-to-3d | Meshy 6 — texture and PBR support |

## Image-to-3D

Generate a 3D model from one or more reference images.

```typescript
// Single image
const result = await RundotGameAPI.threeDGen.generate({
  provider: 'hunyuan3d-v3.1-pro',
  mode: 'image-to-3d',
  imageUrl: 'https://cdn.example.com/character.png',
  quality: 'high',
})

// Multi-view (Hunyuan only): provide additional angles for better geometry
const result = await RundotGameAPI.threeDGen.generate({
  provider: 'hunyuan3d-v3.1-pro',
  mode: 'image-to-3d',
  imageUrl: 'https://cdn.example.com/front.png',
  additionalViews: {
    backImageUrl: 'https://cdn.example.com/back.png',
    leftImageUrl: 'https://cdn.example.com/left.png',
    rightImageUrl: 'https://cdn.example.com/right.png',
  },
  quality: 'high',
})
```

### Using Files SDK Keys

You can use a Files SDK key as the source image instead of a URL:

```typescript
const result = await RundotGameAPI.threeDGen.generate({
  provider: 'hunyuan3d-v3.1-pro',
  mode: 'image-to-3d',
  imageFileKey: 'my-character-concept.png',
  quality: 'standard',
})
```

> `imageFileKey` resolves the file from your app's Files storage and uploads it to the generation provider. The file must be an image (JPEG, PNG, GIF, or WebP) under 10MB. If the file key doesn't exist, the call fails with `THREE_D_GEN_IMAGE_FETCH_FAILED`. If the file isn't a supported image type, it fails with `THREE_D_GEN_INVALID_PARAMS`.

## Text-to-3D

Generate a 3D model from a text description (Hunyuan and Meshy).

```typescript
const result = await RundotGameAPI.threeDGen.generate({
  provider: 'hunyuan3d-v3.1-pro',
  mode: 'text-to-3d',
  prompt: 'A low-poly medieval sword with a blue gem in the hilt',
  quality: 'standard',
})

// Or with Meshy (two-step: preview → refine, handled automatically)
const result = await RundotGameAPI.threeDGen.generate({
  provider: 'meshy',
  mode: 'text-to-3d',
  prompt: 'A low-poly medieval sword with a blue gem in the hilt',
  quality: 'high',
})
```

## Quality Presets

| Quality | Speed | Detail | Use Case |
|---------|-------|--------|----------|
| `draft` | Fastest | Lower poly, fewer textures | Prototyping, previews |
| `standard` | Moderate | Balanced quality | Most game assets |
| `high` | Slowest | Maximum detail, high-res textures | Hero characters, key props |

You can override specific provider parameters with `providerOptions`:

```typescript
const result = await RundotGameAPI.threeDGen.generate({
  provider: 'hunyuan3d-v3.1-pro',
  mode: 'image-to-3d',
  imageUrl: '...',
  quality: 'standard',
  providerOptions: { face_count: 80000 },
})
```

## Remesh

Optimize a model's topology for game use by reducing its polygon count.

```typescript
// Target an explicit polygon count…
const remeshed = await RundotGameAPI.threeDGen.remesh({
  modelUrl: result.modelUrl,
  targetFaceCount: 10000,
})

// …or use a preset ('character' ≈ 5000 faces, 'prop' ≈ 1000 faces)
const remeshedPreset = await RundotGameAPI.threeDGen.remesh({
  modelUrl: result.modelUrl,
  targetPreset: 'character',
})

console.log(remeshed.modelUrl, remeshed.faceCount)
```

## Rig

Add a humanoid skeleton to a 3D model for animation.

```typescript
const rigged = await RundotGameAPI.threeDGen.rig({
  modelUrl: remeshed.modelUrl,
  heightMeters: 1.75, // Improves bone placement accuracy
})

console.log(rigged.rigId)    // Use with animate()
console.log(rigged.modelUrl) // Rigged GLB with skeleton
```

> Any GLB can be rigged, including the Draco + WebP compressed `modelUrl`
> returned by `generate()`/`remesh()`. The platform automatically normalizes
> geometry (decodes Draco and dequantizes) before rigging, so you don't need
> the uncompressed `rawModelUrl`.

### Using Files SDK Keys

You can use a Files SDK key as the source model instead of a URL:

```typescript
const rigged = await RundotGameAPI.threeDGen.rig({
  modelFileKey: 'my-character.glb',
  heightMeters: 1.75,
})
```

> `modelFileKey` resolves the GLB from your app's Files storage and feeds it directly to the rigging provider. The file must be a binary glTF (`.glb`); anything else fails with `THREE_D_GEN_INVALID_PARAMS`. If the file key doesn't exist, the call fails with `THREE_D_GEN_MODEL_FETCH_FAILED`. Models resolved this way are sent inline and must be under 20MB; for larger models, pass `modelUrl` instead. Provide exactly one of `modelUrl` or `modelFileKey` (passing both fails with `THREE_D_GEN_INVALID_PARAMS`).

## Animate

Generate animation clips for a rigged model. Pass animation preset names or raw action IDs.

```typescript
const animated = await RundotGameAPI.threeDGen.animate({
  rigId: rigged.rigId,
  animations: ['walk', 'run', 'idle', 'jump'],
})

for (const clip of animated.clips) {
  console.log(`${clip.animation}: ${clip.modelUrl}`)
}
```

### Available Animation Presets

| Preset | Description |
|--------|-------------|
| `idle` | Standing idle loop |
| `walk` | Walking forward |
| `run` | Running forward |
| `jump` | Jump in place |
| `attack` | Basic attack swing |
| `dance` | Dance loop |
| `wave` | Waving gesture |
| `crouch` | Crouching |
| `fall` | Falling |
| `hit` | Taking a hit |

You can also pass numeric action IDs directly (integers `0`–`586`).

## Async Job Recovery

All 3D generation operations run as async jobs. Use `getCompletedJobs()` to recover results after disconnects.

```typescript
const completedJobs = await RundotGameAPI.threeDGen.getCompletedJobs()

for (const job of completedJobs) {
  if (job.status === 'completed' && job.result) {
    console.log(`Job done:`, job.result.modelUrl)
  } else if (job.status === 'failed') {
    console.error(`Job failed:`, job.error)
  }
}
```

{% hint style="info" %}
Job recovery is only available when your game runs inside the RUN host (the iframe/RPC transport). Games that talk to the backend over the direct HTTP transport always get an empty array back from `getCompletedJobs()` and won't recover in-flight jobs this way.
{% endhint %}

## Full Pipeline Example

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

// 1. Generate base model from concept art
const model = await RundotGameAPI.threeDGen.generate({
  provider: 'hunyuan3d-v3.1-pro',
  mode: 'image-to-3d',
  imageUrl: 'https://cdn.example.com/character-concept.png',
  quality: 'high',
})

// 2. Remesh for game-ready topology
const remeshed = await RundotGameAPI.threeDGen.remesh({
  modelUrl: model.modelUrl,
  targetFaceCount: 15000,
})

// 3. Rig for animation
const rigged = await RundotGameAPI.threeDGen.rig({
  modelUrl: remeshed.modelUrl,
  heightMeters: 1.8,
})

// 4. Generate animation set
const animated = await RundotGameAPI.threeDGen.animate({
  rigId: rigged.rigId,
  animations: ['idle', 'walk', 'run', 'attack'],
})

// Use the assets
console.log('Base model:', model.modelUrl)
console.log('Rigged model:', rigged.modelUrl)
console.log('Animations:', animated.clips.map(c => c.animation))
```

## Configuration

### `rundot/threeDGen.config.json`

`threeDGen` is **default-bounded**: your game can call it without any config file, but undeclared usage runs under default platform safety caps (~$500/game/day and ~$10/user/day). Creating `rundot/threeDGen.config.json` — which `rundot deploy` does automatically the first time it detects the service in your bundle — replaces those defaults with your own policy: the auto-created permissive `{}` removes the caps entirely, or you can author allowlists and caps to tighten instead. An explicit `{ "disabled": true }` turns the service off.

Place your config at `rundot/threeDGen.config.json`. The file contains the settings **directly** (no wrapping key — the filename implies it):

```json
{
  "allowedModels": ["hunyuan3d-v3.1-pro"],
  "perUserDailyCreditCap": 500
}
```

> Commit `rundot/` to your repo; it's project config, not a build artifact, and it's env-agnostic. `game.config.prod.json` is a separate file for local CLI metadata; this config does not go there.

**Common fields:**

| Field | Type | Description |
| --- | --- | --- |
| `disabled` | `boolean` | Turns the service off; every call fails with `AI_POLICY_DENIED`. |
| `allowedModels` | `string[]` | Allowlist of permitted identifiers (see note below). When set, an unlisted identifier is rejected. Omit to allow any. |
| `dailyCreditCap` | `number` | Approximate per-game daily credit ceiling. |
| `perUserDailyCreditCap` | `number` | Approximate per-user daily credit ceiling. |

For `threeDGen.generate`, `allowedModels` entries match the request's **`provider`** (e.g. `hunyuan3d-v3.1-pro`, `meshy`), **not** a model id. Putting a raw model id in the list silently fails to match every request and blocks all calls — list the `provider` values instead. The post-processing operations match fixed identifiers rather than a provider: `remesh` matches `remesh`, `rig` matches `rig`, and `animate` matches `animate`. If you set an allowlist, include every identifier your game uses across these operations.

The two credit caps are approximate safety ceilings, not exact meters: the server reserves budget from a cost estimate *before* each call and reconciles the real cost afterward, so the effective ceiling can drift slightly around the configured value.

Policy resolves from your game's published (`public`) tag — the same config your live players run against.

## API Reference

| Method | Returns | Description |
|--------|---------|-------------|
| `threeDGen.generate(params)` | `Promise<ThreeDGenResult>` | Generate 3D model from image or text |
| `threeDGen.remesh(params)` | `Promise<RemeshResult>` | Remesh model to target polygon count |
| `threeDGen.rig(params)` | `Promise<RigResult>` | Add humanoid skeleton rig |
| `threeDGen.animate(params)` | `Promise<AnimateResult>` | Generate animation clips |
| `threeDGen.getCompletedJobs()` | `Promise<ThreeDGenJobEvent[]>` | Drain completed async job results |

### ThreeDGenParams (generate)

| Parameter | Type | Description |
|-----------|------|-------------|
| `provider` | `ThreeDGenProvider` | Required: `'pixal3d'`, `'hunyuan3d-v3.1-pro'`, `'trellis-2'`, or `'meshy'` |
| `mode` | `ThreeDGenMode` | Required: `'image-to-3d'` or `'text-to-3d'` |
| `imageUrl` | `string` | Input image URL (required for image-to-3d unless `imageFileKey` is provided) |
| `imageFileKey` | `string` | Alternative to `imageUrl`: resolve a Files SDK key as the source image |
| `prompt` | `string` | Text prompt (required for text-to-3d) |
| `quality` | `ThreeDGenQuality` | `'draft'`, `'standard'`, or `'high'` (default: `'standard'`) |
| `seed` | `number` | Seed for reproducible results |
| `clientRef` | `string` | Opaque correlation ID echoed back in job events |
| `additionalViews` | `object` | Hunyuan image-to-3d only. Extra view URLs: `backImageUrl`, `leftImageUrl`, `rightImageUrl`, `topImageUrl`, `bottomImageUrl` |
| `providerOptions` | `object` | Provider-specific overrides. The accepted keys differ per provider (see [providerOptions per provider](#provideroptions-per-provider) below). |

`quality`, `seed`, `clientRef`, and `imageFileKey` are shared base fields available on every provider and mode (text-to-3d included). `additionalViews` and the `providerOptions` keys are provider-specific.

### providerOptions per provider

`providerOptions` is strongly typed per provider, not a free-form object. Each provider accepts a different set of keys; passing a key that another provider owns (for example `face_count` to `trellis-2`) is a type error.

**`pixal3d`** (image-to-3d)

| Option | Type | Description |
|--------|------|-------------|
| `resolution` | `1024 \| 1536` | Generation resolution |
| `decimation_target` | `number` | Target geometry decimation |
| `texture_size` | `1024 \| 2048 \| 4096` | Texture map resolution |
| `remesh` | `boolean` | Remesh the output |
| `ss_guidance_strength` | `number` | Sparse-structure guidance strength |
| `ss_sampling_steps` | `number` | Sparse-structure sampling steps |
| `shape_slat_guidance_strength` | `number` | Shape SLAT guidance strength |
| `shape_slat_sampling_steps` | `number` | Shape SLAT sampling steps |
| `tex_slat_guidance_strength` | `number` | Texture SLAT guidance strength |
| `tex_slat_sampling_steps` | `number` | Texture SLAT sampling steps |

**`hunyuan3d-v3.1-pro`** (image-to-3d and text-to-3d)

| Option | Type | Description |
|--------|------|-------------|
| `face_count` | `number` | Target face count of the generated mesh |
| `generate_type` | `'Normal' \| 'Geometry'` | `'Geometry'` requests a geometry-only result (skips texture and PBR) |
| `enable_pbr` | `boolean` | Generate PBR materials |

**`meshy`** (image-to-3d and text-to-3d)

| Option | Type | Description |
|--------|------|-------------|
| `should_texture` | `boolean` | Generate textures for the mesh. On text-to-3d this selects the untextured (`false`) tier |
| `enable_pbr` | `boolean` | Generate PBR materials |
| `target_polycount` | `number` | Target triangle count (provider default 30000) |
| `topology` | `'triangle' \| 'quad'` | Output polygon flow |
| `model_type` | `'standard' \| 'lowpoly'` | Mesh style |
| `symmetry_mode` | `'off' \| 'auto' \| 'on'` | Symmetry enforcement |
| `should_remesh` | `boolean` | Run the provider's built-in remesh pass |
| `pose_mode` | `'a-pose' \| 't-pose' \| ''` | Force a rest pose |
| `texture_prompt` | `string` | Text guidance for the texture pass |

**`trellis-2`** accepts no `providerOptions` (typed as `Record<string, never>`); passing any provider option is a type error.

### RemeshParams

| Parameter | Type | Description |
|-----------|------|-------------|
| `modelUrl` | `string` | Required: URL of the GLB model to remesh |
| `targetFaceCount` | `number` | Target polygon count (alternative to `targetPreset`) |
| `targetPreset` | `'character' \| 'prop'` | Preset polygon target: `'character'` ≈ 5000, `'prop'` ≈ 1000 |
| `clientRef` | `string` | Opaque correlation ID echoed back in job events |

### RigParams

| Parameter | Type | Description |
|-----------|------|-------------|
| `modelUrl` | `string` | URL of the GLB model to rig (required unless `modelFileKey` is provided) |
| `modelFileKey` | `string` | Alternative to `modelUrl`: resolve a Files SDK key as the source model (inline, must be under 20MB) |
| `heightMeters` | `number` | Character height in meters (improves rigging) |
| `clientRef` | `string` | Opaque correlation ID echoed back in job events |

### AnimateParams

| Parameter | Type | Description |
|-----------|------|-------------|
| `rigId` | `string` | Rig ID from a previous `rig()` call. Provide this **or** `modelUrl` |
| `modelUrl` | `string` | Source GLB to rig and animate in one call — the cheaper form, since a separate `rig()` is billed twice |
| `heightMeters` | `number` | Rig height for the `modelUrl` form; the `rigId` form reuses the height its rig ran at |
| `animations` | `(string \| number)[]` | Required. Preset names or numeric action IDs (`0`–`586`) |
| `clientRef` | `string` | Opaque correlation ID echoed back in job events |

### ThreeDGenResult

| Field | Type | Description |
|-------|------|-------------|
| `generationId` | `string` | Unique ID for this generation |
| `modelUrl` | `string` | URL to the GLB model (Draco + WebP compressed) |
| `rawModelUrl` | `string \| undefined` | URL to the uncompressed GLB |
| `thumbnailUrl` | `string \| undefined` | Preview thumbnail URL |
| `provider` | `ThreeDGenProvider` | Provider that generated the model |
| `mode` | `ThreeDGenMode` | `'image-to-3d'` or `'text-to-3d'` |
| `quality` | `ThreeDGenQuality` | Quality preset used |
| `seed` | `number` | Seed used for generation |
| `compression` | `object \| undefined` | `{ inputSizeBytes, outputSizeBytes, compressionPercent }` |

### RemeshResult

| Field | Type | Description |
|-------|------|-------------|
| `remeshId` | `string` | Remesh operation ID |
| `modelUrl` | `string` | URL to the remeshed GLB |
| `faceCount` | `number` | Actual face count of the remeshed model |
| `provider` | `'meshy'` | Provider used |

### RigResult

| Field | Type | Description |
|-------|------|-------------|
| `rigId` | `string` | Rig ID for use with `animate()` |
| `modelUrl` | `string` | URL to the rigged GLB |
| `provider` | `'meshy'` | Provider used |

### AnimateResult

| Field | Type | Description |
|-------|------|-------------|
| `clips` | `Array<{ animation, modelUrl }>` | Generated animation clips |
| `riggedModelUrl` | `string \| undefined` | The rig the clips were produced against — a free output of the same call |
| `provider` | `'meshy'` | Provider used |

### ThreeDGenJobEvent

| Field | Type | Description |
|-------|------|-------------|
| `jobId` | `string` | Job identifier |
| `operation` | `'generate' \| 'remesh' \| 'rig' \| 'animate'` | Which pipeline step this job ran (a `ThreeDGenJobOperation`); branch on it to know which result shape `result` holds |
| `status` | `'completed' \| 'failed'` | Job outcome |
| `params` | `object` | Original request parameters |
| `result` | `object \| undefined` | Result if completed |
| `error` | `string \| undefined` | Error message if failed |

## Best Practices

- Use `quality: 'draft'` during development for faster iteration, then switch to `'standard'` or `'high'` for production assets.
- For best results with image-to-3d, use a clear front-facing image with a plain background. Use `additionalViews` with Hunyuan for complex geometry.
- Always remesh generated models before use in-game; raw generation output is often too high-poly for real-time rendering.
- Set `heightMeters` when rigging humanoid characters; it significantly improves bone placement.
- Use `getCompletedJobs()` on reconnect to recover results from in-flight operations.
- `modelUrl` is already Draco + WebP compressed (smaller, faster to load). You can pass it straight to `remesh()`/`rig()`; geometry is normalized server-side for those steps. `rawModelUrl` is only needed if you want the uncompressed mesh for your own tooling.

## Limits

- Multi-view input (`additionalViews`) is only supported by `hunyuan3d-v3.1-pro`.
- Text-to-3d mode is supported by `hunyuan3d-v3.1-pro` and `meshy`.
- `trellis-2` does not support PBR materials.
- `animate` takes either a `rigId` from a prior `rig()` or a `modelUrl` directly. The provider rigs the model as part of animating either way, so `animate({ modelUrl })` does the whole job in one billed call — a separate `rig()` first is charged twice. `animate` also returns `riggedModelUrl`.
- A `rigId` issued before the fal migration cannot be animated — re-run `rig`.
- `animate({ modelUrl })` rigs as part of animating, so an `allowedModels` list must include **both** `rig` and `animate` for it. The `rigId` form needs only `animate`.
- `meshy` generate accepts `target_polycount`, so passing your triangle budget at generate time returns a game-ready mesh and makes a follow-up `remesh` call unnecessary.
- Subject to per-creator rate-limit tiers and monthly budget caps; see [Rate Limits](RATE_LIMITS.md).

## Admin API

Game owners and editors can manage 3D generations via `run.app.adminThreeDGen`. These operations require the caller to have `owner` or `editor` role on the app.

### Browse Generations

```typescript
const { entries, nextCursor } = await RundotGameAPI.app.adminThreeDGen.browse({
  status: 'active',       // 'active' | 'removed'
  limit: 20,
  sortOrder: 'desc',
})

for (const entry of entries) {
  console.log(entry.id, entry.operation, entry.provider, entry.modelUrl)
}
```

### Remove a Generation

Quarantines the model to a separate storage path and marks it as removed.

```typescript
await RundotGameAPI.app.adminThreeDGen.removeEntry(generationId)
```

### List Reports

```typescript
const { reports, nextCursor } = await RundotGameAPI.app.adminThreeDGen.listReports({
  status: 'pending',  // 'pending' | 'reviewed' | 'dismissed'
  limit: 10,
})
```

### Resolve a Report

```typescript
await RundotGameAPI.app.adminThreeDGen.resolveReport(reportId, 'reviewed')
// or 'dismissed'
```

### AdminThreeDGenBrowseParams

| Parameter | Type | Description |
|-----------|------|-------------|
| `profileId` | `string` | Filter by player profile |
| `status` | `'active' \| 'removed'` | Filter by entry status |
| `cursor` | `string` | Pagination cursor from previous response |
| `limit` | `number` | Max entries to return (default 20, max 100) |
| `sortOrder` | `'asc' \| 'desc'` | Sort by creation time (default `'desc'`) |

### ThreeDGenEntry (response)

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Generation ID |
| `appId` | `string` | App ID |
| `profileId` | `string` | Creator's profile ID |
| `operation` | `string` | Open string; typically `'generate'`, `'remesh'`, `'rig'`, or `'animate'` |
| `provider` | `string` | Provider used |
| `mode` | `string` | `'image-to-3d'` or `'text-to-3d'` (optional) |
| `quality` | `string` | Quality preset used (optional) |
| `prompt` | `string` | Text prompt, for text-to-3d entries (optional) |
| `modelUrl` | `string` | Model URL |
| `rawModelUrl` | `string` | Uncompressed GLB URL (optional) |
| `estimatedCostUsd` | `number` | Cost of the operation (optional) |
| `createdAt` | `number` | Unix timestamp (ms) |
| `status` | `'active' \| 'removed'` | Entry status |

### ThreeDGenReport (listReports response)

`listReports` resolves to `{ reports: ThreeDGenReport[]; nextCursor?: string }`. Each report describes a player-filed flag against a generation.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Report ID (pass to `resolveReport`) |
| `generationId` | `string` | The reported generation's ID |
| `appId` | `string` | App ID |
| `reporterId` | `string` | Profile ID of the reporter |
| `reason` | `'inappropriate' \| 'spam' \| 'harassment' \| 'other'` | Report reason |
| `details` | `string` | Optional free-text detail |
| `createdAt` | `number` | Unix timestamp (ms) |
| `status` | `'pending' \| 'reviewed' \| 'dismissed'` | Report status |
