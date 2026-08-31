# Syncplay: Runtime Composition Cookbook (BETA)

A custom Syncplay game builds its runtime with `createInstalledRuntimeAdapter`.
The Syncplay core owns the deterministic contract — checkpoints, rollback, checksums,
hydration, identity. Your game owns mechanics, state, schemas, presentation,
and content. This cookbook walks through building that runtime end to end:
identity, state, projection, checkpoint codec, commands, external content, the
session runner, and tests.

Every snippet is drawn from one complete minimal game — a co-op counter — so
the pieces fit together. Copy the seams, not the counter mechanic.

## Choose the smallest shape

| Shape | Use it when | Syncplay core owns | Your game owns |
|---|---|---|---|
| Installed preset | Shipped mechanics fit and only canonical configuration varies | Runtime, mechanics, codec, projection | Preset data and presentation |
| Installed runtime adapter | Your mechanics are custom but can capture and restore their state | Checkpoint handles, rollback plumbing, checksums, capabilities | State, step, schemas, optional codec, commands, projection |
| Hand-written runtime ABI | A measured checkpoint or backend constraint rules out the adapter | ABI validation and Syncplay integration | Every runtime method and invariant |

Start with a generic module when one fits. Otherwise use
`createInstalledRuntimeAdapter` and the recipes below. Hand-write the ABI only
when a concrete constraint rules out the adapter; it carries strictly more
invariants.

## The example game

The recipes share one game. Players each add `-10…10` to a shared counter every
tick; the authority can grant points as an ordered command; the room creator
picks a rules file — a single byte holding a `1…10` multiplier — that every
client fetches and verifies before frame 0. The session schema that carries the
rules reference:

```ts
import type { KinetixSessionConfigSchema } from '@series-inc/rundot-syncplay/core'

export const counterSessionSchema: KinetixSessionConfigSchema = {
  id: 'my-game-counter-session/v1',
  version: 1,
  maxBytes: 256,
  fields: {
    rulesDigest: { type: 'string', maxBytes: 64 },
    rulesByteLength: { type: 'integer', min: 1, max: 64 },
  },
}
```

Canonical session config is capped at 65,536 bytes, so anything larger than a
few parameters — here the rules file, in a real game a level binary — rides its
own storage and is pinned into config by digest and byte length. Recipe 6 shows
both ends of that pin.

## 1. Bind your runtime source into identity

Do this at build time whenever your mechanics are custom executable code. Two
peers may only simulate together when they run identical logic, so the complete
game-owned module list and the exact dependency version is folded into
`engineIdentityHash`:

```ts
// scripts/generate-runtime-identity.ts — run in a checked build step
import {
  deriveCustomRuntimeIdentity,
  kinetixRuntimeModuleManifest,
} from '@series-inc/rundot-syncplay/core'
import { counterSessionSchema } from '../src/sim/session-config'
import pkg from '../package.json' with { type: 'json' }

const syncplayVersion = pkg.dependencies['@series-inc/rundot-syncplay']

export const runtimeIdentity = deriveCustomRuntimeIdentity({
  tickRate: 30,
  inputSchema: { fields: [{ name: 'delta', type: 'i32', min: -10, max: 10 }] },
  stateSchema: { fields: [
    { name: 'frame', type: 'u32' },
    { name: 'total', type: 'i32' },
  ] },
  runtimeModules: kinetixRuntimeModuleManifest('src', [
    'sim/runtime.ts',
    'sim/session-config.ts',
  ]),
  deterministicVersion: `my-game/v1+syncplay@${syncplayVersion}`,
  sessionConfigSchema: counterSessionSchema,
})
```

The Syncplay core owns canonical hashing and identity validation. Your build owns the
complete module list and the exact version. A missing runtime module or a
stale version can admit incompatible peers into one room, so the generator must
fail the build — never fall back to a previously generated identity. Malformed
options throw `KINETIX_CUSTOM_RUNTIME_IDENTITY_INVALID`; an unreadable or
malformed module list throws `KINETIX_PRODUCT_RUNTIME_MODULES_INVALID`. Bumping
the `@series-inc/rundot-syncplay` dependency changes `engineIdentityHash`, so
an upgrade forces regeneration instead of silently reusing the old hash.

## 2. Adapt immutable game state

Use this shape when every tick replaces the state root and never mutates a
retained root. Immutability makes capture O(1) — the adapter retains captured
state by reference — and enables structural sharing between frames:

```ts
// src/sim/runtime.ts
import {
  createInstalledRuntimeAdapter,
  type KinetixRuntime,
  type KinetixRuntimeIdentity,
} from '@series-inc/rundot-syncplay/core/runtime'

export interface CounterState {
  readonly frame: number
  readonly total: number
}

export interface CounterInput {
  readonly delta: number
}

export function createCounterRuntime(options: {
  identity: KinetixRuntimeIdentity
  sessionConfigBytes: Uint8Array
  rulesBytes: Uint8Array
}): KinetixRuntime<CounterState, CounterInput, unknown, CounterProjection> {
  const { config, multiplier } = loadRules(options) // recipe 6
  let state: CounterState = Object.freeze({ frame: 0, total: 0 })

  return createInstalledRuntimeAdapter({
    identity: options.identity,
    sessionConfigBytes: config,
    captureState: () => state,
    restoreState: (restored) => { state = restored },
    frameOf: (captured) => captured.frame,
    step: (inputs, commands) => {
      const inputTotal = inputs.reduce((sum, input) => sum + readDelta(input), 0)
      const commandTotal = commands.reduce((sum, command) => sum + command.amount, 0)
      state = Object.freeze({
        frame: state.frame + 1,
        total: state.total + inputTotal * multiplier + commandTotal,
      })
    },
    capturedStateIsDetached: true,
    // …codec, command, and projection hooks from recipes 3–5
  })
}
```

The Syncplay core owns opaque checkpoint handles and atomic rollback: a failed batch
restores the starting state and retains no partial checkpoints. Your game owns
the immutability guarantee. If your state mutates in place, omit
`capturedStateIsDetached` and the adapter clones captured state instead — slower
per tick, but safe. Validate inputs inside `step` (here `readDelta` enforces the
`-10…10` range and throws on anything else); a throw aborts the batch with the
frame unchanged.

## 3. Project presentation state

Use a projection to keep renderer records out of authoritative state. The
renderer reads the projection; the simulation never reads it back:

```ts
export interface CounterProjection {
  readonly frame: number
  readonly total: number
  readonly change: number
}

// in the adapter options:
projectState: (captured, previous) => Object.freeze({
  frame: captured.frame,
  total: captured.total,
  change: captured.total - (previous?.total ?? 0),
}),
```

The Syncplay core owns checkpoint lookup and passes retained state read-only; an absent
`previous` means produce a full frame. Your game owns the projection shape.
Never mutate either argument, and never feed a projection back into simulation —
a projection that is deterministically wrong but checksum-consistent is the bug
class `assertPresentationParity` catches (recipe 8). A throwing projection
surfaces as `KINETIX_RUNTIME_PROJECTION_INVALID`.

## 4. Install a strict checkpoint codec

Use a custom codec when the default canonical tagged-JSON encoding is too large
for your snapshot budget or cannot represent your state. Supply both hooks or
neither — one without the other throws `KINETIX_RUNTIME_CODEC_INVALID`:

```ts
// fixed-width, big-endian: u32 frame, i32 total — 8 bytes per checkpoint
function serializeState(state: CounterState): Uint8Array {
  const bytes = new Uint8Array(8)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, state.frame, false)
  view.setInt32(4, state.total, false)
  return bytes
}

function hydrateState(frame: number, bytes: Uint8Array): CounterState {
  if (bytes.byteLength !== 8) throw new Error('COUNTER_CHECKPOINT_INVALID')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, false) !== frame) throw new Error('COUNTER_CHECKPOINT_INVALID')
  return Object.freeze({ frame, total: view.getInt32(4, false) })
}
```

The Syncplay core re-serializes hydrated state and rejects byte drift as
`KINETIX_RUNTIME_CHECKPOINT_INVALID`; a decoded frame that disagrees with the
transfer envelope fails closed the same way. Your decoder owns bounds, enums,
lengths, and domain validation — reject anything malformed rather than coercing
it, because hydrated state is the late-join path into a live room. Once the
codec is installed, `serializeCheckpoint` / `hydrateCheckpoint` round trip
across runtime instances with identical checksums, which is what snapshot
transfer and `verifyReplay` build on.

## 5. Accept ordered commands

Add `decodeCommand` only when the game accepts authority-ordered commands —
moderation grants, editor operations, secret-system outcomes. Declaring the hook
is what advertises `{ commands: true }`:

```ts
interface GrantCommand {
  readonly amount: number
}

// in the adapter options:
decodeCommand: (value): GrantCommand => {
  const command = value as { type?: unknown; amount?: unknown }
  if (command.type !== 'grant'
    || !Number.isSafeInteger(command.amount)
    || command.amount < -1000 || command.amount > 1000) {
    throw new Error('COUNTER_COMMAND_INVALID')
  }
  return Object.freeze({ amount: command.amount })
},
```

The Syncplay core decodes the complete batch before stepping and maps any decoder failure
to `KINETIX_RUNTIME_COMMAND_INVALID`, so a rejected command leaves the current
frame unchanged — no partial advancement. Your decoder owns the command schema
and its limits. Omit the hook for `{ commands: false }`; non-empty command
lists then fail closed instead of reaching `step`.

## 6. Verify a session-selected deterministic asset

Use this when the room creator picks content too large for session config — a
rules file, a level binary. Publish it as its own immutable artifact, pin its
digest and byte length into canonical session config, and verify the fetched
bytes before frame 0. The room creator side:

```ts
import {
  createKinetixSessionConfig,
  describeKinetixAuxiliaryAsset,
} from '@series-inc/rundot-syncplay/core/runtime'

// at publish time, over the exact bytes you stored:
const declaration = describeKinetixAuxiliaryAsset('rules', rulesBytes)

// at room creation:
const session = createKinetixSessionConfig(counterSessionSchema, {
  rulesDigest: declaration.digest,
  rulesByteLength: declaration.byteLength,
})
// session.bytes and session.digest go into the room options
```

Every client — and your offline mode — then constructs the runtime through the
same verification path:

```ts
import {
  decodeKinetixSessionConfig,
  verifyKinetixAuxiliaryAsset,
} from '@series-inc/rundot-syncplay/core/runtime'

function loadRules(options: {
  sessionConfigBytes: Uint8Array
  rulesBytes: Uint8Array
}): { config: Uint8Array; multiplier: number } {
  const config = decodeKinetixSessionConfig(
    counterSessionSchema,
    options.sessionConfigBytes,
  )
  const rules = verifyKinetixAuxiliaryAsset({
    name: 'rules',
    digest: config.rulesDigest as string,
    byteLength: config.rulesByteLength as number,
  }, options.rulesBytes)
  if (rules.byteLength !== 1 || rules[0] < 1 || rules[0] > 10) {
    throw new Error('COUNTER_RULES_INVALID')
  }
  return { config: new Uint8Array(options.sessionConfigBytes), multiplier: rules[0] }
}
```

The Syncplay core owns digest and length verification — a mismatch throws
`KINETIX_AUX_ASSET_MISMATCH` — and returns a defensive copy, so caller-side
mutation after construction cannot change simulation output. Your game owns
fetching by the room-selected entry id and domain-decoding the verified bytes.
A digest, length, or domain failure is terminal: never substitute default
content, because the other peers verified different bytes and you would desync
on the first checksum. Referenced entries are never updated in place — publish
edits as new entries, exactly as the [preset's level flow](SYNCPLAY.md#session-config-and-external-deterministic-assets)
does.

## 7. Hand the runtime to the session runner

One `createSyncplayRunner` owns every mode — offline bots, local co-op,
networked play — behind a single `runtimeFactory`:

```ts
import { createSyncplayRunner } from '@series-inc/rundot-syncplay'

let rulesBytes: Uint8Array // fetched and verified before frame 0

const runner = createSyncplayRunner({
  runtimeFactory: (identity, sessionConfigBytes) =>
    createCounterRuntime({ identity, sessionConfigBytes, rulesBytes }),
  defaultInput: { delta: 0 },
  encodeInput,
  decodeInput,
  presentation: {
    project: (projection) => renderCounter(projection),
  },
  prepareNetworkRuntime: async (descriptor, signal) => {
    rulesBytes = await fetchSelectedRules(descriptor, signal) // then recipe 6 verifies
  },
})
```

Syncplay owns authority, prediction, rollback, late join, and transport. Your
game owns preparation, construction, input, and presentation. Asset preparation
runs before the client is constructed, so a preparation error puts the runner
in `error` before frame 0 exists. The full runner contract — snapshot fields,
reconnection, offline options — is in the [main Syncplay
guide](SYNCPLAY.md#session-runner).

## 8. Prove the composition

Test the composition with the correctness kit:

```ts
import {
  assertDeterministic,
  assertLateJoinHydration,
  assertReplayVerifies,
  assertTwoClientConvergence,
} from '@series-inc/rundot-syncplay/testing'
```

Your suite must cover, at minimum:

- identical input and command streams produce identical checksums
  (`assertDeterministic`);
- two clients converge through rollback (`assertTwoClientConvergence`);
- a fresh runtime hydrates a checkpoint and joins late
  (`assertLateJoinHydration`);
- recorded sessions re-verify (`assertReplayVerifies`);
- malformed checkpoints and commands cause no partial advancement (drive your
  runtime directly: assert the throw, then assert `currentFrame` is unchanged);
- bumping a dependency version or touching a runtime module changes
  `engineIdentityHash` (drive your identity generator twice);
- session-selected bytes are verified and defensively copied before frame 0
  (mutate the caller's buffer after construction; output must not change).

See [Correctness tests](SYNCPLAY.md#correctness-tests) for the full kit,
including the runner harness and `assertPresentationParity`.

## Errors

Stable codes your integration can branch on:

| Code | When it surfaces | What to do |
|---|---|---|
| `KINETIX_RUNTIME_COMMAND_INVALID` | A command failed `decodeCommand`, or commands reached a runtime built without the hook | Treat as an integration bug at the sender; the batch was discarded with no frame advanced |
| `KINETIX_RUNTIME_CHECKPOINT_INVALID` | Malformed bytes, or hydrated state that re-encodes differently, in `hydrateCheckpoint` | Reject the transfer; never patch bytes to fit |
| `KINETIX_RUNTIME_FRAME_MISMATCH` | A checkpoint's decoded frame disagrees with its envelope, or an advance batch is not contiguous | Resync from the authority rather than advancing locally |
| `KINETIX_RUNTIME_CODEC_INVALID` | Only one of `serializeState` / `hydrateState` was supplied | Supply both or neither |
| `KINETIX_RUNTIME_PROJECTION_INVALID` | `projectState` threw | Keep the projection pure and total over your state shape |
| `KINETIX_AUX_ASSET_DECLARATION_INVALID` | A malformed asset declaration | Fix the publisher; the declaration shape is canonical |
| `KINETIX_AUX_ASSET_MISMATCH` | Fetched bytes fail digest or length verification | Refetch by entry id; if it still fails, the session pin is stale — fail the join, never substitute content |
| `KINETIX_SESSION_CONFIG_*` | Config bytes fail magic, schema, canonicality, field, or size checks | Recreate the room with config encoded by `createKinetixSessionConfig` |
| `KINETIX_CUSTOM_RUNTIME_IDENTITY_INVALID` / `KINETIX_PRODUCT_RUNTIME_MODULES_INVALID` | Malformed identity options or module manifest at build time | Fix the generator and rebuild; do not ship a fallback identity |
