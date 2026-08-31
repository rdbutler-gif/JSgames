# Notifications API

Schedule reminders, re-engagement prompts, and cross-channel messages through one unified call — `submitMessageAsync`. The host routes each request across on-device local notifications, the durable messaging inbox, and RCS/SMS (when the player is reachable).

{% hint style="warning" %}
All SDK methods can reject; unhandled rejections crash the app. Always wrap SDK calls in `try/catch` or attach a `.catch()` handler. See [Error Handling](../error-handling.md) for details.
{% endhint %}

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

// Local reminder in one hour (host-only — no server call)
const local = await RundotGameAPI.notifications.submitMessageAsync({
  channels: ['local'],
  title: 'Daily Reward Ready',
  body: 'Come back to claim your chest!',
  delaySeconds: 60 * 60,
})

// Cross-channel: local on native when available, RCS as fallback, inbox always written server-side
const cross = await RundotGameAPI.notifications.submitMessageAsync({
  channels: ['local', 'rcs'],
  title: 'Energy Full!',
  body: 'Your energy has fully recharged.',
  delaySeconds: 30 * 60,
  collapseKey: 'energy',
})

// Cancel the on-device handle from the local result
const localResult = cross.results.find((r) => r.channel === 'local')
if (localResult?.id) {
  await RundotGameAPI.notifications.cancelNotification(localResult.id)
}
```

## `submitMessageAsync(input): Promise<SubmitMessageResult>`

Unified scheduling entry point. Pass one or more delivery channels; the host and server fan out from there.

### Input (`SubmitMessageInput`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `channels` | `('local' \| 'rcs')[]` | Yes | Non-empty. `inbox` is never caller-supplied — the server injects it whenever a server channel runs. |
| `title` | `string` | Yes* | Notification title. Required unless `templateId` is provided. |
| `body` | `string` | Yes* | Notification body. Required unless `templateId` is provided. |
| `templateId` | `string` | Yes* | Server-rendered template id — alternative to free-text `title` + `body` for inbox/RCS content. |
| `params` | `Record<string, string>` | No | Interpolation params for `templateId`. |
| `collapseKey` | `string` | No | Cross-channel supersede key (replaces a prior live inbox row for the same game + key). |
| `ctaUrl` | `string` | No | Opaque continuation id for RCS; resolved to OneLink at send time. |
| `continuationParams` | `Record<string, string>` | No | Hydrated into H5 `notificationParams` on CTA tap. |
| `image` | `string` | No | Image URL for RCS. |
| `triggerAt` | `string` | No | ISO8601 UTC. Mutually exclusive with `delaySeconds`. |
| `delaySeconds` | `number` | No | Seconds from now. Mutually exclusive with `triggerAt`; max 7 days. |
| `payload` | `Record<string, unknown>` | No | Extra data attached to the local notification. |
| `notificationId` | `string` | No | Legacy local dedupe/cancel handle (distinct from `collapseKey`). |
| `priority` | `number` | No | Local scheduling priority (default 50). |
| `groupId` | `string` | No | Legacy local grouping key. |

\* Provide either free-text `title` + `body`, or a `templateId` (with optional `params`) — the server renders the template for inbox and RCS. The `local` channel does not render templates, so include `title` + `body` whenever `channels` contains `'local'`.

Exactly one of `triggerAt` or `delaySeconds` when timing is needed. A past `triggerAt` schedules immediately (`seconds = 0`).

### Result (`SubmitMessageResult`)

| Field | Type | Description |
|-------|------|-------------|
| `messageId` | `string` | Logical message id shared across channels (host-issued on native). |
| `results` | `SubmitMessageChannelResult[]` | Per-channel outcomes. |

Each `SubmitMessageChannelResult`:

| Field | Type | Description |
|-------|------|-------------|
| `channel` | `'local' \| 'rcs' \| 'inbox'` | Delivery surface. |
| `status` | `'scheduled' \| 'skipped'` | Whether that channel was armed. |
| `id` | `string` (optional) | Channel-specific handle (`local` notification id, RCS `scheduleId`, inbox row id). |
| `reason` | `string` (optional) | Why a channel was skipped (e.g. `unsupported_platform`, `local_owns_interruptive`, `needs_consent`). |

### Local vs RCS routing (native)

When `channels` includes both `local` and `rcs`:

1. The host **attempts local first** and records whether expo-notifications actually accepted the schedule.
2. If local was accepted, the server **suppresses RCS** (`local_owns_interruptive`) so the player gets at most one interruptive delivery.
3. If local declined (muted, disabled, throttled, permission denied), RCS is scheduled as the **fallback** interruptive channel.
4. The inbox row is always written when the server path runs.

`channels: ['local']` alone never hits the server — same behavior as legacy local-only scheduling.

### Web behavior

On run.world (web) there are no OS-level notifications; local schedules deliver to the platform's bell inbox instead:

- When a schedule fires it appears as an inbox item under the bell. If the fire time passed while the page was closed, it's delivered on the user's next visit.
- Pending schedules persist **per device** (in that browser's local storage). They survive reloads on the same device but do not roam across devices.
- Tapping the inbox item relaunches your game with the schedule's `payload` available via launch intent / `notificationParams` — or via a live `NOTIFICATION_PARAMS_UPDATE` if your game is already running.
- The host applies the same schedule-time gates as native (muted game, notifications toggle, throttling); an undeliverable schedule resolves with `id: null` — the same contract as native. Never treat a resolved call as delivered without null-checking the id.
- `roomId` is a reserved `payload` key and is stripped on web.

`channels: ['local']` alone (including the deprecated `scheduleAsync` shim) schedules for real on web. A call with `['local', 'rcs']` skips local on web (`skipped(unsupported_platform)`) and still schedules server channels when authenticated — the server-written inbox row is the single bell entry for the message.

## Cross-channel opt-in (RCS / SMS): BETA

Reach players outside the app over RCS (with SMS fallback). Availability depends on the user having a phone on file and an active opt-in.

{% hint style="warning" %}
RCS/SMS opt-in is regulated (TCPA). Always call `requestRCSOptInAsync` in response to a user gesture, never as a passive prompt on load.
{% endhint %}

```typescript
const optIn = await RundotGameAPI.notifications.requestRCSOptInAsync({
  rewardCopy: 'Get 100 gems, never miss an update.',
})

const { available } = await RundotGameAPI.notifications.getRCSAvailableAsync()

if (available) {
  await RundotGameAPI.notifications.submitMessageAsync({
    channels: ['rcs'],
    title: 'Your raid is ready',
    body: 'Tap to jump back in and claim your loot.',
    continuationParams: { screen: 'raid', raidId: 'abc123' },
    delaySeconds: 60 * 60 * 4,
  })
}
```

### `requestRCSOptInAsync(input?): Promise<RequestRCSOptInResult>`

Triggers the platform-owned RCS/SMS opt-in modal. Call on a user gesture (TCPA), not as a passive prompt.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `input.rewardCopy` | `string` | No | Copy interpolated into the modal heading. |

Returns `RequestRCSOptInResult` with `status` (`already_subscribed`, `subscribed`, `declined`, `pending_confirmation`) and `newlySubscribed` for one-shot reward gating.

### `getRCSAvailableAsync(): Promise<RCSAvailabilityStatus>`

| Field | Type | Description |
|-------|------|-------------|
| `available` | `boolean` | Whether a cross-channel message can be delivered. |
| `reason` | `'needs_consent' \| 'no_phone' \| 'feature_disabled' \| 'unknown'` (optional) | Why the user is not reachable when `available` is false. |

### Opt-in integration pitfalls

**Reconcile on launch AND resume.** `requestRCSOptInAsync` results are not guaranteed to reach your game. Run `getRCSAvailableAsync()` on launch/resume and grant rewards idempotically when `available` becomes true.

**Drive opt-in entry points from shared, refreshable state** — subscription changes outside your call stack (SMS reply, another entry point).

**Don't cache `getRCSAvailableAsync` across opt-in attempts** — invalidate after every opt-in result or reward grant.

**After `pending_confirmation`, tell users to reply "Y"` — resend buttons do not send another confirmation SMS.

## Deeplinking

When a user taps a notification, they're taken directly to your game by default. Use [`RundotGameAPI.app.resolveLaunchIntent()`](APP.md#launch-intent) to detect a notification launch and read its payload — `kind === 'notification'` with the payload in `params`:

```typescript
const intent = await RundotGameAPI.app.resolveLaunchIntent({ maxWaitMs: 800 })
if (intent.kind === 'notification') {
  handleNotificationLaunch(intent.params)
}
```

> The deprecated `RundotGameAPI.context.notificationParams` snapshot still works until v6.0.0, but `resolveLaunchIntent` is the supported path.

## API Reference

| Method | Returns | Description |
|--------|---------|-------------|
| `submitMessageAsync(input)` | `Promise<SubmitMessageResult>` | Unified scheduling across local, inbox, and RCS. |
| `cancelNotification(id)` | `Promise<boolean>` | Cancel a scheduled **local** notification by its local id. |
| `getAllScheduledLocalNotifications()` | `Promise<ScheduleLocalNotification[]>` | List pending local notifications. |
| `isLocalNotificationsEnabled()` | `Promise<boolean>` | Check if local notifications are enabled for this game. |
| `setLocalNotificationsEnabled(enabled)` | `Promise<boolean>` | Enable or disable local notifications for this game. |
| `requestRCSOptInAsync(input?)` | `Promise<RequestRCSOptInResult>` | Prompt for RCS/SMS opt-in on a user gesture (BETA). |
| `getRCSAvailableAsync()` | `Promise<RCSAvailabilityStatus>` | Check RCS/SMS reachability (BETA). |

## Best Practices

- Use `collapseKey` to supersede stale reminders (energy, daily reward) instead of stacking inbox rows.
- Cancel local handles from `results.find(r => r.channel === 'local')?.id` when the underlying event completes.
- Keep payloads small; store heavy data with the SDK storage APIs and reference it by id.
- Throttle player-facing prompts; the host also debounces rapid local schedules.
- Call `requestRCSOptInAsync` only on explicit user action (TCPA).
