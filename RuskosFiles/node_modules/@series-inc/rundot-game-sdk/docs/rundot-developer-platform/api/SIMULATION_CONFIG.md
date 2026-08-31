# Simulation: Config Reference (BETA)

Define your game's server-authoritative state, actions, and randomized rewards entirely through JSON configuration. This reference covers the full config schema: entities, recipes, loot tables, and lifecycle hooks.

> This page is the config-authoring companion to the [Simulation API](SERVER_AUTHORITATIVE.md), which documents the client SDK methods. If you're looking for a specific pattern (energy systems, gacha, timers), see the recipe docs first; they include complete configs inline.

***

## Project Setup

Simulation config is uploaded to the server when you `rundot deploy`. Place it in the `rundot/simulation/` directory.

### Recommended: `rundot/simulation/` directory

```
my-game/
├── rundot/
│   └── simulation/
│       ├── entities.json
│       ├── recipes.json
│       ├── loot-tables.json
│       └── lifecycle.json
├── src/
├── dist/
├── game.config.prod.json        ← game ID + build settings (separate file)
└── package.json
```

Each `.json` file holds raw simulation content: **no `{"simulation": {...}}` wrapper** (the directory implies it). All files are deep-merged alphabetically at deploy time with collision detection: two files defining the same leaf value differently is an error (identical values are fine). Split however makes sense for your project:

```
rundot/simulation/
├── entities.json              ← all entities
├── crafting-recipes.json      ← one file per recipe group
├── combat-recipes.json
├── loot-tables.json
└── lifecycle.json
```

Example `entities.json`:

```json
{
  "entities": {
    "gold": {
      "tags": ["currency"],
      "clientViewable": true,
      "metadata": { "displayName": "Gold" }
    },
    "energy": {
      "tags": ["resource"],
      "clientViewable": true,
      "metadata": { "displayName": "Energy" }
    }
  }
}
```

Every entity must include `metadata.displayName` (the deploy-time validator rejects entities without it). There is no `type` or `defaultValue` field: entities are plain numeric quantities, and starting values come from an `onStart` lifecycle recipe (see [Lifecycle](#lifecycle)), not a `defaultValue`.

Other server systems each get their own file alongside `simulation/`: `rundot/leaderboard.config.json`, `rundot/shop.config.json`, `rundot/ugc.config.json`, etc. (each contains its value directly, no wrapping key). See each system's doc for details.

> **Commit `rundot/`** to your repo; it's project config like `package.json`, not a build artifact. The folder is env-agnostic: it applies to every environment and takes priority over legacy `config.{local,staging}.json` for any system it defines (a warning is printed when an env-specific override is shadowed this way).

### Also supported: legacy layouts

Legacy `config.json` / `config/` layouts keep working indefinitely. To move an existing project into `rundot/` automatically, run `rundot migrate-config` (add `--dry-run` to preview).

<details>

<summary>Single <code>config.json</code> (simple games)</summary>

Add a `simulation` key to your project's `config.json`:

```json
{
  "simulation": {
    "entities": { ... },
    "recipes": { ... }
  }
}
```

</details>

<details>

<summary><code>config/</code> directory (split files)</summary>

Split across `config/*.config.json` files. Each file **must** use the `{"simulation": {...}}` wrapper (unlike `rundot/simulation/`, where the directory implies it):

```
my-game/
├── config/
│   ├── energy-system.config.json
│   ├── combat.config.json
│   └── store.config.json
├── src/
└── dist/
```

</details>

### Important

- **`rundot/`** (or legacy `config.json` / `config/`) holds server config (simulation, leaderboard, rooms, etc.)
- **`game.config.prod.json`** is a separate file for local CLI metadata only (`gameId`, `relativePathToDistFolder`, `usesPreloader`); simulation config does not go there

***

## Config Structure

Each config file's `simulation` object can contain any combination of these top-level keys:

```json
{
  "simulation": {
    "version": "1.0.0",
    "lifecycle": { ... },
    "entities": { ... },
    "recipes": { ... },
    "lootTables": { ... },
    "clientConfig": { ... },
    "formulaPools": { ... },
    "fieldResolution": { ... }
  }
}
```

Files are merged by key: if two files both define `entities`, their entities are combined. If two files define the same entity ID, the last file wins.

| Key | Description |
|---|---|
| `version` | Config version string. Required by the validator. The `rundot/simulation/` deploy pipeline injects it for you; in the legacy single-`config.json` layout you supply it yourself. |
| `lifecycle` | Hooks that run at lifecycle points (`onStart`, `onReset`). See [Lifecycle](#lifecycle). |
| `entities` | Game-state quantities. See [Entities](#entities). |
| `recipes` | Server-authoritative actions. See [Recipes](#recipes). |
| `lootTables` | Randomized reward pools. See [Loot Tables](#loot-tables). |
| `clientConfig` | Free-form game constants passed through to the client unchanged (reward thresholds, tuning values, etc.). |
| `formulaPools` | Named weighted pools (`entries: [{ value, weight }]`, optional `noRepeatWindow`) that formula functions can draw from (quest rotation, weighted selection). |
| `fieldResolution.slotTemplates` | Reusable slot definitions referenced by an entity's `slotsTemplate`. Also holds `slotAggregations`, `equipmentMappings`, and `patternMappings` for derived field math. |

***

## Entities

Entities are the atomic units of game state. Each entity tracks a numeric quantity per player (e.g., `gold: 150`, `energy_current: 12`, `building_barracks: 3`).

```json
{
  "simulation": {
    "entities": {
      "currency_coins": {
        "tags": ["currency"],
        "clientViewable": true,
        "metadata": {
          "displayName": "Coins",
          "iconComponent": "coin",
          "color": "#FFD700"
        }
      },
      "energy_current": {
        "tags": ["resource", "energy"],
        "clientViewable": true,
        "metadata": {
          "displayName": "Energy",
          "description": "Used to start battles. Regenerates over time.",
          "maxAmount": 20,
          "regenIntervalMs": 600000
        }
      }
    }
  }
}
```

### Entity Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `metadata.displayName` | `string` | **Yes** | Human-readable name. Deploy fails with a validation error if any entity omits it. |
| `tags` | `string[]` | No | Categorize entities for filtering, subscriptions, and loot table lookups. Use any string. |
| `clientViewable` | `boolean` | No | Whether the client can read this entity's quantity via `getStateAsync` and subscriptions. Default `false`. |
| `neverConsumable` | `boolean` | No | If `true`, recipe inputs can check this entity but never deduct from it. Useful for cumulative counters and permanent unlocks. |
| `requiresManualCollection` | `boolean` | No | If `true`, timed recipe outputs for this entity require explicit collection via `collectRecipeAsync`. |
| `slots` | `object` | No | Slot-container schema. Maps slot IDs to `{ allowedTags, maxItems, requirements?, effects? }`. See [Slot Containers](#slot-containers). |
| `slotsTemplate` | `string` | No | Reference to a reusable slot definition in `fieldResolution.slotTemplates` instead of inlining `slots`. |
| `tracking` | `object` | No | Automatic delta tracking: `{ onDecrease?, onIncrease? }`. See [Delta Tracking](#delta-tracking). |
| `rateAccumulator` | `object` | No | Rate-based accumulation for idle/income entities. See [Rate Accumulators](#rate-accumulators). |
| `actorTemplate` | `object` | No | Defaults for the actor system: `{ defaultState?, availableRecipes?, spawnLocation? }`. Used by games with room/actor-scoped recipes and `create_actor` effects. |
| `metadata` | `object` | Yes | Key-value data readable by both config formulas and client code (display names, icons, costs, thresholds). Must contain `displayName`; everything else is free-form. |

Quantities are plain numbers with no per-entity stack cap. If you need to cap an amount, enforce it with a recipe guard, a formula, or a `metadata.maxAmount` value your own logic reads. (The SDK type loosely declares an entity `stackable` flag, but the engine ignores it: it has no effect.)

#### Slot Containers

Container entities hold assignable items in named slots. Power-team and equipment systems use this; it backs the `assign_to_slot` effect and the slot SDK methods (`getSlotContainersAsync`, `getAvailableItemsAsync`, `validateSlotAssignmentAsync`).

```json
"deck_1": {
  "clientViewable": true,
  "metadata": { "displayName": "Battle Deck" },
  "slots": {
    "unit_1": { "allowedTags": ["unit"], "maxItems": 1 },
    "unit_2": { "allowedTags": ["unit"], "maxItems": 1, "requirements": ["building_barracks"] }
  }
}
```

| Slot Field | Type | Description |
|---|---|---|
| `allowedTags` | `string[]` | Only items carrying one of these tags can be assigned. |
| `maxItems` | `number` | Maximum items the slot holds. |
| `requirements` | `string[]` | Entity IDs that must be present before the slot unlocks. |
| `effects` | `array` | Effects applied when an item is assigned (e.g., stat aggregation). |

Set `slotsTemplate: "<templateId>"` to reuse a slot layout defined under `fieldResolution.slotTemplates` instead of inlining `slots`.

#### Delta Tracking

`tracking` mirrors quantity changes into a separate counter entity, useful for cumulative spend/earn counters that unlock features at thresholds (e.g., "spend 10 gems to unlock ad skip").

```json
"currency_gems": {
  "clientViewable": true,
  "metadata": { "displayName": "Gems" },
  "tracking": { "onDecrease": "lifetime_gems_spent" }
}
```

| Field | Type | Description |
|---|---|---|
| `onDecrease` | `string` | When this entity is consumed as a recipe input, the named tracker entity increments by the amount consumed. |
| `onIncrease` | `string` | When this entity is granted as a recipe output, the named tracker entity increments by the amount granted. |

The tracker entity must exist. Give it `neverConsumable: true` so it never depletes (the validator warns otherwise).

#### Rate Accumulators

`rateAccumulator` is an alternative to auto-restart timers for idle/income entities. The stored value is a checkpoint; the engine computes the live value on demand as `checkpoint + sum(rateEntities) * elapsedSeconds`. A reserved companion field `{entityId}__rate_checkpoint_ms` holds the checkpoint timestamp (you cannot name an entity with that suffix).

```json
"gold": {
  "clientViewable": true,
  "metadata": { "displayName": "Gold" },
  "rateAccumulator": {
    "rateEntities": ["mine_level"],
    "maxOfflinePeriod": 86400,
    "offlineMultiplier": 0.5
  }
}
```

| Field | Type | Description |
|---|---|---|
| `rateEntities` | `string[]` | Entity IDs whose values are summed to derive the per-second rate. Required and non-empty. |
| `maxOfflinePeriod` | `number \| string` | Max **seconds** of offline accumulation (caps catch-up). A number is literal seconds; a string is an entity ID whose value is used. |
| `offlineMultiplier` | `number \| string` | Multiplier (0 to 1) applied to income earned while offline. Default `1.0`. A string is an entity ID reference. |
| `offlineThresholdSeconds` | `number` | Seconds of offline time before the multiplier kicks in; below it, income accrues at full rate. Default `0`. |
| `lastGrantDeltaEntity` | `string` | Entity to write the last computed offline delta into, so recipes can reference server-computed offline income (e.g., ad-bonus doubling) without trusting client values. |

### Tagging Patterns

Tags enable powerful filtering throughout the system:

```json
"unit_orc_warrior": {
  "tags": ["unit", "collectible", "rarity:common", "faction:orcs"],
  "clientViewable": true,
  "metadata": { "displayName": "Orc Warrior" }
}
```

- **Client subscriptions** filter by tags: `subscribeAsync({ tags: ['currency'] })`
- **Loot tables** select entities by tag: `"includeTags": ["unit", "rarity:epic"]`
- **Recipes** can be tagged for client discovery

***

## Recipes

Recipes are server-authoritative actions. They consume inputs, produce outputs, and optionally run effects. Every game action (spending currency, opening packs, upgrading items, regenerating energy) is a recipe.

### Instant Recipe

Executes immediately. Duration is `0`.

```json
{
  "battle_start": {
    "duration": 0,
    "scope": "player",
    "clientViewable": true,
    "inputs": {
      "energy_current": 5
    },
    "outputs": {
      "battle_pending": 1
    },
    "metadata": {
      "displayName": "Start Battle"
    }
  }
}
```

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

await RundotGameAPI.simulation.executeRecipeAsync('battle_start')
```

### Timed Recipe

Has a non-zero `duration` (milliseconds). Creates an active run that must complete before outputs are granted.

```json
{
  "upgrade_barracks": {
    "duration": 300000,
    "scope": "player",
    "clientViewable": true,
    "concurrency": "global:building_upgrade",
    "onConflict": "fail",
    "inputs": {
      "currency_bricks": 200
    },
    "outputs": {
      "building_barracks": 1
    }
  }
}
```

```typescript
const result = await RundotGameAPI.simulation.executeRecipeAsync('upgrade_barracks')
// result.runId: track progress via activeRuns subscription

const runs = await RundotGameAPI.simulation.getActiveRunsAsync()
// When run completes, collect outputs:
await RundotGameAPI.simulation.collectRecipeAsync(runs[0].id)
```

### Auto-Restart Recipe

A timed recipe that automatically re-executes after completing. Ideal for regeneration timers and passive production.

```json
{
  "energy_regeneration": {
    "duration": 600000,
    "autoRestart": true,
    "concurrency": "single",
    "onConflict": "fail",
    "maxOfflineExecutionPeriod": 604800,
    "inputs": {},
    "outputs": {
      "energy_current": 1
    },
    "maxRestartCondition": {
      "entity": "energy_current",
      "maxValue": 20
    },
    "clientViewable": true,
    "scope": "player"
  }
}
```

### Entity-Scoped Recipe

A single recipe definition that operates on different entities at runtime. Uses `{{entity}}` as a placeholder resolved when the recipe is executed.

```json
{
  "upgrade_card": {
    "duration": 0,
    "scope": "player",
    "clientViewable": true,
    "inputs": {
      "currency_coins": {
        "formula": "round(2000 * 1.12 ^ max(0, level - 1) / 10) * 10",
        "variables": {
          "level": { "inventory": "{{entity}}_level" }
        }
      }
    },
    "outputs": {
      "{{entity}}_level": 1
    }
  }
}
```

```typescript
await RundotGameAPI.simulation.executeScopedRecipeAsync(
  'upgrade_card',
  'unit_orc_warrior'
)
```

At execution time, `{{entity}}` resolves to `unit_orc_warrior`, so the recipe reads `unit_orc_warrior_level` and increments it.

### Recipe Fields

| Field | Type | Description |
|---|---|---|
| `duration` | `number \| formula` | Milliseconds. `0` for instant. Supports formulas for dynamic durations. |
| `scope` | `"player" \| "room" \| "actor"` | Execution scope. `player` is the common single-player case; `room`/`actor` power multiplayer/room-shared and per-actor recipes. |
| `clientViewable` | `boolean` | Whether the client can see this recipe in config and requirements checks. |
| `inputs` | `object` | Entities consumed when the recipe executes. See [Inputs](#inputs). |
| `outputs` | `object` | Entities produced. For loot, use `rolls`. See [Outputs](#outputs). |
| `guards` | `object` | Preconditions that must pass before execution. See [Guards](#guards). |
| `beginEffects` | `array` | Side effects that run when the recipe starts. See [Effects](#effects). |
| `endEffects` | `array` | Side effects that run when a timed recipe completes. |
| `autoRestart` | `boolean` | Re-execute automatically after completion. |
| `autoRestartAtUtcMidnight` | `boolean` | For auto-restart recipes: re-run aligned to the next UTC midnight instead of immediately. Use for daily resets (daily rewards, daily quests). |
| `concurrency` | `"single" \| "unlimited" \| number \| string` | Controls parallel execution. See [Concurrency](#concurrency). |
| `onConflict` | `"fail" \| "queue" \| "replace"` | What to do when concurrency is violated. See [Concurrency](#concurrency). |
| `maxRestartCondition` | `object` | Stop auto-restart when entity reaches a threshold. |
| `maxOfflineExecutionPeriod` | `number` | Max **seconds** of offline catch-up for auto-restart recipes. |
| `startsDisabled` | `boolean` | If `true`, the recipe cannot run until enabled via an `enable_recipe` effect. |
| `developmentOnly` | `boolean` | If `true`, the recipe runs only in development mode. Use for debug/cheat recipes that must never run in production. |
| `blockedByEntityStates` | `object` | Map of entity ID to state values that block this recipe (cross-recipe gating). |
| `blocksRecipes` | `string[]` | Recipe IDs that cannot run while this recipe is active (mutual exclusion). |
| `multiplayer` | `object` | Competitive/cooperative config for `room`/`actor` recipes. See [Multiplayer Recipes](#multiplayer-recipes). |
| `tags` | `string[]` | Categorize recipes for client-side filtering. |
| `metadata` | `object` | Arbitrary data. Use `hidden: true` to suppress from UI. |
| `trigger` | `object` | Auto-execute when watched entities change. See [Triggers](#triggers). |

***

## Inputs

Recipe inputs define what is consumed when the recipe runs.

### Fixed Amount

```json
"inputs": {
  "energy_current": 5
}
```

### Formula-Based

```json
"inputs": {
  "currency_coins": {
    "formula": "floor(baseCost * costMultiplier ^ level)",
    "variables": {
      "baseCost": { "entity": "{{entity}}", "field": "metadata.baseCost" },
      "costMultiplier": { "entity": "{{entity}}", "field": "metadata.costMultiplier" },
      "level": { "inventory": "{{entity}}" }
    }
  }
}
```

### Wallet (Premium Currency)

```json
"inputs": {
  "wallet": {
    "amount": 10,
    "walletCurrency": "premiumCurrency"
  }
}
```

For dynamic wallet amounts passed at runtime:

```json
"inputs": {
  "wallet": {
    "param": "walletAmount",
    "walletCurrency": "premiumCurrency"
  }
}
```

### Max Guard on Input

Limits how many times an entity can be incremented (useful for one-time or limited purchases):

```json
"inputs": {
  "starter_pack_purchased": { "max": 1 },
  "wallet": { "amount": 10, "walletCurrency": "premiumCurrency" }
}
```

### Advanced Input Options

An input can be an object with these additional fields:

| Field | Type | Description |
|---|---|---|
| `amount` | `number \| formula` | Quantity to consume. Optional for `validateOnly` inputs. |
| `min` / `max` | `number` | Range bounds for the input amount. |
| `formula` | `string` | Computed cost expression returning a number. |
| `validateOnly` | `boolean` | Require the entity to be present but do not consume it (skills, tools, gating items). |
| `as` | `string` | Store the resolved value in execution context under this name for later effects/formulas. |
| `allowedTags` | `string[]` | Accept any entity carrying one of these tags as the input (tag-based input). |
| `useBigNumbers` | `boolean` | Use big-number arithmetic for very large quantities. |
| `blockedWhen` | `array` | Block execution when a status/entity condition holds. Each entry is `{ entity, threshold, operator, message? }` where `operator` is one of `eq`, `gte`, `gt`, `lt`, `lte`, `neq`. |

```json
"inputs": {
  "skill_lockpicking": { "validateOnly": true },
  "currency_coins": { "formula": "100 * level", "as": "coinCost" }
}
```

***

## Outputs

### Fixed Amount

```json
"outputs": {
  "currency_coins": 500,
  "pack_common": 1
}
```

### Formula-Based

```json
"outputs": {
  "currency_bricks": {
    "formula": "min(entities.pending_bricks, entities.brick_storage_max - entities.currency_bricks)"
  }
}
```

### Loot Rolls

For randomized rewards, outputs can contain `rolls` that reference loot tables:

```json
"outputs": {
  "rolls": [
    {
      "table": "common_pack_cards",
      "count": { "min": 3, "max": 5 },
      "guarantees": [
        { "tag": "rarity:rare", "minCount": 1 }
      ],
      "pity": {
        "counterEntity": "pity_counter_mid",
        "threshold": 10,
        "guaranteedTag": "rarity:epic",
        "resetOnHit": true
      }
    },
    {
      "table": "common_pack_coins",
      "count": 1
    }
  ]
}
```

| Roll Field | Type | Description |
|---|---|---|
| `table` | `string` | Loot table ID to roll from. |
| `count` | `number \| { min, max }` | How many times to roll. Fixed or random range. |
| `guarantees` | `array` | Minimum counts by tag (e.g., guarantee at least 1 rare). |
| `pity` | `object` | Pity system: increment a counter each roll, guarantee a tag when threshold is hit. |
| `guards` | `array` | Conditional guards gating this roll. The roll only runs when its guards pass (e.g., a bonus roll for VIP players). |

***

## Guards

Guards are preconditions checked before a recipe can execute. If any guard fails, the recipe is rejected with an HTTP 400 `validation-error`.

```json
"guards": {
  "hasPending": {
    "formula": "entities.battle_pending >= 1"
  },
  "notCleared": {
    "formula": "entities.campaign_humans_cleared == 0"
  }
}
```

Guard formulas have access to `entities.*` for current inventory values.

### Formula syntax (guards and all `formula` fields)

Guard formulas — and every other `formula` field (duration, input costs, output values, triggers) — are parsed by the **mathjs** engine, **not** the `{{...}}` template substitutor. This changes what syntax is valid:

- **Most `{{...}}` template variables are not substituted inside a `formula`.** Use the bare reference instead (`entities.foo`, `inputs.foo`), and for the current time use the `now()` function or the `nowMs` variable — **never `{{now}}`**.
- **`{{entity}}` is the one exception, and only in *value* formulas** (duration, input costs, output values). There the runtime substitutes the executing entity id before parsing, so `entities.{{entity}}_level` is valid. In **guard** and **trigger** formulas there is no substitution, so **no** `{{...}}` template (including `{{entity}}`) is allowed.
- **Use keyword logical operators**: `or`, `and`, `not` — **not** the JavaScript `||`, `&&`, `!` symbols, which fail to parse.
- Comparisons (`<`, `<=`, `>`, `>=`, `==`, `!=`), arithmetic (`+ - * / ^`), and the allowed functions (`floor`, `ceil`, `round`, `sqrt`, `abs`, `min`, `max`, `now`, `mod`, …) are supported.

A formula that fails to parse — because it contains a disallowed `{{...}}`, `||`/`&&`, or any other invalid expression — is rejected at **config upload** with an actionable message, and at runtime returns an HTTP 400 `validation-error` (not a 500). It is no longer silently treated as a failed guard.

Correct example — "available if fewer than 60 drops today, or if we've rolled over to a new UTC day":

```json
"guards": {
  "underDailyCap": {
    "formula": "entities.scout_drop_count_today < 60 or entities.scout_drop_day_index < floor(now() / 86400000)"
  }
}
```

| Reference | Meaning |
|---|---|
| `now()` | Current timestamp in ms (function) |
| `nowMs` | Current timestamp in ms (variable; equivalent to `now()`) |
| `or` / `and` / `not` | Logical operators (use instead of `\|\|` / `&&` / `!`) |

***

## Effects

Effects are side actions that run alongside a recipe. `beginEffects` fire when the recipe starts; `endEffects` fire when a timed recipe completes.

### `set`: Set Entity to Value

```json
{ "type": "set", "entity": "energy_current", "value": 20 }
```

### `add`: Add to Entity

```json
{ "type": "add", "entity": "currency_coins", "value": 500 }
```

Value can be a formula:

```json
{
  "type": "add",
  "entity": "currency_coins",
  "value": {
    "entity": "{{entity}}",
    "field": "metadata.repeatCoinReward",
    "fallback": 0
  }
}
```

### `multiply` / `min` / `max`: Arithmetic on Entity

The same `{ type, entity, value }` shape as `set`/`add`, with a different operation. `value` accepts a number, field reference, or formula.

```json
{ "type": "multiply", "entity": "currency_coins", "value": 2 }
{ "type": "max", "entity": "energy_current", "value": 20 }
{ "type": "min", "entity": "energy_current", "value": 0 }
```

`multiply` scales the current value; `min`/`max` clamp it (`max` caps at the value, `min` floors at it).

### `grant_rewards`: Grant from Metadata

Reads a rewards object from an entity's metadata and grants it. Defaults to the scoped entity if `entity` is omitted.

```json
{
  "type": "grant_rewards",
  "source": { "entity": "{{entity}}", "field": "metadata.repeatRewards" }
}
```

### `enable_recipe`: Allow Future Execution

Re-enables a recipe (the inverse of `disable_recipe`). Pairs with `startsDisabled` to gate recipes until unlocked.

```json
{ "type": "enable_recipe", "selector": "advanced_crafting" }
```

### `compute`: Precompute a Value

Evaluates a formula or rolls a weighted table and stores the result in context under `as`, so later effects in the same recipe can reference `results.<as>`. Provide exactly one of `formula` or `weightedTable`.

```json
{
  "type": "compute",
  "weightedTable": [
    { "value": "rare", "weight": 70 },
    { "value": "epic", "weight": 30 }
  ],
  "as": "tier"
}
```

### `reduce_run_expiry`: Speed Up a Timer

Reduces an active timed run's remaining time. Use for speedups that consume tokens/gems/ad credits. `target` is a concurrency group string (e.g., `"global:building_upgrade"`) or `{ param: "<inputKey>" }` to target a specific run ID.

```json
{
  "type": "reduce_run_expiry",
  "target": "global:building_upgrade",
  "reductionMs": 60000,
  "minRemainingMs": 0
}
```

### `submit_leaderboard`: Submit a Score

```json
{ "type": "submit_leaderboard", "mode": "weekly", "score": { "formula": "entities.total_power" } }
```

### `trigger_recipe`: Execute Another Recipe

```json
{ "type": "trigger_recipe", "selector": "energy_regeneration" }
```

### `trigger_recipes_parallel`: Execute Multiple Recipes

```json
{
  "type": "trigger_recipes_parallel",
  "continueOnError": true,
  "selectors": [
    "energy_regeneration",
    "brick_generation",
    "coin_generation"
  ]
}
```

### `disable_recipe`: Prevent Future Execution

```json
{ "type": "disable_recipe", "selector": "initial_player_state" }
```

### `assign_to_slot`: Assign Item to Slot Container

```json
{
  "type": "assign_to_slot",
  "container": "deck_1",
  "slot": "unit_1",
  "item": "unit_human_swordman"
}
```

### `send_inbox_message`: Send a Message (Preferred)

Sends a message to a player through the inbox broker. Requires an `inbox.templates` entry in your game `config.json` that defines the named template.

```json
{
  "type": "send_inbox_message",
  "recipientProfileId": "{{inputs.targetId}}",
  "template": "battle_challenge",
  "params": { "challengerName": "{{metadata.displayName}}" }
}
```

### `send_notification`: Push Notification (Deprecated)

{% hint style="warning" %}
`send_notification` is deprecated. Use the `send_inbox_message` effect (with an `inbox.templates` entry) instead.
{% endhint %}

See [Server-Authoritative API: Push Notifications](SERVER_AUTHORITATIVE.md#push-notifications) for full details.

```json
{
  "type": "send_notification",
  "recipientProfileId": "{{inputs.targetId}}",
  "title": "Battle Challenge!",
  "body": "A player has challenged you!"
}
```

***

## Concurrency

Controls how many instances of a recipe can run simultaneously. `concurrency` accepts a constraint mode (`"single"`, `"unlimited"`, or a number) or a named group string.

| Value | Behavior |
|---|---|
| `"single"` | Only one instance at a time. New executions conflict if one is active. |
| `"unlimited"` | No concurrency cap; runs never conflict. |
| `number` | Up to N concurrent runs of this recipe; the (N+1)th conflicts. |
| `"<group>"` | Any other string is a concurrency group identifier (e.g., `"global:building_upgrade"`). The string is stored on the run as its group; `reduce_run_expiry` targets runs by group. |

When concurrency is violated, `onConflict` decides what happens:

| `onConflict` | Behavior |
|---|---|
| `"fail"` (default) | Reject the new execution. |
| `"queue"` | Enqueue the new run behind the active one (status `queued`, with a `queuePosition`); it starts when the active run completes. |
| `"replace"` | Cancel the active run and supersede it with the new one. |

Pair `"single"` with `"onConflict": "fail"` when you want a clear rejection on the client.

```json
{
  "upgrade_building": {
    "concurrency": "single",
    "onConflict": "fail",
    "duration": 300000
  }
}
```

With this config, starting a second upgrade while one is active fails.

***

## Multiplayer Recipes

Recipes with `scope: "room"` or `scope: "actor"` can carry a `multiplayer` block for competitive (PVP) and cooperative (guild-style) play.

```json
{
  "guild_build_wall": {
    "scope": "room",
    "duration": 3600000,
    "multiplayer": {
      "minPlayers": 2,
      "maxPlayers": 10,
      "cooperative": {
        "sharedRequirements": { "currency_bricks": 1000 },
        "sharedOutputs": { "building_wall": 1 },
        "personalOutputs": { "currency_coins": 50 },
        "rewardDistribution": { "method": "proportional", "minShare": 0.1 }
      }
    }
  }
}
```

| Field | Description |
|---|---|
| `minPlayers` / `maxPlayers` | Participant bounds for the recipe. |
| `commitmentWindow` | Fraction (0 to 1) of the duration during which players can still join/contribute. Default `1.0` (entire duration). |
| `competitive` | PVP config: `battleType: "powerBattle"`, a `powerBattle` formula (per-unit `power` plus `vsBonus`), optional `returnRates`, and `winnerRewards` / `participantRewards`. |
| `cooperative` | Guild config: `sharedRequirements` (pooled inputs), `sharedOutputs` (granted to the room), `personalOutputs` (granted per participant), and `rewardDistribution` (`equal` or `proportional`, with optional `minShare`). |

***

## Auto-Restart & Offline Catch-Up

For recipes that repeat on a timer (energy regen, resource production):

```json
{
  "energy_regeneration": {
    "duration": 600000,
    "autoRestart": true,
    "concurrency": "single",
    "onConflict": "fail",
    "maxOfflineExecutionPeriod": 604800,
    "inputs": {},
    "outputs": { "energy_current": 1 },
    "maxRestartCondition": {
      "entity": "energy_current",
      "maxValue": 20
    }
  }
}
```

| Field | Description |
|---|---|
| `autoRestart` | Re-execute immediately after each completion. |
| `autoRestartAtUtcMidnight` | When `true`, re-run aligned to the next UTC midnight instead of immediately. Use for daily resets. |
| `maxRestartCondition.entity` | Entity to check before restarting. |
| `maxRestartCondition.maxValue` | Numeric threshold. Auto-restart stops once the entity reaches this value. Both `entity` and `maxValue` must be present for the condition to apply. |
| `maxOfflineExecutionPeriod` | Maximum **seconds** of offline time to catch up. `604800` = 7 days (`86400` = 24 hours). |

When a player returns after being offline, the server calculates how many cycles would have completed and grants the accumulated outputs (capped by `maxRestartCondition`).

***

## Triggers

Triggers automatically execute a recipe when watched entities change:

```json
{
  "upgrade_brick_storage_capacity": {
    "duration": 0,
    "trigger": {
      "formula": "true",
      "watchEntities": ["building_brick_storage", "building_town_hall"]
    },
    "inputs": {},
    "outputs": {
      "brick_storage_max": {
        "formula": "(500 + (entities.building_brick_storage * 500) + (entities.building_town_hall * 500)) - entities.brick_storage_max"
      }
    },
    "clientViewable": false,
    "scope": "player"
  }
}
```

The recipe auto-fires whenever `building_brick_storage` or `building_town_hall` changes. Use this for derived stats that should recalculate when their dependencies change.

***

## Formulas

Many recipe fields accept formula expressions instead of fixed values.

### Syntax

Formulas are JavaScript-like expressions evaluated server-side:

```
"formula": "floor(baseCost * costMultiplier ^ level)"
```

### Available Functions

`floor`, `ceil`, `round`, `min`, `max`, `abs`

### Variables

Formulas can reference variables defined in a `variables` block:

```json
{
  "formula": "baseCost * costMultiplier ^ level",
  "variables": {
    "baseCost": { "entity": "{{entity}}", "field": "metadata.baseCost" },
    "costMultiplier": { "entity": "{{entity}}", "field": "metadata.costMultiplier" },
    "level": { "inventory": "{{entity}}" }
  }
}
```

| Variable Source | Syntax | Resolves To |
|---|---|---|
| Entity metadata field | `{ "entity": "building_barracks", "field": "metadata.baseCost" }` | Value from entity's metadata |
| Current inventory | `{ "inventory": "energy_current" }` | Player's current quantity |
| Inline entities | `entities.energy_current` | Same as inventory, used directly in formula strings |

### Template Variables

`{{...}}` template variables are **effects-only** — they are substituted into string-typed effect fields. They are **not** available in `formula` fields (guards, duration, costs, output values, triggers); inside a formula use the bare reference (`entities.foo`, `inputs.foo`) and `now()` / `nowMs` for the current time. See [Formula syntax](#formula-syntax-guards-and-all-formula-fields).

Available in entity-scoped recipe effects:

| Variable | Description |
|---|---|
| `{{entity}}` | The entity ID passed at execution time |
| `{{profileId}}` / `{{executorId}}` | Player who triggered the recipe |
| `{{roomId}}` | Current room ID (room-scoped recipes) |
| `{{inputs.<key>}}` | Recipe input values |
| `{{results.<key>}}` | Results from earlier effects |
| `{{entities.<id>}}` | Current inventory quantity |
| `{{now}}` | Current timestamp (ms). **Effects-only** — in a formula use `now()` or `nowMs`. |
| `{{metadata.<field>}}` | Entity metadata (of the scoped entity) |

{% hint style="warning" %}
**`{{...}}` substitution only applies to string-typed fields** — entity IDs, selectors, recipient/target IDs, and metadata string values. It does **not** apply to numeric value fields. A `set`/`add`/`multiply`/`min`/`max`, a cost, or an `output` *value* is typed `number | FieldReference | FormulaReference`, so a bare `"{{inputs.X}}"` string is not valid there and resolves to `0`. To use an input inside a numeric value, use a **formula** with the bare `inputs.X` reference (no mustache braces):

```json
{ "formula": "inputs.scannerLevel * 5" }
```

**Missing keys never throw a client error:**

- In a `{{inputs.X}}` template string, a missing key resolves to an empty string (`''`), silently.
- In a formula (`inputs.X`), a missing key resolves to the formula's declared `fallback`, or `0` if none is set. This is logged server-side but never surfaced to the client.
{% endhint %}

***

## Loot Tables

Loot tables define randomized reward pools.

### Weighted Table

Each entry has an explicit weight. Higher weight = more likely.

```json
{
  "faction_orcs_pack": {
    "type": "weighted",
    "entries": [
      { "weight": 25, "outcomes": [{ "entityId": "unit_orc_goblin", "quantity": 1 }] },
      { "weight": 20, "outcomes": [{ "entityId": "unit_orc_warrior", "quantity": 1 }] },
      { "weight": 10, "outcomes": [{ "entityId": "unit_orc_berserker", "quantity": 1 }] }
    ],
    "newItemBias": {
      "enabled": true,
      "biasMultiplier": 3.0
    }
  }
}
```

### Uniform (Tag-Filtered) Table

Dynamically selects from all entities matching tag filters. No explicit entries needed.

```json
{
  "common_units": {
    "type": "uniform",
    "filter": {
      "includeTags": ["unit", "collectible", "rarity:common"],
      "entityGuards": [
        { "entity": "{{metadata.unlockRequirement}}", "min": 1 }
      ]
    },
    "newItemBias": {
      "enabled": true,
      "biasMultiplier": 2.0
    }
  }
}
```

### Guaranteed Table

Fixed drops: always grants the specified items.

```json
{
  "common_pack_coins": {
    "type": "guaranteed",
    "entries": [
      { "entityId": "currency_coins", "quantity": { "min": 100, "max": 300 } }
    ]
  }
}
```

### Table Chaining

Weighted entries can reference other tables via `tableRef` instead of defining outcomes inline:

```json
{
  "common_pack_cards": {
    "type": "weighted",
    "entries": [
      { "tableRef": "common_units", "weight": 75 },
      { "tableRef": "rare_units", "weight": 20 },
      { "tableRef": "epic_units", "weight": 4.5 },
      { "tableRef": "legendary_units", "weight": 0.5 }
    ]
  }
}
```

### Loot Table Options

| Field | Type | Description |
|---|---|---|
| `type` | `"weighted" \| "uniform" \| "guaranteed" \| "sequential"` | How entries are selected. `sequential` drops entries in order (for milestone/sequential rewards). |
| `entries` | `array` | Items, weights, and outcomes (weighted/guaranteed/sequential) or omitted (uniform). |
| `filter` | `object` | Tag-based entity selection (uniform tables). |
| `filter.includeTags` | `string[]` | Entity must have ALL of these tags. |
| `filter.excludeTags` | `string[]` | Entity must have NONE of these tags. |
| `filter.requireUnlocked` | `boolean` | Only include entities the player has unlocked (paired with `unlockPrefix`). |
| `filter.unlockPrefix` | `string` | Entity-ID prefix that marks unlock status (e.g., `"unlocked_"`). |
| `filter.rarityWeights` | `object` | Per-tag weight overrides for tag-filtered tables (e.g., `{ "rarity:common": 100, "rarity:rare": 20 }`). |
| `filter.entityGuards` | `array` | Additional per-entity checks. Each is `{ entity, min?, max? }` with template substitution. |
| `newItemBias` | `object` | Increase probability of items the player hasn't collected yet. |
| `newItemBias.biasMultiplier` | `number` | Multiplier applied to unowned items (e.g., `2.0` = 2x more likely). |
| `wildcardConversion` | `object` | Chance to convert drops into wildcard entities by rarity tag. |

### Wildcard Conversion

A percentage chance to replace a rolled item with a wildcard entity:

```json
"wildcardConversion": {
  "enabled": true,
  "rates": {
    "rarity:common": 0.02,
    "rarity:rare": 0.03,
    "rarity:epic": 0.04,
    "rarity:legendary": 0.05
  },
  "wildcardEntities": {
    "rarity:common": "wildcard_common",
    "rarity:rare": "wildcard_rare",
    "rarity:epic": "wildcard_epic",
    "rarity:legendary": "wildcard_legendary"
  }
}
```

***

## Lifecycle

The `lifecycle` block defines hooks that run at specific points in a player's lifecycle.

### `onStart`

Runs once when a new player first opens the game. Use it to set up initial state.

```json
{
  "simulation": {
    "lifecycle": {
      "onStart": "initial_player_state"
    },
    "recipes": {
      "initial_player_state": {
        "duration": 0,
        "inputs": {},
        "outputs": {},
        "beginEffects": [
          { "type": "disable_recipe", "selector": "initial_player_state" },
          { "type": "set", "entity": "energy_current", "value": 20 },
          { "type": "set", "entity": "currency_coins", "value": 500 },
          {
            "type": "assign_to_slot",
            "container": "deck_1",
            "slot": "unit_1",
            "item": "unit_human_swordman"
          },
          { "type": "trigger_recipe", "selector": "start_recurring_timers" }
        ],
        "scope": "player"
      }
    }
  }
}
```

Key pattern: the `onStart` recipe disables itself (`disable_recipe`) to prevent re-execution, sets initial entity values, assigns starting items to slots, and triggers recurring timers.

{% hint style="info" %}
Use `startsDisabled: true` on the init recipe as a cleaner alternative to the self-disabling `disable_recipe` pattern. The recipe stays inert until an `enable_recipe` effect turns it on.
{% endhint %}

### `onReset`

Runs after a player reset (the `resetStateAsync` SDK method). If `onReset` is not specified, the `onStart` recipe runs instead.

```json
{
  "simulation": {
    "lifecycle": {
      "onStart": "initial_player_state",
      "onReset": "reset_player_state"
    }
  }
}
```

***

## Best Practices

- Split config across multiple files by domain in `rundot/simulation/` (e.g., `energy-system.json`, `boosters.json`). The platform merges them at deploy time.
- Use `tags` liberally; they power subscriptions, loot table filters, and client-side discovery.
- Set `clientViewable: true` only on entities and recipes the client needs. Keep internal state hidden.
- Use `metadata` for display data and formula variables. It's free-form and available everywhere.
- Use `formula` expressions for scaling costs and dynamic outputs rather than creating separate recipes per level.
- Use entity-scoped recipes (`{{entity}}`) to avoid duplicating recipes for every item/building/card.
- Always `disable_recipe` on initialization recipes to prevent accidental re-execution.
- Set `maxOfflineExecutionPeriod` (in seconds) on auto-restart recipes to prevent unbounded offline accumulation.
- Use `maxRestartCondition` to cap regeneration (e.g., stop energy regen at max energy).
