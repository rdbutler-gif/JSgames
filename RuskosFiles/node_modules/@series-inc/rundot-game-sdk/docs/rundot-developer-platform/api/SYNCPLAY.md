# Syncplay: deterministic multiplayer (BETA)

The deterministic core ships inside `@series-inc/rundot-syncplay`; core APIs
live under the `/core` subpaths. Syncplay supplies input authority, prediction,
rollback, replay, late join, secrets, and transport for a signed simulation
product. The core owns the simulation itself: state, RNG streams, mechanics,
fixed ticks, checkpoints, serialization, and checksums.

Mechanics come in two supported shapes. **Installed packs are package code
configured by canonical data** — a module declaration cannot smuggle executable
callbacks; the data selects and parameterizes shipped reducers. **Custom executable
mechanics are source-bound code** — built against `createInstalledRuntimeAdapter`
with the implementation folded into runtime identity at build time. Either way,
games create a Kinetix runtime from the product and the room's canonical session
config, then pass it to the single Syncplay session factory (or let the
[session runner](#session-runner) do it).

Use the [runtime composition cookbook](SYNCPLAY-RUNTIME-COMPOSITIONS.md) to
choose between a preset, a game-owned adapter, and a hand-written runtime, then
copy the identity, checkpoint, projection, command, and deterministic-asset
patterns that apply to your game.

## 1. Bind your runtime source into identity

```typescript
import {
  deriveCustomRuntimeIdentity,
  kinetixRuntimeModuleManifest,
} from '@series-inc/rundot-syncplay/core'

export const runtimeIdentity = deriveCustomRuntimeIdentity({
  tickRate: 30,
  inputSchema: { id: 'my-game-input/v1' },
  stateSchema: { id: 'my-game-state/v1' },
  deterministicVersion: 'my-game@1+syncplay5.26.0',
  runtimeModules: kinetixRuntimeModuleManifest('src', [
    'sim/runtime.ts',
    'sim/step.ts',
  ]),
  sessionConfigSchema: {
    id: 'my-game-session/v1',
    version: 1,
    maxBytes: 65536,
    fields: { playerCount: { type: 'integer', min: 1, max: 8 } },
  },
})
```

Run this in a checked generator with a fixed module list. Generated identity
files must not appear in their own manifest. Bind the exact installed
`@series-inc/rundot-syncplay` version into `deterministicVersion`, so a
dependency change requires regeneration. The version string is folded into `engineIdentityHash`, so the old
generated product cannot retain the same engine hash after a dependency bump.
Preset games can instead use a Kinetix data pack and its provided runtime
factory.

## 2. Construct the runtime and session

```typescript
import {
  createInstalledRuntimeAdapter,
} from '@series-inc/rundot-syncplay/core/runtime'
import { createSyncplaySession } from '@series-inc/rundot-syncplay/creator'

const runtime = createInstalledRuntimeAdapter({
  identity: runtimeIdentity,
  sessionConfigBytes,
  captureState: () => engine.state,
  restoreState: (state) => { engine.state = structuredClone(state) },
  frameOf: (state) => state.frame,
  step: (inputs) => engine.step(inputs),
  projectState: (state) => state,
})

const session = createSyncplaySession(runtime, {
  playerCount: 4,
  defaultInput: { throttle: 0, steer: 0, brake: false },
  snapshotBufferSize: 256,
  checksumIntervalFrames: 30,
})
```

`createSyncplaySession(runtime, policy)` accepts a constructed Kinetix runtime
only. The policy controls input defaults, checksum cadence, checkpoint retention,
and presentation callbacks. It cannot supply initial state, a reducer, a random
seed, or a simulation callback.

Live stepping and rollback use opaque checkpoint handles. Serialization and
hydration happen only for explicit v2 promotion/late-join transfer. A v2 snapshot
contains opaque runtime bytes plus runtime identity, session-config digest,
frame, and checksum; every field is checked before the destination mutates.

## 3. Go multiplayer

```typescript
import {
  createNetworkedSyncplayClient,
  createSyncplayRoom,
  quickMatchSyncplayRoom,
  joinSyncplayRoomByCode,
} from '@series-inc/rundot-syncplay/browser'

const room = await createSyncplayRoom(multiplayerApi, {
  maxPlayers: 4,
  runtimeIdentity: runtime.identity,
  sessionConfigBytes: runtime.sessionConfigBytes(),
  sessionConfigDigest: runtime.sessionConfigDigest,
})

const client = createNetworkedSyncplayClient({
  transport: room,
  runtimeFactory: (identity, configBytes) => loadSignedRuntime(identity, configBytes),
  localInputForTick: readControls,
})
```

Create and quick match carry runtime identity and config. Matchmaking always
isolates engine identity and config digest. Joining by private code accepts no
replacement config: the joiner receives the room-owned bytes, verifies its
catalog-loaded signed product matches, and constructs frame 0 only after that
check. Reconnect and crash recovery repeat the exact bytes.

## Presentation

Rendering reads a runtime **projection**, not a captured second runtime. A live
`NetworkedSyncplayClient` exposes `getPresentationFrame()`, `renderAlpha`,
`currentFrame`, and `caughtUp`, plus an opt-in bounded confirmed-frame queue
(`confirmedPresentationBufferSize` + `drainConfirmedPresentationFrames()`) and
`beginPresentationCatchUp()` for reconnects. The [session runner](#session-runner)
wraps all of this behind a `presentation` contract. Rendering, interpolation,
audio, and effects never mutate authoritative state, and presentation output is
never fed back into simulation.

## Session config and external deterministic assets

Canonical session config is capped at **65,536 bytes**
(`MAX_KINETIX_SESSION_CONFIG_BYTES`). Content larger than that — a UGC level —
rides its own storage: stored UGC `data` is capped at **100 KiB** by default (a
per-app configurable cap), and a session carries
`levelEntryId + levelDigest + levelByteLength`. Joiners fetch by **entry id** (no
digest lookup endpoint), re-encode the stored content canonically, and verify
digest and length with `verifyKinetixAuxiliaryAsset` before frame 0.

Referenced entries are **never updated in place** — a `ugc.update` under a live
session pin makes the room permanently unjoinable. Publish every edit as a new
entry and resolve and verify the immutable pin before frame 0.

## Session runner

`createSyncplayRunner` owns the `offline | connecting | syncing | live | stopped |
error` lifecycle, offline bot filling, network pacing, cancellable UGC asset
preflight (`prepareNetworkRuntime` / `prepareNetworkedSyncplayTransport`), and
presentation/event delivery behind one runtime factory.

### Config surface

`SyncplayRunnerConfig` — everything the runner accepts, nothing else:

| Field | Required | Meaning |
|---|---|---|
| `runtimeFactory` | yes | `(identity, sessionConfigBytes) => KinetixRuntime`. The one place a runtime is constructed, offline and networked alike. |
| `defaultInput` | yes | The neutral input. Fills bot slots and is the reset value for local input. |
| `encodeInput` / `decodeInput` | yes | Wire codec. Derive it with `defineSyncplayInputCodec` rather than hand-writing it. |
| `presentation` | yes | `{ project(projection, { localSlot, status }), interpolate?(previous, current, alpha), events?(projection) }`. Presentation-only; never feeds simulation. |
| `prepareNetworkRuntime` | no | `(descriptor, signal) => Promise<void>` — async asset preflight run **before** the client is constructed. The transport buffers ordered `session-start`/history traffic while it awaits. Aborted on `stop()` and on a superseded connection. |
| `maxPredictionTicks` | no | Rollback/latency budget passed through to the networked client. Not a player-count limit. |
| `maxOfflineStepsPerUpdate` | no | Default **8**. Caps catch-up stepping in one `update(deltaMs)` so a backgrounded tab cannot spiral. |
| `predictionMode` | no | `'always'` (default) or `'confirmed-only'`. In confirmed-only the runner applies confirmed frames only — no prediction, no rollback — while local input still flows to the authority. Use it for editing surfaces, where a rollback yank on a placed tile is worse than a frame of latency. |
| `remoteInputPrediction` | no | `repeat-last` (default) repeats each remote slot's last confirmed input and is appropriate for held movement controls. Use `neutral` for pulse/edge command codecs so a confirmed one-shot is not repeated into speculative frames. |
| `localInputForTick` | no | `(slot, frame) => Input` — per-tick local input provider for incremental adoption (a game whose input is a per-tick pulse supplies its own reader instead of the persistent `applyInput` value). Called once per simulated local frame, offline and networked; when omitted the runner uses the last `applyInput(...)` value verbatim. |
| `pacing` | no | Wall-clock pacing + clock-drift correction for the networked client, forwarded verbatim. Omit for the client defaults. |
| `inputDelay` | no | Local input delay for the networked client; `maxTicks > minTicks` auto-tunes from measured RTT. Forwarded verbatim; omit for the client default (0). |

Offline start options (`SyncplayRunnerOfflineOptions`): `identity`,
`sessionConfigBytes`, `playerCount`, `localSlot?`, `localSlots?`,
`botInputForTick?(slot, frame)`.

`localSlots` is shared-screen co-op: every listed slot is driven locally, and
`applyInput(input, slot)` targets one of them (`localSlot` is sugar for a single
entry). This is **offline only** — one connection is one seat is a room-server
seating invariant, so networked play stays single-seat.

### Snapshot

`subscribe(listener)` publishes a frozen `SyncplayRunnerSnapshot` on every status
or presentation change:

| Field | Meaning |
|---|---|
| `status` | `offline \| connecting \| syncing \| live \| stopped \| error` |
| `renderState?` | Present once a frame has been projected |
| `renderAlpha` | Interpolation alpha within the current frame |
| `localSlot` | `-1` until the client is ready |
| `rollbackCount` | Cumulative client rollbacks; `0` in offline mode and in `confirmed-only` |
| `ready` | False until a session/client exists. Offline: true once a session exists and the frame counters track the local session |
| `appliedThrough` | Last authority-confirmed frame; `-1` before any session/client |
| `predictedThrough` | Last locally predicted frame; `0` before any session/client |
| `error?` | Present only when `status === 'error'` |
| `connection` | `'connected'` or `'reconnecting'` — the transport's phase |
| `roomCode?` | Present when the transport carries one |
| `occupancy?` | `{ occupied, maxPlayers, full, locked }` when the transport reports it |
| `presence?` | The client's confirmed per-slot presence |
| `netStats?` | Client net stats, including `droppedConfirmedPresentationFrames` and `rejectedCommands` |

`update(deltaMs)` throws `SYNCPLAY_RUNNER_DELTA_INVALID` on a negative or
non-finite delta; `getRenderState()` before the first projection throws
`SYNCPLAY_RUNNER_NO_RENDER_STATE`; a malformed `maxOfflineStepsPerUpdate` throws
`SYNCPLAY_RUNNER_CONFIG_INVALID` at construction, and malformed offline options
throw `SYNCPLAY_RUNNER_OFFLINE_OPTIONS_INVALID`.

### Reconnect contract

**The transport owns reconnection — the runner adds no re-dial machinery.**
Re-invoking an opaque connect factory risks a fresh join instead of reclaiming
the seat, so the runner deliberately does not do it.

| Transport event | Runner behaviour |
|---|---|
| `'reconnecting'` | **Non-terminal.** Status drops to `syncing`, `beginPresentationCatchUp()` is called so replayed history is silent, and the runner returns to `live` once the client is caught up *and* has advanced past the pre-recovery frame. |
| `'disconnected'` | **Terminal.** Teardown, `status: 'error'` carrying `SYNCPLAY_TRANSPORT_DISCONNECTED`. |
| `'error'` | **Terminal.** Teardown, `status: 'error'` carrying the transport's message. |

Because a hard disconnect is terminal, **your game should offer an explicit
re-join action** on terminal `error` — call `startNetworked` again with a fresh
connect factory. Starting any mode always tears down the previous one, and a
stale async connection or preparation closes without replacing the current
session.

See also the
[Syncplay runner README](https://www.npmjs.com/package/@series-inc/rundot-syncplay).

## Collaborative editing

Ordered edit commands, confirmed-only prediction, live session reconfiguration,
and an ephemeral presence channel compose into a shared editor on the same
deterministic session — no second realtime path. See
[Syncplay: Collaborative Editing](SYNCPLAY-EDITOR.md).

## Browser room intent and sharing

`resolveSyncplayBrowserIntent`, `openSyncplayBrowserRoom`, and `shareSyncplayRoom`
compose RUN launch-intent, the anonymous sign-in gate, and share links over the
existing room APIs. They expose state and actions only — no badge, modal, or
sign-in UI.

## Correctness tests

`@series-inc/rundot-syncplay/testing` exposes exactly nine supported
entry points — `assertDeterministic`, `assertReplayVerifies`,
`assertTwoClientConvergence`, `assertLateJoinHydration`,
`createSimulatedSyncplayMatch`, `runSyncplaySynctest`,
`createSyncplayRunnerHarness`, `assertRunnerLifecycle`, and
`assertPresentationParity`. The network assertions run the real authority room
and networked client; browser/runtime APIs do not leak through the subpath.

The last three cover the seam games actually ship on — the runner, rather than
the client underneath it:

| Entry point | What it proves |
|---|---|
| `createSyncplayRunnerHarness` | Drives a real runner against the simulated match on a fully controlled clock, and records every status transition. Nothing advances outside `advance()`. |
| `assertRunnerLifecycle` | offline → networked → offline → stop, asserting the status sequence at each step. |
| `assertPresentationParity` | The same inputs produce the same confirmed presentation offline and networked. This catches projections that are deterministically **wrong but checksum-consistent** — a class of bug convergence tests cannot see, because the state agrees and only the projection differs. |

`createSimulatedSyncplayMatch` also wires `playerId`, `sendSecret` and
`onSecretMessage`, so secret systems are testable, and `openTransport(playerId)`
returns a raw transport when you want a real runner to own the seat.

## Capacity and late-join budgets

Snapshot transfer defaults are **256 KiB** chunks and a **4 MiB** total ceiling;
the immutable level payload is fetched and verified separately, never inside a
snapshot. 128 slots is the tested protocol/load ceiling, not a 60 Hz performance
guarantee for an arbitrary game; `maxPredictionTicks` is a rollback/latency
budget, not a player-count limit.

## Replays and late join

```typescript
import { verifyReplay } from '@series-inc/rundot-syncplay/creator'

const result = verifyReplay({
  replay,
  runtimeFactory: (identity, configBytes) => loadSignedRuntime(identity, configBytes),
  policy,
})
```

Replay v2 records runtime identity, canonical session-config bytes/digest,
inputs, authority commands, and checksums. Reducer replay v1 and snapshot v1 are
rejected; there is no migration decoder.

## Determinism and trust

- Only identity-bound game runtimes or Kinetix preset mechanics execute authoritative gameplay.
- Runtime identity is compiler-derived and signed with the product.
- The authority orders inputs but does not invent runtime identity or config.
- A bogus room cannot recruit an honest client whose loaded signed pack differs.
- Optional hidden choices, random draws, decks, bags, and roles use
  [Syncplay Secret Systems](SYNCPLAY-SECRETS.md).

The Kinetix world runtime is a correctness/reference backend with deep-copy
checkpoints. The shared batched ABI is the insertion point for optimized JS,
WASM, or native backends without changing Syncplay.
