# Sprite Generation API (BETA)

Generate pixel art sprites and animated spritesheets from text prompts. Powered by SpriteCook.

---

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

const sprite = await RundotGameAPI.spriteGen.generate({
  prompt: 'A tiny knight with sword and shield, front-facing',
})

// Use the generated sprite
document.querySelector('#character').src = sprite.imageUrl

// Animate it into a walk cycle
const animation = await RundotGameAPI.spriteGen.animate({
  prompt: 'walk cycle, side view',
  sourceGenerationId: sprite.generationId,
})

document.querySelector('#spritesheet').src = animation.spriteSheetUrl
```

## Sprite Generation

Generate a static sprite from a text prompt.

```typescript
const result = await RundotGameAPI.spriteGen.generate({
  prompt: 'A slime enemy, green, bouncy',
  pixel: true,              // Pixel art style (default: true)
  width: 64,               // Sprite width (default: 64)
  height: 64,              // Sprite height (default: 64)
  bgMode: 'transparent',   // Background mode
  smartCrop: false,         // Disable auto-crop to get exact dimensions
  colors: ['#2ecc71', '#27ae60', '#1abc9c'], // Optional color palette
})

console.log(result.imageUrl)       // Hosted image URL
console.log(result.generationId)   // Use as source for animate()
console.log(result.width, result.height) // Actual output dimensions
```

### Variations (multiple candidates per call)

Request up to 4 candidate images in one billed call and pick the best one:

```typescript
const result = await RundotGameAPI.spriteGen.generate({
  prompt: 'A slime enemy, green, bouncy',
  variations: 3,
})

for (const asset of result.assets!) {
  console.log(asset.generationId, asset.imageUrl, asset.spriteCookAssetId)
}
```

When `variations` is set the result carries an `assets` array (the primary asset is duplicated in the top-level fields for back-compat). Each candidate gets its own `generationId`, usable as an `animate()` source. Omitting `variations` preserves the single-object contract exactly.

### Modes and quality dials

```typescript
const tile = await RundotGameAPI.spriteGen.generate({
  prompt: 'mossy stone floor',
  mode: 'texture',       // 'assets' (default) | 'texture' (texture-oriented) | 'ui'
  resolution: '2K',      // '1K' | '2K' | '4K'
  quality: 'high',       // 'low' | 'medium' | 'high'
  aspectRatio: '1:1',    // '1:1' | '16:9' | '9:16'
})
```

`mode: 'texture'` requests texture-oriented output, but SpriteCook does not guarantee seamless edges. Tileset pipelines should retain their seam-continuity check. `resolution`/`quality` trade cost against fidelity per asset class; the effective values are echoed on the result.

## Sprite Animation

Animate a previously generated sprite (or an external image) into a spritesheet.

```typescript
// From a previous generation
const sheet = await RundotGameAPI.spriteGen.animate({
  prompt: 'idle breathing animation',
  sourceGenerationId: sprite.generationId,
  outputFrames: 8,
  outputFormat: 'spritesheet',  // 'spritesheet' | 'gif' | 'webp'
  removeBg: 'Basic',           // 'None' | 'Basic' | 'Pro'
  negativePrompt: 'blurry, extra limbs',  // Optional generative steering
  matteColor: '#00ff00',       // Optional: hex the provider mattes alpha against (default #808080)
})

console.log(sheet.spriteSheetUrl)  // Horizontal spritesheet PNG
console.log(sheet.frameCount)      // Actual frame count (may differ from requested)
console.log(sheet.frameWidth, sheet.frameHeight)
```

### Animate from an external image URL

```typescript
const sheet = await RundotGameAPI.spriteGen.animate({
  prompt: 'attack swing animation',
  sourceImageUrl: 'https://cdn.example.com/my-character.png',
  outputFrames: 6,
})
```

## Character Animate (Preset Animation Sets)

For standard animation sets (idle, walk, etc.), use `characterAnimate` instead of calling `animate` multiple times. It uses SpriteCook's character workflow — purpose-built for full animated character pipelines.

```typescript
// Submit a character animate job (returns immediately with a job ID)
const job = await RundotGameAPI.spriteGen.characterAnimate({
  sourceGenerationId: sprite.generationId,
  animations: ['idle', 'walk'],
})

// Poll via getCompletedJobs() or use job events
const jobs = await RundotGameAPI.spriteGen.getCompletedJobs()
const result = jobs.find(j => j.params.operation === 'characterAnimate')

if (result?.status === 'completed') {
  for (const anim of result.result.animations) {
    if (anim.status === 'completed') {
      console.log(`${anim.name}: ${anim.spriteSheetUrl}`)
    }
  }
}
```

### When to use `characterAnimate` vs `animate`

| Use case | Method |
|----------|--------|
| Standard animation sets (idle, walk, run) | `characterAnimate` |
| Custom one-off motion from a prompt | `animate` |
| Multiple animations from the same source | `characterAnimate` |
| Single bespoke animation (attack, block) | `animate` |

### Character Animate Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `sourceGenerationId` | `string` | ID from a previous `generate()` call |
| `sourceFileKey` | `string` | Creator-storage file key |
| `sourceImageUrl` | `string` | HTTPS URL to an external image |
| `prompt` | `string` | Character description (guides the animation model). Defaults to the source generation's prompt when available |
| `animations` | `string[]` | Animation preset names (e.g. `['idle', 'walk']`) |
| `outputFormat` | `'spritesheet' \| 'gif' \| 'webp'` | Output format (default: `'spritesheet'`) |
| `removeBg` | `'None' \| 'Basic' \| 'Pro'` | Background removal (default: `'Basic'`) |
| `frameCount` | `number` | Frame count per animation |
| `workflowId` | `string` | Workflow/perspective ID from `listCharacterWorkflows` (`platformer` default, `isometric`, `topdown`) |

> **Source requirement:** Provide exactly one of `sourceGenerationId`, `sourceFileKey`, or `sourceImageUrl`.

### Character Animate Result (delivered via job)

| Field | Type | Description |
|-------|------|-------------|
| `jobId` | `string` | SpriteCook run ID |
| `characterId` | `string` | SpriteCook character ID |
| `status` | `'completed' \| 'partial' \| 'failed'` | Overall status |
| `animations` | `CharacterAnimationOutput[]` | Per-animation results |

Each animation in `animations`:

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Animation preset name |
| `status` | `'completed' \| 'failed'` | Individual status |
| `generationId` | `string` | Venus generation ID (when completed) |
| `spriteSheetUrl` | `string` | URL to the spritesheet (when completed) |
| `frameCount` | `number` | Frame count |
| `frameWidth` | `number` | Frame width |
| `frameHeight` | `number` | Frame height |
| `error` | `string` | Error message (when failed) |

**Partial failures:** If some animations succeed and others fail, the overall `status` is `'partial'`. Check each animation's individual `status`.

## Discover Character Workflows

List available animation presets from SpriteCook:

```typescript
const workflows = await RundotGameAPI.spriteGen.listCharacterWorkflows()
for (const wf of workflows) {
  console.log(`${wf.name}: ${wf.animations.join(', ')}`)
}
```

## Models and Costs

Model slugs and pricing live provider-side and change over time — query them instead of hardcoding:

```typescript
// Provider model roster + per-call credit pricing (raw provider payload, unbilled)
const models = await RundotGameAPI.spriteGen.listModels()

// Static per-operation credit costs, for preflighting a batch (unbilled)
const costs = await RundotGameAPI.spriteGen.getCosts()
console.log(costs.operations.generate)                      // credits per generate call (each variation bills as one)
console.log(costs.operations.animate)                       // credits per animate call
console.log(costs.operations.characterAnimatePerAnimation)  // credits per completed character animation
```

## Async Job Recovery

Sprite generation runs as an async job (~90s per call). Use `getCompletedJobs()` to drain results after disconnects.

```typescript
const completedJobs = await RundotGameAPI.spriteGen.getCompletedJobs()

for (const job of completedJobs) {
  if (job.status === 'completed' && job.result) {
    console.log('Sprite ready:', job.result.imageUrl || job.result.spriteSheetUrl)
  } else if (job.status === 'failed') {
    console.error('Generation failed:', job.error)
  }
}
```

### SpriteGenJobEvent

Each completed job event carries the original call params plus an `operation` discriminator so you can tell which call produced it and route the result accordingly.

| Field | Type | Description |
|-------|------|-------------|
| `jobId` | `string` | Unique job identifier |
| `status` | `'completed' \| 'failed'` | Final job status |
| `type` | `string` | Job type; always `'spriteGen'`. Use `params.operation` to distinguish generate vs animate |
| `params` | `(SpriteGenParams \| AnimateSpriteParams) & { operation: 'generate' \| 'animate' }` | The original call params plus an `operation` discriminator |
| `result` | `SpriteGenResult \| AnimateSpriteResult` | Present when `status === 'completed'` |
| `error` | `string` | Present when `status === 'failed'` |

## Configuration

### `rundot/spriteGen.config.json`

`spriteGen` is **default-bounded**: your game can call it without any config file, but undeclared usage runs under default platform safety caps (~$500/game/day and ~$10/user/day). Creating `rundot/spriteGen.config.json` — which `rundot deploy` does automatically the first time it detects the service in your bundle — replaces those defaults with your own policy: the auto-created permissive `{}` removes the caps entirely, or you can author allowlists and caps to tighten instead. An explicit `{ "disabled": true }` turns the service off.

Place your config at `rundot/spriteGen.config.json`. The file contains the settings **directly** (no wrapping key — the filename implies it):

```json
{
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

For `spriteGen`, `allowedModels` entries match the request's `model` string. A `generate` call with no explicit `model` matches the literal `default`; the animation operations match fixed identifiers — `spriteGen.animate` matches `animate` and the character-animation path matches `character-animate`. If you set an allowlist, include every identifier your game uses across these operations, or those calls will be blocked.

The two credit caps are approximate safety ceilings, not exact meters: the server reserves budget from a cost estimate *before* each call and reconciles the real cost afterward, so the effective ceiling can drift slightly around the configured value.

Policy resolves from your game's published (`public`) tag — the same config your live players run against.

## API Reference

| Method | Returns | Description |
|--------|---------|-------------|
| `spriteGen.generate(params)` | `Promise<SpriteGenResult>` | Generate a sprite from prompt |
| `spriteGen.animate(params)` | `Promise<AnimateSpriteResult>` | Animate a sprite into a spritesheet (custom prompt) |
| `spriteGen.characterAnimate(params)` | `Promise<{ jobId }>` | Submit character workflow job (preset animations) |
| `spriteGen.listCharacterWorkflows()` | `Promise<CharacterWorkflow[]>` | List available animation presets |
| `spriteGen.listModels()` | `Promise<unknown>` | Provider model roster + per-call credit pricing (raw passthrough, unbilled) |
| `spriteGen.getCosts()` | `Promise<SpriteGenCosts>` | Per-operation credit costs for batch preflight (unbilled) |
| `spriteGen.getCompletedJobs()` | `Promise<SpriteGenJobEvent[]>` | Drain completed async job results |

### Generate Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `prompt` | `string` | Text description of desired sprite (required) |
| `pixel` | `boolean` | Pixel art style (default: `true`) |
| `width` | `number` | Width in pixels, 16–512 (default: `64`) |
| `height` | `number` | Height in pixels, 16–512 (default: `64`) |
| `bgMode` | `'transparent' \| 'white' \| 'include'` | Background mode (default: `'transparent'`) |
| `smartCrop` | `boolean` | Auto-crop to content bounds (default: `true`). Set `false` to get exact requested dimensions. |
| `pixelPerfect` | `boolean` | Grid-aligned pixel post-processing (default: `true`). Can shift output dimensions slightly. |
| `theme` | `string` | Visual theme hint |
| `style` | `string` | Style hint |
| `colors` | `string[]` | Hex color palette (max 8 colors) |
| `model` | `string` | Model identifier (optional) |
| `referenceAssetId` | `string` | SpriteCook asset ID from a prior generation, for style consistency across a set |
| `referenceFileKey` | `string` | Creator-storage file key to use as a style reference (resolved server-side); alternative to `referenceAssetId` |
| `editAssetId` | `string` | SpriteCook asset ID to repaint in a new style (image-to-image edit); use for canonical-sheet reskins |
| `editFileKey` | `string` | Creator-storage file key to import and use as an edit anchor (resolved server-side) |
| `variations` | `number` | Candidate images per call, 1–4. When set, the result carries an `assets` array; one billed call covers all candidates |
| `mode` | `'assets' \| 'texture' \| 'ui'` | Generation mode; `'texture'` requests texture-oriented output without guaranteeing seamless edges (default: `'assets'`) |
| `resolution` | `'1K' \| '2K' \| '4K'` | Output resolution tier |
| `quality` | `'low' \| 'medium' \| 'high'` | Quality/cost tier |
| `aspectRatio` | `'1:1' \| '16:9' \| '9:16'` | Aspect ratio |

### Animate Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `prompt` | `string` | Animation description (required) |
| `sourceGenerationId` | `string` | ID from a previous `generate()` call |
| `sourceFileKey` | `string` | Creator-storage file key to animate (imported to SpriteCook on the fly) |
| `sourceImageUrl` | `string` | HTTPS URL to an external image (imported on the fly) |
| `pixel` | `boolean` | Override the animation mode; omit to infer pixel vs detailed mode from the source asset |
| `paletteSize` | `number` | Pixel-animation palette size. The animation provider does not accept a fixed hex palette |
| `outputFrames` | `number` | Frame count, must be even. Pixel art: 2–16. HD (`pixel: false`): 2–24. Default: `8` |
| `outputFormat` | `'spritesheet' \| 'gif' \| 'webp'` | Output format (default: `'spritesheet'`) |
| `removeBg` | `'None' \| 'Basic' \| 'Pro'` | Background removal mode (default: `'Basic'`) |
| `negativePrompt` | `string` | Generative steering — what the animation should avoid |
| `matteColor` | `string` | `#RRGGBB` hex the provider mattes alpha against during animation/removebg (provider default `#808080`). A known matte makes downstream background removal near-lossless |

> **Source requirement:** Provide exactly one of `sourceGenerationId`, `sourceFileKey`, or `sourceImageUrl`.

### SpriteGenResult

| Field | Type | Description |
|-------|------|-------------|
| `generationId` | `string` | Unique ID (use as `sourceGenerationId` for animate) |
| `imageUrl` | `string` | URL to the generated sprite |
| `spriteCookAssetId` | `string` | Provider asset ID |
| `prompt` | `string` | Prompt used |
| `model` | `string` | Model used |
| `width` | `number` | Actual output width |
| `height` | `number` | Actual output height |
| `referenceImportAssetId` | `string` | SpriteCook asset ID of an imported `referenceFileKey`, when an import occurred; reuse via `referenceAssetId` to skip re-import |
| `editImportAssetId` | `string` | SpriteCook asset ID of an imported `editFileKey`, when an import occurred; reuse via `editAssetId` to skip re-import |
| `mode` / `resolution` / `quality` / `aspectRatio` | — | Echo of the effective generation dials, when set on the request |
| `assets` | `SpriteGenGeneratedAsset[]` | All candidates (including the primary). Present only when the request set `variations`. Each entry: `generationId`, `imageUrl`, `spriteCookAssetId`, `width`, `height`, `creditsUsed` |

### AnimateSpriteResult

| Field | Type | Description |
|-------|------|-------------|
| `generationId` | `string` | Unique ID for this animation |
| `spriteSheetUrl` | `string` | URL to the spritesheet/animation |
| `frameCount` | `number` | Actual number of frames produced |
| `frameWidth` | `number` | Width of each frame in pixels |
| `frameHeight` | `number` | Height of each frame in pixels |
| `prompt` | `string` | Prompt used |

## Best Practices

- Use descriptive prompts with art-style keywords (e.g., "pixel art", "16-bit", "chibi").
- Keep sprites small (32–128px) for pixel art; larger sizes work better with `pixel: false`.
- Use `colors` to enforce a consistent palette across multiple sprites.
- Set `smartCrop: false` when you need exact output dimensions (e.g., tileset tiles that must be precisely 64×64).
- Always use `sourceGenerationId` when animating a sprite you just generated; it avoids a redundant image re-upload.
- Handle generation failures gracefully: these calls take ~90 seconds and can timeout.
- Use `getCompletedJobs()` on reconnect to recover results from in-flight generations.

## Limits

- Sprite dimensions: **16×16** to **512×512** pixels.
- Palette: max **8** colors per call.
- Variations: **1–4** candidates per generate call.
- Style reference is singular: the provider accepts one `referenceAssetId` per call (there is no multi-reference array on the public API).
- Animation frames (must be even): pixel art **2–16**, HD (`pixel: false`) **2–24**.
- Generation latency: ~90 seconds per call (runs as async job).
- Subject to per-creator rate-limit tiers; see [Rate Limits](RATE_LIMITS.md).

---

## Admin Moderation

Available at `RundotGameAPI.app.adminSpriteGen`. All methods require the caller to be an owner or editor (see [App API](APP.md) for role detection).

### Browse Generated Sprites

```typescript
const { entries, nextCursor } = await RundotGameAPI.app.adminSpriteGen.browse({
  profileId: 'some-user',   // Optional: filter by creator
  status: 'active',         // Optional: 'active' | 'removed'
  sortOrder: 'desc',        // 'asc' | 'desc'
  limit: 20,
})

for (const entry of entries) {
  console.log(`"${entry.prompt}" by ${entry.profileId}`)
  console.log(`  Status: ${entry.status}, Type: ${entry.type}`)
}
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `profileId` | `string` | - | Filter by creator profile ID |
| `status` | `'active' \| 'removed'` | - | Filter by status; omit to see all |
| `sortOrder` | `'asc' \| 'desc'` | `'desc'` | Sort direction (by creation time) |
| `limit` | `number` | `20` | Max entries per page (max 100) |
| `cursor` | `string` | - | Pagination cursor |

### Remove a Generated Sprite

Soft-delete a generated sprite. The original asset is quarantined and replaced with a placeholder.

```typescript
await RundotGameAPI.app.adminSpriteGen.removeEntry('generation-id')
```

### List Reports

Browse player-submitted reports for generated sprites.

```typescript
const { reports, nextCursor } = await RundotGameAPI.app.adminSpriteGen.listReports({
  status: 'pending',
  limit: 20,
})

// Fetch the next page by passing the returned cursor back in
if (nextCursor) {
  const next = await RundotGameAPI.app.adminSpriteGen.listReports({
    status: 'pending',
    limit: 20,
    cursor: nextCursor,
  })
}
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | `'pending' \| 'reviewed' \| 'dismissed'` | - | Filter by report status; omit to see all |
| `limit` | `number` | server default | Max reports per page |
| `cursor` | `string` | - | Pagination cursor; pass the `nextCursor` from a prior call |

### Resolve a Report

Mark a report as handled. The second argument is the resolution action: `'reviewed'` (you looked at it and the sprite stays) or `'dismissed'` (the report was invalid). Both move the report out of the `'pending'` queue.

```typescript
await RundotGameAPI.app.adminSpriteGen.resolveReport('report-id', 'reviewed')

// Or dismiss a report you judged invalid
await RundotGameAPI.app.adminSpriteGen.resolveReport('report-id', 'dismissed')
```

| Param | Type | Description |
|-------|------|-------------|
| `reportId` | `string` | ID of the report to resolve (required) |
| `action` | `'reviewed' \| 'dismissed'` | Resolution outcome (required) |

### SpriteGenEntry

```typescript
interface SpriteGenEntry {
  id: string
  appId: string
  profileId: string
  type: 'generate' | 'animate'
  prompt: string
  model?: string
  pixel?: boolean
  width?: number
  height?: number
  outputFrames?: number
  outputFormat?: string
  frameWidth?: number
  frameHeight?: number
  imageUrl: string
  creditsUsed?: number   // credits consumed by the generation
  createdAt: number      // milliseconds since epoch
  status: 'active' | 'removed'
}
```

### SpriteGenReport

```typescript
interface SpriteGenReport {
  id: string
  generationId: string
  appId: string
  reporterId: string
  reason: 'inappropriate' | 'spam' | 'harassment' | 'other'
  details?: string
  createdAt: number   // milliseconds since epoch
  status: 'pending' | 'reviewed' | 'dismissed'
}
```
