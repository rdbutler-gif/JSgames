# Sharing API

Store shared content and create share parameters. Recipients can jump straight into your content.

{% hint style="warning" %}
All SDK methods can reject. Unhandled rejections crash the app. Always wrap SDK calls in `try/catch` or attach a `.catch()` handler. See [Error Handling](../error-handling.md) for details.
{% endhint %}

Here are some examples for what you might use it for:

* Store a user-created level and share a link to it, allowing anyone to play it
* Generate a challenge, like "Can you beat my score?"
* Generate a QR code for in-person content sharing.

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

const { shareUrl, shareLinkId } = await RundotGameAPI.social.shareLinkAsync({
  shareParams: {
    challengeType: 'highscore',
    scoreToBeat: '1500',
    challengerId: RundotGameAPI.getProfile().id,
  },
  metadata: {
    title: 'Beat my score!',
    description: 'Can you top 1500 points?',
    imageUrl: 'https://cdn.example.com/share-highscore.png',
  },
})

console.log('Shared link:', shareUrl)
console.log('Share handle:', shareLinkId)
```

`shareLinkAsync` resolves to `{ shareUrl, shareLinkId }`. On mobile (iOS/Android) it opens the native share sheet; on web it copies the share URL to the clipboard (with a fallback toast). Use `shareUrl` for telemetry or custom UI; no additional modal call is required. Keep `shareLinkId` around if you want to attach or read click data later (see [Click Tracking](#click-tracking-beta)).

### Share metadata

The optional `metadata` object holds OpenGraph values that social networks use to render rich link previews (Twitter, iMessage, etc.). The same shape is accepted by `shareLinkAsync`, `createQRCodeAsync`, and [`composeSocialPostAsync`](#compose-options). Every field is optional.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | `string` | No | Preview title shown in link cards. |
| `description` | `string` | No | Preview description shown under the title. |
| `imageUrl` | `string` | No | Preview image URL. Must be an HTTPS URL for most social platforms to render the card. |

{% hint style="info" %}
`metadata.imageUrl` must be served over HTTPS. Most social platforms drop the preview image for non-HTTPS URLs.
{% endhint %}

### Pretty link slugs

Share links look like `https://w.run/s/k7Qp2x9`. You can append an optional, human-readable `slug` to the end — `https://w.run/s/k7Qp2x9/boss-level` — by passing it to `shareLinkAsync` or `createQRCodeAsync`:

```typescript
const { shareUrl } = await RundotGameAPI.social.shareLinkAsync({
  shareParams: { level: 'boss' },
  slug: 'Boss Level',
})
// shareUrl → https://w.run/s/k7Qp2x9/boss-level
```

The slug is **purely cosmetic**:

- It is sanitized server-side (lowercased, spaces/punctuation collapsed to hyphens, truncated). `"Boss Level"` becomes `boss-level`.
- It does **not** need to be unique — the same slug may appear on many links.
- It has **no** effect on resolution. The short code (`k7Qp2x9`) alone identifies the share; the slug is ignored when the link is opened.
- If it sanitizes to empty or is rejected by moderation, it is silently dropped and the link is returned without a slug segment (the share is still created).

Previously issued links remain valid; this only changes the shape of newly created ones.

## QR Codes

```typescript
const { shareUrl, qrCode, shareLinkId } = await RundotGameAPI.social.createQRCodeAsync({
  shareParams: {
    challengeType: 'daily',
    dailyPuzzleId: '2024-11-04',
  },
  metadata: {
    title: 'Daily Challenge',
    description: 'Scan to play today!',
  },
  qrOptions: {
    size: 512,
    margin: 4,
    format: 'png',
  },
})

document.querySelector('#qr').src = qrCode
```

`createQRCodeAsync` resolves to `{ shareUrl, qrCode, shareLinkId }`, so you get the underlying link alongside the QR image and don't need a second call to reuse it. It only returns data; display or share the image yourself. Pair it with an on-screen `<img>` element, print asset, or custom UI element.

### QR options

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `size` | `number` | No | `256` | QR image size in pixels. |
| `margin` | `number` | No | `2` | Quiet-zone margin around the QR code, in pixels. |
| `format` | `'png' \| 'svg'` | No | `'png'` | Output format. `png` returns a `data:image/png` URL; `svg` returns a `data:image/svg+xml` URL. |

## Interpreting share intent on Game Start

The data stored when creating a share link is delivered to your game via [`RundotGameAPI.app.resolveLaunchIntent()`](APP.md#launch-intent). Read it on boot — this is the supported path and, unlike the deprecated `context.shareParams` snapshot, it correctly handles **deferred** share links (fresh installs whose attribution resolves asynchronously).

```typescript
const intent = await RundotGameAPI.app.resolveLaunchIntent({ maxWaitMs: 800 })
if (intent.kind === 'share' && intent.params.challengeType === 'highscore') {
  startHighScoreChallenge(parseInt(intent.params.scoreToBeat, 10), intent.params.challengerId)
}
```

Share params are fully custom. Define the schema your game needs (`challengeType`, `dailyPuzzleId`, `referredBy`, etc.) and decode when the experience boots.

{% hint style="warning" %}
Share params are typed `Record<string, string>`: every value must be a string. To carry structured data (objects, arrays, numbers), `JSON.stringify` it before sharing and `JSON.parse` it back from `intent.params` on launch.
{% endhint %}

For example, say you have a game where users can share user-generated content with one another in the form of custom levels. Here is how you might handle share links:

```typescript
const onShare = async (levelData, levelName) => {
  const { shareUrl } = await RundotGameAPI.social.shareLinkAsync({
    shareParams: {
      levelData: JSON.stringify(levelData),
      levelName: levelName
    },
  })
  return shareUrl
}

const onLaunch = async () => {
  const intent = await RundotGameAPI.app.resolveLaunchIntent({ maxWaitMs: 800 })
  if (intent.kind === 'share' && 'levelData' in intent.params) {
    loadLevel(JSON.parse(intent.params.levelData), intent.params.levelName)
  } else {
    loadBlankLevel()
  }
}
```

> A fresh share install on iOS may first return `{ kind: 'timed_out' }` while attribution resolves behind the ATT prompt. Re-call `resolveLaunchIntent` to keep waiting — see the [re-call pattern](APP.md#canonical-pattern-handles-deferred-deep-links).

## Click Tracking (BETA)

Every share (`shareLinkAsync` or `createQRCodeAsync`) returns a `shareLinkId`. Use it to record metadata when a recipient clicks through, then read those clicks back for referral and attribution flows.

{% hint style="warning" %}
Click metadata is readable by any authenticated user who has the `shareLinkId`. Never write PII or sensitive user data. Values are returned verbatim, so escape them before rendering in HTML.
{% endhint %}

### `addShareClickDataAsync(options): Promise<void>`

Write click metadata to a share as the current user (the clicker). Metadata is a full replacement: each call overwrites the entire metadata object for that user, so send the complete set of keys every time you want to preserve prior values.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `shareLinkId` | `string` | Yes | The share to attach metadata to (from `shareLinkAsync` / `createQRCodeAsync`). |
| `metadata` | `Record<string, string>` | Yes | String key-value pairs. Limits: max 20 keys, 64-char keys, 1024-char values, 4 KB total. |

```typescript
// shareLinkId comes from the share you created, or from a share param your
// game stored in shareParams when generating the link.
await RundotGameAPI.social.addShareClickDataAsync({
  shareLinkId,
  metadata: { source: 'qr', referredScore: '1500' },
})
```

### `getShareClicksAsync(options): Promise<{ clicks: ShareClickData[]; truncated: boolean }>`

Query all click data for a share. Returns up to 200 click records ordered by `createdAt` ascending; `truncated` is `true` when that cap was hit.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `shareLinkId` | `string` | Yes | The share to query. |

```typescript
const { clicks, truncated } = await RundotGameAPI.social.getShareClicksAsync({
  shareLinkId,
})
console.log(`${clicks.length} clicks${truncated ? ' (capped at 200)' : ''}`)
```

### `getMyShareClickDataAsync(options): Promise<ShareClickData | null>`

Get the current user's click data for a specific share, or `null` if they haven't clicked it. Useful for one-time referral rewards and "you already redeemed this" checks.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `shareLinkId` | `string` | Yes | The share to query. |

```typescript
const myClick = await RundotGameAPI.social.getMyShareClickDataAsync({
  shareLinkId,
})
if (myClick) {
  console.log('Already clicked at', myClick.createdAt)
}
```

### `ShareClickData`

The return shape for the click-tracking methods.

| Field | Type | Description |
|-------|------|-------------|
| `clickerProfileId` | `string` | Profile ID of the user who recorded the click. |
| `metadata` | `Record<string, string>` | The string key-value pairs written via `addShareClickDataAsync`. |
| `createdAt` | `number` | When the click was first recorded, in epoch milliseconds. |
| `updatedAt` | `number` | When the click metadata was last updated, in epoch milliseconds. |

## File Sharing (BETA)

Share locally-created files (recorded gameplay clips, screenshots, generated images) directly to native share targets (TikTok, Instagram, Messages, etc.) via the Web Share API.

{% hint style="info" %}
File sharing works on **both mobile web and native iOS/Android**. On web, it uses the Web Share API (iOS Safari 15+, Chrome 89+, Edge 89+). On native, it opens the system share sheet via `expo-sharing`. Use `canShareFileAsync` to feature-detect before recording or generating shareable content.

**Native limitation:** `cancelled` is always `false` on iOS/Android; the native share sheet does not report whether the user dismissed it.
{% endhint %}

### Feature Detection

```typescript
const { supported } = await RundotGameAPI.social.canShareFileAsync()
if (supported) {
  showRecordButton()
}
```

### Sharing a File

```typescript
// Share a screenshot as PNG
const pngBlob = canvas.toBlob('image/png')
const result = await RundotGameAPI.social.shareFileAsync({
  data: pngBlob,
  filename: 'screenshot.png',
  mimeType: 'image/png',
  title: 'Check out my score!',
  text: 'I just scored 1500 points!',
})

if (result.cancelled) {
  console.log('User dismissed the share sheet')
}
```

{% hint style="warning" %}
`shareFileAsync` rejects (throws) when the platform does not support file sharing, or when the file fails MIME/size validation. It does not return a soft failure for those cases; `cancelled` only reports user dismissal. Gate calls behind `canShareFileAsync()` and wrap them in `try/catch`.
{% endhint %}

### Share file options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `data` | `Blob \| ArrayBuffer \| string` | Yes | File bytes. `Blob` / `ArrayBuffer` are base64-encoded automatically. A `string` must be raw base64 of the file bytes (see Data formats below). |
| `filename` | `string` | Yes | Filename presented to the share target. |
| `mimeType` | `ShareFileMimeType` | Yes | One of the [accepted file types](#accepted-file-types). Any other value is a compile-time error and a runtime rejection. |
| `title` | `string` | No | Title passed alongside the file to the native share sheet. |
| `text` | `string` | No | Text passed alongside the file to the native share sheet. |

### Accepted File Types

| MIME Type | Extension | Notes |
|-----------|-----------|-------|
| `video/mp4` | `.mp4` | Recorded gameplay clips |
| `image/png` | `.png` | Screenshots, generated images |
| `image/jpeg` | `.jpeg` | Photos, compressed screenshots |
| `image/webp` | `.webp` | Modern image format |
| `image/gif` | `.gif` | Animated images |

### Limits

* **Max file size:** 10 MB. Files exceeding this are rejected before encoding.
* **Rate limit:** One share per 3 seconds per game instance.
* **Data formats:** Pass a `Blob`, `ArrayBuffer`, or pre-encoded base64 string. Blob/ArrayBuffer inputs are encoded to base64 automatically. A pre-encoded `string` must be raw base64 of the file bytes, NOT a data URI: strip any `data:image/png;base64,` prefix first.

## Social Post Composer (BETA)

Let players post about your game to X, Reddit, TikTok, or Instagram — with one call. You pass the content; the platform picks the right share UX for the current device and destination. Your game never branches on OS, browser, or platform support.

```typescript
const { completed, destination } = await RundotGameAPI.social.composeSocialPostAsync({
  text: 'I just beat level 12 in one try! Can you?',
  shareParams: { challenge: 'level-12' },
})

if (completed) {
  console.log('Player shared via', destination)
}
```

Here is what happens when you call it:

1. The platform shows a destination sheet listing only the destinations that work on the player's current device.
2. The player picks one:
   * **X / Reddit** — the platform opens that network's post composer, pre-filled with your `text` (and your tracked share link, when you passed `shareParams`). The player reviews and posts there.
   * **TikTok / Instagram** (shown only when you attached `media`) — the platform copies the caption to the clipboard, tells the player to paste it, and opens the system share sheet with your media.
   * **Copy link** (shown when a share link was minted) or **More…** (the generic OS share card).
3. The promise resolves with `{ completed, destination }` — `completed: false` means no composer actually opened: the player dismissed the sheet, cancelled the OS share sheet (web), or the destination was blocked (for example a popup blocker — the composer link is copied to the clipboard instead).

{% hint style="info" %}
**Native limitation:** iOS/Android do not report whether the player cancelled the system share sheet (same limitation as `shareFileAsync`'s `cancelled`), so TikTok/Instagram destinations resolve `completed: true` once the share sheet opens.
{% endhint %}

{% hint style="info" %}
**There is no `url` parameter — by design.** Pass `shareParams` (the same shape as `shareLinkAsync`) and the platform mints a tracked share link and attaches it to the post: as the composer's `url` field on X (so it doesn't eat into the text budget), appended to the body on Reddit, appended to the caption for TikTok/Instagram. Recipients who click it land in your game with your params — see [Interpreting share intent on Game Start](#interpreting-share-intent-on-game-start).
{% endhint %}

### Targeting a specific platform

Pass an optional `platform` hint to skip the chooser and show a single-destination confirmation instead:

```typescript
await RundotGameAPI.social.composeSocialPostAsync({
  text: 'Daily puzzle done in 42 seconds 🔥',
  shareParams: { puzzle: '2026-07-02' },
  platform: 'x',
})
```

The hint is exactly that — a hint. If the hinted platform can't work on the player's current device (for example `tiktok` on desktop web, where there is no share sheet for files), the platform falls back to the destination chooser. `composeSocialPostAsync` never rejects because of an unsupported platform, so you don't need to feature-detect first.

### Compose options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | `string` | Yes | Post body / caption. Max 500 characters (control characters are stripped). |
| `shareParams` | `Record<string, string>` | No | When present, a tracked share link is minted (same machinery as `shareLinkAsync`) and attached to the post. |
| `metadata` | `{ title?, description?, imageUrl? }` | No | OpenGraph preview for the minted share link — same shape and limits as `shareLinkAsync`'s [share metadata](#share-metadata). Fields you omit fall back to your game's name/thumbnail. Ignored when `shareParams` is absent (no link is minted). |
| `media` | `{ data, filename, mimeType }` | No | Image/video attached to the post. Same encoding rules, [accepted file types](#accepted-file-types) and 10 MB limit as `shareFileAsync`. Required for TikTok/Instagram to be offered. |
| `platform` | `'x' \| 'reddit' \| 'tiktok' \| 'instagram'` | No | Targeting hint. Falls back to the chooser when unavailable — never rejects. |
| `title` | `string` | No | Post title, used only when routed to Reddit. Max 300 characters. Defaults to the start of `text`. |
| `subreddit` | `string` | No | Target subreddit (bare name, no `r/` prefix), used only when routed to Reddit. |

{% hint style="warning" %}
`composeSocialPostAsync` rejects (throws) when `text`/`title`/`subreddit`/`media` fail validation, and is rate-limited to one call per 3 seconds. It resolves `{ completed: false }` — it does not throw — when the player dismisses the sheet, cancels the OS share sheet (web), or when the composer can't actually be shown (a blocked popup, or a game that can't leave fullscreen).
{% endhint %}

{% hint style="info" %}
Every compose call mints a **fresh** share link, so social platforms scrape the preview per link — you can change `metadata` between posts without worrying about a network's link-preview cache showing stale values from an earlier post.
{% endhint %}

## Follow Me Links (BETA)

Send players to the creator's own social profile or Discord server ("follow me on X / Instagram / TikTok" / "join my Discord"). The creator configures these handles once for their account — they apply across all of that creator's games — and your game only ever asks the platform to open a given network. Your game never sees, sets, or handles the underlying handle or URL.

```typescript
const platforms = await RundotGameAPI.social.getConfiguredFollowMePlatformsAsync()

if (platforms.includes('x')) {
  const { completed } = await RundotGameAPI.social.openXFollowMeLinkAsync()
  if (completed) {
    console.log('Opened the creator’s X profile')
  }
}
```

Here is what happens when you call one of the `open…FollowMeLinkAsync` methods:

1. If the creator hasn't configured that platform's handle, the call resolves `{ completed: false, reason: 'not_configured' }` — it never throws. Use `getConfiguredFollowMePlatformsAsync` to decide whether to show a button at all.
2. Otherwise the platform shows a short confirmation sheet, and the player's tap inside it opens the creator's profile (or Discord invite) on that network.
3. The promise resolves `{ completed: true }` once the destination opens, or `{ completed: false }` if the player dismisses the sheet or the open is blocked (for example a popup blocker).

### `getConfiguredFollowMePlatformsAsync(): Promise<FollowMePlatform[]>`

Returns the subset of `['x', 'instagram', 'tiktok', 'discord']` the creator has set a handle for. Feature-detect with this before rendering a "follow us" button so you never show a dead action.

### `openXFollowMeLinkAsync(): Promise<FollowMeResult>`

Opens the creator's X ("Twitter") profile through platform-owned UI. Takes no arguments — the handle is resolved server-side from the creator's account.

### `openInstagramFollowMeLinkAsync(): Promise<FollowMeResult>`

Opens the creator's Instagram profile. Same contract as `openXFollowMeLinkAsync`.

### `openTikTokFollowMeLinkAsync(): Promise<FollowMeResult>`

Opens the creator's TikTok profile. Same contract as `openXFollowMeLinkAsync`.

### `openDiscordFollowMeLinkAsync(): Promise<FollowMeResult>`

Opens the creator's Discord server invite. Same contract as `openXFollowMeLinkAsync`.

`FollowMeResult` is `{ completed: boolean; reason?: 'not_configured' }`. `reason` is present only when `completed` is `false` because the creator hasn't set that platform's handle.

## API Reference

| Method | Returns | Description |
|--------|---------|-------------|
| `shareLinkAsync(options)` | `Promise<{ shareUrl, shareLinkId }>` | Create and share a link with custom parameters; `shareLinkId` is the handle for click tracking |
| `createQRCodeAsync(options)` | `Promise<{ shareUrl, qrCode, shareLinkId }>` | Generate a QR code data URL plus the underlying share URL and `shareLinkId` |
| `addShareClickDataAsync(options)` | `Promise<void>` | Record click metadata on a share as the current user (BETA) |
| `getShareClicksAsync(options)` | `Promise<{ clicks, truncated }>` | Read all click records for a share, up to 200 (BETA) |
| `getMyShareClickDataAsync(options)` | `Promise<ShareClickData \| null>` | Read the current user's click data for a share, or `null` (BETA) |
| `shareFileAsync(options)` | `Promise<{ cancelled }>` | Share a local file to native share targets (BETA) |
| `canShareFileAsync()` | `Promise<{ supported }>` | Check if file sharing is available (BETA) |
| `composeSocialPostAsync(options)` | `Promise<{ completed, destination }>` | Compose a post to X/Reddit/TikTok/Instagram through platform-owned UI (BETA) |
| `getConfiguredFollowMePlatformsAsync()` | `Promise<FollowMePlatform[]>` | List which follow-me platforms the creator has configured (BETA) |
| `openXFollowMeLinkAsync()` | `Promise<FollowMeResult>` | Open the creator's X profile through platform-owned UI (BETA) |
| `openInstagramFollowMeLinkAsync()` | `Promise<FollowMeResult>` | Open the creator's Instagram profile through platform-owned UI (BETA) |
| `openTikTokFollowMeLinkAsync()` | `Promise<FollowMeResult>` | Open the creator's TikTok profile through platform-owned UI (BETA) |
| `openDiscordFollowMeLinkAsync()` | `Promise<FollowMeResult>` | Open the creator's Discord server invite through platform-owned UI (BETA) |

## Payload Guidelines

* Keep `shareParams` under ~100 KB (share payloads are subject to a server-side size cap).
* Use compact identifiers (IDs, short strings) and fetch bulky data from your backend.
* Sanitize user-provided metadata before sharing publicly.
* Fallback when social APIs are unavailable (desktop browsers without share support).

## Best Practices

* Use `shareLinkAsync` for instant share sheets; reserve `createQRCodeAsync` for in-person or kiosk flows.
* Inspect the launch intent via [`RundotGameAPI.app.resolveLaunchIntent()`](APP.md#launch-intent) on boot and branch gameplay early—players expect to land in the invited context immediately.
* Reward referrers only after validating signatures or payloads on your backend to prevent spoofing.
* Provide manual copy buttons for desktop browsers without native sharing.
