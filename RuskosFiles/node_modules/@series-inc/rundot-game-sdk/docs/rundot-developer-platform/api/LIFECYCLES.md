#  Lifecycles API

The host controls when your game is active, paused, or torn down. `RundotGameAPI.lifecycles` exposes six hooks so your app can react to those state changes:

```
Import RundotGameAPI
     │
     ▼
Ready (implicit once module import resolves)
     │
     ├──▶ onPause  ──▶ onResume
     │
     ├──▶ onSleep  ──▶ onAwake
     │
     ├──▶ onBackButton  (Android only; handle or call requestPopOrQuit)
     │
     └──▶ onQuit   (terminal)
```

> Module import resolving is the "ready" moment; there is no separate `onReady` callback in the current SDK.

## Quick Start

1. Import the SDK (it initializes automatically on import):
   ```typescript
   import RundotGameAPI from '@series-inc/rundot-game-sdk/api'
   ```
2. Register lifecycle callbacks on `RundotGameAPI.lifecycles`.
3. Hold onto the returned subscriptions and call `.unsubscribe()` if your app hot-reloads or swaps scenes.

## Event Reference

| Hook                   | When it fires                                                      | Typical usage                                        |
| ---------------------- | ------------------------------------------------------------------ | ---------------------------------------------------- |
| `onPause(callback)`    | Host overlays your game or user momentarily leaves the experience  | Pause loops, mute audio, suspend timers              |
| `onResume(callback)`   | Host brings your game back to the foreground after a pause         | Resume loops, unmute audio, re-enable input          |
| `onSleep(callback)`    | Long suspend/background (system tab switch, network loss, etc.)    | Persist progress, stop network churn, close sockets  |
| `onAwake(callback)`    | App returns from sleep and is about to resume interaction          | Refresh auth/session, refetch stale data             |
| `onQuit(callback)`     | Host is shutting down the app instance                             | Flush telemetry, save state, return pending promises |
| `onBackButton(callback)` | User pressed the device back button (Android only)               | Navigate back in menus, show exit dialog, save state |

Each hook returns a `{ unsubscribe(): void }` handle. Call it if you need to detach listeners manually.

{% hint style="info" %}
**Callback contract.** Every lifecycle callback is typed `() => void`: the host passes no event or payload argument to your handler, and any value you return is ignored (the notification channel is fire-and-forget). This holds for all six hooks, including `onBackButton`; to quit from a back-button handler, call `requestPopOrQuit()` explicitly. The lifecycles subpath also exports named aliases for each callback type (`AwakeCallback`, `SleepCallback`, `ResumeCallback`, `PauseCallback`, `QuitCallback`, `BackButtonCallback`) if you want to type your handler functions; each is `() => void`.
{% endhint %}

## Implementation Example

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

const subscriptions = [
  RundotGameAPI.lifecycles.onPause(() => {
    pauseGameLoop()
    RundotGameAPI.log('[Lifecycle] paused')
  }),

  RundotGameAPI.lifecycles.onResume(() => {
    resumeGameLoop()
    RundotGameAPI.log('[Lifecycle] resumed')
  }),

  RundotGameAPI.lifecycles.onSleep(() => {
    saveProgressSnapshot()
  }),

  RundotGameAPI.lifecycles.onAwake(() => {
    refreshLiveServices()
  }),

  RundotGameAPI.lifecycles.onQuit(async () => {
    await flushTelemetry()
    await saveProgressSnapshot()
  }),
]

export function disposeLifecycleHandlers() {
  subscriptions.forEach((subscription) => subscription.unsubscribe())
}
```

## Best Practices

- **Keep handlers fast**: dispatch longer tasks to your own queues so the host isn't blocked.
- **Guard async work**: wrap awaits in try/catch; transitions can happen at any time.
- **Persist aggressively on `onSleep`**: do not rely on `onQuit` always firing.
- **Avoid deprecated names**: older docs referenced `RundotGameAPI.lifecycle` (singular) and `onShow`/`onPlay`; those APIs aren't available in current SDK builds.

## Back Button (Android)

On Android devices, the hardware or gesture-based back button fires `onBackButton`. Use the callback to handle in-game back navigation (e.g. closing a settings screen, navigating up a menu hierarchy, or showing an exit confirmation).

If you want the host to perform its default quit behavior from inside the callback, call `RundotGameAPI.requestPopOrQuit()` (see below).

If you don't register an `onBackButton` handler at all, the host performs its default quit behavior automatically; you only need this API if your game has its own back navigation.

This event only fires on Android. On iOS and web, the event never fires; registering a handler is safe but acts as a no-op.

### `requestPopOrQuit(options?: QuitOptions): Promise<boolean>`

Ask the host to pop your game off the navigation stack, or quit it outright if it's at the root. This is a top-level navigation method (it lives on `RundotGameAPI`, not on `lifecycles`), but it's the standard way to act on a back-button press, so it's documented here too.

It is awaitable: the returned `Promise<boolean>` resolves once the host has acted on the request (the boolean reflects whether the host honored it). You can `await` it or fire it and forget.

```typescript
// Fire-and-forget
RundotGameAPI.requestPopOrQuit()

// Or await the host's response, with options
const handled = await RundotGameAPI.requestPopOrQuit({ reason: 'user-back-button' })
```

#### `QuitOptions`

All fields are optional.

| Field        | Type     | Description                                                                                              |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------- |
| `reason`     | `string` | Tags why the game is quitting (forwarded to the host, e.g. for telemetry).                               |
| `forceClose` | `boolean`| Requests the host close the game instance outright rather than pop it off the navigation stack.         |
| `[key]`      | `any`    | `QuitOptions` has an open index signature, so you can attach arbitrary extra fields forwarded to the host. |

### Example: In-Game Back Navigation

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

let currentScreen = 'gameplay'

RundotGameAPI.lifecycles.onBackButton(() => {
  if (currentScreen === 'settings') {
    currentScreen = 'gameplay'
    showGameplayScreen()
    return // handled: navigated back within the game
  }

  if (currentScreen === 'gameplay') {
    showExitConfirmDialog()
    return // handled: showing dialog instead of quitting
  }

  // At root with nothing to do, tell the host to quit
  RundotGameAPI.requestPopOrQuit()
})
```

### Example: Simple Exit Confirmation

```typescript
RundotGameAPI.lifecycles.onBackButton(() => {
  showMyCustomDialog('Are you sure you want to quit?', {
    onConfirm: () => RundotGameAPI.requestPopOrQuit(),
    onCancel: () => { /* stay in game */ },
  })
})
```

> **Note:** The callback cannot return a value to the host (the notification channel is fire-and-forget). To quit, call `requestPopOrQuit()` explicitly. Do not use `window.confirm()`; it blocks the WebView JS thread and the host cannot observe its result.
