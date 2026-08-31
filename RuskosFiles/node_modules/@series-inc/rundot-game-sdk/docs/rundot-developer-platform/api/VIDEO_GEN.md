# Video Generation API (BETA)

Generate short videos from text prompts or images. Supports text-to-video, image-to-video, and reference-to-video modes across multiple providers.

---

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

const result = await RundotGameAPI.videoGen.generate({
  provider: 'seedance-2.0',
  mode: 'text-to-video',
  prompt: 'A dragon flying over a medieval castle at sunset, cinematic',
  durationSeconds: 8,
  aspectRatio: '16:9',
})

console.log(result.videoUrl)
console.log(result.durationSeconds)
```

## Providers

| Provider | Best For |
|----------|----------|
| `seedance-2.0` | High-quality generation with reference support, audio generation, 4–15s |
| `seedance-2.0-fast` | Faster generation at slightly lower quality, same capabilities as 2.0. 480p/720p only |
| `seedance-2.0-v2-fast` | Seedance 2.0 enterprise/v2 fast tier, same parameters as `seedance-2.0-fast`. 480p/720p only |
| `kling-3.0-standard` | Multi-prompt storytelling, negative prompts, configurable shot types, 3–15s |

## Text-to-Video

Generate video entirely from a text prompt.

```typescript
// Seedance
const result = await RundotGameAPI.videoGen.generate({
  provider: 'seedance-2.0',
  mode: 'text-to-video',
  prompt: 'A cat jumping between rooftops in a cyberpunk city, neon lights',
  durationSeconds: 6,
  aspectRatio: '16:9',
  resolution: '1080p',
  generateAudio: true,
})

// Kling
const result = await RundotGameAPI.videoGen.generate({
  provider: 'kling-3.0-standard',
  mode: 'text-to-video',
  prompt: 'Ocean waves crashing on a rocky shore at golden hour',
  negativePrompt: 'blurry, low quality',
  durationSeconds: 10,
  aspectRatio: '16:9',
  generateAudio: true,
})
```

## Image-to-Video

Animate a static image into a video. Provide a start image, and optionally an end image for guided transitions.

```typescript
// Seedance: animate a character sprite
const result = await RundotGameAPI.videoGen.generate({
  provider: 'seedance-2.0',
  mode: 'image-to-video',
  startImageUrl: 'https://cdn.example.com/character-idle.png',
  endImageUrl: 'https://cdn.example.com/character-running.png',
  prompt: 'Character transitions from idle to running, smooth motion',
  durationSeconds: 4,
})

// Kling: animate a landscape
const result = await RundotGameAPI.videoGen.generate({
  provider: 'kling-3.0-standard',
  mode: 'image-to-video',
  startImageUrl: 'https://cdn.example.com/landscape.png',
  prompt: 'Clouds drift slowly, sunlight shifts across the valley',
  durationSeconds: 8,
})
```

## Reference-to-Video (Seedance only)

Use image, video, or audio references to guide generation while creating new content.

```typescript
const result = await RundotGameAPI.videoGen.generate({
  provider: 'seedance-2.0',
  mode: 'reference-to-video',
  prompt: 'A warrior performing a sword combo in the same art style',
  imageReferences: ['https://cdn.example.com/art-style-ref.png'],
  videoReferences: ['https://cdn.example.com/motion-ref.mp4'],
  durationSeconds: 6,
  aspectRatio: '1:1',
})
```

## Multi-Prompt (Kling only)

Script multiple scenes within a single generation by providing timed prompt segments.

```typescript
const result = await RundotGameAPI.videoGen.generate({
  provider: 'kling-3.0-standard',
  mode: 'text-to-video',
  prompt: 'A day in the life of a forest',
  durationSeconds: 15,
  multiPrompt: [
    { prompt: 'Sunrise through the trees, mist rising', durationSeconds: 5 },
    { prompt: 'Animals waking up, birds flying', durationSeconds: 5 },
    { prompt: 'Sunset, golden light filtering through leaves', durationSeconds: 5 },
  ],
})
```

## Async Job Recovery

Video generation runs as an async job. Use `getCompletedJobs()` to drain results after disconnects. Pass `clientRef` for correlation; it is not echoed as a top-level field on job events, so read it back via `job.params.clientRef`.

```typescript
const completedJobs = await RundotGameAPI.videoGen.getCompletedJobs()

for (const job of completedJobs) {
  if (job.status === 'completed' && job.result) {
    console.log(`Video ready:`, job.result.videoUrl)
  } else if (job.status === 'failed') {
    console.error(`Generation failed:`, job.error)
  }
}
```

### Tracking and cancelling a running job

Subscribe with `onJobStarted()` to learn the `jobId` of a generation as soon as it kicks off, then pass that `jobId` to `cancel()` to stop it.

```typescript
let currentJobId: string | undefined

const subscription = RundotGameAPI.videoGen.onJobStarted((event) => {
  currentJobId = event.jobId
})

// Start a generation. The onJobStarted callback fires with its jobId.
const generation = RundotGameAPI.videoGen.generate({
  provider: 'seedance-2.0',
  mode: 'text-to-video',
  prompt: 'A dragon flying over a medieval castle at sunset, cinematic',
  durationSeconds: 8,
})

// Later, e.g. the player backs out of the scene.
if (currentJobId) {
  await RundotGameAPI.videoGen.cancel(currentJobId)
}

// When you no longer need started events.
subscription.unsubscribe()
```

{% hint style="info" %}
`onJobStarted()` only delivers events under the live (RPC) transport. It returns a subscription whose `unsubscribe()` is a no-op when running against the HTTP transport, so don't rely on it as your only source of `jobId` if your game may run outside the live host.
{% endhint %}

### `cancel(jobId: string): Promise<void>`

Cancel an in-flight video generation job by its `jobId`. The `jobId` comes from an `onJobStarted` event.

| Parameter | Type | Description |
|-----------|------|-------------|
| `jobId` | `string` | Identifier of the running job to cancel (from `onJobStarted`) |

```typescript
await RundotGameAPI.videoGen.cancel(jobId)
```

### `onJobStarted(callback): { unsubscribe: () => void }`

Subscribe to a notification fired when a generation job starts. The callback receives a `VideoGenJobStartedEvent`, which carries the `jobId` you pass to `cancel()`. Returns a subscription; call `unsubscribe()` to stop receiving events.

| Parameter | Type | Description |
|-----------|------|-------------|
| `callback` | `(event: VideoGenJobStartedEvent) => void` | Invoked with the job-started event when a generation begins |

```typescript
const subscription = RundotGameAPI.videoGen.onJobStarted((event) => {
  console.log('Generation started:', event.jobId)
})

// Stop listening later.
subscription.unsubscribe()
```

#### VideoGenJobStartedEvent

| Field | Type | Description |
|-------|------|-------------|
| `jobId` | `string` | Identifier of the job that started; pass to `cancel()` |

## Configuration

### `rundot/videoGen.config.json`

`videoGen` is **default-bounded**: your game can call it without any config file, but undeclared usage runs under default platform safety caps (~$500/game/day and ~$10/user/day). Creating `rundot/videoGen.config.json` — which `rundot deploy` does automatically the first time it detects the service in your bundle — replaces those defaults with your own policy: the auto-created permissive `{}` removes the caps entirely, or you can author allowlists and caps to tighten instead. An explicit `{ "disabled": true }` turns the service off.

Place your config at `rundot/videoGen.config.json`. The file contains the settings **directly** (no wrapping key — the filename implies it):

```json
{
  "allowedModels": ["seedance-2.0"],
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

For `videoGen`, `allowedModels` entries match the request's **`provider`** (e.g. `seedance-2.0`, `seedance-2.0-fast`, `seedance-2.0-v2-fast`, `kling-3.0-standard`), **not** a model id. Putting a raw model id in the list silently fails to match every request and blocks all calls — list the `provider` values instead.

The two credit caps are approximate safety ceilings, not exact meters: the server reserves budget from a cost estimate *before* each call and reconciles the real cost afterward, so the effective ceiling can drift slightly around the configured value.

Policy resolves from your game's published (`public`) tag — the same config your live players run against.

## API Reference

| Method | Returns | Description |
|--------|---------|-------------|
| `videoGen.generate(params)` | `Promise<VideoGenResult>` | Generate video |
| `videoGen.getCompletedJobs()` | `Promise<VideoGenJobEvent[]>` | Drain completed async job results |
| `videoGen.cancel(jobId)` | `Promise<void>` | Cancel an in-flight generation job |
| `videoGen.onJobStarted(callback)` | `{ unsubscribe: () => void }` | Subscribe to job-started notifications (delivers the `jobId`) |

### Common Parameters (all modes)

| Parameter | Type | Description |
|-----------|------|-------------|
| `provider` | `VideoGenProvider` | Required: `'seedance-2.0'`, `'seedance-2.0-fast'`, `'seedance-2.0-v2-fast'`, or `'kling-3.0-standard'` |
| `mode` | `VideoGenMode` | Required: `'text-to-video'`, `'image-to-video'`, or `'reference-to-video'` |
| `prompt` | `string` | Text description of the video content |
| `seed` | `number` | Seed for reproducible results |
| `requestOrigin` | `string` | Optional origin tag attached to the request |
| `clientRef` | `string` | Opaque correlation ID. Not echoed as a top-level field on job events; read it back via `job.params.clientRef` on the `VideoGenJobEvent` returned by `getCompletedJobs()` |

### Seedance Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `aspectRatio` | `VideoGenAspectRatio` | `'21:9'`, `'16:9'`, `'4:3'`, `'1:1'`, `'3:4'`, or `'9:16'` |
| `resolution` | `VideoGenResolution` | `'480p'`, `'720p'`, or `'1080p'` |
| `durationSeconds` | `4 \| 5 \| ... \| 15` | Video length in whole seconds; accepts only integers 4 through 15 (no decimals) |
| `generateAudio` | `boolean` | Generate synchronized audio track |
| `cameraFixed` | `boolean` | Lock camera position during generation |
| `startImageUrl` | `string` | Start frame image (image-to-video mode) |
| `endImageUrl` | `string` | End frame image (image-to-video mode) |
| `imageReferences` | `string[]` | Style/content reference images (reference-to-video mode, max 9) |
| `videoReferences` | `string[]` | Motion reference videos (reference-to-video mode, max 3) |
| `audioReferences` | `string[]` | Audio references for voice cloning (reference-to-video mode, max 3, see constraints below) |

### Kling Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `aspectRatio` | `'16:9' \| '9:16' \| '1:1'` | Output aspect ratio |
| `durationSeconds` | `3 \| 4 \| ... \| 15` | Video length in whole seconds; accepts only integers 3 through 15 (no decimals) |
| `generateAudio` | `boolean` | Generate synchronized audio track |
| `negativePrompt` | `string` | What to avoid in the video |
| `cfgScale` | `number` | Classifier-free guidance scale |
| `shotType` | `'customize' \| 'intelligent'` | Camera shot control |
| `multiPrompt` | `KlingMultiPromptElement[]` | Timed prompt segments |
| `startImageUrl` | `string` | Start frame image (image-to-video mode) |
| `endImageUrl` | `string` | End frame image (image-to-video mode) |

### KlingMultiPromptElement

Each element of a Kling `multiPrompt` array describes one timed scene segment.

| Field | Type | Description |
|-------|------|-------------|
| `prompt` | `string` | Required: text description for this segment |
| `durationSeconds` | `number` | Optional segment length in seconds. A plain number (not the discrete integer union used by the top-level `durationSeconds`) |

### VideoGenResult

| Field | Type | Description |
|-------|------|-------------|
| `generationId` | `string` | Unique ID for the generated video |
| `videoUrl` | `string` | URL to the video file |
| `posterUrl` | `string \| undefined` | URL to a poster/thumbnail frame |
| `durationSeconds` | `number` | Actual duration of the video |
| `width` | `number` | Video width in pixels |
| `height` | `number` | Video height in pixels |
| `provider` | `VideoGenProvider` | Provider that generated the video |
| `mode` | `VideoGenMode` | Mode used for generation |
| `prompt` | `string` | The prompt used |
| `seed` | `number` | Seed used for generation |

### VideoGenJobEvent

| Field | Type | Description |
|-------|------|-------------|
| `jobId` | `string` | Job identifier |
| `status` | `'completed' \| 'failed'` | Job outcome |
| `params` | `VideoGenParams` | Original request parameters |
| `result` | `VideoGenResult \| undefined` | Result if completed |
| `error` | `string \| object \| undefined` | Failure info if failed. May be a plain message string or an object with `code`, `message`, `detail`, `providerType`, `errorDetail` |
| `errorDetail` | `ProviderErrorDetail \| undefined` | Structured provider rejection detail if the provider supplied one (see below) |

### ProviderErrorDetail

When the video provider rejects a request with a structured reason (rather than failing transiently), it is surfaced as `errorDetail` on failed job events, and as `err.errorDetail` on the `RundotApiError` rejection of `generate()`. All fields are best-effort and optional.

| Field | Type | Description |
|-------|------|-------------|
| `loc` | `(string \| number)[] \| undefined` | Path to the offending request field, e.g. `["body", "image_urls"]` |
| `type` | `string \| undefined` | Provider error type, e.g. `'content_policy_violation'` |
| `reason` | `string \| undefined` | Provider-internal reason code, e.g. `'partner_validation_failed'` |
| `msg` | `string \| undefined` | Provider's verbatim human-readable message |

Handling a failed job by rejection type:

```typescript
const completedJobs = await RundotGameAPI.videoGen.getCompletedJobs()

for (const job of completedJobs) {
  if (job.status !== 'failed') continue

  if (job.errorDetail?.type === 'content_policy_violation') {
    // e.g. errorDetail = {
    //   loc: ['body', 'image_urls'],
    //   type: 'content_policy_violation',
    //   reason: 'partner_validation_failed',
    //   msg: 'The images or videos provided may contain likenesses of real people…',
    // }
    if (job.errorDetail.loc?.includes('image_urls')) {
      // The reference image was rejected — prompt the player to pick a different one.
      showSwapReferenceImageUi(job.errorDetail.msg)
    } else {
      // The prompt itself was rejected — ask the player to reword it.
      showRewordPromptUi(job.errorDetail.msg)
    }
  } else {
    console.error('Generation failed:', job.error)
  }
}
```

## Best Practices

- Use `seedance-2.0-fast` during development for faster iteration, then switch to `seedance-2.0` for production quality.
- For image-to-video, provide high-quality source images: the output quality is bounded by the input.
- Use `cameraFixed: true` when animating UI elements or sprites that should stay centered.
- Kling's `multiPrompt` is ideal for cutscenes with distinct beats: give each segment a clear visual description.
- Use `clientRef` for all generation calls to enable recovery after disconnects.
- Call `getCompletedJobs()` on reconnect to retrieve results from any in-flight generations.

## Reference Constraints (Seedance)

`reference-to-video` mode enforces these limits on reference inputs:

| Reference type | Max count | Duration per ref | Total duration |
|----------------|-----------|-----------------|----------------|
| `imageReferences` | 9 | - | - |
| `videoReferences` | 3 | - | - |
| `audioReferences` | 3 | 3–5 seconds each | <= 15 seconds total |

Audio references must be re-encoded to exact-second boundaries. Stream-copied audio (e.g. from a basic `trim`) will be rejected. Use `files.transform({ op: 'audioTrim', ... })` to produce correctly-encoded clips:

```typescript
const trimmed = await RundotGameAPI.files.transform({
  op: 'audioTrim',
  input: 'voice-sample.mp3',
  outputKey: 'voice-trimmed.mp3',
  maxDurationSec: 5,
})

const video = await RundotGameAPI.videoGen.generate({
  provider: 'seedance-2.0',
  mode: 'reference-to-video',
  prompt: 'Character speaks with the cloned voice',
  audioReferences: [trimmed.entry.url],
})
```

## Limits

- Seedance duration: whole-second integers **4 through 15**. Kling duration: whole-second integers **3 through 15**. Decimals (e.g. 7.5) are rejected at the type level.
- `reference-to-video` mode is only available with Seedance providers.
- `multiPrompt` and `negativePrompt` are only available with Kling.
- Subject to per-creator rate-limit tiers: see [Rate Limits](RATE_LIMITS.md).
