# Advanced Multiplayer API (BETA)

Server-authoritative building blocks for **persistent shared worlds**: long-lived rooms, seasons, a shared economy, authoritative state deltas, a turn loop, server-driven player transfers, cross-instance PvP matchmaking, and platform room chat.

This page builds on the [Multiplayer API](MULTIPLAYER.md). Read that first — it covers the `GameRoom` lifecycle, the client `ServerRoom`, messaging, persistence, the clock, and `this.services`. Everything here is additive: the same `GameRoom` subclass and `RundotGameAPI.realtime.*` client you already use.

Reach for these when an ephemeral, per-match room isn't enough — e.g. a shared world that outlives any single session, an economy multiple players draw from, seasonal resets, or turn-based PvP.

***

## Persistent rooms (shared worlds)

A normal room is keyed by the deployed bundle version and disposed once empty. A **persistent room** is a long-lived shared world keyed by a stable, caller-supplied key — so every joiner of the same key converges on **one** authoritative instance, and that instance survives bundle/version deploys.

A persistent room **freezes** to a durable snapshot when it goes idle (no members) and **resumes deterministically** on the next join. It never runs while empty.

### Declaring a persistent room type

Set `persistent: true` on the room type in your [room-type config](MULTIPLAYER.md#room-type-config):

```json
{
  "rooms": [
    {
      "type": "globe",
      "file": "src/rooms/Globe.ts",
      "persistent": true,
      "config": { "tickInterval": 1, "autoPersist": true }
    }
  ]
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `persistent` | `boolean` | `false` | Long-lived shared world keyed by a stable `persistentKey` instead of by bundle version. Deterministic id, stable across deploys; freezes when idle, resumes on next join. |
| `tickInterval` | `number` (seconds) | `0` | Cadence of the server-owned clock tick (`onTick`). Ticks fire **only while the room is warm** (has members). `0` disables the server tick. |

### Joining by key (client)

The client routes into a persistent room by passing `persistentKey` (typically derived from the current [season](#seasons)):

```typescript
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

const room = await RundotGameAPI.realtime.joinOrCreateRoom<WorldProtocol>('globe', {
  persistentKey: 'globe-2026-summer', // stable key → one shared instance
})
```

All players passing the same `persistentKey` for the same room type land in the same authoritative instance.

### The server-owned clock: `onTick`

`onTick` runs on each server tick while the room is warm. Use it to advance server-authoritative timed progression — **never** rely on a client read to drive world time.

```typescript
import { GameRoom } from '@series-inc/rundot-game-sdk/mp-server'

export default class Globe extends GameRoom<WorldProtocol> {
  protected async onTick() {
    // Drive catch-up from absolute expiry timestamps, NOT a tick counter —
    // an idle room froze and skipped ticks; on resume you may need to settle
    // everything that expired while frozen, in one pass.
    await this.settleExpiredStructures(this.getServerTime())
  }
}
```

{% hint style="warning" %}
**Freeze/resume is deterministic, not continuous.** While a persistent room is idle it does not tick. On resume it does **not** replay the missed ticks one by one. Compute progression from absolute timestamps (expiry times, `startedAt + duration`) so a room that was frozen for an hour settles correctly in a single `onTick`, identically to one that ran the whole time.
{% endhint %}

Persist the world via `getPersistState()` and rehydrate it in `onRestore()` — see [Persistence](MULTIPLAYER.md#persistence). The snapshot is what a frozen room resumes from.

***

## Seasons

`SeasonSchedule` is a game-agnostic schedule of time-windowed **seasons**. It is the single source of truth for season logic: which seasons are live now, which one is "current", whether a given season key may still be joined, and the persistent-room key to use for a season. The same primitive enforces seasons authoritatively on the server (inside a `GameRoom`) and can be evaluated client-side for UI (countdowns, "season ends in…").

```typescript
import { SeasonSchedule } from '@series-inc/rundot-game-sdk/mp-server'
```

### Defining a schedule

Declare seasons explicitly, or generate a recurring schedule:

```typescript
// Explicit
const schedule = new SeasonSchedule([
  { key: 'season-1', startsAt: 1_700_000_000_000, endsAt: 1_702_592_000_000 },
  { key: 'season-2', startsAt: 1_702_592_000_000 }, // open-ended (no endsAt)
])

// Recurring: 8 back-to-back 30-day seasons with a 1-day preview overlap
const recurring = SeasonSchedule.recurring({
  anchorMs: Date.UTC(2026, 0, 1),
  durationMs: 30 * 24 * 60 * 60 * 1000,
  count: 8,
  overlapMs: 24 * 60 * 60 * 1000,
  key: (n) => `globe-${2026 + n}`,
})
```

`SeasonDefinition` fields:

| Field | Type | Description |
|---|---|---|
| `key` | `string` | Stable, unique key. Derives the persistent-room id key — **never reuse a key**. The constructor throws on a duplicate. |
| `startsAt` | `number` | Inclusive start, epoch ms. |
| `endsAt` | `number` (optional) | Exclusive end, epoch ms. Omit for an open-ended (never-expiring) season. Must be after `startsAt` or the constructor throws. |

`SeasonSchedule.recurring(opts)` options: `anchorMs` (when season 0 begins), `durationMs` (length of each, must be `> 0`), `count`, optional `key(n)` (defaults to `season-${n}`), and optional `overlapMs` (each season after the first starts this much earlier than the previous ends, creating a preview/grace window where both are active; defaults to `0`).

### Resolving the current season and room key

```typescript
const now = Date.now()

// The single current season (the newest active one when windows overlap).
// Throws if NO season is active — a player must always resolve to a concrete
// season (fail fast, no silent fallback).
const season = schedule.currentSeason(now)

// Route a client join into the season's persistent world:
const room = await RundotGameAPI.realtime.joinOrCreateRoom('globe', {
  persistentKey: schedule.roomKey(season.key),
})
```

| Method | Returns | Description |
|---|---|---|
| `all()` | `readonly SeasonDefinition[]` | All declared seasons, ordered by start. |
| `activeSeasons(nowMs)` | `SeasonDefinition[]` | Seasons live at `nowMs` (`startsAt <= now < endsAt`). Multiple if windows overlap. |
| `activeSeasonKeys(nowMs)` | `string[]` | Active season keys at `nowMs`. |
| `currentSeason(nowMs)` | `SeasonDefinition` | The active season with the latest start. **Throws** when none is active. |
| `isActive(seasonKey, nowMs)` | `boolean` | Whether `seasonKey` is declared and live at `nowMs` — the **join gate**. |
| `roomKey(seasonKey)` | `string` | The persistent-room id key for a season (fed into `persistentKey`). |

Use `isActive` server-side as the authoritative join gate (reject joins for an expired season), and `currentSeason` / `roomKey` to mint the right `persistentKey`.

***

## Authoritative world deltas

For shared worlds, broadcast server-computed **deltas** instead of full state. `this.broadcastDelta(delta)` pushes a delta to the room's current members; because it originates from authoritative server state (never client input), a client can't forge a shared outcome.

```typescript
export default class Globe extends GameRoom<WorldProtocol> {
  private applyAndBroadcast(change: WorldChange) {
    this.applyToWorld(change) // mutate authoritative state first
    const { sent, bytes } = this.broadcastDelta(change)
    if (sent === 'resync') this.log.warn('delta too large, asked clients to resync', { bytes })
  }
}
```

The realtime WS frame is hard-capped at `MAX_BROADCAST_BYTES` (16 KiB, mirrors the room server's `maxPayload`). A delta that would exceed the cap is **never chunked or silently dropped** — the server instead broadcasts a lightweight **resync** signal telling members to re-pull authoritative state.

```typescript
import { MAX_BROADCAST_BYTES } from '@series-inc/rundot-game-sdk/mp-server'
```

| | |
|---|---|
| Signature | `broadcastDelta(delta: unknown, opts?: { deltaType?: string; resyncType?: string }): { sent: 'delta' \| 'resync'; bytes: number }` |
| Default `deltaType` | `'world:delta'` |
| Default `resyncType` | `'world:resync'` |
| Returns | `sent` (the branch taken) and `bytes` (measured wire-frame size) so callers/tests can assert behavior. |

### Client side

Handle deltas and resync requests via convenience events on `room.on()` — no need to match on the raw message type:

```typescript
room.on({
  onDelta(delta) {
    applyDeltaToLocalView(delta)
  },
  onResync(reason) {
    // A delta exceeded the frame cap or state diverged — refetch full state.
    refetchWorldState()
  },
})
```

***

## Shared economy

`this.services.economy` provides server-authoritative, finite **shared pools** — e.g. a limited supply of a resource that all players in a world draw from. Pools are scoped to the calling room/world (the platform namespaces them by `roomId`), so a room can only touch its own pools; for a persistent season room that makes them per-season by construction.

All calls originate from the authoritative `GameRoom` worker, never from client input, so a client cannot forge an economic outcome. Settlement **never over-allocates** a finite pool, and concurrent contributions never lose updates.

```typescript
async onGameMessage(message: GameMessage<WorldProtocol>) {
  if (message.payload.type === 'harvest') {
    const result = await this.services.economy.claim('summer-ore', message.payload.amount, {
      allowPartial: true,
    })
    // result.granted may be < requested if the pool is nearly drained
    this.sendTo(message.sender.id, { type: 'harvested', granted: result.granted })
    this.broadcastDelta({ pool: 'summer-ore', remaining: result.remaining })
  }
}
```

| Method | Signature | Description |
|---|---|---|
| `claim` | `claim(poolId, amount, opts?: { allowPartial?: boolean }): Promise<EconomyClaimResult>` | Claim up to `amount` from a finite pool. `allowPartial` (default `true`) grants `min(amount, remaining)`; `false` is all-or-nothing. |
| `contribute` | `contribute(poolId, amount): Promise<{ remaining: number }>` | Add `amount` to a pool (replenish / contribute). |
| `remaining` | `remaining(poolId): Promise<number>` | Current remaining quantity of a pool. |

`EconomyClaimResult` is `{ granted: number; remaining: number }` — `granted` is how much was actually allocated (`0 ≤ granted ≤ requested`), `remaining` is the pool quantity after the operation.

{% hint style="info" %}
**Exactly-once.** Economy operations are idempotent at the platform layer: the bridge tags each call with the room request id, and a retried `claim`/`contribute` (e.g. after a transient bridge timeout) replays the original result rather than double-applying. You don't need to add your own dedupe.
{% endhint %}

Economy calls fail fast with a `ServiceError` like every other `this.services.*` call — see [services error handling](MULTIPLAYER.md#platform-services-in-your-gameroom).

***

## Cross-season meta grants

`this.services.simulation.grantMeta(playerId, entityId, amount)` authoritatively grants a `meta`-tagged (cross-season, player-global) entity to a current member's simulation. Use it for season-end permanence awards — e.g. a `commander_vp` trophy that persists after the season's world resets.

```typescript
async onSeasonEnd(winnerId: string) {
  await this.services.simulation.grantMeta(winnerId, 'commander_vp', 1)
}
```

The platform **rejects** the call for a non-member, and **rejects** entities that are not `meta`-tagged (a season-scoped entity must be earned in-season, not granted globally). Like economy claims, repeated grants with the same underlying request are deduped (exactly-once).

This sits alongside the other [simulation methods](MULTIPLAYER.md#simulation) (`getState`, `executeRecipe`, `getActiveRuns`, `getAvailableRecipes`).

***

## Turn loop

`TurnManager` is a reusable, server-authoritative turn loop: it owns the turn order, the current turn, and move validation/advance. It's pure logic (no I/O) — your `GameRoom` instantiates one and drives it from `onGameMessage`, then broadcasts the result.

```typescript
import { GameRoom, TurnManager, TurnError } from '@series-inc/rundot-game-sdk/mp-server'
import type { Player, GameMessage } from '@series-inc/rundot-game-sdk/mp-server'

export default class Duel extends GameRoom<DuelProtocol> {
  private turns = new TurnManager()

  onPlayerJoin(player: Player) {
    this.turns.addPlayer(player.id)
  }

  onGameMessage(message: GameMessage<DuelProtocol>) {
    if (message.payload.type !== 'play') return
    try {
      const nextPlayerId = this.turns.submitTurn(message.sender.id) // validate + advance
      this.applyMove(message.sender.id, message.payload)
      this.broadcast({ type: 'turn', current: nextPlayerId, turn: this.turns.turn })
    } catch (err) {
      if (err instanceof TurnError && err.code === 'NOT_YOUR_TURN') {
        this.sendTo(message.sender.id, { type: 'rejected', reason: 'Not your turn' })
        return
      }
      throw err
    }
  }

  onPlayerLeave(player: Player) {
    this.turns.removePlayer(player.id) // advances if the leaver was current
  }
}
```

| Member | Description |
|---|---|
| `new TurnManager(order?, startIndex?)` | Construct with an initial player order. Throws `TurnError('EMPTY_ORDER')` if `startIndex` is out of range. |
| `currentPlayerId` | The player whose turn it is, or `null` when the order is empty. |
| `turn` | Count of turns advanced so far (`0` before the first move completes). Useful for round detection. |
| `players` | The current turn order (readonly). |
| `isCurrentTurn(playerId)` | Whether it's that player's turn. |
| `assertTurn(playerId)` | Throw `TurnError` unless it's `playerId`'s turn. Does not advance. |
| `submitTurn(playerId)` | Validate it's `playerId`'s turn, advance, and return the new current player id. Throws (no state change) on an out-of-turn or unknown player. |
| `advance()` | Advance without validation (e.g. a timeout/skip). Returns the new current player id. |
| `addPlayer(playerId)` / `removePlayer(playerId)` | Mutate the order. Removing the current player advances to the next; other removals keep the pointer on the same logical player. |
| `snapshot()` / `TurnManager.restore(snapshot)` | Serialize and rehydrate, so a [persistent room](#persistent-rooms-shared-worlds) survives freeze + resume. |

`TurnError` carries a `code` of `'NOT_YOUR_TURN'`, `'NOT_IN_GAME'`, or `'EMPTY_ORDER'`.

To persist the turn loop across crash recovery / freeze, include `this.turns.snapshot()` in `getPersistState()` and restore with `TurnManager.restore(...)` in `onRestore()`.

***

## Server-driven player transfer

The server can move a player from one room to another (the `move_player` simulation effect / world-graph traversal). The player's **socket stays open** and is re-pointed at the destination room; the client is told via the `onMoved` event.

```typescript
room.on({
  onMoved(roomId) {
    // The same connection now serves `roomId`. room.roomCode has updated to match,
    // and a later reconnect resumes the destination. Refetch state for the new room.
    refetchWorldState()
  },
})
```

The game's job on `onMoved` is to **refetch authoritative state** for the destination room. The transfer itself (roster move, socket rebind, reconnection retargeting) is handled by the platform.

***

## PvP matchmaking

`RundotGameAPI.realtime.matchmakeRoom(type, opts?)` is **cross-instance, transactional** matchmaking: it pairs you with another player and joins you both into a single server-minted room — even when the two players land on different server instances. Prefer it over [`joinOrCreateRoom`](MULTIPLAYER.md#creating-and-joining-rooms) for competitive PvP, where `joinOrCreateRoom`'s single-attempt, instance-local pairing can leave two players in separate rooms.

```typescript
const room = await RundotGameAPI.realtime.matchmakeRoom<DuelProtocol>('ranked-1v1', {
  criteria: { mode: 'ranked', region: 'us' }, // only pair players who agree on these
  matchmakeTimeoutMs: 120_000,                // reject if no opponent in time (default 120s)
  pollIntervalMs: 1_000,                      // poll cadence while waiting (default 1s)
})
```

The returned promise **stays pending while you wait for an opponent**, then resolves to the joined `ServerRoom` once paired (or rejects after `matchmakeTimeoutMs`). Show a "finding opponent…" UI while it's pending.

`MatchmakeOptions`:

| Option | Type | Default | Description |
|---|---|---|---|
| `criteria` | `Record<string, string \| number>` | — | Equality constraints. Two players pair only when every key matches. Omit to pair with anyone in the pool. |
| `matchmakeTimeoutMs` | `number` | `120000` | How long to wait for an opponent before rejecting. |
| `pollIntervalMs` | `number` | `1000` | How often to poll the pool while waiting. |

{% hint style="info" %}
Matchmaking always produces a 2-player, server-owned match room. `createOptions` (maxPlayers/isPrivate/metadata) and `persistentKey` are intentionally **not** accepted — landing on a deterministic persistent (season/world) room is done via `joinOrCreateRoom(type, { persistentKey })`, not matchmaking.
{% endhint %}

***

## Room chat

Platform room chat is a first-class, member-gated, persisted alternative to rolling your own chat in `GameRoom` state. The server authorizes each message against the live roster, persists it, rate-limits per sender, and fans it out to all members (including the sender).

```typescript
const room = await RundotGameAPI.realtime.joinOrCreateRoom<MyProtocol>('lobby')

room.on({
  onChat(message) {
    appendChat(message.senderName ?? message.senderId, message.text)
  },
  onChatHistory(messages) {
    renderChatHistory(messages)
  },
})

// Send a chat message — delivered back to all members (incl. you) via onChat
room.sendChat('gg!')

// Request recent history — reply arrives on onChatHistory
room.fetchChatHistory(50)
```

| Member | Signature | Description |
|---|---|---|
| `room.sendChat` | `sendChat(text: string): void` | Send a chat message. The server authorizes against the live roster, persists it, and delivers it to all members via `onChat`. |
| `room.fetchChatHistory` | `fetchChatHistory(limit?: number): void` | Request recent history; the reply arrives via `onChatHistory`. |
| `onChat` | `(message: ChatMessageData) => void` | A chat message was delivered to a current member. |
| `onChatHistory` | `(messages: ChatMessageData[]) => void` | Reply to `fetchChatHistory`. |

`ChatMessageData`:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Message id. |
| `roomId` | `string` | Room the message belongs to. |
| `senderId` | `string` | Sender's profile id. |
| `senderName` | `string` (optional) | Sender display name, if known. |
| `text` | `string` | Message body. |
| `ts` | `number` | Send time, epoch ms. |

{% hint style="info" %}
**Platform chat vs. DIY chat.** Use platform chat (`room.sendChat`) when you want member-gated, persisted, rate-limited chat for free. If you need game-specific message shapes or custom moderation, the [DIY chat-in-GameRoom pattern](MULTIPLAYER.md#chat--message-history) still works — hold history in room state and broadcast it yourself.
{% endhint %}
