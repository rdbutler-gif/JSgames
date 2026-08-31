# Simulation API (BETA)

Drive authoritative game state through the RUN.world simulation system. Execute recipes, manage inventories and slots, and resolve dynamic fields directly from the platform.

> ⚠️ The Server-Authoritative API only runs inside the RUN.world host environment. Calling these methods during local Playground testing throws a helpful error.

## Quick Start

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

if (RundotGameAPI.simulation.isEnabled()) {
  const state = await RundotGameAPI.simulation.getStateAsync()
  const config = await RundotGameAPI.simulation.getConfigAsync()
}
```

`isEnabled()` is a synchronous guard that returns whether the simulation system is available in the current host. Call it before any other simulation method when you need to degrade gracefully outside the RUN.world host.

## State Management

```typescript
const personalState = await RundotGameAPI.simulation.getStateAsync()
// { entities, activeRuns, disabledRecipes }

const roomState = await RundotGameAPI.simulation.getStateAsync('room_123')
// { activeRecipes, sharedAssets, actors, activeRuns }

const config = await RundotGameAPI.simulation.getConfigAsync()
// { version, entities, recipes, fieldResolution?, matchmaking? }
```

`getStateAsync` returns one of two shapes depending on whether you pass a `roomId`. Omit it for personal state; pass a `roomId` to inspect a shared room.

| Field | Type | Shape | Description |
|---|---|---|---|
| `entities` | `Record<string, number \| string>` | personal | Inventory quantities keyed by entity id (this is your inventory map; it is named `entities`, not `inventory`) |
| `activeRuns` | `SimulationRunSummary[]` | both | In-flight recipe runs |
| `disabledRecipes` | `string[]` | personal | Recipe ids currently disabled for the player |
| `activeRecipes` | `Record<string, SimulationRoomActiveRecipe>` | room | Recipes running in the room (each value carries its own `recipeId`) |
| `sharedAssets` | `Record<string, number \| string>` | room | Shared inventory quantities for the room |
| `actors` | `Array<Record<string, unknown>>` | room | Actor entities in the room |

{% hint style="info" %}
The two shapes are mutually exclusive. Room state has no `entities` map and no `disabledRecipes`; personal state has no `actors` or `sharedAssets`. Check for `roomId` at the call site to know which shape you got back.
{% endhint %}

Each entry in `activeRuns` is a `SimulationRunSummary`. This is the same shape `getActiveRunsAsync` resolves to; read it to render run timers and tell which runs are collectable.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Run id (pass to `collectRecipeAsync`) |
| `recipeId` | `string` | Recipe this run is executing |
| `status` | `string` | `'running'`, `'awaiting_collection'`, etc. |
| `startTime` | `number` | Run start time (ms epoch) |
| `expiresAt` | `number` | When the run completes (ms epoch) |
| `entity` | `string` | Present on entity-scoped runs; the entity instance id |
| `inputs` | `Record<string, number \| string>` | Inputs the run was started with |
| `outputs` | `Record<string, number \| string>` | Outputs produced (present once collectable) |
| `commitmentEndsAt` | `number` | When the run's commitment window ends (ms epoch) |
| `participantCount` | `number` | Participant count for room/shared runs |

Each value in a room state's `activeRecipes` map is a `SimulationRoomActiveRecipe`:

| Field | Type | Description |
|---|---|---|
| `recipeId` | `string` | Recipe running in the room |
| `scope` | `'room' \| 'actor'` | Whether the recipe runs at room scope or against an actor |
| `startedAt` | `number` | Start time (ms epoch) |
| `expiresAt` | `number` | Completion time (ms epoch) |
| `commitmentEndsAt` | `number` | When the commitment window ends (ms epoch), if any |

## Simulation Config

`getConfigAsync(roomId?)` resolves to a `RundotGameSimulationConfig`. Read it to drive UI: render slots from the entity definitions, browse recipes, and respect `clientViewable` flags. Top-level keys are `version`, `entities`, `recipes`, and the optional `fieldResolution` and `matchmaking` maps.

Each entry in `entities` is an entity definition:

| Field | Type | Description |
|---|---|---|
| `tags` | `string[]` | Tags used by slot `allowedTags` matching and subscription filters |
| `metadata` | `Record<string, any>` | Arbitrary metadata for the entity |
| `stackable` | `boolean` | Whether multiple copies stack into a quantity |
| `neverConsumable` | `boolean` | Whether recipe inputs can consume this entity |
| `clientViewable` | `boolean` | Whether the entity is streamed to clients via `subscribeAsync` |
| `slots` | `Record<string, { allowedTags: string[]; maxItems: number }>` | Slot definitions on this entity; `allowedTags` gates which items fit, `maxItems` caps each slot |
| `actorTemplate` | `{ defaultState?: Record<string, any>; availableRecipes?: string[] }` | Template applied to actor instances spawned from this entity |

Each entry in `recipes` is a `RundotGameSimulationRecipe`:

| Field | Type | Description |
|---|---|---|
| `scope` | `'player' \| 'room' \| 'actor'` | Execution scope |
| `inputs` | `Record<string, any>` | Declared inputs (name to input spec) |
| `duration` | `number` | Run duration in ms (`0` for instant) |
| `outputs` | `Record<string, any>` | Declared outputs |
| `beginEffects` | `RundotGameSimulationEffect[]` | Effects run when the recipe starts |
| `endEffects` | `RundotGameSimulationEffect[]` | Effects run when the recipe completes |
| `effects` | `Array<any>` | Generic effect list (alternative to begin/end) |
| `guards` | `Record<string, any>` | Preconditions evaluated before the recipe runs |
| `autoRestart` | `boolean` | Whether the recipe restarts on completion |
| `maxRestartCondition` | `any` | Condition that stops auto-restart |
| `metadata` | `{ startsDisabled?: boolean; autoRestart?: boolean; maxRestartCondition?: any }` | Recipe metadata; `startsDisabled` hides the recipe until enabled |
| `clientViewable` | `boolean` | Whether the recipe is surfaced to clients (e.g. via `getAvailableRecipesAsync`) |

## Resetting State

```typescript
// Reset all simulation state (inventory, active runs, slot assignments)
const result = await RundotGameAPI.simulation.resetStateAsync()
// { success: true, clearedRuns: 3, clearedSlots: 2, recipeExecuted: null }

// Reset and re-initialize with a starter recipe
const result = await RundotGameAPI.simulation.resetStateAsync({
  initializeRecipe: 'starter_pack',
})
// { success: true, clearedRuns: 3, clearedSlots: 2, recipeExecuted: 'starter_pack' }
```

`resetStateAsync` clears all simulation state for the current player: inventory quantities are zeroed, active recipe runs are cancelled, and slot assignments are removed. Pass `initializeRecipe` to automatically execute a recipe after the reset: useful for granting a starter loadout or restoring default configuration.

{% hint style="warning" %}
`initializeRecipe` takes only a recipe name — there is no way to pass call-time inputs through `resetStateAsync`, so the recipe always runs with an **empty inputs map**. Any `inputs.X` / `{{inputs.X}}` references inside it resolve to `0` / `''`. To seed parameterized state, call `executeRecipeAsync(recipeId, inputs)` *after* the reset.
{% endhint %}

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Whether the reset completed successfully |
| `clearedRuns` | `number` | Number of active runs that were cancelled |
| `clearedSlots` | `number` | Number of slot assignments that were deleted |
| `recipeExecuted` | `string \| null` | Recipe executed after reset, if any |

## Recipe Execution

```typescript
// Server-authoritative action
const craft = await RundotGameAPI.simulation.executeRecipeAsync('craft_sword', {
  materials: ['iron', 'wood'],
})

// Craft a batch in a room, fulfilling whatever is affordable
const batchCraft = await RundotGameAPI.simulation.executeRecipeAsync(
  'craft_sword',
  { materials: ['iron', 'wood'] },
  { roomId: 'room_123', batchAmount: 5, allowPartialBatch: true },
)

// Entity-scoped recipe
const upgrade = await RundotGameAPI.simulation.executeScopedRecipeAsync(
  'upgrade_weapon',
  'sword_123',
  { level: 5 },
)
// { success, message }

// Track and collect runs
const runs = await RundotGameAPI.simulation.getActiveRunsAsync()
const collected = await RundotGameAPI.simulation.collectRecipeAsync(runs[0].id)
// { success, runId, rewards, message }

// Trigger chained behaviour
await RundotGameAPI.simulation.triggerRecipeChainAsync('battle_complete')
```

`executeRecipeAsync(recipeId, inputs?, options?)` accepts a third `options` argument:

| Option | Type | Description |
|---|---|---|
| `roomId` | `string` | Run the recipe inside the given room instead of personal scope |
| `batchAmount` | `number` | Craft N copies in a single call |
| `allowPartialBatch` | `boolean` | When batching, fulfill as many as the player can afford instead of failing the whole batch |
| `entity` | `string` | Scope the run to a specific entity instance |
| `nonce` | `string` | Idempotency key to safely retry without double-executing |

`executeScopedRecipeAsync(recipeId, entity, inputs?, options?)` takes an optional `options.roomId` and resolves to `{ success, message }` (not a full `ExecuteRecipeResponse`).

`collectRecipeAsync(runId)` resolves to `{ success, runId, rewards, message }`, where `rewards` is a `Record<string, unknown>` of what the completed run granted.

## Recipe Requirements & Availability

```typescript
const requirements = await RundotGameAPI.simulation.getRecipeRequirementsAsync({
  recipeId: 'craft_sword',
  entity: 'player',
  batchAmount: 1,
})
// { recipeId, entity: string | null, amount?, inputs, canAfford, disabled }

const batch = await RundotGameAPI.simulation.getBatchRecipeRequirementsAsync([
  { recipeId: 'craft_sword', batchAmount: 1 },
  { recipeId: 'craft_shield', batchAmount: 2 },
])
// { success, results: RecipeRequirementResult[] }

const available = await RundotGameAPI.simulation.getAvailableRecipesAsync({
  roomId: 'room_123',
  includeActorRecipes: true,
})
// { success, recipes: [{ id, scope, clientViewable }] }
```

`getRecipeRequirementsAsync` takes a single `Recipe` object, not positional args:

| Field | Type | Required | Description |
|---|---|---|---|
| `recipeId` | `string` | Yes | Recipe to evaluate |
| `entity` | `string` | No | Scope the check to a specific entity instance |
| `batchAmount` | `number` | No | Quantity to evaluate affordability for |
| `nonce` | `string` | No | Idempotency key (passed through to the host) |

It resolves to a `RecipeRequirementResult`:

| Field | Type | Description |
|---|---|---|
| `recipeId` | `string` | The recipe evaluated |
| `entity` | `string \| null` | Entity scope, or `null` for player scope |
| `amount` | `number` | Quantity evaluated (present when a `batchAmount` was supplied) |
| `inputs` | `Record<string, number \| string>` | Required inputs and their amounts |
| `canAfford` | `boolean` | Whether the player can currently afford the recipe |
| `disabled` | `boolean` | Whether the recipe is currently disabled |

`getBatchRecipeRequirementsAsync(recipes)` takes an array of `Recipe` objects and resolves to `{ success, results }`, where `results` is an array of `RecipeRequirementResult`. `getAvailableRecipesAsync(options?)` resolves to `{ success, recipes }`, where each recipe is `{ id, scope, clientViewable }`.

Use these helpers to pre-flight UI, disable unaffordable buttons, or build crafting browsers without guessing requirements.

## Slot Management

```typescript
const containers = await RundotGameAPI.simulation.getSlotContainersAsync()
const assignments = await RundotGameAPI.simulation.getSlotAssignmentsAsync('party_formation')

await RundotGameAPI.simulation.assignItemToSlotAsync('party_formation', 'leader', 'hero_knight')
await RundotGameAPI.simulation.removeItemFromSlotAsync('party_formation', 'leader')

// Dry-run: would this item be allowed in this slot?
const check = await RundotGameAPI.simulation.validateSlotAssignmentAsync(
  'party_formation',
  'leader',
  'hero_knight',
)
// { valid, error? }

const available = await RundotGameAPI.simulation.getAvailableItemsAsync('party_formation', 'leader')
const preview = await RundotGameAPI.simulation.calculatePowerPreviewAsync(
  'party_formation',
  'leader',
  available[0].entityId,
)

await RundotGameAPI.simulation.executeBatchOperationsAsync(
  [
    { type: 'assign', containerId: 'party_formation', slotId: 'leader', itemId: 'hero_knight' },
    { type: 'remove', containerId: 'party_formation', slotId: 'support' },
  ],
  false, // validateOnly?
)
```

`validateSlotAssignmentAsync(containerId, slotId, itemId)` is a read-only check: it tells you whether an item would be accepted in a slot (`{ valid, error? }`) without mutating state. Use it to gate drag-and-drop UI before committing an `assignItemToSlotAsync` call.

### Return shapes

`getSlotContainersAsync()` resolves to `SimulationSlotContainer[]`:

| Field | Type | Description |
|---|---|---|
| `entityId` | `string` | Entity that owns the slot container |
| `slots` | `Record<string, unknown>` | Current slot contents keyed by slot id |
| `isOwned` | `boolean` | Whether the current player owns this container |
| `powerCalculationRecipe` | `string` | Recipe used to compute the container's power, if any |

`getAvailableItemsAsync(containerId, slotId)` resolves to `SimulationAvailableItem[]`. The item identifier is `entityId` (there is no `id` field):

| Field | Type | Description |
|---|---|---|
| `entityId` | `string` | Item entity id; pass this to `calculatePowerPreviewAsync` / `assignItemToSlotAsync` |
| `quantity` | `number` | How many of this item the player holds |
| `metadata` | `Record<string, unknown>` | Item metadata for tooltips/UI |
| `tags` | `string[]` | Item tags (matched against the slot's `allowedTags`) |
| `isCompatible` | `boolean` | Whether the item is allowed in the queried slot |

`assignItemToSlotAsync` and `removeItemFromSlotAsync` both resolve to a `SimulationSlotMutationResult`:

| Field | Type | Description |
|---|---|---|
| `success` | `boolean` | Whether the mutation applied |
| `error` | `string` | Failure reason when `success` is `false` |
| `association` | `SimulationAssignment` | The resulting slot assignment (see below); `itemId` is `null` after a remove |

A `SimulationAssignment` describes a single item-in-slot binding:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Assignment id |
| `containerId` | `string` | Container the slot belongs to |
| `slotId` | `string` | Slot within the container |
| `itemId` | `string \| null` | Item occupying the slot; `null` when the slot was cleared |
| `profileId` | `string` | Owning player's profile id |
| `appId` | `string` | App that created the assignment |
| `createdAt` | `number` | Creation time (ms epoch) |
| `metadata` | `Record<string, unknown>` | Optional assignment metadata |

`getSlotAssignmentsAsync(containerId)` resolves to `SimulationAssignment[]` (same shape).

`calculatePowerPreviewAsync(containerId, slotId, candidateItemId)` resolves to a `SimulationPowerPreview`. Use it to show a "+N power" hint before committing an assignment:

| Field | Type | Description |
|---|---|---|
| `currentPower` | `number` | Power with the current slot contents |
| `previewPower` | `number` | Power if the candidate item were assigned |
| `powerDelta` | `number` | `previewPower - currentPower` |
| `breakdown` | `Record<string, number>` | Per-source contribution to the previewed power |

### Batch operations

`executeBatchOperationsAsync(operations, validateOnly?)` applies several slot mutations in one call. Each operation is a `SimulationBatchOperation`. An `assign` op requires `itemId`; a `remove` op's `itemId` is optional (omit it to clear whatever occupies the slot):

| Variant | Fields |
|---|---|
| `assign` | `{ type: 'assign'; containerId: string; slotId: string; itemId: string }` |
| `remove` | `{ type: 'remove'; containerId: string; slotId: string; itemId?: string }` |

Pass `validateOnly: true` to dry-run the whole batch without mutating state. It resolves to a `SimulationBatchOperationsResult`:

| Field | Type | Description |
|---|---|---|
| `success` | `boolean` | Whether every operation succeeded |
| `results` | `SimulationBatchOperationResult[]` | Per-operation outcome (see below) |
| `affectedContainers` | `string[]` | Container ids touched by the batch |

Each `SimulationBatchOperationResult` is `{ success, error?, association?, operation }`, where `operation` echoes the `SimulationBatchOperation` that was attempted and `association` is the resulting `SimulationAssignment` on success.

## Field Resolution & Metadata

```typescript
const power = await RundotGameAPI.simulation.resolveFieldValueAsync(
  'player_123',
  'stats.power',
  'player',
)

const metadata = await RundotGameAPI.simulation.getEntityMetadataAsync('sword_123')
```

Use field resolution for derived stats (power, crit chance, etc.) and metadata lookups for UI tooltips or detail panes.

`resolveFieldValueAsync(entityId, fieldPath, entity?)` resolves to `unknown`; narrow the result yourself based on the field you requested. The third `entity` argument is optional and scopes resolution to a specific entity instance.

`getEntityMetadataAsync(entityId)` resolves to `Record<string, unknown>`, the entity's metadata map.

## Real-Time Subscriptions (BETA)

```typescript
const unsubscribe = await RundotGameAPI.simulation.subscribeAsync({
  entities: ['gold', 'energy'],
  tags: ['currency', 'contractor'],
  activeRuns: true,
  onUpdate(update) {
    switch (update.type) {
      case 'entity':
        update.entities.forEach(({ entityId, quantity }) => updateUI(entityId, quantity))
        break
      case 'activeRuns':
        updateTimers(update.activeRuns)
        break
      case 'snapshot':
        if (update.entities) hydrateEntities(update.entities)
        if (update.activeRuns) hydrateRuns(update.activeRuns)
        break
    }
  },
})

// Later
unsubscribe()
```

**Update types:** `entity`, `activeRuns`, `snapshot`.  
**Filters:** you must supply at least one of `entities` (non-empty), `tags` (non-empty), or `activeRuns` (truthy). `roomId` is a scope selector, not a standalone filter: passing only `roomId` (with no entities/tags/activeRuns) throws. `onUpdate` is also required.  
Only entities marked `clientViewable: true` in your simulation config are streamed to clients.

{% hint style="warning" %}
`subscribeAsync` throws if `onUpdate` is missing or if none of `entities`/`tags`/`activeRuns` is provided. A `roomId` on its own does not satisfy the filter requirement.
{% endhint %}

Every update carries a `timestamp` (ms) and an optional `reason` discriminator (`'recipe_completed'`, `'auto_restart'`, `'manual_update'`, or `'state_sync'`) so you can tell why the push fired. Entity-update entries are `{ entityId, quantity }`, where `quantity` is `number | string`.

`activeRuns` entries (in both `activeRuns` updates and `snapshot` updates) are a trimmed run shape: `{ id, recipeId, status, startTime, expiresAt, entity?, inputs?, outputs? }`. These streamed entries do not carry `commitmentEndsAt` or `participantCount`; for those fields, read the full `SimulationRunSummary` from `getActiveRunsAsync`.

A `snapshot` update carries optional `entities` and `activeRuns` arrays (each present only when the matching filter was supplied); it has no top-level `state` field. Check each before reading it.

## Push Notifications

Recipes can send push notifications to any player using the `send_notification` effect.

### Example Recipe

```json
{
  "challenge_opponent": {
    "duration": 0,
    "inputs": { "targetId": { "type": "string" } },
    "beginEffects": [
      {
        "type": "send_notification",
        "recipientProfileId": "{{inputs.targetId}}",
        "title": "Battle Challenge!",
        "body": "A player has challenged you to battle!"
      }
    ]
  }
}
```

### Effect Properties

| Property | Type | Required | Description |
|---|---|---|---|
| `type` | `"send_notification"` | Yes | Effect type |
| `recipientProfileId` | `string` | Yes | Profile ID of the recipient. Supports template substitution (e.g. `{{inputs.targetId}}`, `{{profileId}}`). |
| `title` | `string` | Yes | Notification title. Supports template substitution. |
| `body` | `string` | Yes | Notification body. Supports template substitution. |
| `payload` | `Record<string, string>` | No | Key-value pairs delivered to your game via `context.notificationParams` on launch. Values support template substitution. |
| `as` | `string` | No | Store the result in `{{results.<as>}}` for downstream effects. Returns `{ sent: true, recipientId }` or `{ sent: false, error }`. |

### Behavior

- `appId` is automatically set from the game's execution context; tapping the notification opens your game.
- `payload` entries are JSON-serialized and delivered as `context.notificationParams` when the recipient opens the game from the notification. Access them via `RundotGameAPI.context.notificationParams`.
- If `recipientProfileId` fails to resolve (e.g. missing input), the effect is skipped with a warning; it does not abort the recipe.
- Braze API failures are caught and logged; they do not abort recipe execution.
- The effect is awaited (not fire-and-forget), so `as` captures the result before downstream effects run. Note: Braze has a 10-second timeout that blocks the recipe chain if the API is slow.

### Template Variables

All standard recipe template variables are supported. `{{...}}` variables are **effects-only** — they are substituted into string-typed effect fields, never into `formula` fields (guards, duration, costs, output values, triggers). Inside a formula, use the bare reference (`entities.foo`, `inputs.foo`) and `now()` / `nowMs` for the current time; keyword operators `or`/`and`/`not` (not `||`/`&&`/`!`). See [SIMULATION_CONFIG — Formula syntax](SIMULATION_CONFIG.md#formula-syntax-guards-and-all-formula-fields).

| Variable | Description |
|---|---|
| `{{profileId}}` / `{{executorId}}` | Profile ID of the player who triggered the recipe |
| `{{roomId}}` | Current room ID (if room-scoped) |
| `{{inputs.<key>}}` | Recipe input values |
| `{{results.<key>}}` | Results from earlier effects (via `as`) |
| `{{entities.<id>}}` | Current inventory quantity for an entity |
| `{{now}}` | Current timestamp (ms). **Effects-only** — in a formula use `now()` or `nowMs`. |

{% hint style="warning" %}
`{{...}}` substitution only applies to **string-typed** fields (entity IDs, selectors, recipient/target IDs, metadata strings) — not to numeric value fields. A bare `"{{inputs.X}}"` in a `set`/`add`/`multiply`/cost/`output` value is invalid and resolves to `0`; use a **formula** with the bare `inputs.X` reference instead. Missing keys never throw: a `{{inputs.X}}` template resolves to `''`, and a formula `inputs.X` resolves to its `fallback` (or `0`). See [SIMULATION_CONFIG](SIMULATION_CONFIG.md) for details.
{% endhint %}

## Response Fields

| Field | Type | When present | Description |
|---|---|---|---|
| `success` | `boolean` | Always | Whether the recipe executed successfully |
| `status` | `string` | Always | `'completed'`, `'running'`, `'queued'`, or `'awaiting_collection'` |
| `runId` | `string` | Always | Unique identifier for this recipe run |
| `outputs` | `Record<string, number \| string>` | `completed`, `awaiting_collection` | Entity quantities produced |
| `randomSeed` | `string` | `completed`, `awaiting_collection` | Hex seed used for all seeded RNG in this run. Use to reproduce deterministic outcomes client-side. |
| `data` | `Record<string, unknown>` | `completed`, `awaiting_collection` | Optional envelope of typed response data. `state` is a nested key within it, not a top-level response field. |
| `data.state` | `Record<string, unknown>` | `completed`, `awaiting_collection` | Effect results (values stored via `as` keys); read as `result.data?.state`. |
| `expiresAt` | `string` | `running` | ISO timestamp when the run completes |
| `queuePosition` | `number` | `queued` | Position in the concurrency queue |
| `message` | `string` | Optional | Server-side status or error text |
| `amountRequested` | `number` | Batch runs | Number of copies requested (when `batchAmount` was set) |
| `amountFulfilled` | `number` | Batch runs | Number of copies actually crafted (relevant with `allowPartialBatch`) |
| `partialSuccess` | `boolean` | Batch runs | `true` when a batch was only partially fulfilled |

## UGC Effects

Recipes can read and mutate UGC entries owned by any player. These effects bridge to the Cloud Run UGC service from the simulation layer.

### `read_ugc`

Fetch a UGC entry's `data` object and store it in `effectResults` for use by downstream effects.

#### Example Recipe

```json
{
  "check_hero_stats": {
    "duration": 0,
    "inputs": {},
    "beginEffects": [
      {
        "type": "read_ugc",
        "entryId": "{{inputs.heroEntryId}}",
        "as": "hero"
      }
    ]
  }
}
```

After execution, `{{results.hero.power}}`, `{{results.hero.name}}`, etc. are available to subsequent effects and in `result.data.state.hero` on the client.

#### Effect Properties

| Property | Type | Required | Description |
|---|---|---|---|
| `type` | `"read_ugc"` | Yes | Effect type |
| `entryId` | `string` | Yes | UGC entry ID. Supports template substitution. |
| `as` | `string` | Yes | Key in `effectResults` where `entry.data` is stored. |

### `mutate_ugc`

Update fields on a UGC entry's `data` object. Operates on any entry regardless of author: enables cross-player state like tip accrual or win counters.

#### Example Recipe (Cross-Player State)

```json
{
  "claim_hero": {
    "duration": 0,
    "inputs": {},
    "beginEffects": [
      {
        "type": "read_ugc",
        "entryId": "{{inputs.heroEntryId}}",
        "as": "hero"
      },
      {
        "type": "mutate_ugc",
        "entryId": "{{inputs.heroEntryId}}",
        "dataUpdates": {
          "lastUsedBy": "{{profileId}}",
          "lastUsedAt": "{{now}}"
        }
      }
    ]
  }
}
```

> Note: `dataUpdates` values are strings after template substitution. For atomic numeric increments, use the UGC HTTP API's `$increment` operator directly instead of the recipe effect.

#### Effect Properties

| Property | Type | Required | Description |
|---|---|---|---|
| `type` | `"mutate_ugc"` | Yes | Effect type |
| `entryId` | `string` | Yes | UGC entry ID. Supports template substitution. |
| `dataUpdates` | `Record<string, string>` | Yes | Key-value pairs to update on `entry.data`. Values support template substitution. |

#### Behavior

- `read_ugc` stores only `entry.data` (the JSON payload), not the full entry envelope (id, authorId, etc.).
- `mutate_ugc` resolves templates in values before applying. Use `{{results.<as>.<field>}}` to reference data fetched by a prior `read_ugc`.
- Both effects are awaited: results are available before downstream effects run.

## Game Effects

### `matchmaking`

Server-side opponent search over `h5_rooms`. Fully documented in [Simulation: PVP System](PVP_SYSTEM.md); see that page for params, filtering, and complete PVP integration examples.

Quick reference:

| Property | Type | Required | Description |
|---|---|---|---|
| `type` | `"matchmaking"` | Yes | Effect type |
| `params.roomType` | `string` | Yes | Room type to search |
| `params.count` | `number` | No | Max results (default: 5) |
| `params.filters` | `Record<string, any>` | No | Filter config (e.g. `minRating`, `maxRating`) |
| `as` | `string` | No | Key in `effectResults` for the match array |

### `resolve_battle`

Single-roll power comparison between attacker and defender. Evaluates power formulas, applies optional bonus modifiers and seeded random variance, then determines victory.

#### Example Recipe

```json
{
  "attack_player": {
    "duration": 0,
    "battleConfig": {
      "randomVariance": 0.1,
      "victoryCondition": "attacker > defender"
    },
    "endEffects": [
      {
        "type": "resolve_battle",
        "attackerPower": { "formula": "entities.attack_power" },
        "defenderPower": { "formula": "entities.defense_power" },
        "defenderProfileId": "{{inputs.target_id}}",
        "as": "battle"
      }
    ]
  }
}
```

#### Effect Properties

| Property | Type | Required | Description |
|---|---|---|---|
| `type` | `"resolve_battle"` | Yes | Effect type |
| `attackerPower` | `string \| number \| FormulaReference` | Yes | Attacker's power value or formula |
| `defenderPower` | `string \| number \| FormulaReference` | Yes | Defender's power value or formula |
| `defenderProfileId` | `string` | No | When provided, `defenderPower` is evaluated against this player's entities instead of the executor's. Supports template substitution. |
| `applyBonuses.attacker` | `string[]` | No | Bonus modifier keys for attacker |
| `applyBonuses.defender` | `string[]` | No | Bonus modifier keys for defender |
| `as` | `string` | No | Key in `effectResults` for battle outcome |

#### Behavior

- Power formulas are resolved against the executing player's inventory by default. When `defenderProfileId` is set, `defenderPower` evaluates against the defender's inventory (server-side lookup).
- `battleConfig.randomVariance` on the recipe applies seeded random variance to both powers. The variance is deterministic given the recipe's `randomSeed`.
- Victory is determined by `battleConfig.victoryCondition` (default: `"attacker > defender"`).
- Results (victory, rewards, final powers) are stored in `effectResults[as]` and returned in `result.data.state`.

## Best Practices

- Batch operations with `executeBatchOperationsAsync` when you need atomic updates.
- Use simulation results as the source of truth: mirror UI state from responses rather than guessing.
- Guard recipe calls with optimistic UI but reconcile against the final data returned by the host.
