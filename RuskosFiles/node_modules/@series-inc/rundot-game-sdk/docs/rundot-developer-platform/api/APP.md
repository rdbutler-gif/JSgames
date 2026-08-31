# App API (BETA)

Server-verified role detection and admin moderation tools for game owners and editors.

---

## Overview

The App API lets your game detect whether the current player is a member of the development team and, if so, perform admin operations like content moderation.

Roles are **server-verified**: the backend checks the user's Firebase Auth email against the game's owner and editor list. There is no client-side role assignment to tamper with.

**Key Features:**
- Detect whether the current user is an owner, editor, or regular player
- Browse and remove UGC entries as an admin
- Browse and remove AI-generated content as an admin: images, video, sprites, audio, and 3D models
- Review and resolve player reports across every content type

---

## Role Detection

### Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

const role = await RundotGameAPI.app.getMyRole()

if (role === 'owner' || role === 'editor') {
  showAdminPanel()
} else {
  showPlayerUI()
}
```

### `getMyRole()`

Returns the current user's role for this game.

```typescript
const role: AppRole = await RundotGameAPI.app.getMyRole()
```

**Returns:** `'owner' | 'editor' | 'none'`

| Role | Meaning |
|------|---------|
| `owner` | The user's email matches the game's owner email |
| `editor` | The user's email is in the game's editor list |
| `none` | No match, anonymous user, or game not found |

> **Security:** Roles are resolved server-side from the verified Firebase ID token. Anonymous users and unrecognized emails always receive `'none'`.

---

## Launch Intent

`RundotGameAPI.app.resolveLaunchIntent()` is the single, supported way to find out **how your game was launched** — from a share link, a deep link, a notification tap, or a cold/organic start. It replaces the deprecated `RundotGameAPI.context.{launchParams,shareParams,notificationParams,shareLinkId}` snapshot fields (removed in v6.0.0).

### Why a method (and not a field)?

There are two classes of launch intent:

* **Class A — deterministic.** An OS universal link, a URI scheme, a notification tap, or an already-attached share link. These are known at (or near) boot, so `resolveLaunchIntent()` returns them with ~0 wait regardless of `maxWaitMs`.
* **Class B — deferred.** Post-install attribution (AppsFlyer). This resolves **asynchronously** — on iOS it can be postponed up to ~15s by the ATT prompt — so a fresh share install often resolves *after* `INIT_SDK` already returned. A one-shot `context` snapshot is empty in this case; this is exactly the gap `resolveLaunchIntent` closes.

`maxWaitMs` is **your** patience budget: the host returns the intent as soon as the launch route resolves, but waits no longer than your budget. If it hasn't resolved in time you get `{ kind: 'timed_out' }` — which is **not** terminal. Call again to keep waiting; once the signal settles, every call returns it instantly.

### `resolveLaunchIntent(options?)`

```typescript
const intent: LaunchIntent = await RundotGameAPI.app.resolveLaunchIntent({
  maxWaitMs: 800, // optional; omit for the platform default. Clamped host-side.
})
```

**Returns:** `Promise<LaunchIntent>`. The host **always resolves** a `LaunchIntent` (it never rejects with a launch-intent value). Like every RPC, the promise can still reject on transport-level failures (a host too old to support the message, or the RPC call timeout) — handle that the same way you handle any other SDK rejection; it is distinct from a `timed_out` intent.

```typescript
type LaunchIntentKind = 'share' | 'deeplink' | 'notification' | 'none' | 'timed_out'

interface LaunchIntent {
  kind: LaunchIntentKind
  shareLinkId?: string             // present for kind === 'share'
  sharerId?: string                // sharer's profile id, for kind === 'share'
  params: Record<string, string>   // flat share / deeplink / notification payload
}
```

| `kind` | Meaning |
|--------|---------|
| `share` | Launched from a share link. `shareLinkId`, `sharerId`, and the share payload (in `params`) are populated. |
| `deeplink` | Generic deep link (OS initial URL, google-ads `af_dp`, runtime URL). `params` carries the route params. |
| `notification` | Launched by tapping a notification. `params` carries the notification payload. |
| `none` | The host **definitively** reported no launch link (organic install / resolution completed with no route). Terminal. |
| `timed_out` | Your budget elapsed before any answer. **Indeterminate and re-callable** — call again to keep waiting. |

### Canonical pattern (handles deferred deep links)

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

let intent = await RundotGameAPI.app.resolveLaunchIntent({ maxWaitMs: 800 })

// Keep waiting only while it's still resolving and you're willing to wait.
while (intent.kind === 'timed_out' && stillWaiting()) {
  intent = await RundotGameAPI.app.resolveLaunchIntent({ maxWaitMs: 1500 })
}

if (intent.kind === 'share') {
  routeToShared(intent.shareLinkId, intent.sharerId, intent.params)
} else {
  startNormally() // 'deeplink' / 'notification' / 'none' / gave-up 'timed_out'
}
```

`maxWaitMs: 0` means "return what's known now, don't wait." A value above the host ceiling is clamped.

{% hint style="warning" %}
**Delete any `setTimeout`-based polling for share/launch params.** The old workaround — waiting a few seconds before reading `context.shareParams` to give a deferred deep link time to land — is no longer needed and should be removed. `resolveLaunchIntent({ maxWaitMs })` is the deterministic replacement: it returns the instant the host resolves the route and bounds the wait to your budget.
{% endhint %}

---

## Admin UGC

Available at `RundotGameAPI.app.adminUgc`. All methods require the caller to be an owner or editor; the server returns `403 Forbidden` otherwise.

### Browse All Entries

Browse all UGC entries for your game, including non-public entries that the player-facing `ugc.browse()` hides.

```typescript
const { entries, nextCursor } = await RundotGameAPI.app.adminUgc.browse({
  contentType: 'character',   // Optional: filter by content type
  authorId: 'some-profile',   // Optional: filter by author
  isPublic: false,            // Optional: filter by visibility (omit to see all)
  sortBy: 'recent',           // 'recent' | 'mostLiked' | 'mostUsed'
  sortOrder: 'desc',          // 'asc' | 'desc'
  limit: 20,                  // Max entries per page
  cursor: nextCursor,         // Pagination cursor from previous response
})

for (const entry of entries) {
  console.log(`${entry.title} by ${entry.authorName} (public: ${entry.isPublic})`)
}
```

#### Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `contentType` | `string \| string[]` | - | Filter by app-defined content type. Pass an array to match any of several types in one query (e.g. `['character', 'level']`). |
| `authorId` | `string` | - | Filter by author profile ID |
| `isPublic` | `boolean` | - | Filter by visibility; omit to see all |
| `sortBy` | `string` | `'recent'` | Sort field: `'recent'`, `'mostLiked'`, `'mostUsed'` |
| `sortOrder` | `'asc' \| 'desc'` | `'desc'` | Sort direction |
| `limit` | `number` | `20` | Max entries per page (max 100) |
| `cursor` | `string` | - | Pagination cursor |
| `filters` | `Record<string, unknown>` | - | Custom indexed field filters (fields must have `idx_` prefix) |

### Remove an Entry

Soft-delete any entry regardless of author. The entry's record is marked as `status: 'removed'` and excluded from all player-facing queries. The content is **not permanently deleted**; it can be reviewed later.

```typescript
await RundotGameAPI.app.adminUgc.removeEntry('entry-id-to-remove')
```

### List Reports

Browse player-submitted reports for UGC content, with optional status filtering.

```typescript
const { reports, nextCursor } = await RundotGameAPI.app.adminUgc.listReports({
  status: 'pending',  // Optional: 'pending' | 'reviewed' | 'dismissed'
  limit: 20,          // Optional: max reports per page
  cursor: nextCursor, // Optional: pagination cursor from a previous response
})

for (const report of reports) {
  console.log(`Report on entry ${report.entryId}: ${report.reason}`)
  console.log(`  Status: ${report.status}, Filed: ${new Date(report.createdAt)}`)
}
```

#### Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | `'pending' \| 'reviewed' \| 'dismissed'` | - | Filter by report status; omit to see all |
| `cursor` | `string` | - | Pagination cursor from a previous response's `nextCursor` |
| `limit` | `number` | - | Max reports per page |

### Resolve a Report

Update a report's status after reviewing it. The `action` argument accepts only `'reviewed'` or `'dismissed'` (there is no `'pending'` option when resolving).

```typescript
// Mark as reviewed (acknowledged, action taken)
await RundotGameAPI.app.adminUgc.resolveReport('report-id', 'reviewed')

// Dismiss (no action needed)
await RundotGameAPI.app.adminUgc.resolveReport('report-id', 'dismissed')
```

---

## Admin ImageGen

Available at `RundotGameAPI.app.adminImageGen`. All methods require the caller to be an owner or editor.

### Browse Generated Images

Browse all AI-generated images for your game with optional filtering by creator or status.

```typescript
const { entries, nextCursor } = await RundotGameAPI.app.adminImageGen.browse({
  profileId: 'some-user',   // Optional: filter by creator
  status: 'active',         // Optional: 'active' | 'removed' (omit to see all)
  sortOrder: 'desc',        // 'asc' | 'desc'
  limit: 20,
})

for (const entry of entries) {
  console.log(`"${entry.prompt}" by ${entry.profileId}`)
  console.log(`  Status: ${entry.status}, Model: ${entry.model}`)
}
```

#### Parameters

These are the shared `AdminGenBrowseParams`: the same shape applies to every admin-gen namespace (`adminImageGen`, `adminVideoGen`, `adminSpriteGen`, `adminAudioGen`, `adminThreeDGen`).

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `profileId` | `string` | - | Filter by creator profile ID |
| `status` | `'active' \| 'removed'` | - | Filter by status; omit to see all |
| `sortOrder` | `'asc' \| 'desc'` | `'desc'` | Sort direction (by creation time) |
| `limit` | `number` | `20` | Max entries per page (max 100) |
| `cursor` | `string` | - | Pagination cursor |

### Remove a Generated Image

Soft-delete a generated image. The original image is moved to a quarantine area and replaced with a placeholder so existing references don't break with a 404. The record is marked `status: 'removed'`.

```typescript
await RundotGameAPI.app.adminImageGen.removeEntry('generation-id')
```

### List Reports

Browse player-submitted reports for generated images. Reports paginate with `cursor` the same way `browse()` does.

```typescript
const { reports, nextCursor } = await RundotGameAPI.app.adminImageGen.listReports({
  status: 'pending',  // Optional: 'pending' | 'reviewed' | 'dismissed'
  limit: 20,          // Optional
  cursor: nextCursor, // Optional: pagination cursor from a previous response
})

for (const report of reports) {
  console.log(`Report on generation ${report.generationId}: ${report.reason}`)
}
```

### Resolve a Report

The `action` argument accepts only `'reviewed'` or `'dismissed'`.

```typescript
await RundotGameAPI.app.adminImageGen.resolveReport('report-id', 'reviewed')
```

---

## Admin VideoGen

Available at `RundotGameAPI.app.adminVideoGen`. All methods require the caller to be an owner or editor.

This namespace has the same four methods as Admin ImageGen: `browse(params?)`, `removeEntry(generationId)`, `listReports(params?)`, and `resolveReport(reportId, action)`. `browse()` returns `VideoGenEntry` objects.

```typescript
const { entries, nextCursor } = await RundotGameAPI.app.adminVideoGen.browse({
  status: 'active',   // Optional: 'active' | 'removed'
  sortOrder: 'desc',
  limit: 20,
})

for (const entry of entries) {
  console.log(`"${entry.prompt}" (${entry.provider}/${entry.mode})`)
  console.log(`  ${entry.videoUrl} (${entry.durationSeconds}s, ${entry.width}x${entry.height})`)
}

// Moderation
await RundotGameAPI.app.adminVideoGen.removeEntry('generation-id')

const { reports } = await RundotGameAPI.app.adminVideoGen.listReports({ status: 'pending' })
await RundotGameAPI.app.adminVideoGen.resolveReport('report-id', 'reviewed')
```

`browse()` accepts the shared `AdminGenBrowseParams`; `listReports()` accepts `status`, `cursor`, and `limit`.

---

## Admin SpriteGen

Available at `RundotGameAPI.app.adminSpriteGen`. All methods require the caller to be an owner or editor. Same four methods as Admin ImageGen; `browse()` returns `SpriteGenEntry` objects.

```typescript
const { entries, nextCursor } = await RundotGameAPI.app.adminSpriteGen.browse({
  status: 'active',
  limit: 20,
})

for (const entry of entries) {
  console.log(`"${entry.prompt}" (${entry.type})`)
  console.log(`  ${entry.imageUrl}${entry.pixel ? ' (pixel art)' : ''}`)
}

await RundotGameAPI.app.adminSpriteGen.removeEntry('generation-id')
await RundotGameAPI.app.adminSpriteGen.resolveReport('report-id', 'reviewed')
```

---

## Admin AudioGen

Available at `RundotGameAPI.app.adminAudioGen`. All methods require the caller to be an owner or editor. Same four methods as Admin ImageGen; `browse()` returns `AudioGenEntry` objects.

```typescript
const { entries, nextCursor } = await RundotGameAPI.app.adminAudioGen.browse({
  status: 'active',
  limit: 20,
})

for (const entry of entries) {
  console.log(`"${entry.prompt}" (${entry.type})`)
  console.log(`  ${entry.audioUrl} (${entry.durationSec}s)`)
}

await RundotGameAPI.app.adminAudioGen.removeEntry('generation-id')
await RundotGameAPI.app.adminAudioGen.resolveReport('report-id', 'reviewed')
```

---

## Admin ThreeDGen

Available at `RundotGameAPI.app.adminThreeDGen`. All methods require the caller to be an owner or editor. Same four methods as Admin ImageGen; `browse()` returns `ThreeDGenEntry` objects (3D models).

```typescript
const { entries, nextCursor } = await RundotGameAPI.app.adminThreeDGen.browse({
  status: 'active',
  limit: 20,
})

for (const entry of entries) {
  console.log(`${entry.operation} via ${entry.provider}`)
  console.log(`  Model: ${entry.modelUrl}`)
}

await RundotGameAPI.app.adminThreeDGen.removeEntry('generation-id')
await RundotGameAPI.app.adminThreeDGen.resolveReport('report-id', 'reviewed')
```

{% hint style="info" %}
All five generated-content namespaces (`adminImageGen`, `adminVideoGen`, `adminSpriteGen`, `adminAudioGen`, `adminThreeDGen`) share the same `AdminGenApi` shape: identical `browse` / `removeEntry` / `listReports` / `resolveReport` methods and identical params. Only the entry shape returned by `browse()` differs per media type (see the Type Reference below).
{% endhint %}

---

## Building an Admin Panel

Here's a complete example of a simple admin moderation flow:

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

async function initAdminPanel() {
  const role = await RundotGameAPI.app.getMyRole()

  if (role === 'none') {
    return // Not an admin, nothing to show
  }

  // Load pending reports across both UGC and ImageGen
  const [ugcReports, imageGenReports] = await Promise.all([
    RundotGameAPI.app.adminUgc.listReports({ status: 'pending' }),
    RundotGameAPI.app.adminImageGen.listReports({ status: 'pending' }),
  ])

  console.log(`Pending: ${ugcReports.reports.length} UGC, ${imageGenReports.reports.length} ImageGen`)

  // Example: remove a flagged UGC entry and resolve the report
  for (const report of ugcReports.reports) {
    if (report.reason === 'inappropriate') {
      await RundotGameAPI.app.adminUgc.removeEntry(report.entryId)
      await RundotGameAPI.app.adminUgc.resolveReport(report.id, 'reviewed')
    }
  }
}
```

---

## Type Reference

### AppRole

```typescript
type AppRole = 'owner' | 'editor' | 'none'
```

### LaunchIntent

```typescript
type LaunchIntentKind = 'share' | 'deeplink' | 'notification' | 'none' | 'timed_out'

interface LaunchIntent {
  kind: LaunchIntentKind
  shareLinkId?: string
  sharerId?: string
  params: Record<string, string>
}

interface ResolveLaunchIntentOptions {
  maxWaitMs?: number
}
```

### AdminUgcEntry

```typescript
interface AdminUgcEntry {
  id: string
  appId: string
  authorId: string
  authorName: string
  authorAvatarUrl: string | null
  contentType: string
  data: Record<string, unknown>
  createdAt: number
  updatedAt: number
  isPublic: boolean
  title?: string
  tags?: string[]
  useCount?: number
  likeCount?: number
}
```

### UgcReport

```typescript
interface UgcReport {
  id: string
  entryId: string
  appId: string
  reporterId: string
  reason: 'inappropriate' | 'spam' | 'harassment' | 'other'
  details?: string
  createdAt: number   // milliseconds since epoch
  status: 'pending' | 'reviewed' | 'dismissed'
}
```

### ImageGenEntry

```typescript
interface ImageGenEntry {
  id: string
  appId: string
  profileId: string
  prompt: string
  negativePrompt?: string
  aspectRatio: string
  imageUrl: string
  removeBackground: boolean
  model: string
  createdAt: number   // milliseconds since epoch
  status: 'active' | 'removed'
}
```

### ImageGenReport

```typescript
interface ImageGenReport {
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

### VideoGenEntry

Returned by `adminVideoGen.browse()`. `posterUrl` and `generationCostUsd` are optional; `provider` and `mode` are free-form strings.

```typescript
interface VideoGenEntry {
  id: string
  appId: string
  profileId: string
  provider: string
  mode: string
  prompt: string
  videoUrl: string
  posterUrl?: string
  durationSeconds: number
  width: number
  height: number
  generationCostUsd?: number
  createdAt: number   // milliseconds since epoch
  status: 'active' | 'removed'
}
```

### SpriteGenEntry

Returned by `adminSpriteGen.browse()`. `type` distinguishes a still sprite (`'generate'`) from an animated sprite sheet (`'animate'`); every field except `id`, `appId`, `profileId`, `type`, `prompt`, `imageUrl`, `createdAt`, and `status` is optional.

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
  creditsUsed?: number
  createdAt: number   // milliseconds since epoch
  status: 'active' | 'removed'
}
```

### AudioGenEntry

Returned by `adminAudioGen.browse()`. `type` is the kind of audio; duration is `durationSec`. `model` and `voiceId` are optional.

```typescript
interface AudioGenEntry {
  id: string
  appId: string
  profileId: string
  type: 'sfx' | 'music' | 'tts'
  provider: string
  prompt: string
  audioUrl: string
  durationSec: number
  model?: string
  voiceId?: string
  createdAt: number   // milliseconds since epoch
  status: 'active' | 'removed'
}
```

### ThreeDGenEntry

Returned by `adminThreeDGen.browse()`. Unlike the other entries, `prompt` is optional here (a 3D asset can come from an operation other than a text prompt). `modelUrl` is the required asset URL; `rawModelUrl`, `mode`, `quality`, and `estimatedCostUsd` are optional.

```typescript
interface ThreeDGenEntry {
  id: string
  appId: string
  profileId: string
  operation: string
  provider: string
  mode?: string
  quality?: string
  prompt?: string
  modelUrl: string
  rawModelUrl?: string
  estimatedCostUsd?: number
  createdAt: number   // milliseconds since epoch
  status: 'active' | 'removed'
}
```

### VideoGenReport, SpriteGenReport, AudioGenReport, ThreeDGenReport

The report shape is the same for every generated-content namespace. `VideoGenReport`, `SpriteGenReport`, `AudioGenReport`, and `ThreeDGenReport` are each identical to `ImageGenReport`: `generationId` points at the offending entry; `reason` is one of the four enum values; `status` tracks moderation state.

```typescript
interface VideoGenReport {  // same fields for Sprite / Audio / ThreeD
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

