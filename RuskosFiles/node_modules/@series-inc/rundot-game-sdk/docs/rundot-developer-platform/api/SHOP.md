# Shop API

Browse your game's shop catalog from within your H5 game. The catalog is defined in your game's server config and uploaded via the existing server config pipeline.

## Overview

The shop system uses your game's **server config** as the source of truth:

1. Define your shop catalog in `rundot/shop.config.json`
2. Upload it with `rundot game upload-server-config`. This prints the new config's `Id` — note it for the next step.
3. Point a tag at that config so the storefront can resolve it: `rundot game update-tag public --server-config-id <id>`. Uploading alone is **not** enough — the storefront reads the `public` tag, so a config that no tag references returns `404`.
4. The SDK reads the catalog at runtime via `RundotGameAPI.shop`

Each config upload creates a new immutable version. The storefront response includes a `configId` that pins the catalog to a specific version.

In [Playground](../playground.md#shop-and-entitlements-in-playground) the shop resolves the `private` tag that the dev server's config upload repoints, so your local `rundot/shop.config.json` is what you see — and purchases are real on the target environment (persistent orders, wallet debits, entitlement grants).

> **Publishing a live game?** Use the `rundot deploy` flow instead of pointing `public` by hand. `deploy` uploads your server config and lands it on a staging/in-review tag; it's promoted to the `public` tag through the normal review/approval step. `rundot game update-tag` is the manual override, handy while developing and testing.

## Config Structure

### Recommended: `rundot/shop.config.json`

Place your shop config at `rundot/shop.config.json`. The file contains the shop configuration **directly** (no `shop` wrapping key):

```json
{
  "items": [
    {
      "itemId": "speed_boost",
      "name": "Speed Boost",
      "description": "Double movement speed for 60 seconds",
      "category": "consumable",
      "price": { "type": "bucks", "value": "100" },
      "entitlements": [
        { "entitlementId": "speed_boost_effect", "quantity": 1, "consumable": true }
      ],
      "assets": { "icon": "speed_icon.png" },
      "unique": false,
      "active": true,
      "regions": [],
      "refundEligible": true,
      "refundWindowHours": 24,
      "tags": ["boost"],
      "sortOrder": 1,
      "releasedAt": null,
      "expiresAt": null
    }
  ],
  "sales": [
    {
      "saleId": "launch_sale",
      "targetId": "speed_boost",
      "discountType": "percentage",
      "discountValue": 25,
      "regions": [],
      "startsAt": 0,
      "endsAt": 4102444800000,
      "active": true
    },
    {
      "saleId": "episode_sale",
      "targetId": "episodes",
      "targetType": "collection",
      "discountType": "percentage",
      "discountValue": 20,
      "regions": [],
      "startsAt": 0,
      "endsAt": 4102444800000,
      "active": true,
      "itemFilter": { "tags": ["premium"] }
    }
  ],
  "collections": [
    {
      "collectionId": "episodes",
      "price": { "type": "bucks", "value": "50" },
      "entitlement": { "consumable": false },
      "refundEligible": true,
      "refundWindowHours": 24,
      "items": [
        {
          "itemId": "ep-premium-1",
          "tags": ["premium"],
          "priceOverride": { "type": "bucks", "value": "100" }
        }
      ]
    }
  ]
}
```

> Commit `rundot/` to your repo: it's project config like `package.json`, not a build artifact. It's env-agnostic and takes priority over legacy `config.{local,staging}.json` for any system it defines. `game.config.prod.json` is a separate file for local CLI metadata (`gameId`, `relativePathToDistFolder`); shop config does not go there.

### Also supported: legacy `config.json`

Add a `shop` key to your project's `config.json` (alongside `simulation`, etc.). Legacy layouts keep working indefinitely; run `rundot migrate-config` (with `--dry-run` to preview) to move them into `rundot/` automatically.

<details>

<summary>Legacy <code>config.json</code></summary>

```json
{
  "simulation": { ... },
  "shop": {
    "items": [ ... ],
    "sales": [ ... ],
    "collections": [ ... ]
  }
}
```

</details>

## Item Fields

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `itemId` | string | Yes | - | Unique identifier within the game |
| `name` | string | Yes | - | Display name |
| `description` | string | Yes | - | Display description |
| `category` | enum | Yes | - | `consumable`, `non_consumable`, or `time_bound` |
| `price` | object | Yes | - | `{ type, value }`: see Price Structure |
| `entitlements` | array | Yes | - | What the player receives: see Entitlements |
| `assets` | object | No | `{}` | `{ thumbnail?, banner?, icon? }`: image identifiers |
| `unique` | boolean | No | `false` | If true, player can only own one |
| `active` | boolean | No | `false` | Whether the item is visible/purchasable |
| `regions` | string[] | No | `[]` | Region codes; empty = all regions |
| `refundEligible` | boolean | No | `true` | Whether refunds are allowed |
| `refundWindowHours` | number | No | `24` | Hours after purchase to allow refund |
| `tags` | string[] | No | `[]` | Arbitrary tags for filtering |
| `sortOrder` | number | No | `0` | Display sort order |
| `releasedAt` | number | No | `null` | Release timestamp (ms since epoch) |
| `expiresAt` | number | No | `null` | Expiry timestamp (ms since epoch) |

## Sale Fields

Sales are separate objects that reference items or collections by ID. Items don't need modification to go on sale, and multiple sales can be scheduled in advance.

| Field | Type | Required | Description |
|---|---|---|---|
| `saleId` | string | Yes | Unique identifier for the sale |
| `targetId` | string | Yes | `itemId` (when targeting items) or `collectionId` (when targeting collections) |
| `targetType` | enum | No | `item` (default) or `collection` |
| `discountType` | enum | Yes | `percentage` or `fixed_price` |
| `discountValue` | number | Yes | Percentage (0–100) when `discountType` is `percentage` |
| `discountPrice` | object | No | Override price `{ type, value }` when `discountType` is `fixed_price` |
| `regions` | string[] | No | Region codes; empty = all regions |
| `startsAt` | number | Yes | Start timestamp (ms since epoch) |
| `endsAt` | number | Yes | End timestamp (ms since epoch) |
| `active` | boolean | Yes | Whether the sale is active |
| `itemFilter` | object | No | Only for collection sales. Narrows which items the sale applies to: `{ tags?: string[], itemIds?: string[] }` |

When `targetType` is `collection`, the sale applies to all items in the collection by default. Use `itemFilter` to narrow it, for example, `{ "tags": ["premium"] }` only discounts items whose override entry has the `"premium"` tag. Items without overrides (or without matching tags) are unaffected by filtered sales.

## Price Structure

```json
{ "type": "bucks", "value": "100" }
```

| Price Type | Description |
|---|---|
| `bucks` | RunBucks (platform hard currency) |
| `direct_purchase` | Direct FIAT purchase (not yet supported in v1) |

The `value` field is a string to support decimal precision for direct purchases.

## Entitlements

Each item must specify what the player receives on purchase:

```json
{
  "entitlementId": "speed_boost_effect",
  "quantity": 1,
  "consumable": true,
  "durationDays": 7
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `entitlementId` | string | Yes | ID of the entitlement to grant |
| `quantity` | number | Yes | How many to grant (must be > 0) |
| `consumable` | boolean | Yes | Whether this is consumed on use |
| `durationDays` | number | No | For time-bound items, how long it lasts |

## Categories

| Category | Description |
|---|---|
| `consumable` | Used up on use (e.g., potions, boosts) |
| `non_consumable` | Permanent ownership (e.g., skins, characters) |
| `time_bound` | Expires after a duration (e.g., subscriptions, passes) |

## Collections

Collections let you sell large catalogs (episodes, chapters, level packs) without listing every item in the config. A collection defines shared defaults (price, entitlement shape, refund policy) and the server trusts the client to know what items exist.

Any `(collectionId, itemId)` pair is valid. Items without an override entry use the collection's defaults. Only items that deviate from defaults need to be listed.

### Collection Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `collectionId` | string | Yes | Unique identifier for the collection |
| `price` | object | Yes | Default price `{ type, value }` for all items |
| `entitlement` | object | Yes | `{ consumable: boolean, durationDays?: number }` |
| `refundEligible` | boolean | Yes | Default refund policy |
| `refundWindowHours` | number | Yes | Default refund window |
| `items` | array | No | Item overrides: only items that deviate from defaults |

### Item Override Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `itemId` | string | Yes | The item being overridden |
| `tags` | string[] | No | Tags for sale targeting |
| `priceOverride` | object | No | Override price `{ type, value }` |
| `refundEligibleOverride` | boolean | No | Override refund eligibility |
| `refundWindowHoursOverride` | number | No | Override refund window |

### Entitlement Mapping

Collection entitlements are derived automatically: the entitlement ID is `${collectionId}_${itemId}`, quantity is 1, and `consumable`/`durationDays` come from the collection config. No per-item entitlement configuration is needed.

Non-consumable collection items are treated as unique: a player cannot purchase the same item twice.

## SDK Usage

### Get Catalog

Fetch the full storefront. Returns all items with sale-resolved prices and a `configId` for version pinning.

```typescript
const storefront = await RundotGameAPI.shop.getCatalog()

console.log('Config version:', storefront.configId)
for (const item of storefront.items) {
  const { originalPrice, finalPrice, appliedSales } = item.resolvedPrice
  console.log(`${item.name}: ${originalPrice.value} → ${finalPrice.value}`)
  if (appliedSales.length > 0) {
    console.log('  On sale:', appliedSales.map(s => s.saleId).join(', '))
  }
}
```

By default the catalog excludes inactive, expired, and unreleased items. Pass the optional boolean flags to include them, for example when building an admin or preview view:

```typescript
// Include everything, even items not yet live
const fullCatalog = await RundotGameAPI.shop.getCatalog(true, true, true)
```

| Argument | Type | Default | Description |
|---|---|---|---|
| `includeInactive` | boolean | `false` | Include items where `active` is false |
| `includeExpired` | boolean | `false` | Include items past their `expiresAt` |
| `includeUnreleased` | boolean | `false` | Include items whose `releasedAt` is in the future |

### Get Item Detail

Fetch a single item by ID with its resolved price.

```typescript
const item = await RundotGameAPI.shop.getItemDetail('speed_boost')

console.log(item.name, item.description)
console.log('Price:', item.resolvedPrice.finalPrice.value)
console.log('Entitlements:', item.entitlements)
```

### StorefrontResponse

```typescript
interface StorefrontResponse {
  configId: string        // Server config version ID
  items: StorefrontItem[]
  collections?: StorefrontCollection[]
}
```

### Resolve Collection Item Price

The storefront includes collection info with pre-resolved pricing. Use `resolveCollectionItemPrice` to look up the price for any item in a collection locally, with no server round-trip needed.

This is a pure helper function, not a method on `RundotGameAPI.shop`. Import it directly from the package:

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'
import { resolveCollectionItemPrice } from '@series-inc/rundot-game-sdk'

const storefront = await RundotGameAPI.shop.getCatalog()

// Get the price for any episode, even ones not listed in the config
const price = resolveCollectionItemPrice(storefront, 'episodes', 'ep-42')
if (price) {
  console.log(`Price: ${price.finalPrice.value}`) // Uses collection defaults
}

// Override items get their own resolved price
const premiumPrice = resolveCollectionItemPrice(storefront, 'episodes', 'ep-premium-1')
if (premiumPrice) {
  console.log(`Premium price: ${premiumPrice.finalPrice.value}`) // Uses override price
}
```

It takes the storefront response plus a `(collectionId, itemId)` pair and returns the item's resolved price (the override's `resolvedPrice` if the item has one, otherwise the collection's `resolvedDefaults`). It returns `null` if the collection is not in the storefront.

| Argument | Type | Description |
|---|---|---|
| `storefront` | `StorefrontResponse` | The response from `getCatalog()` |
| `collectionId` | string | The collection to look in |
| `itemId` | string | The item within the collection |

Returns `StorefrontCollection['resolvedDefaults'] | null`.

### Purchase Collection Item

Buy an item from a collection. Like regular purchases, pass an `idempotencyKey` to prevent duplicates.

```typescript
const idempotencyKey = crypto.randomUUID()
const result = await RundotGameAPI.shop.purchaseCollectionItem('episodes', 'ep-42', idempotencyKey)

if (!result.success) return // player dismissed the top-up paywall

console.log('Order:', result.order.orderId)
console.log('Status:', result.order.status) // 'fulfilled'
console.log('Collection:', result.order.collectionId) // 'episodes'
```

### Purchase

Buy an item. Pass an `idempotencyKey` (for example `crypto.randomUUID()`) to prevent duplicate charges on retry.

```typescript
const idempotencyKey = crypto.randomUUID()
const result = await RundotGameAPI.shop.purchase('speed_boost', idempotencyKey)

if (!result.success) {
  // The player closed the top-up paywall. Nothing was charged and no order
  // exists. Don't show error copy — just return to the store.
  return
}

console.log('Order:', result.order.orderId)
console.log('Status:', result.order.status) // 'fulfilled'
console.log('Paid:', result.order.finalPrice.value)
```

**Always check `success` before granting.** `purchase()` resolves with one of two shapes:

| `success` | `cancelled` | `order` | Meaning |
| --- | --- | --- | --- |
| `true` | absent | `ShopOrder` | Purchase completed. Grant the item. |
| `false` | `true` | `null` | The player dismissed the top-up paywall. Nothing charged, no order. |

On RUN app web and native hosts, insufficient funds automatically opens the currency purchase flow. After a completed top-up, the host retries the original Shop order once with the same idempotency key. Dismissing the top-up **resolves** with `{ success: false, cancelled: true, order: null }` — a closed paywall is a player choice, not a failure, so it does not reject and should not surface error copy. A completed top-up that still does not cover the order rejects with `insufficient_funds`. The Playground HTTP host instead surfaces `insufficient_funds` directly so you can fund the test wallet with `RundotGameAPI.iap.openStore()`.

Rejections are reserved for genuine failures: stale catalog, still-insufficient funds after a top-up, and network/transport errors. If you are on an SDK older than the version that introduced the resolved cancel result, a dismissed paywall instead rejects with a `RundotApiError` whose code is `USER_CANCELLED` — rebuild your game against the current SDK to get the resolved shape.

If the catalog has been updated since the player last fetched it, the SDK throws a stale catalog error: re-fetch the catalog and retry.

### Get Order

Retrieve a specific order by ID.

```typescript
const result = await RundotGameAPI.shop.getOrder(orderId)
const order = result.order

console.log('Status:', order.status)
for (const entry of order.statusHistory) {
  console.log(`  ${entry.status} @ ${entry.timestamp}`)
}
```

### Get Order History

Retrieve recent orders for the current game.

```typescript
const result = await RundotGameAPI.shop.getOrderHistory({ limit: 10 })
for (const order of result.orders) {
  console.log(`${order.orderId}: ${order.itemId} - ${order.status}`)
}
```

### Request Refund

Refund a recent purchase. The player gets their currency back and the entitlements are removed.

```typescript
const result = await RundotGameAPI.shop.requestRefund(orderId, 'changed_mind')

console.log('Status:', result.order.status) // 'refunded'
console.log('Refund amount:', result.order.refund.amount.value)
```

**Refund reason codes:** `changed_mind`, `accidental_purchase`, `not_as_expected`, `technical_issue`, `other`

**Refund constraints:**
- The item must have `refundEligible: true` in the config
- The request must be within `refundWindowHours` of the purchase
- Consumable entitlements must not have been used (quantity must equal what was originally granted)
- Non-refundable items (e.g., `refundEligible: false`) are always rejected

## Client-Side Analytics Events

The platform automatically tracks server-side analytics for purchases (`shop_purchase`), failed purchases (`shop_purchase_failed`), and refunds (`shop_refund`).

For client-side shop analytics, send the following events via `RundotGameAPI.analytics.logEvent()`:

| Event | When to Fire | Properties |
|---|---|---|
| `shop_item_viewed` | Player views an item detail page | `item_id`, `item_name`, `item_category`, `price` |
| `shop_item_click_purchase` | Player taps the purchase button | `item_id`, `item_name`, `price` |
| `shop_item_cancel_purchase` | Player cancels/dismisses the purchase confirmation | `item_id`, `item_name`, `price` |
| `shop_item_view_duration` | Player leaves an item detail page | `item_id`, `duration_ms` |

```typescript
// Example: track item viewed
RundotGameAPI.analytics.logEvent('shop_item_viewed', {
  item_id: item.itemId,
  item_name: item.name,
  item_category: item.category,
  price: item.resolvedPrice.finalPrice.value,
})
```

## Type Reference

### StorefrontItem

```typescript
interface StorefrontItem {
  itemId: string
  name: string
  description: string
  assets: { thumbnail?: string; banner?: string; icon?: string }
  price: { type: string; value: string }
  category: string
  unique: boolean
  active: boolean
  regions: string[]
  tags: string[]
  sortOrder: number
  releasedAt: number | null
  expiresAt: number | null
  entitlements: { entitlementId: string; quantity: number; consumable: boolean; durationDays?: number }[]
  refundEligible: boolean
  refundWindowHours: number
  resolvedPrice: {
    originalPrice: { type: string; value: string }
    finalPrice: { type: string; value: string }
    appliedSales: {
      saleId: string
      discountType: string
      discountValue: number
      discountPrice?: { type: string; value: string }
    }[]
  }
}
```

### StorefrontCollection

```typescript
interface StorefrontCollection {
  collectionId: string
  price: { type: string; value: string }
  entitlement: { consumable: boolean; durationDays?: number }
  refundEligible: boolean
  refundWindowHours: number
  resolvedDefaults: {
    originalPrice: { type: string; value: string }
    finalPrice: { type: string; value: string }
    appliedSales: { saleId: string; discountType: string; discountValue: number; discountPrice?: { type: string; value: string } }[]
  }
  items: {
    itemId: string
    resolvedPrice: {
      originalPrice: { type: string; value: string }
      finalPrice: { type: string; value: string }
      appliedSales: { saleId: string; discountType: string; discountValue: number; discountPrice?: { type: string; value: string } }[]
    }
  }[]
}
```

- **`resolvedDefaults`**: the collection's default price with any collection-wide sales applied. Use this for items without overrides.
- **`items`**: only items with overrides are listed, each with its own `resolvedPrice`. The element type is the named, importable `StorefrontCollectionItem` (`{ itemId, resolvedPrice }`).

### ShopOrder

```typescript
interface ShopOrder {
  orderId: string
  userId: string
  gameId: string
  configId: string
  collectionId?: string | null  // Set for collection purchases
  itemId: string
  itemSnapshot: {
    name: string
    price: { type: string; value: string }
    entitlements: { entitlementId: string; quantity: number; consumable: boolean; durationDays?: number }[]
  }
  originalPrice: { type: string; value: string }
  finalPrice: { type: string; value: string }
  appliedSales: {
    saleId: string
    discountType: string
    discountValue: number
    discountPrice?: { type: string; value: string }
  }[]
  status: string
  statusHistory: { status: string; timestamp: string; reason?: string }[]
  refund: null | {
    amount: { type: string; value: string }
    reasonCode: string
    requestedAt: string
    processedAt: string
  }
  idempotencyKey: string
  createdAt: string
  updatedAt: string
}
```

### ShopPurchaseResponse

The return type of `getOrder()` and `requestRefund()`, and the success arm of `ShopPurchaseResult`. The order is always present.

```typescript
interface ShopPurchaseResponse {
  success: true
  cancelled?: false
  order: ShopOrder
}
```

### ShopPurchaseResult

What `purchase()` and `purchaseCollectionItem()` resolve to. Narrow on `success` (or `cancelled`) before touching `order` — TypeScript will not let you read `order.orderId` until you do.

```typescript
interface ShopPurchaseCancelledResponse {
  success: false
  cancelled: true
  order: null
}

type ShopPurchaseResult = ShopPurchaseResponse | ShopPurchaseCancelledResponse
```

### ShopOrderHistoryResponse

The return type of `getOrderHistory()`. The orders live under `orders`; `success` reports whether the lookup succeeded.

```typescript
interface ShopOrderHistoryResponse {
  success: boolean
  orders: ShopOrder[]
}
```
