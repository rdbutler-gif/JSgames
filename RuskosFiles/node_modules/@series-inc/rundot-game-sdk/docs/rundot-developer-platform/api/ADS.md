# Ad Monetization API

Monetize your game with rewarded videos and interstitials. The host manages presentation; your game just requests placements and reacts to the result.

{% hint style="info" %}
This is **ad monetization** — earning revenue by showing ads inside your game. To *spend* on ads that bring new players to your game, see [Marketing Your Game](../marketing-your-game.md).
{% endhint %}

{% hint style="warning" %}
All SDK methods can reject; unhandled rejections crash the app. Always wrap SDK calls in `try/catch` or attach a `.catch()` handler. See [Error Handling](../error-handling.md) for details.
{% endhint %}

{% hint style="danger" %}
Ads are not currently supported on Desktop. \
Calling the Ads API on Desktop will show a universal link to the mobile app.&#x20;
{% endhint %}

## Ad Types

### Rewarded Video Ads

Opt-in ads where players receive rewards for watching. Players choose to watch these ads in exchange for in-game benefits.

```typescript
const isReady = await RundotGameAPI.ads.isRewardedAdReadyAsync()
if (isReady) {
  const rewardEarned = await RundotGameAPI.ads.showRewardedAdAsync()
  if (rewardEarned) {
    grantReward() // Player earned the reward
  }
}
```

{% hint style="info" %}
`showRewardedAdAsync()` resolves `true` only when the reward was actually earned. A `false` result covers both "the ad was never shown" and "the ad was shown but the player closed it early". Treat the boolean as your grant gate, not as a "the ad played" signal. The host does not surface a separate "shown" flag for rewarded ads.
{% endhint %}

**Use cases:**
- Extra lives or continues
- Bonus currency
- Speed up timers
- Unlock temporary power-ups

### Interstitial Ads

Forced ads that interrupt gameplay at natural break points. These ads are automatically hidden for platform subscribers.

```typescript
const isReady = await RundotGameAPI.ads.isInterstitialAdReadyAsync()
if (isReady) {
  // Show interstitial at level transition
  await RundotGameAPI.ads.showInterstitialAd()
  // Gameplay resumes after ad completes or is skipped
}
```

**Use cases:**
- Between levels
- After game over
- After completing a session
- On menu transitions

> **Note**: Interstitial ads are hidden for users with platform subscriptions. Your code can safely call `showInterstitialAd()` for all users: subscribers simply won't see the ad.

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

const isReady = await RundotGameAPI.ads.isRewardedAdReadyAsync()
if (isReady) {
  const rewardEarned = await RundotGameAPI.ads.showRewardedAdAsync()
  if (rewardEarned) {
    grantReward()
  }
}
```

## Complete Example

```typescript
// Rewarded ad button handler
async function onWatchAdForReward() {
  const isReady = await RundotGameAPI.ads.isRewardedAdReadyAsync()
  
  if (!isReady) {
    showMessage('No ad available right now')
    return
  }
  
  try {
    // Pass placement metadata so the reward shows up correctly in attribution/analytics
    const rewardEarned = await RundotGameAPI.ads.showRewardedAdAsync({
      adDisplayId: 'extra_life',
      adDisplayName: 'Extra Life Reward',
    })
    if (rewardEarned) {
      grantBonus(100) // Give the reward
      await RundotGameAPI.analytics.recordCustomEvent('rewarded_ad_complete', {
        reward: 'bonus_100',
      })
    }
  } catch (error) {
    console.error('Ad failed:', error)
  }
}

// Interstitial between levels
async function onLevelComplete(level: number) {
  saveProgress(level)
  
  // Show interstitial every 3 levels
  if (level % 3 === 0) {
    await RundotGameAPI.ads.showInterstitialAd({
      adDisplayId: 'level_transition',
      adDisplayName: 'Level Transition',
    })
  }
  
  loadNextLevel(level + 1)
}
```

## API Reference

| Method | Returns | Description |
|--------|---------|-------------|
| `isRewardedAdReadyAsync()` | `Promise<boolean>` | Check if a rewarded ad is available |
| `isInterstitialAdReadyAsync()` | `Promise<boolean>` | Check if an interstitial ad is available |
| `showRewardedAdAsync(options?)` | `Promise<boolean>` | Show rewarded ad; resolves `true` when the reward was earned |
| `showInterstitialAd(options?)` | `Promise<boolean>` | Show interstitial ad; resolves `true` if the ad was displayed (e.g. `false` for subscribers or when no ad was available) |

### Display Options

Both `showRewardedAdAsync(options?)` and `showInterstitialAd(options?)` accept an optional options object. Every field is optional; the object is forwarded to the host for placement attribution and analytics. Omit it and the host uses its defaults.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `adDisplayId` | `string` | No | - | Identifier for this ad placement (e.g. `'extra_life'`, `'level_transition'`). Used by the host for attribution. |
| `adDisplayName` | `string` | No | - | Human-readable name for the placement, surfaced alongside `adDisplayId` in analytics. |

```typescript
const rewardEarned = await RundotGameAPI.ads.showRewardedAdAsync({
  adDisplayId: 'extra_life',
  adDisplayName: 'Extra Life Reward',
})
```

### Deprecated top-level aliases

Older code may call `RundotGameAPI.isRewardedAdReadyAsync()` and `RundotGameAPI.showRewardedAdAsync()` directly on the root object. Both still work and forward to the `ads` namespace, but they are marked `@deprecated`; use the `ads` namespace in new code.

The top-level `RundotGameAPI.showRewardedAdAsync()` takes no arguments: it cannot pass `adDisplayId` / `adDisplayName`, so you lose placement attribution. Use `RundotGameAPI.ads.showRewardedAdAsync(options?)` to keep it.

| Deprecated | Use instead |
|------------|-------------|
| `RundotGameAPI.isRewardedAdReadyAsync()` | `RundotGameAPI.ads.isRewardedAdReadyAsync()` |
| `RundotGameAPI.showRewardedAdAsync()` | `RundotGameAPI.ads.showRewardedAdAsync(options?)` |

## Best Practices

- Preflight with `isRewardedAdReadyAsync()` / `isInterstitialAdReadyAsync()` before calling display methods: hosts may throttle requests during campaigns.
- Disable reward buttons when `isRewardedAdReadyAsync()` returns `false` to avoid extra clicks.
- Guard reward logic so you only grant the prize when the call resolves `true`.
- Wrap ad calls in try/catch and fail silently; players might deny permissions or lose connectivity.
- Show interstitials at natural break points (level transitions, game over) not mid-gameplay.
- Don't show interstitials too frequently: player experience matters.
