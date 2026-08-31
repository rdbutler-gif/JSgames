# Safe Area & HUD Insets

The Safe Area API exposes padding (device notches plus host chrome) so your layout never collides with host UI. The SDK initializes automatically on import. Read the safe area once initialization completes, then apply it to your layout.

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

const safeArea = RundotGameAPI.system.getSafeArea()
applyInsets(safeArea)
```

{% hint style="warning" %}
On a real device, `getSafeArea()` throws if called before initialization completes. Read it after init (for example inside a lifecycle/ready hook), not at module top level. During local Playground testing it returns a fallback instead of throwing (see [When to read it](#when-to-read-it)), so an early read won't surface the error until you run on a real device.
{% endhint %}

## API Reference

| Method | Returns | Description |
| --- | --- | --- |
| `system.getSafeArea()` | `SafeArea` | Padding to avoid device notches and host UI. Includes toolbar/feedHeader height plus device safe areas. On a real device, throws if called before initialization (during local Playground testing it returns a fallback instead). |

### `getSafeArea(): SafeArea`

Returns the safe-area insets the host computed for this game. The value includes the device safe areas (notches, home indicator) plus the host chrome (toolbar/feedHeader height), so you can treat it as the single source of truth for usable layout bounds.

All four fields are numbers in pixels.

| Field | Type | Description |
| --- | --- | --- |
| `left` | `number` | Left inset in pixels. |
| `top` | `number` | Top inset in pixels. |
| `right` | `number` | Right inset in pixels. |
| `bottom` | `number` | Bottom inset in pixels. |

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

const { top, right, bottom, left } = RundotGameAPI.system.getSafeArea()
// e.g. { top: 88, right: 0, bottom: 34, left: 0 } in pixels
container.style.padding = `${top}px ${right}px ${bottom}px ${left}px`
```

**Throws (real host only):** `[RUN] getSafeArea() called before initialization. Call RundotGameAPI.initializeAsync() first.` if the safe area has not been populated yet. (`initializeAsync()` is deprecated and runs automatically on import; the error text just lags behind the deprecation.) During local Playground testing the call does not throw; it returns the fallback described below.

## When to read it

The SDK populates the safe area during initialization. On a real device, calling `getSafeArea()` before that completes throws an error, so don't call it at module top level. Read it once you know the SDK is ready, for example inside a lifecycle/ready hook or right after your first layout pass.

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

function onReady() {
  const safeArea = RundotGameAPI.system.getSafeArea()
  applyInsets(safeArea)
}
```

{% hint style="warning" %}
The throw is real-host behavior. During local Playground testing, an early `getSafeArea()` does not throw; it returns a hard-coded fallback of `{ top: 0, right: 0, bottom: 34, left: 0 }` (top is `0` because the Playground toolbar handles notch positioning). Don't rely on these exact numbers, they're placeholders for layout testing, and a too-early read that "works" locally will throw on a real device. Read after init in every environment.
{% endhint %}

{% hint style="info" %}
The safe area is static: it's set once during initialization and doesn't change, so there's no change event to subscribe to. Each call returns a fresh copy of the same values, so re-reading is safe but unnecessary. Compute your layout once and cache it.
{% endhint %}

## Layout Tips

- Combine safe-area padding with your own gameplay gutters. `getSafeArea()` only guarantees you won't overlap system chrome.
- Treat `RundotGameAPI.system.getSafeArea()` as the source of truth (it includes both device safe areas and host chrome).

## Best Practices

- Keep your core canvas anchored inside the computed safe rectangle; place non-interactive backgrounds outside.
- Mirror padding to physics or hitbox calculations so gameplay surfaces match UI boundaries.
- Persist the merged insets in your state store. Since the value is static you only need to read it once.

## Deprecated paths

If you're reading older samples, you may see these. Prefer `RundotGameAPI.system.getSafeArea()` instead.

| Deprecated | Replacement |
| --- | --- |
| `RundotGameAPI.context.safeArea` (the safe area from the INIT_SDK response) | `RundotGameAPI.system.getSafeArea()` |
| `HudInsets` type | `SafeArea` type |

{% hint style="warning" %}
Both `context.safeArea` and the `HudInsets` type alias are deprecated and pending removal in a future major version. `HudInsets` is a plain alias of `SafeArea`, so it has the same four fields (`left`, `top`, `right`, `bottom`). Migrate to `getSafeArea()` and the `SafeArea` type.
{% endhint %}
