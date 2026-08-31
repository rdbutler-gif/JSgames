---
icon: shield-halved
---

# Runtime Environment

This page describes what the RUN.world platform gives your game at runtime: where you save player data, where you can load content from, and which device features your game can use.

Each game runs in its own isolated space on RUN.world. Player data is private to your game, and the platform provides SDK APIs for everything you'd normally reach for in a browser (storage, networking helpers, device features), purpose-built so they work consistently across web and mobile.

## Saving Player Data

Use the SDK storage APIs to persist save state, settings, and progress. Each scope is optimized for a different sharing model:

| API | Use it for |
| --- | --- |
| [`RundotGameAPI.appStorage`](api/STORAGE.md#choosing-a-scope) | Per-player save state, settings, and progress for your game. Cloud-synced. |
| [`RundotGameAPI.deviceCache`](api/STORAGE.md#choosing-a-scope) | Anonymous, per-device hints (e.g. last-used app ID). Cross-game. |
| [`RundotGameAPI.ownerStorage`](api/STORAGE.md#owner-storage) | Per-player state shared across every title you publish. |
| [`RundotGameAPI.sharedStorage`](api/STORAGE.md#shared-storage) | Per-player state shared with another creator's game, governed by an explicit access policy. |

A typical write looks like:

```javascript
await RundotGameAPI.appStorage.setItem('level', '5')
const level = await RundotGameAPI.appStorage.getItem('level')
```

See [Storage APIs](api/STORAGE.md) for the full reference, value rules, and limits.

{% hint style="info" %}
Browser storage APIs (`localStorage`, `sessionStorage`, `IndexedDB`, `caches`, `document.cookie`, `BroadcastChannel`, and `ServiceWorker`) are not available inside the game iframe; use the SDK helpers above instead.
{% endhint %}

## Authentication & Player Identity

RUN.world signs players in and hands your game their identity, so you don't build or run a login yourself. The platform is the only supported auth system.

You **cannot** run your own login inside a game. A self-hosted Firebase Auth project, Google/Apple/other third-party OAuth, or a custom identity provider will not work: the auth scripts, token endpoints, and OAuth popups they rely on are blocked by the platform sandbox.

Use the platform instead:

- To require login or gate features behind a signed-in player, use the [Access Gate API](api/ACCESS_GATE.md).
- To read the signed-in player's identity, use the [Profiles API](api/PROFILE.md).
- To check the player's role for your game (e.g. owner/editor), use the [App API](api/APP.md).

## Where Your Game Can Load Content From

Your game can fetch assets, scripts, fonts, and data (over `fetch`, `XMLHttpRequest`, `<img>`, `<video>`, `<audio>`, `<script src>`, `<link>`, and `WebSocket`) from the following hosts:

| Host | Use it for |
| --- | --- |
| Your own game origin | Your built game files and the `cdn-assets/` directory uploaded with your build. |
| `https://fonts.googleapis.com` | Google Fonts stylesheets. |
| `https://fonts.gstatic.com` | Google Fonts woff/woff2 files. |

SDK calls that return URLs (e.g. AI generation, embedded libraries, shared assets) point at platform-managed CDNs; those URLs work in your game without any extra configuration.

`data:` URLs work for images, media, and fonts. `blob:` URLs work for scripts, images, media, and workers, so `URL.createObjectURL(...)` is available for canvas snapshots, downloaded buffers, and dynamically-generated content.

## Calling Servers & External Services

The hosts in [Where Your Game Can Load Content From](#where-your-game-can-load-content-from) are the only ones your game can reach. Arbitrary external hosts are not reachable, and that includes your own backend or API server: calls to a server you host from inside the game are blocked by the platform sandbox.

Use the platform instead:

- For custom server-side logic and authoritative state, use the [Simulation API](api/SERVER_AUTHORITATIVE.md).
- For text, image, and audio generation, use the platform AI/generation APIs.
- For persistence, use the SDK [storage scopes](#saving-player-data).

## What Your Game Can Do

### Available to every game

- Camera (`getUserMedia({ video: true })`)
- Microphone (`getUserMedia({ audio: true })`)
- Clipboard read and write
- Autoplay (audio/video without a user gesture)

Browser and OS permission prompts still apply where they normally would: for example, the first call to `getUserMedia` still asks the player for camera access.

### Use the SDK instead

A few browser features have SDK equivalents that work consistently across web and mobile: use those:

- For opening links and sharing, use the [Sharing API](api/SHARING.md) instead of `window.open(...)`.
- For embedding third-party content, use the [Embedded Libraries API](api/EMBEDDED_LIBRARIES.md) instead of nested `<iframe>`, `<object>`, or `<embed>` elements.

## Best Practices

A few things to keep in mind as you build:

- Use the right SDK [storage scope](#saving-player-data) for player data: `appStorage` for per-game save state, `deviceCache` for anonymous per-device hints, `ownerStorage` and `sharedStorage` for cross-title state.
- Bundle your dependencies into your build, or use the [Embedded Libraries API](api/EMBEDDED_LIBRARIES.md) for shared libraries the platform provides.
- Point your `fetch` and `XMLHttpRequest` call sites at your own game origin or the [other allowlisted hosts above](#where-your-game-can-load-content-from).
- Use the [Sharing API](api/SHARING.md) for outbound links and the [Embedded Libraries API](api/EMBEDDED_LIBRARIES.md) in place of nested iframes.

If something doesn't behave the way you expect after deploying, see [Troubleshooting](troubleshooting.md) or ask in Discord.
