# Clips API (BETA)

Record gameplay clips (canvas video with game audio, optional microphone, and optional webcam PiP overlay) and persist them as private [UGC](UGC.md) entries backed by the [Files API](FILES.md).

{% hint style="warning" %}
All SDK methods can reject; unhandled rejections crash the app. Always wrap SDK calls in `try/catch` or attach a `.catch()` handler. See [Error Handling](../error-handling.md) for details.
{% endhint %}

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

const { clips } = RundotGameAPI

// 1. Route game audio through Web Audio (once at init)
clips.useGameAudio(myMasterGainNode)

// 2. Start recording (canvas + mic + game audio + webcam PiP)
await clips.startRecordingAsync({ camera: true })

// 3. Stop and persist as private UGC
const clip = await clips.stopRecordingAsync({ title: 'Boss kill', tags: ['win'] })

// clip.blob       → Blob for immediate playback
// clip.ugc        → private UGC entry (contentType: 'clip')
// clip.fileKey    → durable GCS key for later retrieval
// clip.fileUrl    → signed URL (~4h TTL, immediate playback only)

// 4. Optionally make it public
await clips.publishClipAsync(clip.ugc.id)
```

## How It Works

Clips captures the game's `<canvas>` via `captureStream()` and mixes in game audio (from a Web Audio node) and/or microphone audio via `MediaRecorder`. When camera is enabled, the SDK acquires the webcam and composites a PiP overlay onto an offscreen canvas before encoding. The resulting video is uploaded to the [Files API](FILES.md) and registered as a private [UGC](UGC.md) entry with `contentType: 'clip'`.

```
startRecordingAsync()
  → canvas.captureStream(fps)
  → optional getUserMedia({ video, audio })  [camera + mic, single call]
  → optional useGameAudio(node)              [game audio]
  → composite canvas draws game + PiP overlay (when camera on)
  → MediaRecorder records mixed stream

stopRecordingAsync()
  → files.upload + PUT blob + files.confirmUpload (moderation)
  → ugc.create(contentType: 'clip', isPublic: false)
  → returns ClipResult
```

## Game Audio

Call `useGameAudio(node)` **once at init** with your game's master `AudioNode` (typically a `GainNode`). Without it, only microphone audio is captured (or silence if mic is also off).

```typescript
// Phaser
clips.useGameAudio(game.sound.context.destination)

// three.js / react-three-fiber
clips.useGameAudio(audioListener.getInput())

// Generic Web Audio
const masterGain = audioCtx.createGain()
// ... connect your audio graph to masterGain ...
clips.useGameAudio(masterGain)
```

{% hint style="info" %}
`<audio>` and `<video>` element playback **cannot** be captured; only Web Audio API nodes work. If your game uses HTML media elements for sound, route them through a `MediaElementAudioSourceNode` first.
{% endhint %}

## Camera PiP (Reaction Cam)

Add a picture-in-picture webcam overlay so players can record their reactions alongside gameplay. The webcam feed is composited directly into the video (no separate track or post-production). A **live preview** of the camera is always shown on screen during recording so the player knows they are being captured.

### Basic Usage

```typescript
// Front camera, top-center, 25% width (defaults)
await clips.startRecordingAsync({ camera: true })
```

### Custom Layout

```typescript
await clips.startRecordingAsync({
  camera: {
    facingMode: 'user',
    pip: {
      position: 'top-right',
      widthFraction: 0.3,
    },
  },
})
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `camera` | `boolean \| ClipCameraOptions` | `false` | Enable webcam PiP. `true` uses defaults. |
| `camera.facingMode` | `'user' \| 'environment'` | `'user'` | Which camera to use |
| `camera.pip.position` | `ClipPipPosition` | `'top-center'` | PiP placement (see positions below) |
| `camera.pip.widthFraction` | `number` | `0.25` | PiP width as a fraction of the canvas width |
| `onCameraUnavailable` | `() => void` | - | Called if camera access fails (recording continues without PiP) |

#### Positions

`'top-left'` · `'top-center'` · `'top-right'` · `'bottom-left'` · `'bottom-center'` · `'bottom-right'`

### How It Works

When camera is enabled, the SDK:

1. Acquires webcam + mic in a **single `getUserMedia` call** (one OS prompt)
2. Creates an offscreen composite canvas (even in auto mode)
3. Draws the game canvas + a rounded PiP overlay each frame (mirrored only for the front camera; see below)
4. Feeds the composite into `MediaRecorder`
5. Injects a **live camera preview** (`<video>` overlay) on top of the game canvas at the same position/size as the recorded PiP; the player sees exactly what will appear in the final video

The live preview is always visible when the camera is active. It is removed automatically when recording stops or is cancelled.

The PiP corner radius (12px) and the margin from the edge (16px) are fixed; only `position` and `widthFraction` are tunable.

{% hint style="info" %}
The PiP and the live preview are **mirrored only for the front camera** (`facingMode: 'user'`, the default). Rear-camera footage (`facingMode: 'environment'`) is drawn un-mirrored so on-screen text and scenes read correctly.
{% endhint %}

### Camera Failure Is Non-Fatal

If `getUserMedia` rejects (no camera, permission denied), the clip records normally without PiP. The `onCameraUnavailable` callback notifies your game:

```typescript
await clips.startRecordingAsync({
  camera: true,
  onCameraUnavailable: () => {
    showToast('Camera unavailable: recording without webcam')
  },
})
```

### Feature Detection

```typescript
const support = await clips.isSupportedAsync()
if (support.canUseCamera) {
  await clips.startRecordingAsync({ camera: true })
}
```

## Consent & Permissions

Microphone and camera recording require permission, enforced automatically when either `audio.microphone` or `camera` is enabled. The SDK avoids double-prompting by coordinating between the browser/OS permission and the platform consent dialog.

### 1. Sign-in

Anonymous users cannot record with a microphone or camera. If the user isn't signed in, `requestCaptureConsentAsync()` routes through the host sign-in flow first.

### 2. Single Opt-in

The SDK checks the browser's device permission state before deciding whether to show the platform consent dialog:

| Scenario | What the user sees |
|---|---|
| **Internal apps** (trusted first-party creator) | Nothing: auto-granted server-side |
| **First game on this origin** (device permission not yet granted) | Browser/OS permission prompt only: serves as the single opt-in for that recording. App consent stays `undetermined` server-side because the host never self-grants on a game's behalf |
| **Device permission already granted** (e.g. a later recording, or a second game on the same origin) | Platform consent dialog: the browser won't prompt again, so the host shows its own gate |

The host never persists `granted` from a game-supplied signal (the game cannot self-grant). As a result, the platform consent dialog may appear on a later recording even after the browser already granted device permission. A future enhancement could persist consent from a host-owned signal to make this a true once-only prompt.

### 3. App Capture Consent (per app, per user)

Consent status is persisted server-side per app per user. Use `getCaptureConsentAsync()` to check without prompting, and `requestCaptureConsentAsync()` to trigger the prompt (which itself applies the single opt-in logic above).

### 4. OS Permission

The browser/OS mic and camera permission is per-origin (not per-game). When both camera and mic are enabled, the SDK makes a single `getUserMedia({ video, audio })` call so the user sees one combined prompt. This is separate from app consent; `granted` app consent does not guarantee OS permission.

### Skipping Consent Entirely

If your game doesn't need mic or camera, pass `audio: { microphone: false }` (and omit `camera`) to skip all consent checks:

```typescript
await clips.startRecordingAsync({
  audio: { microphone: false, gameAudio: true },
})
```

## Capture Modes

### Auto Mode (default)

Every frame the canvas renders is automatically captured. Use this for most games.

```typescript
await clips.startRecordingAsync({ captureMode: 'auto' })
```

### Manual Mode

Call `captureFrame()` to snapshot the canvas at specific points: useful when HUD elements are composited into the same canvas and you want to capture only the clean game render.

```typescript
await clips.startRecordingAsync({ canvas: mainCanvas, captureMode: 'manual' })

function renderLoop() {
  renderWorld()
  clips.captureFrame()   // snapshot clean gameplay
  renderHud()            // HUD is excluded from recording
  requestAnimationFrame(renderLoop)
}
```

`captureFrame()` is a no-op when not recording, so it's safe to leave in your render loop.

## Auto-Stop

When `maxDurationMs` elapses, the recorder stops capture and releases the mic immediately, but retains recorded data. The `onAutoStop` callback fires; the game **must still call `stopRecordingAsync()`** to get the blob and persist.

```typescript
await clips.startRecordingAsync({
  maxDurationMs: 30_000,
  onAutoStop: () => {
    clips.stopRecordingAsync({ title: 'Auto clip' })
  },
})
```

When a recording auto-stops at `maxDurationMs`, the resulting `ClipResult.durationMs` is reported as exactly `maxDurationMs` (not wall-clock time). For a manual stop it's the elapsed wall-clock time since recording started.

## Cancel

Abort a recording, discard all data, and release the mic + camera:

```typescript
await clips.cancelRecordingAsync()
```

## Publishing

Clips are **private by default**. To share with other players:

```typescript
const published = await clips.publishClipAsync(clip.ugc.id)
// Sets both file visibility and UGC isPublic to true
```

Other players can browse published clips via UGC. `browse` returns a paginated `UgcBrowseResponse`, so read the `entries` array off the response (don't iterate the response itself):

```typescript
const { entries } = await RundotGameAPI.ugc.browse({ contentType: 'clip' })
```

## Stored Clip Data

When a clip is persisted (`persist: 'ugc'`, the default), `stopRecordingAsync` writes a fixed set of fields into the created UGC entry's `data` blob. They are merged **under** any caller-supplied `data` from `ClipPersistOptions`, so the fields below always win on collision. A game reading a clip back from UGC can rely on them:

| `data` field | Type | Description |
|---|---|---|
| `fileKey` | `string` | Durable GCS key for the video. Resolve a fresh playback URL with `files.getUrl({ key })`. |
| `durationMs` | `number` | Clip length in milliseconds. |
| `width` | `number` | Recorded video width in pixels. |
| `height` | `number` | Recorded video height in pixels. |
| `mimeType` | `string` | Container/codec MIME type the clip was encoded with. |
| `codec` | `string \| undefined` | Codec reported by file moderation/transcode metadata (may be absent). |

{% hint style="info" %}
`fileUrl` is intentionally **not** stored in `data`; it's a ~4h signed URL. Always resolve a fresh one from `data.fileKey` via `files.getUrl({ key: data.fileKey })`.
{% endhint %}

```typescript
const { entries } = await RundotGameAPI.ugc.browse({ contentType: 'clip' })
const clip = entries[0]
const url = await RundotGameAPI.files.getUrl({ key: clip.data.fileKey as string })
```

## Durable Playback URLs

The `fileUrl` in `ClipResult` expires after ~4 hours. For long-term playback, store `fileKey` and resolve fresh URLs:

```typescript
const url = await RundotGameAPI.files.getUrl({ key: clip.fileKey })
```

## API Reference

### `isSupportedAsync(): Promise<ClipsSupport>`

Feature detection. Returns whether the environment supports recording.

```typescript
interface ClipsSupport {
  canRecord: boolean
  canUseMicrophone: boolean
  canUseCamera: boolean
  reason?: string
}
```

### `getCaptureConsentAsync(): Promise<CaptureConsent>`

Check the current app's mic consent status without prompting.

```typescript
type CaptureConsentStatus = 'granted' | 'denied' | 'undetermined'

interface CaptureConsent {
  status: CaptureConsentStatus
  canAskAgain: boolean   // false when status is 'denied'
}
```

### `requestCaptureConsentAsync(opts?: { includesCamera?: boolean }): Promise<CaptureConsent>`

Request capture consent. The SDK applies the single opt-in logic: internal apps short-circuit to `granted`; if the device permission state is exactly `'prompt'` (the browser will still show its own prompt during recording), returns `{ status: 'granted', canAskAgain: true }` so you don't double-prompt; otherwise shows the platform consent modal. If the device permission is already `'denied'`, there is no short-circuit; the platform consent dialog is shown and you get back whatever it yields. Pass `{ includesCamera: true }` when the upcoming recording uses the webcam so the correct device permission (camera vs microphone) drives the decision.

### `useGameAudio(node: AudioNode): void`

Register the master Web Audio output for game-audio capture. Call once at init, before recording.

### `startRecordingAsync(options?: StartClipRecordingOptions): Promise<void>`

Begin recording.

```typescript
interface StartClipRecordingOptions {
  canvas?: HTMLCanvasElement | string  // default: first <canvas> on page
  fps?: number                         // default: 30
  maxDurationMs?: number               // default: 60_000 (60s)
  audio?: ClipAudioOptions
  camera?: boolean | ClipCameraOptions // default: false (no webcam)
  onCameraUnavailable?: () => void     // called if camera access fails
  captureMode?: 'auto' | 'manual'     // default: 'auto'
  mimeType?: string                    // throws if unsupported
  videoBitsPerSecond?: number          // default: 2_500_000
  onAutoStop?: () => void              // fired when maxDurationMs reached
}

interface ClipAudioOptions {
  microphone?: boolean   // default: true
  gameAudio?: boolean    // default: true (effective only after useGameAudio)
}

interface ClipCameraOptions {
  facingMode?: 'user' | 'environment'  // default: 'user'
  pip?: ClipPipLayout
}

type ClipPipPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'

interface ClipPipLayout {
  position?: ClipPipPosition             // default: 'top-center'
  widthFraction?: number                 // default: 0.25
}
```

### `captureFrame(): void`

Manual mode only. Snapshot the canvas into the recording. No-op when not recording or in auto mode.

### `stopRecordingAsync(persist?: ClipPersistOptions): Promise<ClipResult>`

Stop recording and optionally upload + create UGC.

```typescript
interface ClipPersistOptions {
  persist?: 'none' | 'ugc'            // default: 'ugc'
  title?: string
  tags?: string[]
  data?: Record<string, unknown>       // merged into UGC data blob
}

interface ClipResult {
  blob: Blob
  mimeType: string
  durationMs: number
  width: number
  height: number
  sizeBytes: number
  ugc?: UgcEntry       // present when persist !== 'none'
  fileKey?: string      // durable GCS key
  fileUrl?: string      // ~4h signed URL for immediate playback
}
```

### `cancelRecordingAsync(): Promise<void>`

Abort recording, discard data, release mic, camera, and all tracks.

### `publishClipAsync(ugcId: string): Promise<UgcEntry>`

Make a private clip public. Sets both the file visibility and UGC `isPublic` to `true`.

The entry is fetched first and publishing is refused unless its `data.fileKey` is a non-empty string, so only entries created by `stopRecordingAsync` (which writes `data.fileKey`) are publishable. If the `ugc.update` fails after the file is flipped public, the SDK best-effort reverts the file back to private so you never leave a public file behind a private entry. Throws:

- `[clips] UGC entry "<id>" not found` when the id resolves to nothing.
- `[clips] UGC entry "<id>" has no data.fileKey; refusing to publish a clip with no accessible file` when `data.fileKey` is absent or empty.

## Defaults

| Setting | Default |
|---|---|
| `fps` | 30 |
| `maxDurationMs` | 60,000 (60s) |
| `videoBitsPerSecond` | 2,500,000 |
| `audio.microphone` | `true` |
| `audio.gameAudio` | `true` |
| `camera` | `false` |
| `camera.facingMode` | `'user'` |
| `camera.pip.position` | `'top-center'` |
| `camera.pip.widthFraction` | `0.25` |
| `captureMode` | `'auto'` |
| `persist` | `'ugc'` |

## Error Handling

```typescript
try {
  await clips.startRecordingAsync()
} catch (err) {
  if (err instanceof Error && err.message === 'CAPTURE_CONSENT_DENIED') {
    // Fallback: record without mic
    await clips.startRecordingAsync({ audio: { microphone: false } })
    return
  }
  throw err
}
```

| Error | When |
|---|---|
| `CAPTURE_CONSENT_DENIED` | Mic or camera enabled but app consent denied or user declined sign-in |
| `[clips] a recording is already in progress` | Second `startRecordingAsync` while recording |
| `[clips] recording is not supported in this environment` | No `MediaRecorder` or `captureStream` |
| `[clips] MediaRecorder is not available in this environment` | `MediaRecorder` / `isTypeSupported` missing entirely |
| `[clips] no supported MediaRecorder mime type found` | `MediaRecorder` exists but none of the SDK's preferred mp4/webm types are supported and no explicit `mimeType` was passed |
| `[clips] no <canvas> found...` | Canvas selector/element missing |
| `[clips] failed to get 2D context for compositing` | The composite canvas `getContext('2d')` returned null (manual mode or camera recording) |
| `[clips] mimeType "..." is not supported here` | Explicit unsupported mime type |
| `[clips] no active recording to stop` | `stopRecordingAsync` called with nothing recording |
| `NotAllowedError` (from `getUserMedia`) | OS mic permission denied (camera denial is non-fatal; see `onCameraUnavailable`) |
| `[clips] clip is N bytes which exceeds the M-byte upload cap...` | Over `files.getQuota().maxFileBytes` |
| `[clips] upload PUT failed with status N` | The blob PUT to the signed upload URL returned a non-2xx status (the partial file is deleted to avoid orphaning quota) |
| `CONTENT_REJECTED` | Video moderation flagged content |

## Supported Formats

The SDK auto-selects the first supported format:

| Platform | Format |
|---|---|
| Safari / iOS | `video/mp4` |
| Chrome / Android | `video/webm` |

Both are accepted by the Files API and content moderation pipeline.

## Limitations

- **Canvas only**: DOM elements outside the canvas are not recorded (the webcam PiP is composited *into* the canvas recording and shown as a live DOM overlay)
- **Camera is best-effort**: if `getUserMedia` fails for video, the clip records without PiP (non-fatal); use `onCameraUnavailable` to react
- **Web Audio required for game sound**: `<audio>`/`<video>` elements can't be captured directly
- **Local testing**: recording is unavailable during local Playground testing; verify clips in the RUN.world app
- **Upload size cap**: limited by `files.getQuota().maxFileBytes` (typically 50 MB); tune `maxDurationMs`, `fps`, and `videoBitsPerSecond` accordingly
