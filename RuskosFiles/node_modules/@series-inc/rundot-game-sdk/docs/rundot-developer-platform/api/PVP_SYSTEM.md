# Simulation: PVP System (BETA)

Add asynchronous PVP to your game. Each player serializes their board into a personal room; the server matches them against another player's room; the client fetches the opponent's snapshot and runs the battle locally. A separate effect lets the server validate the reported outcome before any reward flow runs.

> This is a self-contained recipe. Everything you need (config, client code, and patterns) is on this page.
>
> Ranking, MMR, and season leaderboards are intentionally out of scope here; they're covered separately.

***

## Where Config Goes

All JSON config on this page is simulation config: server-authoritative state, actions, and rewards. The CLI uploads it automatically when you `rundot deploy`.

### Recommended: `rundot/simulation/`

Place simulation config in the `rundot/simulation/` directory, one file per system. Each file holds **raw simulation content with no `{"simulation": {...}}` wrapper** (the directory implies it). Files are deep-merged alphabetically at deploy time with collision detection.

```
my-game/
├── rundot/
│   └── simulation/
│       └── pvp-system.json          ← raw content, no "simulation" wrapper
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
│   └── pvp-system.config.json
├── game.config.prod.json            ← game ID + build settings only (separate)
└── package.json
```

</details>

***

## What You'll Build

- **Board snapshots**: each player's deck/board is serialized into their own room as actors, so an opponent can fetch it later without both players needing to be online
- **Server-side matchmaking**: the server returns rooms belonging to other players that match a filter you supply
- **Server-validated outcomes**: the server can reject reports that don't match the board state it knows about, so wins aren't taken on trust

The three effects doing the work are `replace_room_actors`, `matchmaking`, and `validate_battle_outcome`.

***

## Server Configuration

### Entities

Only one entity is required for the snapshot/matchmaking flow: a per-player number the server can compare against reported battle power. Add any other entities your game already has; this doc doesn't dictate the rest of your data model.

```json
{
  "simulation": {
    "entities": {
      "pvp_board_power": {
        "tags": ["pvp", "state"],
        "stackable": true,
        "clientViewable": true,
        "metadata": {
          "displayName": "PVP Board Power",
          "description": "Total power of the player's most recently snapshotted board."
        }
      }
    }
  }
}
```

| Entity | Purpose |
|---|---|
| `pvp_board_power` | Cached total power of the player's latest snapshot. Supporting state for the server-side validation effect. |

### Recipes

Four recipes wrap the three PVP effects. Effects that produce a return value use `endEffects` so the `as`-named outputs are available on the client in `result.data.state`.

```json
{
  "simulation": {
    "recipes": {
      "pvp_snapshot_board": {
        "duration": 0,
        "scope": "player",
        "clientViewable": true,
        "inputs": {},
        "outputs": {},
        "beginEffects": [
          { "type": "ensure_room",
            "roomType": "pvp_board",
            "roomId": "pvp_{{profileId}}",
            "roomTags": ["pvp", "board_snapshot"],
            "metadata": {
              "lastUpdate": { "formula": "now()" }
            }
          },
          { "type": "set",
            "entity": "pvp_board_power",
            "value": { "formula": "inputs.totalPower" }
          },
          { "type": "replace_room_actors",
            "roomId": "pvp_{{profileId}}",
            "clearTag": "board_unit",
            "actorsInputKey": "inputs.units",
            "actorTag": "board_unit"
          }
        ]
      },
      "pvp_find_opponent": {
        "duration": 0,
        "scope": "player",
        "clientViewable": true,
        "inputs": {},
        "outputs": {},
        "endEffects": [
          { "type": "matchmaking",
            "params": {
              "roomType": "pvp_board",
              "count": 5
            },
            "as": "opponent_rooms"
          }
        ]
      },
      "pvp_get_opponent_board": {
        "duration": 0,
        "scope": "player",
        "clientViewable": true,
        "inputs": {},
        "outputs": {},
        "endEffects": [
          { "type": "get_room_actors",
            "roomId": "inputs.roomId",
            "filter": { "hasTag": "board_unit" },
            "as": "opponent_units"
          }
        ]
      },
      "pvp_report_battle": {
        "duration": 0,
        "scope": "player",
        "clientViewable": true,
        "inputs": {},
        "outputs": {},
        "endEffects": [
          { "type": "validate_battle_outcome",
            "reportedOutcomeKey": "inputs.result",
            "attackerPowerKey":  "inputs.myPower",
            "defenderPowerKey":  "inputs.opponentPower",
            "powerVariance":   0.1,
            "outcomeVariance": 0.2,
            "onFail": { "rejectRecipe": true, "logAnomaly": true },
            "as": "validation"
          }
        ]
      }
    }
  }
}
```

| Effect | What it does |
|---|---|
| `ensure_room` | Idempotently create (or update) a room scoped to this player. The room ID `pvp_{{profileId}}` ensures one room per player. Metadata on the room (set here) is what `matchmaking` filters on. |
| `replace_room_actors` | Atomically clear all actors with a given tag in the room and replace them with new ones from `inputs.units`. Each input element becomes an actor, perfect for storing a serialized deck. |
| `get_room_actors` | Read actors back out of a room. Returns them under the `as` key in `effectResults`. |
| `matchmaking` | Server-side opponent search. Returns up to `count` rooms of the given `roomType`. The current player's own room is excluded automatically. Add a `filters` block (see "Filtering Opponents" below) if you want to narrow the pool. |
| `validate_battle_outcome` | Server-side check on a reported battle outcome. Rejects reports that look implausible given the board state the server has on record. On rejection the recipe aborts and an anomaly is logged. |

### Initialization

No explicit initialization is required. `pvp_snapshot_board` calls `ensure_room` on every invocation, so the player's room is created lazily on their first snapshot. If you want the room (and a default `pvp_board_power`) to exist before the player has ever played a match, so they show up in matchmaking results, trigger `pvp_snapshot_board` once with an empty unit list from an `onStart` lifecycle recipe.

***

## Client-Side Implementation

### Step 1: Serialize Your Board

`replace_room_actors` needs a flat list of unit objects; each one becomes an actor in the room. Convert your in-game board to a serialized form, and total the power up while you're at it:

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

interface SerializedBoardUnit {
  unitId: string
  position: number
  power: number
  // …any other fields the opponent's client needs to render this unit
}

function serializeBoard(board: BoardSlot[]) {
  const units: SerializedBoardUnit[] = []
  let totalPower = 0
  board.forEach((slot, position) => {
    if (!slot?.card) return
    const power = calculateUnitPower(slot.card)
    units.push({ unitId: slot.card.unitId, position, power })
    totalPower += power
  })
  return { units, totalPower }
}
```

### Step 2: Snapshot the Board to Your Room

Pass `units` and `totalPower` as recipe inputs. The recipe stores the units as actors and caches `totalPower` in `pvp_board_power` for later validation.

```typescript
async function snapshotBoard(board: BoardSlot[]) {
  const { units, totalPower } = serializeBoard(board)

  const result = await RundotGameAPI.simulation.executeRecipeAsync(
    'pvp_snapshot_board',
    { units, totalPower },
  )

  if (!result.success) {
    showError(`Snapshot failed: ${result.message}`)
  }
  return result.success
}
```

Call `snapshotBoard` whenever the player's board changes: after a shop phase, after a deck edit, etc. That way an opponent who matches you while you're between rounds still gets a coherent board to fight.

### Step 3: Find an Opponent

```typescript
interface MatchedRoom {
  id: string
  createdBy: string
  name?: string
  metadata?: Record<string, unknown>
}

async function findOpponent(): Promise<MatchedRoom | null> {
  const result = await RundotGameAPI.simulation.executeRecipeAsync('pvp_find_opponent')
  if (!result.success) return null

  const rooms = (result.data?.state?.opponent_rooms ?? []) as MatchedRoom[]
  if (rooms.length === 0) return null

  // Pick one at random from the top N matches so two players in the
  // same bucket don't always face each other.
  return rooms[Math.floor(Math.random() * rooms.length)]
}
```

`pvp_find_opponent` returns up to 5 rooms of `roomType: "pvp_board"`. The player's own room is excluded server-side, so you don't have to filter it client-side.

### Step 4: Fetch the Opponent's Board

```typescript
async function fetchOpponentBoard(roomId: string) {
  const result = await RundotGameAPI.simulation.executeRecipeAsync(
    'pvp_get_opponent_board',
    { roomId },
  )
  if (!result.success) return []

  const actors = (result.data?.state?.opponent_units ?? []) as { data: SerializedBoardUnit }[]
  return actors.map(a => a.data)
}
```

Hydrate the returned units back into your in-game representation and simulate the battle however your game does it. The server doesn't need to play out turns, just to validate the final outcome (see Step 5).

### Step 5 (optional): Report the Outcome with Server Validation

If wins should grant rewards (currency, trophies, your own ranking system), gate the reward recipe on a successful `pvp_report_battle`. The client reports the outcome and the validation effect decides whether the rest of the reward flow gets to run.

```typescript
async function reportBattle(
  outcome: 'win' | 'loss',
  myPower: number,
  opponentPower: number,
) {
  const result = await RundotGameAPI.simulation.executeRecipeAsync(
    'pvp_report_battle',
    {
      result:        outcome === 'win' ? 1 : 0,
      myPower,
      opponentPower,
    },
  )

  if (!result.success) {
    // validation rejected the report
    showError('Battle result rejected by server')
    return false
  }
  return true
}
```

Treat `pvp_report_battle` as a gate. Only run your reward recipe(s) if it succeeds. Because the client can't mutate trophy/currency entities directly (only guarded reward recipes can), a rejected report short-circuits the payout before it begins.

***

## How Server-Authoritative Validation Works

Outcomes that hand out rewards shouldn't be decided by the client alone. `validate_battle_outcome` lets the server take a reported result and decide whether it's consistent with the board state the server already has, without needing to simulate the battle turn-by-turn. The recipe aborts on rejection, so any reward effect chained after the validation never runs.

To wire it up, make sure each player's snapshot recipe writes the supporting state the validation effect expects (in this doc, `pvp_board_power` set during `pvp_snapshot_board`). With that in place, the report recipe can be treated as a gate on the rest of the reward flow: successful validation lets the chain continue, a rejection stops it and logs an anomaly you can review.

***

## Filtering Opponents

The example above passes no `filters` to `matchmaking`, so the server returns any other `pvp_board` room. To narrow the pool, write the field you want to filter on into the room's `metadata` at snapshot time, then reference it in `matchmaking.params.filters`. For example, to bucket on a generic `skill_bucket` entity, add it to the `ensure_room` metadata in `pvp_snapshot_board`:

```json
"metadata": {
  "skillBucket": { "formula": "entities.skill_bucket" },
  "lastUpdate":  { "formula": "now()" }
}
```

…and add a matching filter in `pvp_find_opponent`:

```json
"filters": {
  "skillBucket": { "formula": "entities.skill_bucket" }
}
```

Keep the bucket coarse; too narrow a filter and the server will return zero matches for players outside the meta.

***

## Bot Fallback When No Humans Match

`pvp_find_opponent` returns an empty list when the player is at the edge of a filter bucket or when the game is new. Fall back to a procedurally generated opponent so the player isn't stuck:

```typescript
async function findOrGenerateOpponent() {
  const room = await findOpponent()
  if (room) {
    const units = await fetchOpponentBoard(room.id)
    return { source: 'human', board: hydrateBoard(units) } as const
  }
  return { source: 'bot', board: generateBotBoard() } as const
}
```

The client never tells the server whether an opponent was a human or a bot; if you use `pvp_report_battle`, outcomes go through the same validation path either way.

***

## Best Practices

- Snapshot the board *after* every change to it, not just before a battle. Opponents matching against a stale room get a worse experience.
- Always treat `pvp_find_opponent` as best-effort. The server may return zero matches; have a fallback ready (bot, retry with a wider filter, queue).
- Pick a match at random from the top N results instead of always taking index 0; that spreads load across players in the same bucket.
- If you use `pvp_report_battle`, call it *before* any reward recipe. A rejected validation should short-circuit the payout.
- Tune variance bands conservatively for your own game's power curve; too tight and legitimate underdog wins get flagged. The values shown above are illustrative placeholders, not recommended settings — pick your own and avoid documenting them publicly so opponents can't calibrate against them.
- Log `validate_battle_outcome` anomalies but don't ban on them; false positives happen. Use them as inputs to a heuristic, not a verdict.
- Cache the player's own `totalPower` on the server (via `pvp_board_power`) at snapshot time so the validation effect has the supporting state it needs.
