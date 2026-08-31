# Credits API (BETA)

Read the player's AI **Creator credits** and drive a plan paywall. When a game is **player-billed**, the AI generation it triggers (`ai`, `imageGen`, `videoGen`) is charged to the signed-in player's Creator credits instead of the game owner's. This API lets you show the player their balance and plan, and resolve a deficit when they run out.

{% hint style="warning" %}
All SDK methods can reject; unhandled rejections crash the app. Always wrap SDK calls in `try/catch` or attach a `.catch()` handler. See [Error Handling](../error-handling.md) for details.
{% endhint %}

> **Note:** Creator credits are **not** the same as RunBucks. RunBucks are the in-game hard currency, handled by the [Purchases API](PURCHASES.md) (`RundotGameAPI.iap`). Creator credits are the AI credits that power generation in player-billed games. This API (`RundotGameAPI.credits`) only deals with Creator credits.

## Is My Game Player-Billed?

A game's billing mode is set by the platform, not by your game. `getBillingContext()` tells you how the current session bills AI generation. It is **informational only** — it never gates the other methods, so you can call any method regardless of billing mode and decide what to render yourself.

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

const ctx = await RundotGameAPI.credits.getBillingContext()
if (ctx.billedTo === 'player') {
  // The player pays for AI generation — show their balance / a top-up entry point.
  if (ctx.playerChargesEnabled) {
    // Charges are actively enforced right now.
  }
}
```

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

// Show the player's spendable Creator credits.
const balance = await RundotGameAPI.credits.getBalance()
console.log(`${balance.available} / ${balance.total} credits`)

// Quote a generation without running a model or spending credits.
const estimate = await RundotGameAPI.credits.estimateGenerationCost({
  kind: 'image',
  model: 'gemini-3-pro-image-preview',
  imageSize: '4K',
})
console.log(`${estimate.credits} credits${estimate.exact ? ' (exact)' : ''}`)

// Let the player upgrade their plan.
const result = await RundotGameAPI.credits.openPaywall()
if (result.outcome === 'purchased') {
  updateCreditsUI(result.balance)
}
```

## Handling Exhaustion

When a player-billed game runs the player out of credits mid-generation, the host can automatically open the paywall and retry the call — so for most games you don't have to do anything. Two flags (both **on** by default) control this:

* `setAutoPaywallOnExhaustion(enabled)` — on exhaustion, automatically open the paywall.
* `setAutoRetryOnPurchase(enabled)` — after a paywall purchase, automatically retry the original generation once and resolve it with the result.

| autoPaywall | autoRetry | What happens on exhaustion |
|---|---|---|
| `true` (default) | `true` (default) | Paywall opens. On purchase, the original call retries and resolves with the result. On cancel, it rejects with `CreditsExhaustedError`. |
| `true` | `false` | Paywall opens. On purchase, the call **rejects** (`paywallOutcome: 'purchased'`) so you can retry it yourself. On cancel, it rejects. |
| `false` | *(ignored)* | The call rejects immediately (`paywallShown: false`). |

These setters are **synchronous** — they update local SDK state and push it to the host fire-and-forget.

```typescript
// Drive your own credits UX instead of the built-in paywall:
RundotGameAPI.credits.setAutoPaywallOnExhaustion(false)

try {
  const image = await RundotGameAPI.imageGen.generate({ prompt: 'a fox' })
  show(image)
} catch (err) {
  if (isCreditsExhaustedError(err)) {
    // Show your own out-of-credits UI, then open the paywall on demand.
    const result = await RundotGameAPI.credits.openPaywall({ highlightTier: 'plus' })
    if (result.outcome === 'purchased') {
      retryGeneration()
    }
  }
}
```

## Reacting to Balance Changes

`onBalanceChanged` fires when the player's spendable balance changes (for example after a paywall purchase). It returns an unsubscribe function.

```typescript
const unsubscribe = RundotGameAPI.credits.onBalanceChanged((balance) => {
  updateCreditsUI(balance)
})

// later
unsubscribe()
```

## API Reference

<table><thead><tr><th width="320">Method</th><th>Returns</th><th>Description</th></tr></thead><tbody><tr><td><code>getBillingContext()</code></td><td><code>Promise&#x3C;CreditsBillingContext></code></td><td>How the current game bills AI generation. Informational only — never gates other calls.</td></tr><tr><td><code>getBalance()</code></td><td><code>Promise&#x3C;CreditBalance></code></td><td>The player's spendable / total Creator credits and free-daily info.</td></tr><tr><td><code>getSubscription()</code></td><td><code>Promise&#x3C;CreditSubscription></code></td><td>The player's current Creator plan (paid tier), if any.</td></tr><tr><td><code>getPlans()</code></td><td><code>Promise&#x3C;CreditPlansCatalog></code></td><td>The available plans, top-up packs, and the free-daily grant.</td></tr><tr><td><code>openPaywall(options?)</code></td><td><code>Promise&#x3C;CreditsPurchaseResult></code></td><td>Open the host paywall. Resolves once the player closes it.</td></tr><tr><td><code>setAutoPaywallOnExhaustion(enabled)</code></td><td><code>void</code></td><td>Toggle the automatic exhaustion paywall (default <code>true</code>). Synchronous.</td></tr><tr><td><code>getAutoPaywallOnExhaustion()</code></td><td><code>boolean</code></td><td>Current auto-paywall setting.</td></tr><tr><td><code>setAutoRetryOnPurchase(enabled)</code></td><td><code>void</code></td><td>Toggle automatic retry after an exhaustion purchase (default <code>true</code>). Synchronous.</td></tr><tr><td><code>getAutoRetryOnPurchase()</code></td><td><code>boolean</code></td><td>Current auto-retry setting.</td></tr><tr><td><code>onBalanceChanged(listener)</code></td><td><code>Unsubscribe</code></td><td>Subscribe to balance changes. Returns an unsubscribe function.</td></tr></tbody></table>

`estimateGenerationCost(request): Promise<GenerationCostEstimate>` returns an
unbilled quote from the canonical server pricing endpoint. It supports `image`,
`music`, `sfx`, `video`, `sprite`, `animate-sprite`,
`sprite-character-animate`, `tts`, `text`, and `upscale` requests.

`upscale` prices the Topaz upscale exactly as billing brackets it: pass the
source `contentType` — `'image/*'` quotes the flat image rate; `'video/*'`
quotes per second by `resolution` (`'720p'` or `'1080p'`) × `durationSeconds`.
Passing `outputMp` (output megapixels) selects the tiered advanced-upscale
pricing instead.

`quantity` multiplies the quote for a batch of identical generations (default
`1`) — a batch of N scene clips is `{ kind: 'video', …, quantity: N }`. Text
ranges scale bound-for-bound; the percent bounds are unchanged. Pass the
per-unit options (model, mode, duration, size) exactly as generation will send
them, or the quote prices a different product than the one you dispatch.

## Types

These types are exported from the package root, `@series-inc/rundot-game-sdk` (not the `/api` subpath).

### `CreditsBillingContext`

<table><thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead><tbody><tr><td><code>billedTo</code></td><td><code>'owner' | 'player'</code></td><td>Who AI generation in this game is billed to.</td></tr><tr><td><code>playerChargesEnabled</code></td><td><code>boolean</code></td><td><code>true</code> only when <code>billedTo === 'player'</code> AND charge enforcement is live.</td></tr></tbody></table>

### `GenerationCostEstimate`

Text estimate requests include the same `model`, `messages`, `system`, and
output-token cap used for generation. The result contains `credits`,
`lowCredits`, `highCredits`, `lowerPercent`, `upperPercent`, `exact`, and a
human-readable `reason`. Exact quotes use the same value for low, estimate, and
high. The server is the only pricing source; estimating never runs a model or
debits credits.

### `CreditBalance`

<table><thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead><tbody><tr><td><code>available</code></td><td><code>number</code></td><td>Credits the player can spend right now.</td></tr><tr><td><code>total</code></td><td><code>number</code></td><td>The "available / total" denominator.</td></tr><tr><td><code>freeDaily</code></td><td><code>CreditFreeDailyInfo | null</code></td><td>Free-daily grant info, or <code>null</code> when the player isn't eligible (e.g. a paid plan).</td></tr></tbody></table>

`CreditFreeDailyInfo`: `{ dailyCredits: number; availableCredits: number; nextResetAt: string }` (`nextResetAt` is an ISO timestamp).

### `CreditSubscription`

<table><thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead><tbody><tr><td><code>status</code></td><td><code>'active' | 'none'</code></td><td>Whether the player has an active Creator plan.</td></tr><tr><td><code>tier</code></td><td><code>string | null</code></td><td>The paid plan tier (e.g. <code>'plus'</code>), or <code>null</code>.</td></tr><tr><td><code>monthlyCredits</code></td><td><code>number | null</code></td><td>Credits granted per period for the active plan.</td></tr><tr><td><code>creditsRemaining</code></td><td><code>number | null</code></td><td>Credits remaining in the current period.</td></tr><tr><td><code>renewsAt</code></td><td><code>string | null</code></td><td>ISO renewal/expiry timestamp.</td></tr><tr><td><code>willRenew</code></td><td><code>boolean</code></td><td>Whether the plan will auto-renew.</td></tr></tbody></table>

### `CreditPlansCatalog`

<table><thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead><tbody><tr><td><code>plans</code></td><td><code>CreditPlan[]</code></td><td>Available subscription plans.</td></tr><tr><td><code>plansUnavailable</code></td><td><code>boolean</code></td><td>When <code>true</code>, the plan catalog couldn't be resolved right now and <code>plans</code> is empty — show "temporarily unavailable", not "no plans exist". <code>topUpPacks</code> and <code>freeDailyCredits</code> stay valid.</td></tr><tr><td><code>topUpPacks</code></td><td><code>CreditTopUpPack[]</code></td><td>One-time top-up packs (purchase UI is a future release).</td></tr><tr><td><code>freeDailyCredits</code></td><td><code>number</code></td><td>The free-daily grant amount.</td></tr></tbody></table>

`CreditPlan`: `{ tier: string; productId: string; monthlyCredits: number; rolloverDays: number }`.
`CreditTopUpPack`: `{ productId: string; credits: number }`.

### `OpenPaywallOptions`

<table><thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Description</th></tr></thead><tbody><tr><td><code>focus</code></td><td><code>'plans' | 'topup'</code></td><td>No</td><td>Which surface to focus. <code>'topup'</code> is a future surface (currently shows plans).</td></tr><tr><td><code>highlightTier</code></td><td><code>string</code></td><td>No</td><td>A tier id to visually highlight in the plan picker.</td></tr><tr><td><code>screenName</code></td><td><code>string</code></td><td>No</td><td>Screen/route name for analytics attribution.</td></tr></tbody></table>

### `CreditsPurchaseResult`

<table><thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead><tbody><tr><td><code>outcome</code></td><td><code>'purchased' | 'cancelled' | 'pending'</code></td><td>What the player did in the paywall.</td></tr><tr><td><code>balance</code></td><td><code>CreditBalance | null</code></td><td>The refreshed balance after the paywall closed, or <code>null</code> if it couldn't be read.</td></tr></tbody></table>

### `CreditsExhaustedError`

Thrown from `ai` / `imageGen` / `videoGen` calls when a player-billed game runs the player out of credits and the deficit wasn't resolved. Use the exported `isCreditsExhaustedError(err)` / `asCreditsExhaustedError(err)` helpers to detect and narrow it.

<table><thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead><tbody><tr><td><code>code</code></td><td><code>'CREDITS_EXHAUSTED'</code></td><td>Stable discriminator.</td></tr><tr><td><code>billedTo</code></td><td><code>'owner' | 'player'</code></td><td>Who the generation was billed to.</td></tr><tr><td><code>paywallShown</code></td><td><code>boolean</code></td><td>Whether the host opened the paywall before giving up.</td></tr><tr><td><code>paywallOutcome</code></td><td><code>'purchased' | 'cancelled' | 'pending' | null</code></td><td>The paywall result (<code>null</code> when <code>paywallShown</code> is <code>false</code>).</td></tr></tbody></table>

## Best Practices

* Treat `getBillingContext()` as a hint for what to render — never as a gate. Any method works regardless of billing mode.
* Leave the auto-paywall on for the simplest experience; only turn it off when you want a custom out-of-credits UX.
* Use `onBalanceChanged` to keep your credits UI in sync rather than polling `getBalance()`.
* Always handle the `'cancelled'` outcome — players will dismiss the paywall.
