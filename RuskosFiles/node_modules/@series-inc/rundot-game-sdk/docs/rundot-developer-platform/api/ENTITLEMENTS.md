# Entitlements API

Track what players own in your game. Entitlements represent items, power-ups, passes, and other in-game assets that are granted through purchases, rewards, or admin actions.

## Overview

Entitlements are server-authoritative records of player ownership. The server is the source of truth; games read entitlements via the SDK and consume them when used.

- **Granted** by the shop purchase flow, admin tools, collectible rules (see [Stats API](STATS.md) and [Collectibles API](COLLECTIBLES.md)), or backend services (not directly by the SDK)
- **Consumed** by the game client via the SDK when a player uses a consumable item
- **Queried** by the game client to check what the player owns

Each entitlement is scoped to a `(userId, gameId, entitlementId)` tuple. If a player is granted the same entitlement multiple times, the quantity is incremented on the existing entitlement rather than creating duplicates.

## Entitlement Types

| Type | `consumable` | Behavior |
|---|---|---|
| **Consumable** | `true` | Quantity decreases on use. Auto-revoked when quantity reaches 0. |
| **Non-consumable** | `false` | Permanent ownership. Cannot be consumed via the SDK. |
| **Time-bound** | either | Has an `expiresAt` timestamp. Automatically expired by the server. |

## SDK Usage

### List Entitlements

Get all active entitlements for the current player in the current game.

```typescript
const entitlements = await RundotGameAPI.entitlements.listEntitlements()

for (const ent of entitlements) {
  console.log(`${ent.entitlementId}: qty=${ent.quantity}, consumable=${ent.consumable}`)
  if (ent.expiresAt) {
    console.log(`  Expires: ${new Date(ent.expiresAt).toISOString()}`)
  }
}
```

### Get Quantity

Check how many of a specific entitlement the player owns. Returns `0` if the entitlement doesn't exist or is not active.

```typescript
const coins = await RundotGameAPI.entitlements.getQuantity('gold_coins')
console.log(`Player has ${coins} gold coins`)

if (coins >= 10) {
  // Player can afford the upgrade
}
```

### Consume Entitlement

Use up a quantity of a consumable entitlement. The server deducts the quantity atomically and returns the updated entitlement. If quantity reaches 0, the entitlement is automatically revoked.

```typescript
const updated = await RundotGameAPI.entitlements.consumeEntitlement(
  'health_potion',  // entitlementId
  1,                // quantity to consume
)

console.log(`Remaining potions: ${updated.quantity}`)
```

**With callback**: the callback runs exactly once on success with the resulting entitlement and the referenceId that was used:

```typescript
await RundotGameAPI.entitlements.consumeEntitlement(
  'health_potion',
  1,
  (entitlement, referenceId) => {
    // Apply the game effect here
    player.heal(50)
    console.log(`Consumed with ref: ${referenceId}`)
  },
)
```

The callback may be synchronous or return a `Promise` (`void | Promise<void>`). It is `await`ed before `consumeEntitlement` resolves, so an async callback (for example one that awaits a save) delays the returned promise until it settles.

If the callback throws, or a returned Promise rejects, the error is caught and logged as a warning but the consume still succeeds; the entitlement quantity is already deducted server-side. The returned entitlement is a fresh snapshot reflecting the post-consume `quantity` and `updatedAt`.

{% hint style="info" %}
When a consumable hits `0`, the server revokes it. The consume call still returns the quantity-`0` snapshot, but the next `listEntitlements()` / `getQuantity()` will no longer return that entitlement.
{% endhint %}

**With reason**: an optional human-readable reason stored in the ledger:

```typescript
await RundotGameAPI.entitlements.consumeEntitlement(
  'gold_coins',
  100,
  undefined,       // no callback
  'Bought armor',  // reason
)
```

The `reason` is forwarded verbatim and written to the resulting ledger entry's `reason` field. When omitted it is stored as `null` (not an empty string). The consume also writes a ledger entry with `action: 'consume'`, `change: -quantity`, and `source: 'progression'`.

### Idempotent Retries

Every consume call uses a unique `referenceId` for idempotency. If a network error occurs and you need to retry, pass the same referenceId so the server doesn't double-consume:

```typescript
let savedRefId: string | undefined

try {
  await RundotGameAPI.entitlements.consumeEntitlement(
    'coins',
    10,
    (_ent, refId) => {
      savedRefId = refId
      riskyOperation() // may throw
    },
  )
} catch {
  // Retry with the same referenceId; the server won't double-consume
  await RundotGameAPI.entitlements.consumeEntitlement(
    'coins',
    10,
    undefined,
    undefined,
    savedRefId,
  )
}
```

A referenceId is generated automatically if you don't provide one. Only pass one explicitly when retrying a failed call.

### Get Ledger

Retrieve the audit trail of all entitlement changes (grants, consumes, revokes, expirations) for the current player. Entries are returned newest-first (descending `createdAt`).

```typescript
// Get all recent ledger entries
const entries = await RundotGameAPI.entitlements.getLedger()

for (const entry of entries) {
  console.log(`${entry.action} ${entry.entitlementId}: ${entry.change} (balance: ${entry.balanceAfter})`)
}
```

**Filter by entitlement:**

```typescript
const coinHistory = await RundotGameAPI.entitlements.getLedger('gold_coins')
```

**With pagination:**

```typescript
// First page
const page1 = await RundotGameAPI.entitlements.getLedger(undefined, 20)

// Next page: pass the createdAt of the last entry
const lastEntry = page1[page1.length - 1]
const page2 = await RundotGameAPI.entitlements.getLedger(undefined, 20, lastEntry.createdAt)
```

`startAfter` is a `createdAt` millisecond timestamp used as an exclusive cursor: only entries with `createdAt < startAfter` are returned (the matching entry is excluded). It is not an opaque page token, an offset, or a `ledgerId`. Because results are descending, passing the last entry's `createdAt` yields the next (older) page.

## Type Reference

### Entitlement

```typescript
interface Entitlement {
  docId: string
  userId: string
  gameId: string
  entitlementId: string
  quantity: number
  consumable: boolean
  status: 'active' | 'revoked' | 'expired'
  expiresAt: number | null     // ms since epoch, null = permanent
  createdAt: number            // ms since epoch
  updatedAt: number            // ms since epoch
  revokedAt: number | null     // ms since epoch
}
```

### LedgerEntry

```typescript
interface LedgerEntry {
  ledgerId: string
  userId: string
  gameId: string
  entitlementId: string
  change: number               // positive for grants, negative for consumes/revokes
  action: 'grant' | 'consume' | 'revoke' | 'expire'
  source: string               // 'purchase', 'battlepass', 'progression', 'reward', 'admin'
  referenceId: string          // idempotency key
  reason: string | null        // human-readable reason, null when omitted
  createdAt: number            // ms since epoch
  balanceAfter: number         // quantity after this change
}
```

A ledger entry from a game-driven `consumeEntitlement` carries `source: 'progression'`, `action: 'consume'`, and `change: -quantity`. Filter on `source === 'progression'` to isolate in-game consumes from grants made by purchases, rewards, or admin tools.

## Method Reference

| Method | Description |
|---|---|
| `listEntitlements()` | Get all active entitlements for the current game |
| `getQuantity(entitlementId)` | Get current quantity for a specific entitlement (0 if not owned) |
| `consumeEntitlement(entitlementId, quantity, callback?, reason?, referenceId?)` | Consume a quantity of a consumable entitlement |
| `getLedger(entitlementId?, limit?, startAfter?)` | Get audit trail of entitlement changes |

## Error Handling

All methods throw on failure. Common errors:

| Error message prefix | Cause |
|---|---|
| `Entitlement not found` | Entitlement doesn't exist or is not active for this player |
| `Entitlement is not consumable` | Tried to consume a non-consumable entitlement |
| `Insufficient quantity` | Tried to consume more than the player owns |
| `quantity must be a positive integer` | Tried to consume a quantity that isn't a positive integer (rejects `0`, negatives, and fractional values) |

{% hint style="warning" %}
Several are message **prefixes**. The full thrown messages append detail (`Entitlement not found: <entitlementId>`, `Insufficient quantity: have <n>, need <m>`), so match with `.includes(...)` rather than equality-checking the full string. The quantity error is the exact string `quantity must be a positive integer`. Production server errors may carry different wording; substring-matching on the prefix is the reliable approach.
{% endhint %}

Reusing a `referenceId` that was already processed for a **different** entitlement is rejected by the server, not the SDK. The RPC path forwards `{ entitlementId, quantity, referenceId, reason }` without a client-side idempotency check, so the exact message text is server-defined and not guaranteed by the SDK. Within the same entitlement, reusing a referenceId is the intended idempotency behavior (see [Idempotent Retries](#idempotent-retries)).

{% hint style="info" %}
`consumeEntitlement` rejects a `quantity` that isn't a positive integer (rejecting `0`, negatives, and fractional values). Local Playground testing and the production server enforce the same positive-integer check, both surfacing `quantity must be a positive integer`. The production RPC path forwards the request to the server, which returns the rejection as a thrown error from the call.
{% endhint %}

```typescript
try {
  await RundotGameAPI.entitlements.consumeEntitlement('boost', 1)
} catch (error) {
  if (error.message.includes('Insufficient quantity')) {
    showMessage('Not enough boosts!')
  } else if (error.message.includes('not consumable')) {
    showMessage('This item cannot be used')
  } else {
    showMessage('Something went wrong')
  }
}
```

## Relationship with Shop

When a player purchases a shop item, the server automatically grants the entitlements defined in the item's config. You don't need to grant entitlements manually; just define them in your shop config and they're granted on purchase.

See the [Shop API](./SHOP.md) for how to configure items with entitlements and the [Purchases API](./PURCHASES.md) for the purchase flow.

## Relationship with Stats & Collectibles

Entitlements can also be auto-granted by **collectible rules** when a player's stats cross a threshold. The rule lives in your project's `rundot/collectibles.config.json`; when the client calls `RundotGameAPI.stats.submit(...)` and the new value satisfies the rule's predicate, the server fires `entitlementService.grant(...)` server-side and returns a `GrantInfo` for the new card inline with the `submit()` response. No SDK grant call is involved.

This is how RUN.tv's free episode cards land in player libraries: watching to 90% of an episode submits `episode_watched_<series>_<episode> = 1`, which trips the rule and grants the corresponding card entitlement. Your game reads the resulting ownership through the normal `listEntitlements()` / `getQuantity()` calls.

See the [Stats API](./STATS.md) for the submit/getValue surface and the rule config schema, and the [Collectibles API](./COLLECTIBLES.md) for catalog reads + VIP claims.

## Best Practices

- **Check quantities before consuming**: call `getQuantity()` to show UI state, then `consumeEntitlement()` when the player acts. The server enforces the check atomically, but pre-checking avoids unnecessary error round-trips.
- **Use callbacks for game effects**: apply in-game effects in the consume callback to ensure they only fire on successful consumes.
- **Save referenceIds for retries**: if your game effect is critical (e.g., awarding a reward), capture the referenceId in the callback and retry with it on failure.
- **Don't cache quantities long-term**: entitlements can change server-side (grants, expirations). Re-fetch when the player returns to a screen that shows quantities.
- **Non-consumables are permanent**: use `getQuantity() > 0` to check ownership of permanent items like skins or characters.
