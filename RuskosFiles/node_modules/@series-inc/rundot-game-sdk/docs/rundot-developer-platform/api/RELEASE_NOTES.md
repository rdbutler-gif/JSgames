# Release Notes API

Read your game's published release notes (changelog history) at runtime, and
deep-link players to the full release-notes history on your game's info page.

{% hint style="warning" %}
All SDK methods can reject, and unhandled rejections crash the app. Always wrap SDK calls in `try/catch` or attach a `.catch()` handler. See [Error Handling](../error-handling.md) for details.
{% endhint %}

---

## Overview

When you deploy a new version of your game with a changelog, RUN.world moderates
and publishes it as a **release note**. Major updates are also surfaced to fans
in their inbox. This API lets your game:

- Read its own published release notes (e.g. to build an in-game "What's new" panel).
- Open the host's game info page with the **Release Notes** tab in view, where
  players can browse the latest update and all prior updates.

Release notes are authored via the CLI when you deploy:

```bash
rundot deploy --changelog ./CHANGELOG.md --announce
```

Only the changelog for the **currently-running game** is readable through this
API — a game can't read another game's release notes.

---

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

// Read this game's release notes (newest first)
const notes = await RundotGameAPI.app.getReleaseNotesAsync()
if (notes.length > 0) {
  const latest = notes[0]
  console.log(`Latest: v${latest.versionNumber} (${latest.releaseType})`)
  console.log(latest.changelog)
}

// Send the player to the full release-notes history on the info page
await RundotGameAPI.app.openReleaseNotesAsync()
```

---

## API Reference

### `getReleaseNotesAsync()`

```typescript
getReleaseNotesAsync(): Promise<ReleaseNote[]>
```

Fetches this game's published release notes, **newest first**. Returns an empty
array if the game has no published changelog entries.

**Returns:** `Promise<ReleaseNote[]>`

```typescript
interface ReleaseNote {
  /** The version label you deployed (e.g. "1.4.0"). */
  versionNumber: string
  /** Moderated changelog markdown (safe subset — see below). */
  changelog: string
  /** 'major' updates fan out to fans; 'minor' are routine. */
  releaseType: 'major' | 'minor'
  /** ISO-8601 timestamp of when the version was published. */
  publishedAt: string
}
```

### `openReleaseNotesAsync()`

```typescript
openReleaseNotesAsync(): Promise<void>
```

Opens the host game info page with the **Release Notes** tab in view. The latest
update is shown, with all prior updates browsable. Your game keeps running — the
info page opens as an overlay on top of it. Resolves once the request has been
handed to the host.

---

## Changelog content

The `changelog` you ship is moderated and restricted to a **safe markdown
subset** before it's published. The following render correctly in the app:

- Headings, paragraphs, **bold** / _italic_, and `inline code`
- Bullet and numbered lists
- Blockquotes
- `http(s)` links — `[text](https://…)`
- Images hosted in your game's own CDN bucket — `![alt](https://…/cdn-assets/…)`

The following are **rejected at deploy time** (the deploy fails with an error):

- Raw HTML tags (`<div>`, `<img>`, `<script>`, …)
- Links or images with a non-`http(s)` scheme (`javascript:`, `data:`, …)
- Images hosted outside your game's CDN bucket
- Control characters, or a changelog longer than 10,000 characters

Keep changelogs short and player-facing — they're a "what's new" summary, not
release documentation.

---

## Example: in-game "What's New" badge

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

async function maybeShowWhatsNew(lastSeenVersion: string): Promise<void> {
  try {
    const notes = await RundotGameAPI.app.getReleaseNotesAsync()
    const latest = notes[0]
    if (latest && latest.versionNumber !== lastSeenVersion) {
      // Show your own in-game badge, then let the player read the full history:
      await RundotGameAPI.app.openReleaseNotesAsync()
    }
  } catch (err) {
    console.error('Failed to load release notes', err)
  }
}
```
