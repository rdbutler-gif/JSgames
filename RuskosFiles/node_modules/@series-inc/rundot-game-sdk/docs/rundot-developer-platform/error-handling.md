---
icon: shield-exclamation
---

# Error Handling

Every `RundotGameAPI` method is an RPC call across a React Native JS bridge. Any call, including ones typed as `void`, can return a promise that rejects due to bridge timeouts, disconnects, or host-side failures. **If your game leaves a rejection unhandled, the host app treats it as a fatal `RUNTIME_ERROR` and crashes the player back to the RUN catalog.**

## Fire-and-Forget Calls

Methods like `log()`, `analytics.recordCustomEvent()`, `triggerHapticAsync()`, and `popups.showToast()` don't return data you need, but they still return promises that can reject. Always attach a `.catch()`:

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

// Bad: unhandled rejection crashes the app
RundotGameAPI.log('player scored')

// Good: swallow transport errors on fire-and-forget calls
RundotGameAPI.log('player scored').catch(() => {})
```

### Reusable Helper

Copy this utility into your project to protect every fire-and-forget call in one line:

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'
import { HapticFeedbackStyle } from '@series-inc/rundot-game-sdk'

/** Attach .catch() to any thenable returned by a fire-and-forget SDK call. */
function catchVoid(result: unknown, label: string): void {
  try {
    if (
      result != null &&
      typeof result === 'object' &&
      'catch' in result &&
      typeof (result as Promise<unknown>).catch === 'function'
    ) {
      (result as Promise<unknown>).catch((err) => {
        console.warn(`[SDK] ${label}:`, err);
      });
    }
  } catch {
    // defensive
  }
}

// Usage
catchVoid(RundotGameAPI.log('player scored'), 'log')
catchVoid(RundotGameAPI.triggerHapticAsync(HapticFeedbackStyle.Light), 'haptic')
catchVoid(RundotGameAPI.analytics.recordCustomEvent('level_start', { level: 1 }), 'analytics')
```

## Awaited Calls

Methods where you need the result, storage, ads, purchases, subscriptions, entitlements, should always be wrapped in `try/catch`:

```typescript
try {
  await RundotGameAPI.appStorage.setItem('key', value)
} catch (err) {
  const storageError = err as { code?: string; retryAfterMs?: number }
  if (storageError.code === 'RATE_LIMITED') {
    console.warn('[SDK] storage throttled for ms:', storageError.retryAfterMs)
  } else if (storageError.code === 'TIMEOUT') {
    console.warn('[SDK] storage caller timed out; retain local state for a later save')
  } else {
    console.warn('[SDK] storage write failed:', err)
  }
}

try {
  const balance = await RundotGameAPI.iap.getHardCurrencyBalance()
} catch (err) {
  console.warn('[SDK] balance check failed:', err)
  // Show fallback UI or retry
}
```

## Structured Errors: RundotApiError

When the server returns a structured failure, the rejection is a `RundotApiError` (a subclass of `Error`, so `err.message` still works everywhere). Beyond `message`, it carries:

| Field | Type | Description |
|-------|------|-------------|
| `code` | `string` | Machine-readable error code, e.g. `VIDEO_GEN_SAFETY_FILTER`, `CREDITS_EXHAUSTED`, `TIMEOUT` |
| `status` | `number` | HTTP status when the error came over HTTP; `0` for RPC/transport errors |
| `detail` | `string \| undefined` | Human-readable cause from the upstream provider, when available |
| `errorDetail` | `ProviderErrorDetail \| undefined` | Structured provider rejection detail: `{ loc?, type?, reason?, msg? }` |
| `retryAfterMs` | `number \| undefined` | Backoff duration for `RATE_LIMITED` errors, including hosted storage errors crossing the RPC bridge |

`detail` is a display string; `errorDetail` is the machine-readable breakdown of the same rejection. Lead with `errorDetail` when you want to branch on the cause. The most common case is a content-policy rejection from video generation:

```typescript
import { RundotApiError } from '@series-inc/rundot-game-sdk'

try {
  const video = await RundotGameAPI.videoGen.generate({
    provider: 'seedance-2.0',
    mode: 'image-to-video',
    prompt: 'The character waves',
    startImageUrl: playerPhotoUrl,
  })
} catch (err) {
  if (err instanceof RundotApiError && err.errorDetail?.type === 'content_policy_violation') {
    // e.g. errorDetail = {
    //   loc: ['body', 'image_urls'],
    //   type: 'content_policy_violation',
    //   reason: 'partner_validation_failed',
    //   msg: 'The images or videos provided may contain likenesses of real people…',
    // }
    askPlayerForDifferentImage(err.errorDetail.msg)
  } else {
    console.warn('[SDK] video generation failed:', err)
  }
}
```

Every field on `errorDetail` is optional — treat it as best-effort metadata and always keep a generic fallback path.

## Quick Reference

| Call type | Examples | Pattern |
|-----------|---------|---------|
| Fire-and-forget | `log()`, `analytics.recordCustomEvent()`, `triggerHapticAsync()`, `popups.showToast()` | `.catch(() => {})` or `catchVoid()` helper |
| Awaited | `appStorage.setItem()`, `iap.spendCurrency()`, `ads.showRewardedAdAsync()` | `try/catch` block |

## Global Safety Net

As a last resort, add a global unhandled-rejection handler so a single missed `.catch()` doesn't crash your game:

```typescript
window.addEventListener('unhandledrejection', (event) => {
  console.warn('[SDK] unhandled rejection:', event.reason)
  event.preventDefault() // prevent the host from treating it as fatal
})
```

{% hint style="warning" %}
The global handler is a safety net, not a substitute for proper error handling. Wrap every SDK call individually so you can handle failures where they happen.
{% endhint %}
