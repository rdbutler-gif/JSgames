# Simulation: Energy System (BETA)

Add a regenerating energy/stamina system to your game. Players spend energy to take actions (start battles, enter dungeons) and it refills automatically over time, even while offline.

> This is a self-contained recipe. Everything you need, config, client code, and patterns, is on this page.

***

## Where Config Goes

All JSON config on this page is simulation config: server-authoritative state, actions, and rewards. The CLI uploads it automatically when you `rundot deploy`.

### Recommended: `rundot/simulation/`

Place simulation config in the `rundot/simulation/` directory, one file per system. Each file holds **raw simulation content with no `{"simulation": {...}}` wrapper** (the directory implies it). Files are deep-merged alphabetically at deploy time with collision detection.

```
my-game/
├── rundot/
│   └── simulation/
│       └── energy-system.json       ← raw content, no "simulation" wrapper
├── game.config.prod.json            ← game ID + build settings only (separate)
└── package.json
```

> Commit `rundot/` to your repo; it's project config like `package.json`, not a build artifact. It's env-agnostic and takes priority over legacy `config.{local,staging}.json`. `game.config.prod.json` is for CLI metadata only; simulation config does not go there.

### Also supported: legacy `config.json` / `config/`

Legacy layouts keep working indefinitely. Run `rundot migrate-config` (with `--dry-run` to preview) to move them into `rundot/simulation/` automatically.

<details>

<summary>Legacy <code>config.json</code> or <code>config/</code></summary>

Use a single `config.json` with a top-level `"simulation"` key, or split across `config/*.config.json` files (each file **must** keep the `{"simulation": {...}}` wrapper):

```
my-game/
├── config.json                      ← option A: all-in-one (add "simulation" key)
├── config/                          ← option B: split files for complex games
│   └── energy-system.config.json
├── game.config.prod.json            ← game ID + build settings only (separate)
└── package.json
```

</details>

***

## What You'll Build

- Energy that regenerates 1 point every N minutes, up to a maximum
- Actions that cost energy (e.g., starting a battle costs 5 energy)
- Automatic offline catch-up (player returns after 2 hours → energy has regenerated)
- A cap so energy stops regenerating at max

***

## Server Configuration

### Entities

Define the energy state:

```json
{
  "simulation": {
    "entities": {
      "energy_current": {
        "tags": ["resource", "energy"],
        "stackable": true,
        "clientViewable": true,
        "metadata": {
          "displayName": "Energy",
          "description": "Used to start battles. Regenerates over time.",
          "maxAmount": 20,
          "regenIntervalMs": 600000
        }
      },
      "energy_max": {
        "tags": ["resource", "energy", "cap"],
        "stackable": true,
        "clientViewable": true,
        "metadata": {
          "displayName": "Max Energy"
        }
      }
    }
  }
}
```

| Entity | Purpose |
|---|---|
| `energy_current` | The player's current energy. Consumed by actions, refilled by regen. |
| `energy_max` | Maximum energy capacity. Use this if max energy can increase (e.g., through upgrades). |

### Regeneration Recipe

This is the core of the energy system: a timed recipe that auto-restarts to produce 1 energy every cycle:

```json
{
  "simulation": {
    "recipes": {
      "energy_regeneration": {
        "duration": 600000,
        "autoRestart": true,
        "concurrency": "single",
        "onConflict": "fail",
        "maxOfflineExecutionPeriod": 604800000,
        "inputs": {},
        "outputs": {
          "energy_current": 1
        },
        "maxRestartCondition": {
          "entity": "energy_current",
          "maxValue": 20
        },
        "metadata": {
          "displayName": "Energy Regeneration",
          "hidden": true
        },
        "clientViewable": true,
        "scope": "player"
      }
    }
  }
}
```

| Field | Value | Why |
|---|---|---|
| `duration` | `600000` | 10 minutes per energy point (in milliseconds). |
| `autoRestart` | `true` | Restarts immediately after granting energy. |
| `concurrency` | `"single"` | Only one regen timer runs at a time. |
| `maxOfflineExecutionPeriod` | `604800000` | Catch up to 7 days of offline regen. |
| `maxRestartCondition` | `energy_current` ≤ 20 | Stops regenerating when energy is full. |
| `inputs` | `{}` | Regen is free: no cost to the player. |
| `outputs` | `energy_current: 1` | Grants 1 energy per cycle. |

### Energy-Spending Recipes

Define actions that consume energy:

```json
{
  "simulation": {
    "recipes": {
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
      },
      "battle_start_free": {
        "duration": 0,
        "scope": "player",
        "clientViewable": true,
        "inputs": {},
        "outputs": {
          "battle_pending": 1
        },
        "metadata": {
          "displayName": "Start Tutorial Battle"
        }
      },
      "battle_resolve_forfeit": {
        "duration": 0,
        "scope": "player",
        "clientViewable": true,
        "inputs": {
          "battle_pending": 1
        },
        "outputs": {
          "energy_current": 5
        },
        "metadata": {
          "displayName": "Battle Forfeit"
        }
      }
    }
  }
}
```

Key patterns:
- **`battle_start`** costs 5 energy and sets a `battle_pending` flag
- **`battle_start_free`** is an alternative for tutorials with no energy cost
- **`battle_resolve_forfeit`** refunds energy if the player cancels before the battle starts

### Initialization

Start the regen timer when a new player opens the game for the first time:

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
          { "type": "set", "entity": "energy_max", "value": 20 },
          { "type": "trigger_recipe", "selector": "energy_regeneration" }
        ],
        "scope": "player"
      }
    }
  }
}
```

The `onStart` lifecycle hook fires the `initial_player_state` recipe once. It sets energy to full and kicks off the regen timer.

***

## Client-Side Implementation

### Step 1: Read Energy State

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

// getStateAsync returns a union of personal and room state.
// For player-scoped energy, cast to the personal shape to read entities.
const state = (await RundotGameAPI.simulation.getStateAsync()) as {
  entities: Record<string, number | string>
}
const currentEnergy = state.entities['energy_current'] ?? 0
const maxEnergy = state.entities['energy_max'] ?? 20
```

{% hint style="info" %}
`getStateAsync()` returns a union: personal state (which has `entities`) or room state (which has `sharedAssets` / `activeRecipes` instead). Reading `state.entities` on the raw union is a type error, so cast to a shape with `entities` (as shown above) for player-scoped state.
{% endhint %}

### Step 2: Subscribe to Real-Time Updates

```typescript
const unsubscribe = await RundotGameAPI.simulation.subscribeAsync({
  entities: ['energy_current', 'energy_max'],
  activeRuns: true,
  onUpdate(update) {
    switch (update.type) {
      case 'snapshot':
        // Initial state on subscribe: seed energy + timer before any deltas arrive.
        for (const { entityId, quantity } of update.entities ?? []) {
          if (entityId === 'energy_current') {
            updateEnergyDisplay(quantity)
          }
        }
        updateRegenTimer(update.activeRuns ?? [])
        break
      case 'entity':
        for (const { entityId, quantity } of update.entities) {
          if (entityId === 'energy_current') {
            updateEnergyDisplay(quantity)
          }
        }
        break
      case 'activeRuns':
        updateRegenTimer(update.activeRuns)
        break
    }
  },
})
```

Subscribe to `activeRuns: true` to get the regen timer's progress. Each active run includes an `expiresAt` timestamp you can use to show a countdown.

{% hint style="info" %}
`subscribeAsync` delivers three update types: `'snapshot'` (the current `entities` and `activeRuns` right after you subscribe), `'entity'` (a delta when an entity quantity changes), and `'activeRuns'` (a delta when timers start, finish, or restart). Handle `'snapshot'` to seed your initial UI instead of relying only on `getStateAsync`.
{% endhint %}

You can also target entities by tag instead of listing ids, and scope the subscription to a room:

```typescript
await RundotGameAPI.simulation.subscribeAsync({
  tags: ['energy'],   // subscribe to every entity tagged "energy"
  activeRuns: true,
  // roomId: 'my-room', // optional: scope to room-shared state
  onUpdate(update) { /* ... */ },
})
```

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `entities` | `string[]` | No | - | Entity ids to watch (e.g. `['energy_current']`). |
| `tags` | `string[]` | No | - | Entity tags to watch (e.g. `['energy']`); an alternative to listing ids. |
| `activeRuns` | `boolean` | No | `false` | When `true`, emit `'activeRuns'` updates for in-flight timers. |
| `roomId` | `string` | No | - | Scope the subscription to a room's shared state. |
| `onUpdate` | `(update) => void` | Yes | - | Receives `'snapshot'`, `'entity'`, and `'activeRuns'` updates. |

### Step 3: Display Regen Countdown

```typescript
import type { SimulationRunSummary } from '@series-inc/rundot-game-sdk/api'

function updateRegenTimer(activeRuns: SimulationRunSummary[]) {
  const regenRun = activeRuns.find(run => run.recipeId === 'energy_regeneration')
  if (regenRun) {
    // expiresAt is a number (epoch ms), so subtract directly.
    const msRemaining = regenRun.expiresAt - Date.now()
    const secondsRemaining = Math.max(0, Math.ceil(msRemaining / 1000))
    showCountdown(secondsRemaining)
  } else {
    hideCountdown() // Energy is full, regen stopped
  }
}
```

{% hint style="info" %}
There is no `ActiveRun` type exported by the SDK. Active runs returned by `getActiveRunsAsync` are `SimulationRunSummary[]`, and `expiresAt` is a `number` (epoch milliseconds), not a date string. The `activeRuns` arrays on `'activeRuns'` and `'snapshot'` subscription updates carry the same shape.
{% endhint %}

#### Seed the timer on mount with `getActiveRunsAsync`

The subscription's `'activeRuns'` deltas only fire when a timer changes, so on screen mount you may want the current timer immediately. `getActiveRunsAsync` does a one-shot fetch:

```typescript
// One-shot: read in-flight runs (e.g. the regen timer) without subscribing.
const runs = await RundotGameAPI.simulation.getActiveRunsAsync()
updateRegenTimer(runs)
```

| Method | Returns | Description |
|---|---|---|
| `getActiveRunsAsync(options?)` | `Promise<SimulationRunSummary[]>` | Fetch the player's current active runs once. `options` is `{ roomId?: string }` to scope to a room. Pair it with the `'snapshot'` subscription update to seed the regen countdown before deltas arrive. |

### Step 4: Spend Energy with Optimistic UI

```typescript
async function startBattle(currentEnergy: number) {
  const energyCost = 5

  if (currentEnergy < energyCost) {
    showError('Not enough energy!')
    return false
  }

  // Optimistic update: deduct immediately for responsive UI
  updateEnergyDisplay(currentEnergy - energyCost)

  const result = await RundotGameAPI.simulation.executeRecipeAsync('battle_start')

  if (!result.success) {
    // Rollback on failure
    updateEnergyDisplay(currentEnergy)
    showError(result.message ?? 'Failed to start battle')
    return false
  }

  return true
}
```

`executeRecipeAsync` resolves to more than `success` / `message`. The full `ExecuteRecipeResponse` reports what the server actually did:

| Field | Type | Description |
|---|---|---|
| `success` | `boolean` | Whether the recipe ran. |
| `message` | `string?` | Human-readable result or error. |
| `outputs` | `Record<string, number \| string>?` | Entities granted or consumed (e.g. confirm the 5 energy spent). |
| `runId` | `string?` | Id of the started run (for timed recipes). |
| `expiresAt` | `string?` | When a timed run completes. |
| `queuePosition` | `number?` | Position if the recipe was queued. |
| `amountRequested` | `number?` | Batch quantity requested. |
| `amountFulfilled` | `number?` | Batch quantity actually granted. |
| `partialSuccess` | `boolean?` | `true` when only part of a batch spend succeeded. |
| `randomSeed` | `string?` | Seed for recipes with randomized outputs. |
| `status` | `string?` | Server status code for the run. |
| `data` | `Record<string, unknown>?` | Extra recipe-specific payload. |

For batched spends (`batchAmount` in `ExecuteRecipeOptions`), check `partialSuccess` and `amountFulfilled` to learn how many copies actually went through, and read `outputs` to reconcile your optimistic UI with the authoritative result.

### Step 5: Check Requirements Before Showing UI

```typescript
const requirements = await RundotGameAPI.simulation.getRecipeRequirementsAsync({
  recipeId: 'battle_start',
})

if (!requirements.canAfford) {
  disableBattleButton()
  showCost(requirements.inputs) // Show what's needed
}
```

`getRecipeRequirementsAsync` takes a single `Recipe` object: `{ recipeId: string; entity?: string; nonce?: string; batchAmount?: number }`. Pass `batchAmount` to check the cost of spending several copies at once (e.g. `{ recipeId: 'battle_start', batchAmount: 3 }`). It resolves to a `RecipeRequirementResult` with `canAfford`, `inputs`, `disabled`, and the resolved `amount`.

***

## How Offline Catch-Up Works

1. Player closes the game with 5/20 energy
2. Player returns 3 hours later (180 minutes)
3. Regen is 1 energy per 10 minutes → 18 cycles would have completed
4. But `maxRestartCondition` caps at 20, so only 15 energy is granted (5 + 15 = 20)
5. Player sees 20/20 energy on return

The `maxOfflineExecutionPeriod` of 7 days means if a player is away for a month, only 7 days of catch-up are calculated.

***

## Common Variations

### Dynamic Regen Rate

If regen speed increases with level, use a formula for duration:

```json
{
  "energy_regeneration": {
    "duration": {
      "formula": "max(60000, 600000 - (playerLevel * 30000))",
      "variables": {
        "playerLevel": { "inventory": "player_level" }
      }
    },
    "autoRestart": true,
    "outputs": { "energy_current": 1 }
  }
}
```

### Premium Energy Refill

Let players buy energy with premium currency:

```json
{
  "purchase_energy_refill": {
    "duration": 0,
    "scope": "player",
    "clientViewable": true,
    "inputs": {
      "wallet": { "amount": 2, "walletCurrency": "premiumCurrency" }
    },
    "outputs": {
      "energy_current": 25
    }
  }
}
```

### Ad-Rewarded Energy

Grant energy for watching an ad: call the recipe after a successful ad view:

```typescript
// showRewardedAdAsync resolves to a boolean: true when the ad was watched to completion.
const watched = await RundotGameAPI.ads.showRewardedAdAsync()
if (watched) {
  await RundotGameAPI.simulation.executeRecipeAsync('ad_reward_energy')
}
```

***

## Resetting State During Development

While building and testing an energy system, `resetStateAsync` wipes the current player's simulation state: it clears entities, cancels all active runs (including the regen timer), and removes slot assignments. Pass `initializeRecipe` to re-seed full energy in the same call.

```typescript
const reset = await RundotGameAPI.simulation.resetStateAsync({
  initializeRecipe: 'initial_player_state', // re-run the seed recipe after clearing
})
// reset.clearedRuns, reset.clearedSlots, reset.recipeExecuted tell you what happened.
```

{% hint style="info" %}
`initializeRecipe` runs with an empty inputs map (it can't receive call-time inputs), so for parameterized seeding call `executeRecipeAsync(recipeId, inputs)` after the reset.
{% endhint %}

| Method | Returns | Description |
|---|---|---|
| `resetStateAsync(options?)` | `Promise<ResetStateResult>` | Clears all simulation state for the current player. `options` is `{ initializeRecipe?: string }`. Resolves to `{ success, clearedRuns, clearedSlots, recipeExecuted }`. |

{% hint style="warning" %}
`resetStateAsync` is destructive and meant for development and testing. It deletes the player's progress; don't wire it to a player-facing button in production.
{% endhint %}

***

## Best Practices

- Always validate energy client-side before calling `executeRecipeAsync` for responsive UX, but trust the server result as authoritative.
- Use optimistic updates with rollback: deduct energy immediately, restore on server failure.
- Subscribe to `activeRuns` to power countdown timers instead of calculating client-side.
- Set `maxOfflineExecutionPeriod` to prevent unlimited offline accumulation.
- Consider a `battle_resolve_forfeit` recipe to refund energy when players cancel actions.
- Keep `energy_regeneration` metadata `hidden: true` so it doesn't appear in player-facing recipe lists.
