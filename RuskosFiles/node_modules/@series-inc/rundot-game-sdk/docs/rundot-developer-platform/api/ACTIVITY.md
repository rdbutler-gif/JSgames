# Activity API (BETA)

Tell the host what your app is currently doing, and let the platform surface it natively. You describe a **logical activity** — "I am playing episode 42, and I support play and pause". The host decides which native surfaces present it, and routes any transport commands back to you.

{% hint style="info" %}
**Fire TV MediaSession ships today.** On Fire TV, a `mediaPlayback` activity becomes a native media session, so **"Alexa, pause"** and the remote's play/pause key reach your app. iOS Now Playing, iOS Live Activities, and Android Live Updates are **not yet implemented** — on those hosts, starting an activity returns `skipped`.
{% endhint %}

{% hint style="warning" %}
All SDK methods can reject; unhandled rejections crash the app. Always wrap SDK calls in `try/catch` or attach a `.catch()` handler. See [Error Handling](../error-handling.md) for details.
{% endhint %}

## You describe intent; the host picks the surface

This is the key idea, and it is deliberate: **your game never names a platform surface.** There is no `mediaSession`, `nowPlaying`, `liveActivity`, or `liveUpdate` in this API.

You submit one logical activity. The host validates it, attaches trusted identity, and fans it out to whichever presenters are eligible on that device. Permissions, native metadata, deep links, staleness, and dismissal are all host policy. A game written today against `mediaPlayback` picks up new surfaces as the platform adds them, with no code change.

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

// 1. Start the activity when playback begins.
const { activityId, status } = await RundotGameAPI.activity.startActivityAsync({
  kind: 'mediaPlayback',
  key: 'watch',                 // stable, yours; identifies this logical activity
  contentId: 'ep-42',
  title: 'Episode 42',
  state: { status: 'playing', positionSeconds: 0, durationSeconds: 1380 },
  supportedActions: ['play', 'pause'],
})

if (status === 'skipped') {
  // No eligible native surface on this host. Not an error — just carry on.
}

// 2. Keep it truthful as playback moves. Fire-and-forget.
RundotGameAPI.activity.updateActivity({
  activityId,
  state: { status: 'paused', positionSeconds: 137, durationSeconds: 1380 },
})

// 3. Act on transport commands from Alexa / the remote.
RundotGameAPI.activity.onActivityAction((event) => {
  if (event.activityId !== activityId) return   // stale: content already replaced
  if (event.action === 'pause') pausePlayback()
  if (event.action === 'play') resumePlayback()
})

// 4. End it when playback is over.
await RundotGameAPI.activity.endActivityAsync({ activityId })
```

## Lifecycle

| Call | Kind | Meaning |
| --- | --- | --- |
| `startActivityAsync(intent)` | acknowledged | Begin a logical activity; returns its `activityId`. |
| `updateActivity(input)` | fire-and-forget | Report new state. Safe to call often. |
| `endActivityAsync(input)` | acknowledged | The activity is genuinely finished. |
| `onActivityAction(cb)` | subscription | A native surface issued a transport command. |

`startActivityAsync` is **idempotent on `key`**. Calling it twice with the same key returns the same `activityId` and updates the existing activity rather than creating a second native presentation. That is what makes a stable `key` worth choosing — it lets a remounted or reloaded app reconcile with the activity it already had.

Updates are fire-and-forget on purpose: a position tick that arrives late is worthless, and you should never `await` one in a playback loop. Start and end are acknowledged because you need their result.

## Result semantics

```typescript
interface StartActivityResult {
  activityId: string
  status: 'accepted' | 'skipped'
  reason?: 'unsupported_surface'
}
```

`skipped` with `unsupported_surface` means **no eligible presenter exists on this host** — a phone today, or a TV where the native bridge is unavailable. It is a normal result, not a failure: you still get an `activityId`, and calling `updateActivity` / `endActivityAsync` with it is harmless. Handle it by simply continuing; do not treat it as an error and do not retry.

A **rejection** means you sent something invalid:

| Error | Cause |
| --- | --- |
| `INVALID_ACTIVITY` | The intent or state failed validation (see below). |
| `ACTIVITY_NOT_FOUND` | The `activityId` is unknown, or was already ended. |
| `ACTIVITY_OWNER_MISMATCH` | The `activityId` belongs to a different app. |

## Activity identity

Every activity and every action is identity-scoped.

You supply a stable `key`. The host returns an opaque `activityId`. Updates, ends, and inbound actions all carry that ID.

**Always check `event.activityId` in your action handler.** If the player has moved on to new content, an action aimed at the old activity may still arrive — matching the ID is what stops a stale "Alexa, pause" from pausing whatever is playing now. The host filters these too, but the game is the only layer that truly knows what it is showing.

## `mediaPlayback`

The one activity kind in v1.

```typescript
interface MediaPlaybackActivityIntent {
  kind: 'mediaPlayback'
  key: string                    // stable, non-blank, ≤ 128 chars
  contentId: string              // non-blank, ≤ 256 chars
  title: string                  // non-blank, ≤ 256 chars — shown natively
  state: MediaPlaybackState
  supportedActions: MediaPlaybackAction[]   // non-empty, no duplicates
  continuationParams?: Record<string, string>
}

interface MediaPlaybackState {
  status: 'playing' | 'paused' | 'buffering'
  positionSeconds: number        // finite, ≥ 0, ≤ 1e9, ≤ durationSeconds when finite
  durationSeconds: number | null // null = live / unknown; otherwise finite, > 0, ≤ 1e9
}

type MediaPlaybackAction = 'play' | 'pause'
```

Anything outside those bounds rejects with `INVALID_ACTIVITY` rather than being silently coerced — a media session that advertises a bogus position is worse than none. Note that "finite" is not the whole bound: seconds are converted to milliseconds downstream, so absurd-but-finite values are rejected too.

The `activityId` the host derives from your `key` is itself length-bounded. A very long `key` combined with a long app ID can overflow that bound, which rejects with `INVALID_ACTIVITY` at `startActivityAsync`. Short, stable keys (`'watch'`, `'episode-playback'`) are the intent.

**Report `buffering` honestly.** It maps to the native buffering state, and a session stuck at `playing` while it actually stalls will mislead the surface (and the player).

**Supported actions are advertised, not assumed.** The native surface only exposes the actions you list. If you send `['pause']`, the platform will not offer play.

**There is no third "toggle" action.** A physical play/pause key is resolved by the host from the state you last reported, and arrives as either `play` or `pause`. You never have to implement a toggle.

## Owner detach vs. explicit end

These are different, and the distinction matters.

* **`endActivityAsync`** — the activity is *over*. The episode finished, the player closed the video. Presenters tear down.
* **Owner detach** — *your app went away* (unmounted, crashed) without ending anything. The host handles this for you; you do not call anything.

Each presenter applies its own policy on detach. Fire TV releases its MediaSession, because a media session whose owner is gone would accept transport commands with nowhere to deliver them. Future persistent surfaces (Live Activities, Live Updates) may instead keep showing a stale entry until an explicit end or a TTL.

The practical consequence: **do not synthesize an end during teardown.** If your app is going away, just go away. Ending an activity you did not actually finish throws away the state that a persistent surface would have kept.

## Surface support

| Surface | Status |
| --- | --- |
| Fire TV — MediaSession (Alexa + remote transport) | ✅ Shipped |
| iOS — Now Playing | ❌ Not implemented |
| iOS — Live Activities | ❌ Not implemented |
| Android — Live Updates | ❌ Not implemented |
| Everything else | Returns `skipped` / `unsupported_surface` |

## Not in v1

* `seek`, `next`, `previous`, `restart`, and `skip` actions.
* Actions delivered while your app is **not mounted**. A native surface will not expose actions it cannot deliver.
* Remote/server-driven updates.
