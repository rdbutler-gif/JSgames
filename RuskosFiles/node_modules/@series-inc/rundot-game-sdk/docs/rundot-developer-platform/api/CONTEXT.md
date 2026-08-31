# Context API

Access data about the context in which your game is currently running. Determine how your game should act depending on what data it is given.

{% hint style="danger" %}
**The launch-intent fields on `context` are deprecated and will be removed in v6.0.0.** `launchParams`, `shareParams`, `notificationParams`, and `shareLinkId` are a one-shot snapshot taken at `INIT_SDK` time — they **cannot** represent a **deferred** deep link (e.g. a fresh share install whose attribution resolves asynchronously after init). Use [`RundotGameAPI.app.resolveLaunchIntent()`](APP.md#launch-intent) instead, which races the resolved launch signal up to a budget you control. Reading these fields logs a one-time deprecation warning.
{% endhint %}

{% hint style="info" %}
Context fields are synchronous property reads on `RundotGameAPI.context`. There are no async methods here, so nothing to `await` and nothing that can reject. The whole context object is available synchronously after the SDK initializes.
{% endhint %}

Here are some examples for what you might use it for:

* Read game-to-game navigation data (`g2gLaunch` / `g2gReturn`)
* Read the device safe area and the `initializeAsleep` flag

## Reading Launch Intent

To find out how your game was launched (share / deep link / notification / cold), use [`RundotGameAPI.app.resolveLaunchIntent()`](APP.md#launch-intent) — **not** the deprecated `context` fields:

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

const intent = await RundotGameAPI.app.resolveLaunchIntent({ maxWaitMs: 800 })

if (intent.kind === 'share') {
  startSharedExperience(intent.shareLinkId, intent.sharerId, intent.params)
} else if (intent.kind === 'notification') {
  handleNotificationLaunch(intent.params)
} else if (intent.kind === 'deeplink') {
  handleDeepLink(intent.params)
} else {
  startNormally() // 'none' (organic) or 'timed_out' (re-callable)
}
```

See the [App API → Launch Intent](APP.md#launch-intent) section for the full contract, including the five result kinds and the re-call-on-`timed_out` pattern for deferred deep links.

## Context Fields

`RundotGameAPI.context` is a synchronous object available after SDK init. Read any field directly.

| Field | Type | Description |
|-------|------|-------------|
| `launchParams` | `Record<string, string> \| undefined` | Runtime configuration passed in at launch. |
| `shareParams` | `Record<string, string> \| undefined` | Payload from a share link the player opened. |
| `notificationParams` | `Record<string, string> \| undefined` | Payload from a push notification launch (e.g. `roomId`, or a custom payload from a `send_notification` effect). |
| `shareLinkId` | `string \| undefined` | The share document ID when the game was launched from a share link; `undefined` otherwise. Use it to look up the share's metadata or to branch on launch source. See the [Sharing API](SHARING.md). |
| `initializeAsleep` | `boolean` | Whether the game was started in a sleeping/background state (e.g. preloaded) rather than foregrounded. Defer heavy work or audio until the player is actually viewing the game. |
| `g2gLaunch` | `Record<string, any> \| undefined` | Data from the source game that launched this game via [game-to-game navigation](NAVIGATION.md). |
| `g2gReturn` | `Record<string, any> \| undefined` | Data restored after returning from a game this game navigated to. |
| `safeArea` | `SafeArea \| undefined` | DEPRECATED (will be removed in v4.0.0). Legacy safe-area insets (`{ left, top, right, bottom }`) captured at init. Use [`RundotGameAPI.system.getSafeArea()`](SAFE_AREA.md) instead. |

{% hint style="warning" %}
`context.safeArea` is deprecated and will be removed in v4.0.0. Read safe-area insets from [`RundotGameAPI.system.getSafeArea()`](SAFE_AREA.md), which stays current as host UI changes.
{% endhint %}

{% hint style="info" %}
When the host supplies no context payload, the SDK seeds `launchParams`, `shareParams`, and `notificationParams` to empty objects `{}` (not `undefined`), and `initializeAsleep` to `false`. A truthiness check like `if (context.launchParams)` always passes, so check the keys you expect instead (for example `context.launchParams.level`) or use `Object.keys(context.launchParams).length`. The remaining fields (`shareLinkId`, `g2gLaunch`, `g2gReturn`) stay genuinely `undefined` when absent.
{% endhint %}

## Payload Guidelines

* Keep `shareParams` under \~100 KB (share payloads are subject to a server-side size cap).
* Keep your runtime configuration under \~100 KB for the same reason.
* Use compact identifiers (IDs, short strings) and fetch bulky data from your backend.

## Game-to-Game Navigation Context

When your game is launched via [game-to-game navigation](NAVIGATION.md), two additional context fields may be present:

```typescript
const context = RundotGameAPI.context

if (context.g2gLaunch) {
  // This game was launched from another game
  console.log('Launch data from source game:', context.g2gLaunch)
}

if (context.g2gReturn) {
  // The player returned from a game we navigated to
  console.log('Return data:', context.g2gReturn)
}
```

| Field | Type | Description |
|-------|------|-------------|
| `g2gLaunch` | `Record<string, any> \| undefined` | Data from the source game that launched this game |
| `g2gReturn` | `Record<string, any> \| undefined` | Data restored after returning from a game this game navigated to |

Both are `undefined` when the game is launched normally. See the [Navigation API](NAVIGATION.md) for full details on game-to-game navigation.

## Best Practices

* Use [`RundotGameAPI.app.resolveLaunchIntent()`](APP.md#launch-intent) on boot to detect share / deep link / notification launches and branch gameplay early — it correctly handles deferred deep links, unlike the deprecated `context` snapshot fields.
* Check `RundotGameAPI.context.g2gLaunch` and `g2gReturn` to handle game-to-game navigation launches and returns. (These are not deprecated.)
* Do **not** add `setTimeout`-based polling to wait for a share payload — `resolveLaunchIntent({ maxWaitMs })` is the supported way to wait for a deferred launch signal.
* Check `RundotGameAPI.context.initializeAsleep` on boot; if `true`, the game was preloaded in the background, so defer heavy work and audio until the player is actually viewing it.
