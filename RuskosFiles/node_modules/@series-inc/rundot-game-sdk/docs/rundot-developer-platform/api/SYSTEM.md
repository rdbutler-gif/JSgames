# System API

The System API is the unified namespace for device, environment, and platform-capability data: anything that's about *the host the game is running in*, not about the game itself.

It also exposes platform actions that need a round trip to the host, like prompting the user to add the game to their home screen.

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

// Read-only platform info: synchronous, available after initialize.
const device = RundotGameAPI.system.getDevice()
const env = RundotGameAPI.system.getEnvironment()
const isMobile = RundotGameAPI.system.isMobile()

// Add to Home Screen: async, requires a user gesture.
if (await RundotGameAPI.system.canAddToHomeScreen()) {
  showInGamePinPromptButton()
}
```

## Methods

### Device & environment (synchronous)

| Method | Returns | Use |
| --- | --- | --- |
| `getDevice()` | `DeviceInfo` | Screen/viewport size, orientation, pixel ratio, font scale, device type, haptics support. Does NOT include safe-area insets; use `getSafeArea()` for those. |
| `getEnvironment()` | `EnvironmentInfo` | Platform (`ios` / `android` / `web`), platform version, browser info, dev-mode flag. |
| `getSafeArea()` | `SafeArea` | Padding to avoid device notches and host UI. Top includes the toolbar/feed-header height. |
| `isMobile()` | `boolean` | `true` on iOS, Android, or any mobile browser. |
| `isWeb()` | `boolean` | `true` on the web platform or desktop browser. |

For the full `DeviceInfo`, `EnvironmentInfo`, and `SafeArea` field shapes, see the [Environment API](ENVIRONMENT.md) and [Safe Area](SAFE_AREA.md) pages.

These read cached host data and throw if called before the SDK has finished its on-import initialization. The SDK initializes automatically when you import it, so read these after your first `await` rather than at module top level. You don't need to call `RundotGameAPI.initializeAsync()` yourself; it's deprecated.

{% hint style="info" %}
If you do read too early on a real device, the thrown error text still tells you to "call `RundotGameAPI.initializeAsync()`". That wording predates the deprecation and lags behind it; the call isn't required. Just make sure you read after init completes.
{% endhint %}

### `isMobile()` / `isWeb()` are not strict complements

These resolve from `getEnvironment()`:

- `isMobile()` returns `true` for `platform` `'ios'` or `'android'`; on web it returns `browserInfo.isMobile`. If neither the platform nor `browserInfo` resolves, it defaults to `true` (a conservative "assume mobile" fallback).
- `isWeb()` returns `true` when `platform === 'web'`, or when `browserInfo` is present and `browserInfo.isMobile` is `false` (desktop web). Otherwise `false`.

Because of the default-`true` fallback, an unknown platform with no `browserInfo` is `isMobile()` true and `isWeb()` false; a desktop browser is `isWeb()` true and `isMobile()` false. Don't assume one is the negation of the other.

### Deprecated top-level aliases

`RundotGameAPI.isMobile()` and `RundotGameAPI.isWeb()` still exist as top-level aliases that redirect to the `system.` versions and log a deprecation warning. Use `RundotGameAPI.system.isMobile()` / `RundotGameAPI.system.isWeb()` instead.

### Add to Home Screen (asynchronous)

| Method | Returns | Use |
| --- | --- | --- |
| `canAddToHomeScreen()` | `Promise<boolean>` | Whether the host can present an install prompt for this game right now. |
| `addToHomeScreen()` | `Promise<AddToHomeScreenResult>` | Show the host confirmation modal and, on confirm, trigger the platform install prompt. Resolves `{ added: boolean }`. |

#### `canAddToHomeScreen()`

Resolves to `false` when:

- The host has not surfaced a deferred install prompt: either the browser hasn't decided the site is installable yet, or the user has already installed it.
- The platform is iOS Safari (no programmatic install API exists; users must use the Safari Share menu manually).
- The running game has no thumbnail.
- A per-session cooldown is active because the user already dismissed the prompt for this game during this app session.

Use this before showing your own "pin this game" CTA so the CTA isn't displayed when it would no-op.

```typescript
const canPin = await RundotGameAPI.system.canAddToHomeScreen()
setPinButtonVisible(canPin)
```

#### `addToHomeScreen()`

Shows the host's "Add to Home Screen" confirmation modal. On confirm, the host triggers the platform install prompt (PWA install on supported browsers). On cancel (either the modal or the system prompt) resolves `{ added: false }`.

Returns the named type `AddToHomeScreenResult` (`{ added: boolean }`). `added: true` normally means the user accepted and the icon was pinned. On platforms that don't surface acceptance back to the SDK, `added: true` means the prompt flow launched successfully, which isn't a strict confirmation that the icon was pinned. Treat it as "the flow ran", not "the install definitely completed".

This call has no timeout: the host modal and the platform install dialog wait for the user, so the returned promise can stay pending for an arbitrary amount of time. Don't race it against your own timeout.

```typescript
async function onPlayerTappedPinButton() {
  const result = await RundotGameAPI.system.addToHomeScreen()
  if (result.added) {
    analytics.track('pinned_to_homescreen')
  }
}
```

##### Browser user-gesture requirement

Most browsers only honor an install prompt inside a user-initiated event handler. Call `addToHomeScreen()` in direct response to a user tap (button click), **not** from a timer, async callback, network response, or cutscene step. If called outside a user gesture the call resolves `{ added: false }` without showing UI.

```typescript
//  GOOD: direct response to a tap
button.addEventListener('click', async () => {
  await RundotGameAPI.system.addToHomeScreen()
})

//  BAD: fires after a delay, browser will reject the prompt
setTimeout(() => RundotGameAPI.system.addToHomeScreen(), 5000)
```

##### iOS

iOS Safari does not expose a programmatic install API. On iOS, `canAddToHomeScreen()` returns `false` and `addToHomeScreen()` resolves `{ added: false }` without showing UI. If you want iOS users to pin the game, surface your own instructional UI pointing to the Safari Share menu.

##### Per-session cooldown

If the user dismisses the modal once for a game, that game is silenced for the remainder of the app session: `canAddToHomeScreen()` returns `false`, and `addToHomeScreen()` resolves `{ added: false }`. This applies equally to SDK-triggered and host-toolbar-triggered prompts.

## Patterns

- **Pin at the magic moment.** Call `canAddToHomeScreen()` before showing a "Keep this game on your phone?" CTA after a high-engagement beat (boss defeat, quest completion). Trigger `addToHomeScreen()` from the CTA tap.
- **Don't autofire.** A prompt the user didn't ask for trains them to dismiss it. Always require a user tap.
- **Respect the cooldown.** Don't poll `canAddToHomeScreen()` repeatedly to retry; once it returns `false` for a session, accept it.

## Best Practices

- Treat `canAddToHomeScreen()` as the source of truth for whether to render your CTA. Don't try to recreate the host's logic by checking platform manually.
- Don't gate `addToHomeScreen()` on `isMobile()` alone: `canAddToHomeScreen()` already encodes everything you need.
- Show the player something tangible *before* prompting (level cleared, loot earned). Pinning is friction; pay for it with an emotional payoff.
