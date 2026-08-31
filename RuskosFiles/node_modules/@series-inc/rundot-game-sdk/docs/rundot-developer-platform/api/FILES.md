# Files API (BETA)

Store and load large binary data: generated portraits, recorded audio, video clips, exported save files, custom assets. Unlike [Storage API](STORAGE.md) (string key-value, ~977 KiB max per value), the Files API stores binary blobs up to 50 MB each via direct-to-cloud uploads.

**All file storage is creator-funded.** The game creator's tier determines the storage cap; players never pay for or manage storage. This matches every PaaS model: the developer pays per GB, not the end user.

{% hint style="warning" %}
All SDK methods can reject; unhandled rejections crash the app. Always wrap SDK calls in `try/catch` or attach a `.catch()` handler. See [Error Handling](../error-handling.md) for details.
{% endhint %}

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

// 1. Check if there's enough storage
const canStore = await RundotGameAPI.files.hasStorageAvailable(imageBlob.size)
if (!canStore) {
  console.log('Creator storage quota exceeded or file too large')
  return
}

// 2. Request an upload URL (public delivery is the default)
const upload = await RundotGameAPI.files.upload({
  key: 'portrait.png',
  contentType: 'image/png',
  sizeBytes: imageBlob.size,
  visibility: 'public', // optional, default 'public'; omit for the same result
})

// 3. PUT the binary data: use uploadHeaders from the response
await fetch(upload.uploadUrl, {
  method: 'PUT',
  headers: upload.uploadHeaders,
  body: imageBlob,
})

// 4. Confirm the upload (extracts media metadata)
const entry = await RundotGameAPI.files.confirmUpload('portrait.png')
// entry.mediaMetadata = { width: 512, height: 512 }

// 5. Read it back later
const url = await RundotGameAPI.files.getUrl({ key: 'portrait.png' })
const response = await fetch(url)
const data = await response.blob()
```

{% hint style="info" %}
`confirmUpload` returns a `FileEntry` with its resolved read URL; public entries have a stable URL and private entries have a signed URL with `urlExpiresAt`. You don't need a separate `getUrl()` call after confirming an upload.
{% endhint %}

## Two-Phase Upload

Uploads are a two-step process:

1. **`upload(params)`**: requests a short-lived signed PUT URL. The server validates the creator's quota, content type, and file size before returning the URL and required headers.
2. **`confirmUpload(key)`**: called after your `fetch()` PUT succeeds. The server verifies the object, probes media metadata, transitions to `active`, and updates the creator's storage counter. For public uploads (the default, or `visibility: 'public'`), content moderation runs before activation. This runs asynchronously via the job system; the SDK awaits completion automatically.

Binary data flows directly from your game to cloud storage, no bridge serialization overhead. The `uploadHeaders` returned by `upload()` **must** be included in your PUT request (they contain the `Content-Type` and size-range validation headers).

## Batch Upload

For multi-file uploads, use `batchUpload` and `batchConfirm` to reduce HTTP round-trips from 2N to 2:

```typescript
// 1. Get presigned URLs for all files in one call (single quota check)
const batch = await RundotGameAPI.files.batchUpload({
  files: [
    { key: 'portrait.png', contentType: 'image/png', sizeBytes: file1.size },
    { key: 'background.png', contentType: 'image/png', sizeBytes: file2.size },
  ],
})

// 2. PUT all files in parallel
await Promise.all(
  batch.files.map((upload, i) =>
    fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: upload.uploadHeaders,
      body: blobs[i],
    })
  )
)

// 3. Confirm all uploads in one call (returns per-key job statuses)
const confirmed = await RundotGameAPI.files.batchConfirm(
  batch.files.map(f => f.key)
)

// 4. Poll for completed jobs to get FileEntry results (includes url)
const completedJobs = await RundotGameAPI.files.getCompletedJobs()
```

**Limits:** Maximum 20 files per batch. All files in a batch share a single quota check: if the total exceeds the creator's remaining quota, the entire batch is rejected.

Each file is public when `visibility` is omitted. Set `visibility: 'private'` on an individual file when it must use signed, non-cacheable delivery.

## Batch Copy

Use `batchCopy` to copy existing Files keys without downloading, uploading, or polling transform jobs. A batch accepts 1–20 entries, preserves request ordering in its results, and manages copy concurrency on the server. Copies are public by default; pass `visibility: 'private'` for signed, non-cacheable outputs. Public copies run the existing publication and moderation flow for every successful copy.

```typescript
const batch = await run.files.batchCopy({
  copies: [
    {
      inputKey: 'projects/draft/assets/ship.glb',
      outputKey: 'releases/2026-07-16/assets/ship.glb',
    },
    {
      inputKey: 'projects/draft/audio/theme.ogg',
      outputKey: 'releases/2026-07-16/audio/theme.ogg',
    },
  ],
  visibility: 'public',
})

const failedCopies = batch.results.filter((result) => result.status === 'failed')

if (failedCopies.length > 0) {
  throw new Error(
    `Failed to publish: ${failedCopies.map((copy) => copy.outputKey).join(', ')}`,
  )
}
```

```typescript
interface BatchCopyParams {
  copies: Array<{
    inputKey: string
    outputKey: string
  }>
  visibility?: 'private' | 'public' // default: 'public'
}

interface BatchCopyResult {
  results: Array<
    | {
        inputKey: string
        outputKey: string
        status: 'copied'
        sizeBytes: number
        visibility: 'private' | 'public'
      }
    | {
        inputKey: string
        outputKey: string
        status: 'failed'
        error: string
        code?: string
      }
  >
}
```

Request validation and aggregate quota checks happen before any copy starts. Invalid keys, duplicate output keys, any output key that also appears as an input key, invalid visibility, and batches outside the 1–20 item limit reject the entire request.

Execution is not atomic: one item can fail while other items succeed, and successful copies are not rolled back. Retry only the entries whose result has `status: 'failed'`. Retrying the same output key uses the existing non-destructive overwrite behavior, so the previous active file continues serving until its replacement commits. Batch-copy results contain compact metadata only and never include signed URLs; call `getUrl` or `getMetadata` when a URL is needed.

## API Reference

### `upload(params: UploadParams): Promise<UploadResult>`

```typescript
interface UploadParams {
  key: string           // unique per (app, player): your chosen filename
  contentType: string   // MIME type (must be in the allowlist)
  sizeBytes: number     // declared size: enforced at the cloud level
  visibility?: 'private' | 'public'  // default: 'public'
}

interface UploadResult {
  uploadUrl: string                    // signed PUT URL (15-minute TTL)
  uploadHeaders: Record<string, string> // MUST be included in the PUT request
  key: string
  expiresAt: number                    // epoch ms
}
```

### `confirmUpload(key: string, options?: ConfirmUploadOptions): Promise<FileEntry>`

Finalize an upload. Extracts media metadata and transitions the file to `active`. For public uploads (the default, or `visibility: 'public'`), content moderation runs before activation; rejected content throws `FILES_CONTENT_REJECTED`. Returns the finalized file entry.

```typescript
interface ConfirmUploadOptions {
  clientRef?: string  // opaque tag echoed back in job events
}
```

Internally, `confirmUpload` submits a server-side job. The SDK awaits job completion and returns the final `FileEntry`. If you need to track confirm jobs across sessions (e.g., the player closes the app mid-upload), use `getCompletedJobs()`.

### `batchUpload(params: BatchUploadParams): Promise<BatchUploadResult>`

Request presigned upload URLs for multiple files in a single call. Performs one quota check for the entire batch.

```typescript
interface BatchUploadParams {
  files: Array<{
    key: string
    contentType: string
    sizeBytes: number
    visibility?: 'private' | 'public' // default: 'public'
  }>
}

interface BatchUploadResult {
  files: UploadResult[]  // same structure as single upload()
}
```

Maximum 20 files per batch. If the total declared size exceeds the creator's remaining quota, the entire batch is rejected.

### `batchConfirm(keys: string[], options?: ConfirmUploadOptions): Promise<BatchConfirmResult>`

Submit confirm jobs for multiple keys in a single call. Returns per-key results including job IDs.

```typescript
interface BatchConfirmResult {
  jobs: Array<{
    key: string
    jobId?: string   // present when submitted successfully
    status: string   // 'pending' | 'rejected' | 'failed'
    error?: string   // present when rejected or failed
  }>
}
```

Unlike single `confirmUpload`, `batchConfirm` does **not** poll for completion; it returns immediately with job IDs. Use `getCompletedJobs()` to check for results.

### `getUrl(params: GetUrlParams): Promise<string>`

Resolve a file's read URL. Public files return a stable unsigned URL; private files return a four-hour signed URL.

```typescript
interface GetUrlParams {
  key: string
  targetAppId?: string       // cross-app read (same creator only)
  targetProfileId?: string   // cross-player read (public files only)
}
```

### `getUrls(params: GetUrlsParams): Promise<GetUrlsResult>`

Batch read URLs for up to 50 keys in one call. Keys that don't exist or are inaccessible are silently omitted.

```typescript
interface GetUrlsParams {
  keys: string[]             // up to 50 keys
  targetAppId?: string
  targetProfileId?: string
}

interface GetUrlsResult {
  urls: Record<string, string>  // key → stable public URL or signed private URL
  ttlMs: number                 // 0 when all URLs are public; 4 hours if any URL is private
}
```

### `getMetadata(params: GetMetadataParams): Promise<FileEntry>`

Get metadata for a stored file. Accepts the same cross-read params as `getUrl`.

```typescript
interface GetMetadataParams {
  key: string
  targetAppId?: string
  targetProfileId?: string
}
```

### `exists(params: ExistsParams): Promise<boolean>`

Check whether a single file exists and is accessible. Returns `false` for missing or inaccessible keys; it does **not** throw `FILES_NOT_FOUND`. Accepts the same cross-read params as `getUrl`.

```typescript
interface ExistsParams {
  key: string
  targetAppId?: string       // cross-app read (same creator only)
  targetProfileId?: string   // cross-player read (public files only)
}
```

For checking many keys at once, use `batchExists` instead (one rate-limited call for up to 50 keys).

### `batchGetMetadata(params: BatchMetadataParams): Promise<BatchMetadataResult>`

Retrieve metadata for up to 50 files in one call. Missing or inaccessible keys are silently omitted from the result.

```typescript
interface BatchMetadataParams {
  keys: string[]            // up to 50 keys
  targetAppId?: string
  targetProfileId?: string
}

interface BatchMetadataResult {
  entries: Record<string, FileEntry>
  ttlMs: number                 // 0 when all entries are public; 4 hours if any entry is private
}
```

Example:

```typescript
const result = await RundotGameAPI.files.batchGetMetadata({
  keys: ['portrait.png', 'level-data.json', 'replay.mp4'],
})

for (const [key, entry] of Object.entries(result.entries)) {
  console.log(`${key}: ${entry.sizeBytes} bytes, ${entry.contentType}`)
}
```

### `batchExists(params: BatchExistsParams): Promise<BatchExistsResult>`

Check existence of up to 50 files in one call. Keys that don't exist or aren't accessible return `false`.

```typescript
interface BatchExistsParams {
  keys: string[]            // up to 50 keys
  targetAppId?: string
  targetProfileId?: string
}

interface BatchExistsResult {
  results: Record<string, boolean>
}
```

Example:

```typescript
const result = await RundotGameAPI.files.batchExists({
  keys: ['portrait.png', 'profile-photo.jpg', 'replay.mp4'],
})

if (result.results['portrait.png']) {
  // file exists and is accessible
}
```

### `delete(key: string): Promise<void>`

Delete a file. Removes the cloud object and decrements the creator's storage counter.

### `list(params?: ListParams): Promise<ListResult>`

List active files for the current player. Supports pagination, prefix filtering, and cross-app listing.

```typescript
interface ListParams {
  prefix?: string      // filter keys by prefix
  cursor?: string      // pagination cursor from previous response
  limit?: number       // 1–500 (default: 100)
  targetAppId?: string // list from a sibling app (same creator)
}

interface FileListEntry {
  // ...same fields as FileEntry, except:
  url?: string         // present for PUBLIC files only — see below
}

interface ListResult {
  files: FileListEntry[]
  nextCursor?: string  // pass to next call for more results
}
```

**`url` is optional on a list entry.** Public files have a stable URL that costs
nothing to produce, so it is included. Private files need a *signed* URL, which
takes a server round-trip per file — producing one for every row would make a
single page of results cost hundreds of them. So private files are listed
without a URL, and you fetch URLs for just the ones you actually need:

```typescript
const { files } = await rundot.files.list({ prefix: 'levels/' })

// Render what you can immediately; resolve the rest in one batched call.
const needUrls = files.filter(f => !f.url).map(f => f.key)
if (needUrls.length > 0) {
  const { urls } = await rundot.files.getUrls({ keys: needUrls.slice(0, 50) })
  // urls[key] → signed URL
}
```

Prefer `getUrls` (batched, up to 50 keys) over calling `getUrl` per file. If a
file doesn't need to be private, uploading it with `visibility: 'public'` avoids
the second call entirely.

**A `cursor` is only valid while the file it points at still exists.** If that
file is deleted before you request the next page, the call fails with
`FILES_INVALID_CURSOR` and you should restart the listing without a cursor. When
you are deleting as you page, don't carry `nextCursor` forward — just re-request
the first page until it comes back empty.

### `setVisibility(key: string, visibility: 'private' | 'public'): Promise<FileEntry>`

Toggle file visibility. Only the file owner can change visibility. When changing from `private` to `public`, the file is copied to a fresh immutable public object path and content moderation runs before the transition completes; if rejected, the file stays private and `FILES_CONTENT_REJECTED` is thrown. Changing from `public` to `private` switches future reads to a fresh signed object and removes the old public object after the swap. Bytes already cached from a public URL cannot be recalled.

### `getQuota(): Promise<StorageQuota>`

Get the creator's current storage quota and usage.

```typescript
interface StorageQuota {
  usedBytes: number       // creator's total usage across all apps
  capBytes: number        // cap for creator's tier
  availableBytes: number  // capBytes - usedBytes
  maxFileBytes: number    // per-file size limit for normal uploads (default 50 MB)
  maxArchiveBytes: number // larger per-file limit for gated `application/zip` archive uploads
  tier: 'free' | 'creator' | 'plus' | 'pro' | 'power' | 'max'  // creator entitlement tier
}
```

### `hasStorageAvailable(sizeBytes: number, contentType?: string): Promise<boolean>`

Pre-flight convenience check. Returns `true` if the file fits within both the creator's remaining quota and the relevant per-file size limit.

Pass `contentType` so the correct per-file cap is used: `application/zip` archive uploads are checked against the larger `maxArchiveBytes`, everything else against `maxFileBytes`. Use the same `contentType` you pass to `upload()`. Equivalent to:

```typescript
const q = await RundotGameAPI.files.getQuota()
const cap = contentType === 'application/zip' ? q.maxArchiveBytes : q.maxFileBytes
return sizeBytes <= q.availableBytes && sizeBytes <= cap
```

```typescript
// normal upload
await RundotGameAPI.files.hasStorageAvailable(imageBlob.size)
// archive upload destined for server-side extraction
await RundotGameAPI.files.hasStorageAvailable(zipBlob.size, 'application/zip')
```

### `transform(params: TransformParams): Promise<TransformResult>`

Server-side media processing. Every op runs asynchronously via the job system — the server accepts the request and returns a job, and the SDK awaits completion before resolving, so from the caller's side `transform` is a single `await` for all ops. If you need to recover a result across sessions (e.g. the player closes the app mid-transform), use `getCompletedJobs()`.

Single-output transforms use public delivery only when every input is public; if any input is private, the output is private. Archive extraction follows the archive's delivery mode. Public outputs use fresh immutable object paths, while private outputs use signed, non-cacheable delivery.

`transform` is overloaded by op. Every single-output op returns a `TransformResult`. The `unzip` op fans out to many keys, so a literal `{ op: 'unzip' }` call resolves to `Promise<ArchiveExtractResult>` (a manifest) instead:

```typescript
transform(params: ArchiveExtractParams): Promise<ArchiveExtractResult>   // op: 'unzip'
transform(params: TransformParams): Promise<TransformResult>             // all other ops
```

```typescript
type TransformOp =
  | 'concat' | 'trim' | 'thumbnail' | 'frameExtract' | 'upscale' | 'copy'
  | 'fade' | 'split' | 'audioMix' | 'audioTrim' | 'overlay' | 'unzip'

type TransformParams =
  | { op: 'concat'; inputs: string[]; outputKey: string; deleteInputs?: boolean; clientRef?: string }
  | { op: 'trim'; input: string; outputKey: string; startMs: number; endMs: number; clientRef?: string }
  | { op: 'thumbnail'; input: string; outputKey: string; atMs?: number; width?: number; height?: number; clientRef?: string }
  | { op: 'frameExtract'; input: string; outputKey: string; atMs?: number | 'last'; width?: number; height?: number; clientRef?: string }
  | { op: 'upscale'; input: string; outputKey: string; targetResolution?: '720p' | '1080p'; model?: 'standard-v2' | 'low-resolution-v2' | 'cgi' | 'high-fidelity-v2' | 'recovery-v2'; sharpen?: number; denoise?: number; faceEnhancement?: boolean; outputFormat?: 'png' | 'jpeg'; clientRef?: string }
  | { op: 'copy'; input: string; outputKey: string; clientRef?: string }
  | { op: 'fade'; input: string; outputKey: string; fadeInMs?: number; fadeOutMs?: number; audioFade?: boolean; clientRef?: string }
  | { op: 'split'; input: string; outputKey: string; segments: Array<{ startMs: number; endMs: number }>; clientRef?: string }
  | { op: 'audioMix'; videoInput: string; audioInput: string; outputKey: string; audioFadeOutMs?: number; audioStartMs?: number; videoVolume?: number; audioVolume?: number; clientRef?: string }
  | { op: 'audioTrim'; input: string; outputKey: string; maxDurationSec: number; clientRef?: string }
  | { op: 'overlay'; input: string; overlay: string; outputKey: string; position?: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'; scale?: number; margin?: number; opacity?: number; clientRef?: string }
  | ArchiveExtractParams   // op: 'unzip'

interface TransformResult {
  jobId: string
  entry: FileEntry   // output file with mediaMetadata populated
}
```

All ops behave the same way from the caller's side (submitted as a job, awaited by the SDK); they differ only in what they do and how long they take.

| Operation | Description |
|-----------|-------------|
| `concat` | Concatenate multiple audio/video files into one |
| `trim` | Extract a time range from audio/video (stream copy: fast but may have imprecise cut points) |
| `thumbnail` | Extract a still frame from video as an image |
| `frameExtract` | Extract a frame at a specific time (or `'last'`), with optional resize |
| `upscale` | AI upscale image/video to 720p or 1080p. When `model` is specified, uses Topaz advanced upscaler |
| `copy` | Server-side duplicate of a file to a new key |
| `fade` | Apply video fade-in/out with optional audio fade. Re-encodes to H.264/AAC |
| `split` | Extract and concatenate multiple time segments from a single file. Re-encodes |
| `audioMix` | Mix an audio track into a video. Supports delay, fade-out, and per-track volume. Video is stream-copied when it is already H.264/HEVC, otherwise re-encoded to H.264 |
| `audioTrim` | Re-encode audio to an exact max duration in MP3. Produces exact-second boundaries (unlike `trim` which uses stream copy) |
| `overlay` | Composite an image (e.g. a transparent-PNG watermark) onto a video, anchored to a corner. Re-encodes video to H.264; audio is stream-copied |
| `unzip` | Extract a ZIP archive into individual Files entries under a prefix. Returns an `ArchiveExtractResult` manifest, not a `TransformResult`. Gated server-side (allowlisted app + entitlement) |

The optional `clientRef` is echoed back in `FilesJobEvent` when polling `getCompletedJobs()`, useful for correlating async results across sessions.

Every media child process the server spawns is capped on wall clock, under two separate deadlines: **10 minutes** for an ffmpeg encode, and **30 seconds** for an ffprobe metadata read — including the probe run on transform inputs and outputs, since reading container headers off a local file is sub-second and a stalled probe should not hold a job for minutes. Exceeding either kills the process and fails the transform job with code `TRANSFORM_TIMEOUT`, so you can pre-check input size/duration and retry with a trimmed or downscaled input. A timed-out probe is never reported as "this file has no metadata": the transform fails rather than silently continuing with degraded encoder settings. Neither cap applies to `upscale`, which is a provider HTTP call rather than ffmpeg and carries the provider's own job deadline.

Outside transforms the probe cap is deliberately not fatal everywhere: a probe timeout while confirming an `upload` is logged and tolerated (the bytes are already stored, only the optional `width`/`height`/`durationMs` metadata is lost), while video generation with `audioReferences` fails the request, because it needs the reference's duration.

#### Audio Trim

Re-encode audio to an exact max duration. Outputs MP3 with precise second boundaries: required for Seedance `audioReferences` which reject stream-copied trims.

```typescript
const trimmed = await RundotGameAPI.files.transform({
  op: 'audioTrim',
  input: 'voice-sample.mp3',
  outputKey: 'voice-5s.mp3',
  maxDurationSec: 5,
})
// trimmed.entry.url → exact 5-second MP3
```

`maxDurationSec` must be between 1 and 30.

#### Upscale with AI Model

Use the `model` parameter for higher-quality AI upscaling with configurable sharpening and denoising:

```typescript
const upscaled = await RundotGameAPI.files.transform({
  op: 'upscale',
  input: 'hero-lowres.png',
  outputKey: 'hero-hires.png',
  model: 'standard-v2',
  sharpen: 0.3,
  denoise: 0.2,
})
```

Available models: `standard-v2` (default), `low-resolution-v2`, `cgi`, `high-fidelity-v2`, `recovery-v2`. Without `model`, uses the basic Topaz enhancer.

Two more optional knobs on the `upscale` op:

- `faceEnhancement?: boolean` (default `true`) runs a face-restoration pass that sharpens facial detail on portraits and characters. It runs by default; set `faceEnhancement: false` to skip it for non-face imagery.
- `outputFormat?: 'png' | 'jpeg'` (default `'png'`) sets the encoding of the upscaled output. Use `'jpeg'` for smaller photographic outputs; keep `'png'` when you need lossless detail or transparency.

#### Fade

Apply fade-in and/or fade-out to video, with optional audio fade. Re-encodes to H.264/AAC.

```typescript
const faded = await RundotGameAPI.files.transform({
  op: 'fade',
  input: 'clip.mp4',
  outputKey: 'clip-faded.mp4',
  fadeInMs: 500,
  fadeOutMs: 1000,
  audioFade: true,
})
```

#### Split

Extract and concatenate multiple time segments from a single file.

```typescript
const highlights = await RundotGameAPI.files.transform({
  op: 'split',
  input: 'full-match.mp4',
  outputKey: 'highlights.mp4',
  segments: [
    { startMs: 5000, endMs: 12000 },
    { startMs: 45000, endMs: 52000 },
  ],
})
```

#### Audio Mix

Mix an audio track into a video with optional delay, fade-out, and independent volume control for each track. When the video is already H.264 or HEVC its stream is copied through untouched, so `audioMix` is fast and lossless on the picture; the output then keeps the input's video bitrate, which may make it slightly larger than a re-encoded file. Any other video codec is re-encoded to H.264. `videoInput` must be a video — passing an audio or image key fails the job with a validation error.

```typescript
const mixed = await RundotGameAPI.files.transform({
  op: 'audioMix',
  videoInput: 'gameplay.mp4',
  audioInput: 'narration.mp3',
  outputKey: 'gameplay-narrated.mp4',
  audioStartMs: 2000,      // delay before the mixed-in track starts
  audioFadeOutMs: 1500,    // fade the mixed-in track out at the end
  videoVolume: 0.3,        // gain on the video's existing audio, default 1.0
  audioVolume: 0.8,        // gain on `audioInput`, default 1.0
})
```

`audioVolume` scales the incoming `audioInput` track before its fade-out is applied, so you do not need to pre-bake gain client-side — upload a compressed MP3 and set the level here. If the video has no audio stream of its own, `audioInput` becomes the output's only track and `videoVolume` has no effect. Both volumes are gains in the range `0`–`10`; anything outside that (or `NaN`/`Infinity`) is rejected with a 400.

The output always runs for the full length of the video. An `audioInput` longer than the video is truncated at the end of the video; one *shorter* than the video is padded with silence to the end. If the video has no audio stream *and* its duration cannot be read from the container, the job fails rather than emit an output that violates that guarantee.

#### Overlay

Composite an image onto a video — e.g. burn a watermark onto a downloadable export. The overlay is scaled to a fraction of the frame width (aspect ratio preserved), anchored to a corner with a pixel margin. Video re-encodes to H.264; the audio stream is copied untouched.

```typescript
const marked = await RundotGameAPI.files.transform({
  op: 'overlay',
  input: 'episode-final.mp4',
  overlay: 'watermark.png',      // a Files key, transparent PNG recommended
  outputKey: 'episode-final-watermarked.mp4',
  position: 'bottomRight',       // default 'bottomRight'
  scale: 0.18,                   // overlay width as a fraction of frame width, default 0.18
  margin: 24,                    // px inset from the anchored edges, default 24
  opacity: 1.0,                  // 0..1, default 1.0
})
```

#### Extract Archive (unzip)

Upload a ZIP archive, then extract it into individual Files entries under a prefix. Each archived file becomes its own Files key at `<outputPrefix>/<path>`. Unlike the single-output ops, `unzip` returns an `ArchiveExtractResult` manifest listing what landed and what was skipped.

`unzip` is **gated server-side** (allowlisted app + entitlement) and runs as a long-running async job; the host allows roughly 15 minutes before timing out. Archive uploads use `application/zip` and are checked against the larger `maxArchiveBytes` cap (see `getQuota`), so call `hasStorageAvailable(zipBlob.size, 'application/zip')` before uploading.

```typescript
const manifest = await RundotGameAPI.files.transform({
  op: 'unzip',
  input: 'sprites.zip',
  outputPrefix: 'sprites',
})
// manifest.created → [{ path, key, sizeBytes, contentType }, ...]
// manifest.skipped → [{ path, reason, bytes? }, ...]  e.g. surface as "N media skipped"
```

```typescript
type ArchiveExtractParams = {
  op: 'unzip'
  input: string         // key of the uploaded ZIP
  outputPrefix: string  // Files prefix the extracted entries are written under
  clientRef?: string    // echoed back in FilesJobEvent
}

interface ArchiveExtractResult {
  created: ArchiveExtractEntry[]   // Files keys written under outputPrefix
  skipped: ArchiveSkippedEntry[]   // entries intentionally not written, with reasons
}

interface ArchiveExtractEntry {
  path: string         // relative POSIX path inside the archive
  key: string          // Files key written (`<outputPrefix>/<path>`)
  sizeBytes: number
  contentType: string
}

interface ArchiveSkippedEntry {
  path: string
  reason: 'oversize' | 'unsupported' | 'invalid-path'
  bytes?: number       // declared size of the archived entry
}
```

### `exportToCloudinary(params: ExportToCloudinaryParams): Promise<CloudinaryExportResult>`

Export a stored file to Cloudinary. Runs asynchronously via the job system; the SDK awaits completion when the server returns a pending job. Returns the resolved Cloudinary URL and public ID. Emits a `FilesJobEvent` with `type: 'fileExportCloudinary'`, so you can also recover the result via `getCompletedJobs()`.

```typescript
interface ExportToCloudinaryParams {
  key: string         // source file to export
  publicId?: string   // optional Cloudinary public ID (server picks one if omitted)
  folder?: string     // optional Cloudinary folder
}

interface CloudinaryExportResult {
  secureUrl: string   // the HTTPS Cloudinary URL
  publicId: string    // the resolved Cloudinary public ID
}
```

### `getCompletedJobs(): Promise<FilesJobEvent[]>`

Poll for completed async jobs (`confirmUpload`, `upscale`, `transform`, `unzip`, `exportToCloudinary`) that finished since last poll. Useful for recovering results after the player leaves and returns.

```typescript
interface FilesJobEvent {
  jobId: string
  type: 'fileConfirm' | 'upscale' | 'transform' | 'fileExportCloudinary' | 'archiveExtract'
  status: 'completed' | 'failed'
  clientRef?: string                      // echoed from request
  params: Record<string, unknown>
  result?: FileEntry | TransformResult | CloudinaryExportResult | ArchiveExtractResult  // present when completed
  error?: string | { code: string; message: string }  // present when failed
}
```

The `result` shape depends on `type`: `fileConfirm` returns a `FileEntry`, `upscale`/`transform` return a `TransformResult`, `fileExportCloudinary` returns a `CloudinaryExportResult`, and `archiveExtract` (the `unzip` op) returns an `ArchiveExtractResult`. The `error` field may be a plain string or a structured `{ code, message }` object, so handle both shapes when parsing job failures.

## Types

```typescript
interface FileEntry {
  key: string
  sizeBytes: number
  contentType: string
  visibility: 'private' | 'public'
  url: string          // stable public URL, or signed private URL
  urlExpiresAt?: number // epoch ms; present only for private signed URLs
  createdAt: string    // ISO 8601
  updatedAt: string
  mediaMetadata?: MediaMetadata
}

interface MediaMetadata {
  width?: number        // images and video
  height?: number
  durationMs?: number   // video and audio
  codec?: string        // e.g. 'h264', 'vp9', 'aac'
}
```

## File Visibility

Files are **public by default**. Omitting `visibility` creates an immutable public object with a stable URL. Pass `visibility: 'private'` when the bytes must remain private; private entries use a four-hour signed URL and `private, no-store` cache metadata.

Public URLs are bearer URLs: anyone who obtains one can fetch the object until that immutable object is reaped. Do not use public delivery for secrets or content that requires immediate revocation. Setting a file to `private` changes future API responses and deletes the old public object after the metadata swap, but it cannot recall bytes already cached by a browser or intermediary.

This enables the **UGC + Files pattern**: upload a video using the default public visibility, store `{ key, profileId }` in UGC data, and other players resolve the content via `getUrl({ key, targetProfileId })`.

### Read URL lifetime and caching

`FileEntry.url` and the URLs returned by `getUrls` are resolved according to the file's delivery mode:

- **Public:** an unsigned, stable GCS URL with no expiry field. The object is prepared with `Cache-Control: public, max-age=31536000, immutable`, and public overwrites use a new object path so a cached URL never points at replacement bytes.
- **Private:** a V4 signed URL with a four-hour lifetime, plus `urlExpiresAt` containing the epoch-millisecond expiry. The object uses `Cache-Control: private, no-store`.

For `getUrls` and `batchGetMetadata`, `ttlMs` is `0` when every returned entry is public. If any returned entry is private, `ttlMs` is the time left on the **soonest-expiring** URL in the batch, which is the safe refresh interval for it. Treat it as a remaining budget, not a constant: the server reuses a signed URL for much of its four-hour life, so a batch can legitimately come back with well under four hours on it.

`list` is the exception: it never returns a signed URL, so a list entry's `url` is either a stable public URL or absent. See [`list`](#list-params-listparams-promise-listresult).

The signed URL lifetime is an authorization lifetime, not a browser-cache lifetime.

## Cross-App Reads

Apps by the same creator can read each other's files: `getUrl({ key: 'avatar.png', targetAppId: 'sibling-app' })`. The server validates that both apps share the same `ownerUserId`. Writes are always scoped to the current app.

## Content Moderation

Files are moderated when made public: either at upload time via `visibility: 'public'` or later via `setVisibility`. Private files are not moderated since only the owner can access them.

- **Images** are scanned via Vision SafeSearch
- **Videos** are scanned via Video Intelligence

If moderation rejects the content, the file cannot be made public. The error code `FILES_CONTENT_REJECTED` includes the rejection category.

## Key Rules

- **1–256 bytes** UTF-8
- No path separators (`/`, `\`)
- No `..`, no leading `.`
- No control characters
- Keys are unique per (app, player): uploading with an existing key overwrites

## Allowed Content Types

`image/png`, `image/jpeg`, `image/webp`, `audio/mpeg`, `audio/wav`, `audio/ogg`, `video/mp4`, `video/webm`, `video/quicktime`, `application/octet-stream`, `application/json`, `text/plain`

## Storage Quotas

Storage caps are tied to the **game creator's entitlement tier** (driven by the
creator's credit subscription), not the player:

| Entitlement Tier | Storage Cap |
|-------------|------------|
| `free`    | 1 GB |
| `creator` | 5 GB |
| `plus`    | 25 GB |
| `pro`     | 100 GB |
| `power`   | 500 GB |
| `max`     | 50 TB |

The cap is **global** across all of a creator's apps. Use `getQuota()` or `hasStorageAvailable()` to check before uploading.

## Rate Limits

File API calls are rate-limited per creator entitlement tier. **Reads and writes have separate budgets**; loading files won't prevent uploads, and vice versa.

| Tier      | Reads (RPM) | Writes (RPM) |
|-----------|-------------|--------------|
| `free`    | 40          | 20           |
| `creator` | 60          | 30           |
| `plus`    | 150         | 60           |
| `pro`     | 400         | 150          |
| `power`   | 1200        | 600          |
| `max`     | 3000        | 1200         |

**Read endpoints:** `getUrl`, `getUrls`, `getMetadata`, `exists`, `list`, `batchGetMetadata`, `batchExists`

**Write endpoints:** `upload`, `batchUpload`, `confirmUpload`, `batchConfirm`, `delete`, `setVisibility`, `exportToCloudinary`

Batch calls count as **one request** regardless of how many keys are included (up to 50). Prefer batch methods to reduce rate limit consumption.

## Limits

| Limit | Value |
|-------|-------|
| Per-file size | 50 MB (configurable) |
| Per-creator global | Tier-dependent (see above) |
| Upload URL TTL | 15 minutes |
| Private read URL TTL | 4 hours |
| Public cache freshness | 1 year, immutable |
| Pending upload timeout | 30 minutes |
| Batch max keys | 50 |

## Error Codes

| Code | Raised when |
|------|------------|
| `FILES_INVALID_KEY` | Key fails validation. |
| `FILES_INVALID_CONTENT_TYPE` | Content type not in the allowlist. |
| `FILES_FILE_TOO_LARGE` | `sizeBytes` exceeds the per-file cap. |
| `FILES_CREATOR_QUOTA_EXCEEDED` | Upload would push the creator past their storage cap. |
| `FILES_CREATOR_NOT_RESOLVED` | Game has no `ownerUserId`. |
| `FILES_NOT_FOUND` | No active file with this key (or private file accessed by non-owner). |
| `FILES_UPLOAD_NOT_CONFIRMED` | `confirmUpload` called but cloud object missing or size mismatch. |
| `FILES_RATE_LIMITED` | Request rate exceeded. Throws `RateLimitedError` with `retryAfterMs`. |
| `FILES_CROSS_APP_DENIED` | Cross-app read denied (different creator). |
| `FILES_INVALID_CURSOR` | A `list` cursor points at a file that no longer exists. Restart the listing without a cursor. |
| `FILES_CONTENT_REJECTED` | Content moderation rejected the upload. |
| `TRANSFORM_TIMEOUT` | A `transform` job's ffmpeg/ffprobe step exceeded the 10-minute cap and was killed. |

## Differences from Storage API

| | Storage API | Files API |
|---|---|---|
| **Data type** | Strings only | Binary blobs |
| **Max value** | ~977 KiB | 50 MB |
| **Transfer** | Through Cloud Run | Direct to cloud storage |
| **Quota** | Per-bucket limits | Creator-funded, tier-based |
| **Moderation** | None | Image + video scanned at public-visibility boundary |
| **Use case** | Settings, progress, small state | Images, audio, video, large saves |

Use Storage API for small string data. Use Files API for binary assets.
