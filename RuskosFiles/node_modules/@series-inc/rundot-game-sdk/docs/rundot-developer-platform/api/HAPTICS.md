#  Haptics API

Trigger tactile feedback across supported devices without worrying about platform differences. The RUN.world host normalizes style names and falls back gracefully when hardware lacks vibration support.

{% hint style="warning" %}
All SDK methods can reject; unhandled rejections crash the app. Even fire-and-forget calls like `triggerHapticAsync()` return promises that can fail. Always attach a `.catch()` handler. See [Error Handling](../error-handling.md) for details.
{% endhint %}

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'
import { HapticFeedbackStyle } from '@series-inc/rundot-game-sdk'

await RundotGameAPI.triggerHapticAsync(HapticFeedbackStyle.Success)
await RundotGameAPI.triggerHapticAsync(HapticFeedbackStyle.Warning)
await RundotGameAPI.triggerHapticAsync(HapticFeedbackStyle.Heavy)
```

`triggerHapticAsync` gracefully no-ops on hosts that lack vibration hardware, so you can call it defensively without extra guards.

## Supported Styles

`triggerHapticAsync` only accepts the `HapticFeedbackStyle` enum exported from `@series-inc/rundot-game-sdk`. Stick to the enum (or the equivalent string literal) to avoid typos.

| Style (`HapticFeedbackStyle`) | String literal | Typical use |
| --- | --- | --- |
| `Light` | `'light'` | Subtle taps for UI chrome (button clicks, light impacts). |
| `Medium` | `'medium'` | Noticeable impulses when you need emphasis without being jarring. |
| `Heavy` | `'heavy'` | Strong pulses for collisions, explosions, or high-stakes input. |
| `Success` | `'success'` | Reward cues after quests, crafting, or confirmations. |
| `Warning` | `'warning'` | Prompt the player about risky states or invalid actions. |
| `Error` | `'error'` | Hard-stop feedback when something definitively fails. |

## Capability Detection

Capability data lives on the device payload that the host provides during the host handshake. Cache it once so you can tailor UI (for example, hide haptics toggles if unsupported).

```typescript
const { haptics } = RundotGameAPI.system.getDevice()

// Useful if you want to adjust UI, prompt the player, or log analytics.
const supportsHaptics = haptics.supported && haptics.enabled
```

{% hint style="warning" %}
`RundotGameAPI.system.getDevice()` throws if called before `RundotGameAPI.initializeAsync()` has completed. Read the `haptics` capability after init (or inside your game setup), not at module load.
{% endhint %}

{% hint style="info" %}
The device payload also exposes a flat `hapticsEnabled: boolean` alongside the nested `haptics` object. It's a legacy shorthand that mirrors `haptics.enabled`. Prefer the nested `haptics.supported` / `haptics.enabled` fields for new code; treat `hapticsEnabled` as a duplicate you may see in the payload.
{% endhint %}

## Patterns

- **Reward cues:** fire `Success` when players complete goals or receive loot.
- **Error signaling:** use `Warning` or `Error` to reinforce invalid actions.
- **Moment-to-moment feel:** pair `Light`, `Medium`, or `Heavy` pulses with button presses or impacts.

## Best Practices

- Cache `RundotGameAPI.system.getDevice().haptics` to avoid repeated lookups and to understand if the host supports feedback.
- Avoid spamming vibrations: respect rhythm and allow cooldowns so the experience stays premium.
- Wrap calls in `try/catch`; some desktop browsers reject vibration promises.

