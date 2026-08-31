# Simulation: Gacha System (BETA)

Add randomized loot boxes, booster packs, and gacha pulls to your game. Players open packs to receive random rewards from weighted pools, with pity counters, rarity guarantees, and new-item bias, all validated server-side.

> This is a self-contained recipe. Everything you need (config, client code, and patterns) is on this page.

***

## Where Config Goes

All JSON config on this page is simulation config: server-authoritative state, actions, and rewards. The CLI uploads it automatically when you `rundot deploy`.

### Recommended: `rundot/simulation/`

Place simulation config in the `rundot/simulation/` directory, one file per system. Each file holds **raw simulation content with no `{"simulation": {...}}` wrapper** (the directory implies it). Files are deep-merged alphabetically at deploy time with collision detection.

```
my-game/
├── rundot/
│   └── simulation/
│       └── boosters.json            ← raw content, no "simulation" wrapper
├── game.config.prod.json            ← game ID + build settings only (separate)
└── package.json
```

> Commit `rundot/` to your repo: it's project config like `package.json`, not a build artifact. It's env-agnostic and takes priority over legacy `config.{local,staging}.json`. `game.config.prod.json` is for CLI metadata only; simulation config does not go there.

### Also supported: legacy `config.json` / `config/`

Legacy layouts keep working indefinitely. Run `rundot migrate-config` (with `--dry-run` to preview) to move them into `rundot/simulation/` automatically.

<details>

<summary>Legacy <code>config.json</code> or <code>config/</code></summary>

Use a single `config.json` with a top-level `"simulation"` key, or split across `config/*.config.json` files (each file **must** keep the `{"simulation": {...}}` wrapper):

```
my-game/
├── config.json                      ← option A: all-in-one (add "simulation" key)
├── config/                          ← option B: split files for complex games
│   └── boosters.config.json
├── game.config.prod.json            ← game ID + build settings only (separate)
└── package.json
```

</details>

***

## What You'll Build

- Booster packs that players open for randomized rewards
- Weighted loot tables with rarity tiers (common → legendary)
- A pity system that guarantees rare drops after N unlucky opens
- Minimum rarity guarantees per pack tier
- New-item bias so players are more likely to get items they don't own yet
- Server-side resolution: the client never determines drop results

***

## Server Configuration

### Step 1: Define Pack Entities

Each pack type is an entity that tracks how many the player owns:

```json
{
  "simulation": {
    "entities": {
      "pack_common": {
        "tags": ["pack", "openable"],
        "stackable": true,
        "clientViewable": true,
        "metadata": {
          "displayName": "Common Pack"
        }
      },
      "pack_rare": {
        "tags": ["pack", "openable"],
        "stackable": true,
        "clientViewable": true,
        "metadata": {
          "displayName": "Rare Pack"
        }
      },
      "pack_epic": {
        "tags": ["pack", "openable"],
        "stackable": true,
        "clientViewable": true,
        "metadata": {
          "displayName": "Epic Pack"
        }
      }
    }
  }
}
```

### Step 2: Define Reward Entities

The items players can receive. Tag them by rarity so loot tables can filter:

```json
{
  "simulation": {
    "entities": {
      "unit_swordman": {
        "tags": ["unit", "collectible", "rarity:common"],
        "stackable": true,
        "clientViewable": true,
        "metadata": { "displayName": "Swordman", "rarity": "common" }
      },
      "unit_archer": {
        "tags": ["unit", "collectible", "rarity:common"],
        "stackable": true,
        "clientViewable": true,
        "metadata": { "displayName": "Archer", "rarity": "common" }
      },
      "unit_knight": {
        "tags": ["unit", "collectible", "rarity:rare"],
        "stackable": true,
        "clientViewable": true,
        "metadata": { "displayName": "Knight", "rarity": "rare" }
      },
      "unit_dragon": {
        "tags": ["unit", "collectible", "rarity:legendary"],
        "stackable": true,
        "clientViewable": true,
        "metadata": { "displayName": "Dragon", "rarity": "legendary" }
      }
    }
  }
}
```

### Step 3: Define Pity Counter Entities

Track how many opens since the last high-rarity drop:

```json
{
  "simulation": {
    "entities": {
      "pity_counter_mid": {
        "tags": ["pity", "counter"],
        "stackable": true,
        "clientViewable": true,
        "metadata": {
          "displayName": "Mid Pity Counter",
          "description": "Resets when an epic drops"
        }
      },
      "pity_counter_high": {
        "tags": ["pity", "counter"],
        "stackable": true,
        "clientViewable": true,
        "metadata": {
          "displayName": "High Pity Counter",
          "description": "Resets when a legendary drops"
        }
      }
    }
  }
}
```

### Step 4: Define Loot Tables

Loot tables are the pools the server draws from when a pack is opened.

**Rarity pool tables**: one per rarity tier, using tag-based filtering:

```json
{
  "simulation": {
    "lootTables": {
      "common_units": {
        "type": "uniform",
        "filter": {
          "includeTags": ["unit", "collectible", "rarity:common"]
        },
        "newItemBias": {
          "enabled": true,
          "biasMultiplier": 2.0
        }
      },
      "rare_units": {
        "type": "uniform",
        "filter": {
          "includeTags": ["unit", "collectible", "rarity:rare"]
        },
        "newItemBias": {
          "enabled": true,
          "biasMultiplier": 2.0
        }
      },
      "epic_units": {
        "type": "uniform",
        "filter": {
          "includeTags": ["unit", "collectible", "rarity:epic"]
        },
        "newItemBias": {
          "enabled": true,
          "biasMultiplier": 1.5
        }
      },
      "legendary_units": {
        "type": "uniform",
        "filter": {
          "includeTags": ["unit", "collectible", "rarity:legendary"]
        },
        "newItemBias": {
          "enabled": true,
          "biasMultiplier": 1.5
        }
      }
    }
  }
}
```

`uniform` tables automatically include all entities matching the tags. When you add a new `rarity:common` unit entity, it's automatically part of the common pool, no table edits needed.

**Rarity selection tables**: weighted roll to pick which pool, per pack tier:

```json
{
  "simulation": {
    "lootTables": {
      "common_pack_cards": {
        "type": "weighted",
        "entries": [
          { "tableRef": "common_units", "weight": 75 },
          { "tableRef": "rare_units", "weight": 20 },
          { "tableRef": "epic_units", "weight": 4.5 },
          { "tableRef": "legendary_units", "weight": 0.5 }
        ]
      },
      "rare_pack_cards": {
        "type": "weighted",
        "entries": [
          { "tableRef": "common_units", "weight": 50 },
          { "tableRef": "rare_units", "weight": 40 },
          { "tableRef": "epic_units", "weight": 8 },
          { "tableRef": "legendary_units", "weight": 2 }
        ]
      },
      "epic_pack_cards": {
        "type": "weighted",
        "entries": [
          { "tableRef": "common_units", "weight": 30 },
          { "tableRef": "rare_units", "weight": 40 },
          { "tableRef": "epic_units", "weight": 25 },
          { "tableRef": "legendary_units", "weight": 5 }
        ]
      }
    }
  }
}
```

Each entry uses `tableRef` to chain into a rarity pool. Weights determine the odds of rolling each rarity. For `common_pack_cards`: 75% common, 20% rare, 4.5% epic, 0.5% legendary.

**Bonus coin tables**: guaranteed currency alongside card drops:

```json
{
  "simulation": {
    "lootTables": {
      "common_pack_coins": {
        "type": "guaranteed",
        "entries": [
          { "entityId": "currency_coins", "quantity": { "min": 100, "max": 300 } }
        ]
      },
      "rare_pack_coins": {
        "type": "guaranteed",
        "entries": [
          { "entityId": "currency_coins", "quantity": { "min": 300, "max": 600 } }
        ]
      }
    }
  }
}
```

### Step 5: Define Pack-Opening Recipes

Each recipe consumes 1 pack and rolls from the appropriate loot tables:

```json
{
  "simulation": {
    "recipes": {
      "open_pack_common": {
        "scope": "player",
        "duration": 0,
        "clientViewable": true,
        "inputs": {
          "pack_common": 1
        },
        "outputs": {
          "rolls": [
            {
              "table": "common_pack_cards",
              "count": { "min": 3, "max": 5 },
              "guarantees": [],
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
        },
        "metadata": {
          "displayName": "Open Common Pack"
        }
      },
      "open_pack_rare": {
        "scope": "player",
        "duration": 0,
        "clientViewable": true,
        "inputs": {
          "pack_rare": 1
        },
        "outputs": {
          "rolls": [
            {
              "table": "rare_pack_cards",
              "count": { "min": 4, "max": 6 },
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
              "table": "rare_pack_coins",
              "count": 1
            }
          ]
        },
        "metadata": {
          "displayName": "Open Rare Pack"
        }
      },
      "open_pack_epic": {
        "scope": "player",
        "duration": 0,
        "clientViewable": true,
        "inputs": {
          "pack_epic": 1
        },
        "outputs": {
          "rolls": [
            {
              "table": "epic_pack_cards",
              "count": { "min": 3, "max": 4 },
              "guarantees": [
                { "tag": "rarity:epic", "minCount": 1 }
              ],
              "pity": {
                "counterEntity": "pity_counter_high",
                "threshold": 40,
                "guaranteedTag": "rarity:legendary",
                "resetOnHit": true
              }
            }
          ]
        },
        "metadata": {
          "displayName": "Open Epic Pack"
        }
      }
    }
  }
}
```

### How Rolls Work

Each roll entry:

1. **`table`**: Which loot table to draw from
2. **`count`**: How many draws. `{ "min": 3, "max": 5 }` means 3–5 random draws.
3. **`guarantees`**: After all random draws, if the results don't include at least `minCount` items with the specified tag, extra draws are forced. E.g., `{ "tag": "rarity:rare", "minCount": 1 }` ensures at least one rare in every rare pack.
4. **`pity`**: Increments `counterEntity` each time the pack is opened. When the counter reaches `threshold`, the next roll guarantees an item with `guaranteedTag`. `resetOnHit: true` resets the counter when the guaranteed rarity drops naturally (before hitting the threshold).

### How New-Item Bias Works

When `newItemBias.enabled` is `true`, items the player doesn't own yet get their selection weight multiplied by `biasMultiplier`. A multiplier of `2.0` means unowned items are twice as likely to be selected. This helps new players build a collection quickly.

***

## Client-Side Implementation

### Step 1: Read Pack Inventory

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

const state = await RundotGameAPI.simulation.getStateAsync()
const commonPacks = state.entities['pack_common'] ?? 0
const rarePacks = state.entities['pack_rare'] ?? 0
const epicPacks = state.entities['pack_epic'] ?? 0
```

### Step 2: Subscribe to Pack Count Changes

```typescript
const unsubscribe = await RundotGameAPI.simulation.subscribeAsync({
  tags: ['pack'],
  onUpdate(update) {
    if (update.type === 'entity') {
      for (const { entityId, quantity } of update.entities) {
        updatePackCount(entityId, quantity)
      }
    }
  },
})
```

### Step 3: Open a Pack

```typescript
async function openPack(packType: 'common' | 'rare' | 'epic') {
  const recipeId = `open_pack_${packType}`

  const result = await RundotGameAPI.simulation.executeRecipeAsync(recipeId)

  if (!result.success) {
    showError(result.message ?? 'Failed to open pack')
    return null
  }

  // result.outputs maps each granted entityId to its quantity (the rolled items).
  // The server has already updated entity quantities.
  // result.randomSeed carries the server seed used to resolve the roll.
  return result
}
```

The `executeRecipeAsync` response (`ExecuteRecipeResponse`) carries the open result:

| Field | Type | Description |
| --- | --- | --- |
| `success` | `boolean` | Whether the open succeeded. |
| `outputs` | `Record<string, number \| string>` | What the player was granted: entity ID to quantity. This is the rolled loot. |
| `randomSeed` | `string` | Server seed used to resolve the roll. Useful for provably-fair displays or replaying the open animation deterministically. |
| `message` | `string` | Failure reason when `success` is `false`. |

```typescript
const result = await RundotGameAPI.simulation.executeRecipeAsync('open_pack_common')
if (result.success && result.outputs) {
  for (const [entityId, quantity] of Object.entries(result.outputs)) {
    playDropAnimation(entityId, quantity)
  }
}
```

### Step 4: Display Results

After opening a pack, read updated state to show the player what they received:

```typescript
async function showPackResults() {
  // Re-fetch state to get updated quantities
  const state = await RundotGameAPI.simulation.getStateAsync()

  // Or use subscriptions: entity updates will fire
  // with the new quantities for each dropped item
}
```

### Step 5: Check if Player Can Open

`getRecipeRequirementsAsync` takes a single `Recipe` object (`{ recipeId, entity?, nonce?, batchAmount? }`), not positional arguments. Use `batchAmount` to check whether the player can afford several opens at once.

```typescript
async function canOpenPack(packType: string): Promise<boolean> {
  const requirements = await RundotGameAPI.simulation.getRecipeRequirementsAsync({
    recipeId: `open_pack_${packType}`,
  })
  return requirements.canAfford
}

// Check affordability for a 10x open:
async function canOpenPackBatch(packType: string, count: number): Promise<boolean> {
  const requirements = await RundotGameAPI.simulation.getRecipeRequirementsAsync({
    recipeId: `open_pack_${packType}`,
    batchAmount: count,
  })
  return requirements.canAfford
}
```

***

## Purchasing Packs

### With Premium Currency (Wallet)

```json
{
  "purchase_booster_10": {
    "duration": 0,
    "scope": "player",
    "clientViewable": true,
    "inputs": {
      "wallet": { "amount": 5, "walletCurrency": "premiumCurrency" }
    },
    "outputs": {
      "pack_common": 10
    },
    "metadata": {
      "displayName": "10x Boosters"
    }
  }
}
```

### Free Booster on Cooldown

Grant a free pack every 4 hours:

```json
{
  "claim_free_booster": {
    "duration": 14400000,
    "concurrency": "cooldown:free_booster",
    "onConflict": "fail",
    "inputs": {},
    "beginEffects": [
      { "type": "add", "entity": "pack_common", "value": 1 }
    ],
    "outputs": {},
    "clientViewable": true,
    "scope": "player"
  }
}
```

The pack is granted immediately via `beginEffects`, while the 4-hour cooldown runs. The player can claim again after the cooldown expires.

```typescript
const result = await RundotGameAPI.simulation.executeRecipeAsync('claim_free_booster')

if (!result.success) {
  // Cooldown still active: show timer
  const runs = await RundotGameAPI.simulation.getActiveRunsAsync()
  const cooldown = runs.find(r => r.recipeId === 'claim_free_booster')
  if (cooldown) {
    showCooldownTimer(cooldown.expiresAt)
  }
}
```

***

## Common Variations

### Faction-Specific Packs

Use weighted loot tables with explicit entity entries for curated faction packs:

```json
{
  "faction_orcs_pack": {
    "type": "weighted",
    "entries": [
      { "weight": 25, "outcomes": [{ "entityId": "unit_orc_goblin", "quantity": 1 }] },
      { "weight": 20, "outcomes": [{ "entityId": "unit_orc_warrior", "quantity": 1 }] },
      { "weight": 15, "outcomes": [{ "entityId": "unit_orc_berserker", "quantity": 1 }] },
      { "weight": 10, "outcomes": [{ "entityId": "unit_orc_warchief", "quantity": 1 }] }
    ],
    "newItemBias": { "enabled": true, "biasMultiplier": 3.0 }
  }
}
```

### Wildcard Conversion

A small chance to replace a drop with a wildcard (trade-in) token:

```json
{
  "common_pack_cards": {
    "type": "weighted",
    "entries": [ ... ],
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
  }
}
```

When a drop triggers conversion, the player receives the wildcard entity instead of the original item. Higher rarities have higher conversion rates.

### Curated Starter Pack

Fixed contents with no randomization:

```json
{
  "open_pack_starter": {
    "scope": "player",
    "duration": 0,
    "clientViewable": true,
    "inputs": { "pack_starter": 1 },
    "outputs": {
      "unit_swordman": 2,
      "unit_archer": 2,
      "unit_spearman": 2
    }
  }
}
```

***

## Displaying Drop Rates

For legal compliance and player trust, you'll often need to show players the odds. Loot tables are **server-only** and never reach the client.

{% hint style="warning" %}
`getConfigAsync()` returns `RundotGameSimulationConfig` (`version`, `entities`, `recipes`, optional `fieldResolution`/`matchmaking`). It does **not** include `lootTables`, `probabilityTables`, or `formulaPools`. The game-server strips those before returning the client config, so `config.lootTables` is `undefined` at runtime. Don't try to compute drop rates from `getConfigAsync()`.
{% endhint %}

You have two ways to surface published rates on the client:

**Option A: `clientConfig` passthrough.** Anything under the `clientConfig` key in your simulation config passes through to the client unchanged. Mirror your published rates there:

```json
{
  "simulation": {
    "clientConfig": {
      "dropRates": {
        "common_pack_cards": {
          "common_units": 75.0,
          "rare_units": 20.0,
          "epic_units": 4.5,
          "legendary_units": 0.5
        }
      }
    }
  }
}
```

```typescript
const config = await RundotGameAPI.simulation.getConfigAsync()
// clientConfig is a runtime passthrough; it is not yet on the typed RundotGameSimulationConfig surface, so cast it.
const clientConfig = (config as { clientConfig?: { dropRates?: Record<string, Record<string, number>> } }).clientConfig
const rates = clientConfig?.dropRates?.['common_pack_cards']
// { common_units: 75.0, rare_units: 20.0, epic_units: 4.5, legendary_units: 0.5 }
```

**Option B: hardcode the published rates in your game build.** Keep the displayed odds in your client code and match them to the server loot tables when you deploy. Simplest to ship, but you must keep both in sync by hand.

***

## Best Practices

- All randomization happens server-side: the client never determines drop results.
- Use `uniform` (tag-filtered) tables for pools that grow over time. New entities with matching tags are automatically included.
- Use `weighted` tables when you need explicit control over individual item probabilities.
- Chain tables with `tableRef` to separate "which rarity" from "which item within that rarity."
- Implement a pity system for high-rarity items to prevent frustrating dry streaks.
- Set `newItemBias` to help new players build collections faster.
- Display drop rates to players. Loot tables are server-only, so surface published odds through the `clientConfig` passthrough on `getConfigAsync()` or hardcode them in your build (see "Displaying Drop Rates").
- Use `beginEffects` for free-booster cooldowns so the pack is granted instantly while the timer runs.
