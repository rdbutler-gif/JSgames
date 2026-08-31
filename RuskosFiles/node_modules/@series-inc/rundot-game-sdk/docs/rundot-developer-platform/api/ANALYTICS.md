# Analytics API

Record gameplay telemetry and funnel steps. Events flow to the host analytics pipeline with consistent schema and automatic attribution.

{% hint style="info" %}
Analytics calls are fire-and-forget. The SDK catches RPC failures internally and logs a non-fatal warning to the console; your code does not need a `.catch()` handler, and rejections will not crash the host. This is unlike `storage`, `ads`, and `purchases`, which can reject and require handling: see [Error Handling](../error-handling.md).
{% endhint %}

> **Note**: This API fires events to the analytics pipeline; it records data but does not provide analytics dashboards or reporting. Use the platform dashboard to view and analyze your recorded events.

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

RundotGameAPI.analytics.recordCustomEvent('level_complete', {
  level: 5,
  score: 1200,
  timeElapsed: 98,
})
```

## Best Practices

* Keep event names stable and snake\_case for easier querying.
* Limit payload size; send identifiers for large objects instead of entire blobs.
* Combine analytics with `RundotGameAPI.profile` data (id, username) for joined analysis without extra network calls.
* Batch non-critical analytics behind `onPause` or `onSleep` to avoid mid-gameplay network churn.
* Define your funnel steps upfront and keep step numbers consistent.
* Use meaningful event names that describe what happened (e.g., `boss_defeated`, not `event_1`).

## Custom Events

Record custom events with payloads to capture gameplay context. Events flow to the analytics pipeline automatically — no registration step is required for them to appear in your dashboards:

```typescript
RundotGameAPI.analytics.recordCustomEvent('boss_defeated', {
  bossId: 'dragon',
  attempts: 3,
  remainingHp: 12,
  weaponUsed: 'fire_sword',
})

RundotGameAPI.analytics.recordCustomEvent('purchase_complete', {
  itemId: 'gold_pack_100',
  price: 99,
  currency: 'runbucks',
})
```

The payload is an optional `Record<string, any>` (an arbitrary key/value object), so you can attach whatever context you want. Calling `recordCustomEvent('name')` with no payload is valid when the event name alone is enough.

Every custom event is automatically stamped with `_game_version`, the running H5 build version supplied by the host. This parameter is reserved: if game code includes its own `_game_version`, the host overwrites it with the authoritative running version.

{% hint style="info" %}
The interface names the second argument `payload`, while this doc's API Reference table and the deprecated root `logCustomEvent({ eventName, params })` call it `params`. They refer to the same thing.
{% endhint %}

## Funnel Tracking

Track funnels with step numbers for precise drop-off reporting. This is a separate, opt-in step from the above Custom Events:

```typescript
// Onboarding funnel
RundotGameAPI.analytics.trackFunnelStep(1, 'tutorial_start', 'onboarding')
RundotGameAPI.analytics.trackFunnelStep(2, 'tutorial_movement', 'onboarding')
RundotGameAPI.analytics.trackFunnelStep(3, 'tutorial_combat', 'onboarding')
RundotGameAPI.analytics.trackFunnelStep(4, 'tutorial_complete', 'onboarding')

// Purchase funnel
RundotGameAPI.analytics.trackFunnelStep(1, 'shop_opened', 'purchase')
RundotGameAPI.analytics.trackFunnelStep(2, 'item_selected', 'purchase')
RundotGameAPI.analytics.trackFunnelStep(3, 'checkout_started', 'purchase')
RundotGameAPI.analytics.trackFunnelStep(4, 'purchase_complete', 'purchase')
```

You can optionally provide a `funnelOrder` value to indicate where a funnel occurs in your overall user journey. 

This is useful when you want to compare multiple funnels (for example, onboarding and purchase) side by side in a single dashboard while preserving their chronological order.

```typescript
// Onboarding funnel
RundotGameAPI.analytics.trackFunnelStep(1, 'tutorial_start', 'onboarding', 1) // the 1 indicates this is the first funnel in the game
RundotGameAPI.analytics.trackFunnelStep(2, 'tutorial_movement', 'onboarding', 1)

// Purchase funnel
RundotGameAPI.analytics.trackFunnelStep(1, 'shop_opened', 'purchase', 2) // the 2 indicates this is the second funnel in the game
RundotGameAPI.analytics.trackFunnelStep(2, 'item_selected', 'purchase', 2)
```

If this argument is not passed, the funnel will have an order value of 0.

## API Reference

| Method                                              | Returns         | Description                         |
| --------------------------------------------------- | --------------- | ----------------------------------- |
| `recordCustomEvent(name, params?)`                  | `Promise<void>` | Record a custom event with payload  |
| `trackFunnelStep(step, name, funnel?, funnelOrder?)` | `Promise<void>` | Track a step in a conversion funnel |

##
