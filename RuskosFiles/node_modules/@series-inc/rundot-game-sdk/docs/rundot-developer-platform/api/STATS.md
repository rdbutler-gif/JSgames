# Stats API (BETA)

A schemaless per-user key/value store for numerical game stats. Use it to track anything you'd like the platform to remember about a player — episodes watched, level cleared, score, distance traveled.

The Stats API is also the trigger surface for **collectible grants**: when a stat crosses a threshold defined in your game's collectibles config, the platform fires the matching grant rule and returns any newly-granted cards inline with your `submit()` call.

> **Beta scope.** During beta, stats are not a server-enforced security boundary. A server-only stat policy mechanism (`rundot/stats.config.json`) is on the v1.1 roadmap alongside server-authoritative anti-cheat. For RUN.tv-style consumers where stats drive entitlement grants, the exposure is bounded — see [Trust model](#trust-model) for details.

***

## Overview

Stats are stored per `(userId, gameId, statId)` tuple. Writes are **last-write-wins** — submitting the same value twice is a no-op; submitting a different value overwrites. There is no schema, no aggregation type negotiation, and no pre-definition step: the first `submit()` call materializes the stat.

The platform records the stored value but doesn't interpret it. Meaning is layered on top via your `rundot/collectibles.config.json` rules — see [Wiring stats to collectible grants](#wiring-stats-to-collectible-grants).

***

## API

The Stats API lives on `RundotGameAPI.stats`. Three methods:

### `submit(statId, value)`

```ts
const { grants } = await RundotGameAPI.stats.submit('episode_watched_curse_ep1', 1)
```

Persists the value and runs any matching grant-rule evaluations server-side. Resolves with `{ grants }` containing the cards granted **by this specific statId**:

```ts
interface GrantInfo {
  cardId: string                                  // = entitlementId on the platform
  ruleId: string                                  // the rule that fired
  type: 'free' | 'completion'                     // card type from your catalog
  source: 'watch' | 'completion_reward'           // for analytics attribution
}
```

For stats with no rules attached, `grants` is `[]`. For most game use cases you can ignore the return value entirely — the platform records the grant regardless and your consumer code can read it via the [Entitlements API](ENTITLEMENTS.md) on a separate cadence.

### `getValue(statId)`

```ts
const score = await RundotGameAPI.stats.getValue('high_score')   // number | null
```

Returns the current value, or `null` if the stat has never been submitted.

### `getAllValues()`

```ts
const all = await RundotGameAPI.stats.getAllValues()
// { episode_watched_curse_ep1: 1, high_score: 42_000, ... }
```

Returns every stat for the current user in this game, as a flat map.

> Claiming a VIP collectible card given a `series_completed_*` stat is a [Collectibles API](COLLECTIBLES.md) concern, not a Stats API concern. The corresponding method lives at `RundotGameAPI.collectibles.claimVipCard(seriesId, cardId)`.

***

## Coalescing and timing

Submits issued within the same synchronous tick coalesce into a single round-trip. The first `submit()` schedules a microtask flush; any further `submit()` calls in the same tick join the same pending batch (last-write-wins per `statId`). On the next microtask, one RPC carries the whole batch.

```ts
// Synchronous burst — one RPC for the whole batch.
RundotGameAPI.stats.submit('coins', 10)
RundotGameAPI.stats.submit('coins', 12)   // value wins: 12
RundotGameAPI.stats.submit('gems', 3)
// → single RPC with { coins: 12, gems: 3 } fires on the next microtask
```

**Per-stat outcomes.** Each caller's promise resolves or rejects based on **their own stat's** outcome. If you submit `coins` and a teammate submits `gems` in the same tick and the bridge succeeds for `coins` but fails for `gems`, your promise resolves with the `coins` grants and theirs rejects with the `gems` error. You will not observe grants from another caller's stat ID.

**Read methods are not batched** — `getValue` and `getAllValues` fire one RPC each.

***

## Wiring stats to collectible grants

To make a stat trigger a grant, declare a rule in your project's `rundot/collectibles.config.json`. The rule watches a stat ID and grants an entitlement when the threshold is crossed.

```json
{
  "cards": [
    {
      "cardId": "curse_of_marble_ep1_intro",
      "storyId": "curse_of_marble",
      "episodeId": "ep1",
      "type": "free",
      "rarity": "common",
      "title": "The Beginning",
      "description": "Marble's first day at the academy.",
      "artPath": "Cards/curse_of_marble/ep1_intro.png",
      "thumbPath": "Cards/curse_of_marble/ep1_intro_thumb.png"
    }
  ],
  "rules": [
    {
      "ruleId": "grant_curse_of_marble_ep1_intro",
      "statId": "episode_watched_curse_of_marble_ep1",
      "operator": ">=",
      "threshold": 1,
      "rewardType": "entitlement",
      "rewardConfig": {
        "entitlementId": "curse_of_marble_ep1_intro",
        "quantity": 1,
        "consumable": false
      }
    }
  ]
}
```

Deploy via `rundot deploy`. When the client submits `episode_watched_curse_of_marble_ep1 = 1`, the rule fires, the entitlement is granted server-side, and the `{ grants }` array in the `submit()` response carries a `GrantInfo` for the new card.

See the [Entitlements API](ENTITLEMENTS.md) for ownership reads (`listEntitlements`, `getQuantity`, `getLedger`).

***

## Example: watch threshold → card grant

```ts
function onVideoProgress(seriesId: string, episodeId: string, progress: number) {
  if (progress < 0.9) return
  if (alreadyMarked(seriesId, episodeId)) return

  RundotGameAPI.stats
    .submit(`episode_watched_${seriesId}_${episodeId}`, 1)
    .then(({ grants }) => {
      for (const grant of grants) {
        showRevealOverlay(grant.cardId)
      }
    })
    .catch((err) => {
      console.error('Failed to record watch progress', err)
    })
}
```

The `then` callback runs after the rule eval. `grants` is empty for most calls (most submits aren't crossing a threshold for the first time) — when it has entries, that's a freshly-granted card.

***

## Trust model

During beta, stats wired to grant rules are best-effort tracking, not a security boundary — treat any stat that drives a grant as client-influenced. Three things bound the impact:

- **Cards are non-fungible.** No resale, no trading, no price — the only "value" is displaying them on the user's own Profile.
- **Grants are idempotent.** Deterministic grant doc IDs cap any given rule to one grant per user, so cheating is one-shot per rule.
- **VIP boundary preserved.** VIP card claims use a dedicated server-validated endpoint that bypasses the rule engine entirely; cheating series-completion stats doesn't get past the subscription check.

The server-only stat policy mechanism (`rundot/stats.config.json` declaring patterns of stat IDs that only accept server-side writes) is on the v1.1 roadmap. Until it lands, treat stats wired to grant rules as best-effort tracking, not a security boundary.

***

## Related

- [Entitlements API](ENTITLEMENTS.md) — read ownership, consume, audit grants
- [Leaderboards API](LEADERBOARD.md) — competitive rankings with stronger anti-cheat
