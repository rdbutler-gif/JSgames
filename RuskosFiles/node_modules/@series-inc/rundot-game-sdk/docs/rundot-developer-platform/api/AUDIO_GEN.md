# Audio Generation API (BETA)

Generate sound effects, music, and text-to-speech audio for dynamic game content. Powered by ElevenLabs.

---

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

// Generate a sound effect
const sfx = await RundotGameAPI.audioGen.generate({
  type: 'sfx',
  description: 'Sword clashing against metal shield, heavy impact',
})

const audio = new Audio(sfx.audioUrl)
audio.play()
```

## Sound Effects (SFX)

Generate short sound effects from a text description.

```typescript
const result = await RundotGameAPI.audioGen.generate({
  type: 'sfx',
  description: 'Glass shattering on stone floor, sharp and echoey',
  durationSec: 3,       // 0.5–30 seconds (optional, model decides if omitted)
  clientRef: 'shatter-1', // Optional correlation ID for job recovery
})

console.log(result.audioUrl)     // URL to the generated audio
console.log(result.durationSec)  // Actual duration
```

### SFX Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | `'sfx'` | Required discriminator |
| `description` | `string` | Describe materials, intensity, context (required) |
| `durationSec` | `number` | Duration 0.5–30s (optional, model decides if omitted) |
| `provider` | `AudioGenProvider` | Audio backend provider (optional; only `'elevenlabs'` is valid; defaults to `'elevenlabs'`) |
| `clientRef` | `string` | Opaque correlation ID echoed back in job events |

## Music

Generate music tracks with a prompt describing genre, tempo, instruments, and mood. Multiple models are available with different capabilities.

```typescript
const music = await RundotGameAPI.audioGen.generate({
  type: 'music',
  prompt: 'Orchestral victory fanfare, triumphant brass, 120 BPM',
  durationSec: 15,       // Required, 3–300 seconds
  model: 'lyria3',       // Optional: uses Google Lyria 3
  clientRef: 'victory-music',
})

console.log(music.audioUrl)
console.log(music.durationSec)
```

### Music Models

| Model | Notes |
|-------|-------|
| `'elevenlabs'` (default) | Duration-controlled, highest quality |
| `'lyria3'` | Google Lyria 3: fixed-length output |
| `'lyria3-pro'` | Google Lyria 3 Pro: higher quality than lyria3, fixed-length output |
| `'minimax-music-2.6'` | MiniMax: supports vocals and lyrics in prompt, fixed-length output |

> **Note:** FAL models (`lyria3`, `lyria3-pro`, `minimax-music-2.6`) produce a fixed-length track; `durationSec` is required for the API but is only honored by the `'elevenlabs'` model. The response `durationSec` always reflects the actual output duration.

### Music Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | `'music'` | Required discriminator |
| `prompt` | `string` | Genre, tempo, instruments, mood (required) |
| `durationSec` | `number` | Duration 3–300s (required; only honored by `'elevenlabs'`) |
| `model` | `MusicModel` | Music model (default: `'elevenlabs'`) |
| `provider` | `AudioGenProvider` | Audio backend provider (optional; only `'elevenlabs'` is valid; defaults to `'elevenlabs'`) |
| `clientRef` | `string` | Opaque correlation ID echoed back in job events |

## Text-to-Speech (TTS)

Convert text to spoken audio with configurable voice and expression parameters.

```typescript
// Browse the voice library to find a voiceId
const { voices } = await RundotGameAPI.audioGen.listVoices()
const narrator = voices.find(v => v.name === 'Adam')!

const speech = await RundotGameAPI.audioGen.generate({
  type: 'tts',
  text: '[whispers]The treasure lies beneath the old oak tree.[/whispers]',
  voiceId: narrator.voiceId,
  model: 'eleven_v3',
  stability: 0.3,         // Lower = more expressive
  similarityBoost: 0.8,
  speed: 1.0,
})

console.log(speech.audioUrl)
```

### TTS Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | `'tts'` | Required discriminator |
| `text` | `string` | Text to speak; supports ElevenLabs v3 audio tags: `[whispers]`, `[shouts]`, `[pause]` (required) |
| `voiceId` | `string` | ElevenLabs voice ID (required) |
| `model` | `'eleven_v3' \| 'eleven_multilingual_v2'` | TTS model (default: `'eleven_v3'`) |
| `stability` | `number` | 0–1, lower = more expressive (default: 0.5) |
| `similarityBoost` | `number` | 0–1, voice similarity boost (default: 0.8) |
| `speed` | `number` | Speech speed 0.5–2.0 (default: 1.0) |
| `provider` | `AudioGenProvider` | Audio backend provider (optional; only `'elevenlabs'` is valid; defaults to `'elevenlabs'`) |
| `clientRef` | `string` | Opaque correlation ID echoed back in job events |

## Voice Library

Browse the available ElevenLabs voices. Results are cached server-side (60 s) so repeated calls are cheap.

```typescript
const { voices } = await RundotGameAPI.audioGen.listVoices()

for (const voice of voices) {
  console.log(`${voice.name} (${voice.voiceId}) - ${voice.category}`)
  // Preview the voice at voice.previewUrl
}
```

### VoiceLibraryEntry

| Field | Type | Description |
|-------|------|-------------|
| `voiceId` | `string` | Voice ID for use in TTS `voiceId` parameter |
| `name` | `string` | Display name |
| `category` | `string \| undefined` | e.g. "premade", "cloned", "generated" |
| `description` | `string \| undefined` | Short voice description |
| `previewUrl` | `string \| undefined` | URL to a sample clip |
| `labels` | `Record<string, string> \| undefined` | Metadata labels (accent, age, etc.) |

## Voice Design

Generate custom voice previews from a natural-language description. Returns up to three candidates with temporary voice IDs that can be used directly as TTS `voiceId` values.

```typescript
const result = await RundotGameAPI.audioGen.designVoices({
  description: 'Young female, breathy, excited, slight British accent',
  sampleText: 'Welcome to the enchanted forest! ...',  // 100–1000 chars, optional
})

for (const preview of result.previews) {
  // Play preview.audioUrl to audition the voice
  // Use preview.generatedVoiceId as voiceId in generate({ type: 'tts', ... })
  console.log(preview.generatedVoiceId, preview.audioUrl)
}
```

### DesignVoicesParams

| Parameter | Type | Description |
|-----------|------|-------------|
| `description` | `string` | Natural-language voice description, 1–1000 chars (required) |
| `sampleText` | `string` | Text for the preview clip, 100–1000 chars (optional) |

### DesignVoicesResult

| Field | Type | Description |
|-------|------|-------------|
| `previews` | `DesignVoicePreview[]` | Up to 3 candidate voices |
| `previewText` | `string` | The text spoken in the previews |

### DesignVoicePreview

| Field | Type | Description |
|-------|------|-------------|
| `generatedVoiceId` | `string` | Temporary voice ID: pass as TTS `voiceId` |
| `audioUrl` | `string` | URL or data URI of the preview audio |
| `durationSec` | `number` | Duration of the preview clip |

## Save Designed Voice

Save a designed voice preview as a permanent voice in the ElevenLabs library. After calling `designVoices`, pick a preview and save it; the returned `voiceId` replaces the temporary `generatedVoiceId` and won't expire.

```typescript
// 1. Design voice previews
const { previews } = await RundotGameAPI.audioGen.designVoices({
  description: 'Young female, breathy, excited, slight British accent',
})

// 2. Let the user pick one, then save it
const saved = await RundotGameAPI.audioGen.saveDesignedVoice({
  generatedVoiceId: previews[0].generatedVoiceId,
  voiceName: 'Breathy British Girl',
  voiceDescription: 'Young female, breathy, excited, slight British accent',
})

// 3. Use the permanent voiceId for TTS
const speech = await RundotGameAPI.audioGen.generate({
  type: 'tts',
  text: 'Hello, adventurer!',
  voiceId: saved.voiceId,  // permanent - won't expire
})
```

### SaveDesignedVoiceParams

| Parameter | Type | Description |
|-----------|------|-------------|
| `generatedVoiceId` | `string` | Temporary voice ID from a `designVoices` preview (required) |
| `voiceName` | `string` | Display name, 1–100 chars (required) |
| `voiceDescription` | `string` | Optional description, up to 1000 chars |

### SaveDesignedVoiceResult

| Field | Type | Description |
|-------|------|-------------|
| `voiceId` | `string` | Permanent voice ID: use as TTS `voiceId` going forward |

## Async Job Recovery

Audio generation runs as an async job. If the client disconnects mid-generation, use `getCompletedJobs()` to drain results on reconnect. Pass a `clientRef` in the original request to correlate results with your game state.

```typescript
// On reconnect, check for any completed jobs
const completedJobs = await RundotGameAPI.audioGen.getCompletedJobs()

for (const job of completedJobs) {
  if (job.status === 'completed' && job.result) {
    console.log(`Job ${job.params.clientRef} ready:`, job.result.audioUrl)
  } else if (job.status === 'failed') {
    console.error(`Job ${job.params.clientRef} failed:`, job.error)
  }
}
```

## Configuration

### `rundot/audioGen.config.json`

`audioGen` is **default-bounded**: your game can call it without any config file, but undeclared usage runs under default platform safety caps (~$500/game/day and ~$10/user/day). Creating `rundot/audioGen.config.json` — which `rundot deploy` does automatically the first time it detects the service in your bundle — replaces those defaults with your own policy: the auto-created permissive `{}` removes the caps entirely, or you can author allowlists and caps to tighten instead. An explicit `{ "disabled": true }` turns the service off.

Place your config at `rundot/audioGen.config.json`. The file contains the settings **directly** (no wrapping key — the filename implies it):

```json
{
  "allowedModels": ["lyria3", "eleven_v3"],
  "perUserDailyCreditCap": 500
}
```

> Commit `rundot/` to your repo; it's project config, not a build artifact, and it's env-agnostic. `game.config.prod.json` is a separate file for local CLI metadata; this config does not go there.

**Common fields:**

| Field | Type | Description |
| --- | --- | --- |
| `disabled` | `boolean` | Turns the service off; every call fails with `AI_POLICY_DENIED`. |
| `allowedModels` | `string[]` | Allowlist of permitted model identifiers. When set, a request whose `model` isn't listed is rejected. Omit to allow any. |
| `dailyCreditCap` | `number` | Approximate per-game daily credit ceiling. |
| `perUserDailyCreditCap` | `number` | Approximate per-user daily credit ceiling. |

For `audioGen`, `allowedModels` entries match the request's `model` string.

The two credit caps are approximate safety ceilings, not exact meters: the server reserves budget from a cost estimate *before* each call and reconciles the real cost afterward, so the effective ceiling can drift slightly around the configured value.

Policy resolves from your game's published (`public`) tag — the same config your live players run against.

## API Reference

| Method | Returns | Description |
|--------|---------|-------------|
| `audioGen.generate(params)` | `Promise<AudioGenResult>` | Generate audio (SFX, music, or TTS) |
| `audioGen.getCompletedJobs()` | `Promise<AudioGenJobEvent[]>` | Drain completed async job results |
| `audioGen.listVoices()` | `Promise<ListVoicesResult>` | Browse available ElevenLabs voices |
| `audioGen.designVoices(params)` | `Promise<DesignVoicesResult>` | Generate custom voice previews from a description |
| `audioGen.saveDesignedVoice(params)` | `Promise<SaveDesignedVoiceResult>` | Save a designed voice preview as a permanent voice |

### AudioGenResult

| Field | Type | Description |
|-------|------|-------------|
| `generationId` | `string` | Unique ID for the generated audio |
| `audioUrl` | `string` | URL to the audio file |
| `type` | `'sfx' \| 'music' \| 'tts'` | Type of audio generated |
| `durationSec` | `number` | Actual duration of the audio |
| `prompt` | `string` | The prompt/description used |

### AudioGenJobEvent

| Field | Type | Description |
|-------|------|-------------|
| `jobId` | `string` | Job identifier |
| `status` | `'completed' \| 'failed'` | Job outcome |
| `params` | `AudioGenParams` | Original request parameters |
| `result` | `AudioGenResult \| undefined` | Result if completed |
| `error` | `string \| undefined` | Error message if failed |

## Best Practices

- Be specific in SFX descriptions: include materials, intensity, and spatial context (e.g., "metal on metal" not just "hit sound").
- For music, specify genre, tempo, instruments, and mood together for best results.
- Use `clientRef` for all generation calls to enable recovery after disconnects.
- Call `getCompletedJobs()` on reconnect to retrieve results from any in-flight generations.
- Keep TTS `stability` low (0.2–0.4) for expressive NPC dialogue, high (0.7–0.9) for UI narration.

## Limits

- Music `durationSec` minimum is **3 seconds**; SFX range is **0.5–30 seconds**.
- Subject to per-creator rate-limit tiers; see [Rate Limits](RATE_LIMITS.md).
