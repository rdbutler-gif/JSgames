# Collectibles API (BETA)

Read the card catalog deployed with your game and let players claim subscriber-exclusive VIP cards. Card ownership itself flows through the [Entitlements API](ENTITLEMENTS.md) (each card is a non-consumable entitlement); the methods on this namespace are for catalog hydration and VIP-tier claims.

***

## Overview

A *card* is one non-consumable entitlement plus a chunk of presentation metadata (title, rarity, art paths, etc.). The metadata lives in your project's `rundot/collectibles.config.json` and is deployed with `rundot deploy`. The Collectibles API gives end users a way to:

1. **Fetch the deployed catalog** on game init so they can render owned-vs-unowned cards.
2. **Claim VIP-tier cards** for which they are eligible (active subscription + completed series).

How players *earn* free / completion cards (watch threshold crossings, rule eval) is described in the [Stats API](STATS.md). How players *purchase* premium cards is described in the [Shop API](SHOP.md). All three paths produce the same kind of artifact — an entitlement the platform records.

***

## API

The Collectibles API lives on `RundotGameAPI.collectibles`. Two methods.

### `listCards()`

```ts
const catalog = await RundotGameAPI.collectibles.listCards()
// CollectibleCard[]
```

Returns the full card catalog for the current game. Pure metadata — no per-user state. Typically called once on game init and cached client-side; the catalog only changes on the next `rundot deploy`.

```ts
interface CollectibleCard {
  cardId: string                                  // = entitlementId on the platform
  storyId: string
  episodeId?: string
  type: 'free' | 'premium' | 'vip' | 'completion'
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
  title: string
  description: string
  artPath: string                                 // CDN-relative; resolve via cdn.resolveAssetUrl
  thumbPath: string
  lockedArtPath?: string
  priceRbOverride?: number                        // premium only
  limitedTimeEnd?: string                         // ISO date, premium only
}
```

To know which cards the player currently owns, intersect this catalog with `RundotGameAPI.entitlements.listEntitlements()` by `cardId === entitlementId`.

### `claimVipCard(seriesId, cardId)`

```ts
const result = await RundotGameAPI.collectibles.claimVipCard('curse_of_marble', 'curse_of_marble_vip')
// { granted: true, cardId: 'curse_of_marble_vip' }
```

Claims a VIP-tier collectible card for the current user. The server validates two preconditions before granting:

1. **Subscription status** — the user must be an active subscriber (RevenueCat-backed). Non-subscribers receive a 403 with the message "Subscription required to claim."
2. **Series completion** — the user must have completed the requested series (the server checks the `series_completed_{seriesId}` stat).

On success the matching card entitlement is granted directly — no rule engine, no client-writable trigger stat involved. The promise resolves with `{ granted: true, cardId }`.

On failure the promise rejects with an `Error` whose message is the server-supplied detail. Typical consumer pattern:

```ts
try {
  const { cardId } = await RundotGameAPI.collectibles.claimVipCard(seriesId, cardId)
  showRevealOverlay(cardId)
} catch (err) {
  showToast(err.message)   // "Subscription required to claim" / "Not eligible to claim this card"
}
```

Each call is a single user-initiated action — direct RPC, no batching.

***

## Authoring cards

Cards live in `rundot/collectibles.config.json` alongside the rules that grant them. See the [Stats API](STATS.md#wiring-stats-to-collectible-grants) for the full schema (cards + rules + series settings) and an end-to-end watch-threshold-grants-card example.

***

## Related

- [Stats API](STATS.md) — submit watch / progress stats that trigger rule-driven grants
- [Entitlements API](ENTITLEMENTS.md) — read card ownership, audit grants
- [Shop API](SHOP.md) — premium card purchase flow
