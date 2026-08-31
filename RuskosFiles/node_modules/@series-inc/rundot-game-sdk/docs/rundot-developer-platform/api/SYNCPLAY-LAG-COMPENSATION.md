# Syncplay: Lag Compensation (BETA)

Fair hitscan for fast 3D shooters. When a player fires, they're aiming at where
targets appeared **on their screen** — which, thanks to prediction and network
delay, is a few ticks behind the confirmed simulation. Lag compensation **rewinds
the world to the frame the shooter actually saw**, validates the shot there, and
applies the result — without letting a client forge favorable timing.

Import from `@series-inc/rundot-syncplay/browser`. Builds on the
[Syncplay guide](SYNCPLAY.md) and [Physics](SYNCPLAY-PHYSICS.md) (shots resolve
against 3D bodies).

{% hint style="info" %}
**When you need this.** Only for hitscan/instant-hit weapons in latency-sensitive
3D games. Projectile games that simulate a travelling bullet deterministically don't
need it — the bullet is already part of the rolled-back simulation.
{% endhint %}

***

## The pattern

```
createDeterministicLagCompensation3DHistory({ maxStoredFrames, occluders })
history.recordTargets(targets)          // each tick: snapshot hitbox positions
history.validateShot(shot)              // on fire: rewind + test + return a verdict
```

The history is a **ring buffer of past hitbox states**. You record every tick;
when a shot arrives you validate it against the rewound world. The result tells you
whether it hit, missed, was occluded, or was rejected for bad timing.

***

## Recording target history

```typescript
import { createDeterministicLagCompensation3DHistory } from '@series-inc/rundot-syncplay/browser'

const history = createDeterministicLagCompensation3DHistory({
  maxStoredFrames: 128,       // how far back you can rewind (default 128)
  occluders: worldBodies,     // static geometry that blocks shots (DeterministicPhysicsBody3D[])
})

// every tick, record each target's hitbox:
history.recordTargets(state.players.map((p) => ({
  frame: ctx.frame,
  targetId: p.id,
  x: p.x, y: p.y, z: p.z,     // fixed-point
  radius: p.hitRadius,
  pose: p.crouching ? 'crouching' : 'standing',
})))
```

`DeterministicLagCompensatedTarget3D`: `{ frame, targetId, x, y, z, radius, pose }`
(`pose: 'standing' | 'crouching'`).

The history object:

| Member | Purpose |
|---|---|
| `recordTargets(targets)` | Store this tick's hitbox states. |
| `rewind(frame, shooterSlot?)` | Reconstruct all hitboxes as they were at `frame` (interpolating between stored frames). |
| `validateShot(shot)` | Rewind + test a shot; returns a verdict. |
| `snapshot()` / `restore(snapshot)` | Serialize for rollback — the history is part of simulation state. |
| `checksum()` | Deterministic hash of the buffer. |

***

## Validating a shot

```typescript
const result = history.validateShot({
  id: 'shot-42',
  shooterSlot: 0,
  shotFrame: ctx.frame,       // the frame the shooter fired on
  latencyFrames: 3,           // how far behind the shooter's view was
  x, y, z, dx, dy, dz,        // fixed-point origin + direction
  maxDistance,
  weapon: 'rifle',            // 'rifle' | 'shotgun' | 'burst'
  pellets: [],                // extra rays for shotguns
  maxHistoryFrames: 128,
})

if (result.reason === 'hit') applyDamage(result.hitTargetId, result.distance)
```

`DeterministicLagCompensatedShot3DResult`:

| Field | Meaning |
|---|---|
| `reason` | `'hit'` \| `'miss'` \| `'occluded'` \| `'stale-frame'` \| `'future-frame'` \| `'invalid-shot'` |
| `rewindFrame` | The frame the world was rewound to (`shotFrame - latencyFrames`, clamped). |
| `hitTargetId` / `hitboxId` | What was hit. |
| `distance` | Hit distance. |
| `pelletHits` | Pellets that connected (shotguns). |
| `checksum` | Deterministic hash of the resolution. |

The `reason` codes let **your own sim logic** reject malformed or backdated
shots: a shot claiming a `latencyFrames` that rewinds past the buffer is
`stale-frame`; one with a future `shotFrame` is `future-frame`; a malformed
shot is `invalid-shot`. Because every client runs the same deterministic
validation, a shot one peer rejects is rejected by all — but note this is
in-sim validation, not a server-enforced guarantee: the deterministic
authority relays and orders inputs, it does not run your sim or adjudicate
shots.

***

## Server-authoritative validation

`validateDeterministicAuthoritativeLagCompensatedShot3D(history, occluders, shot,
context)` adds a `DeterministicAuthoritativeLagCompensation3DShotContext` with
`acceptedShotFrame` / `serverReceiveFrame`, so a validator that DOES know when a
shot was received (e.g. a game running its own authoritative server, or a
future platform-side validator) can bound how far in the past a shot may
reach — narrowing the "claim huge latency to rewind arbitrarily far" hole.
On the standard deterministic room there is no such server-side adjudicator
today; the bound is only as trustworthy as the context your sim feeds it.

The lower-level functions are available if you want to build a custom flow:

| Function | Purpose |
|---|---|
| `rewindDeterministicLagCompensatedTargets3D(history, frame)` | Get interpolated hitbox states at a past frame. |
| `buildDeterministicLagCompensatedHitboxProxies3D(history, frame, shooterSlot?)` | Build [physics bodies](SYNCPLAY-PHYSICS.md) for the rewound hitboxes (raycast against them yourself). |
| `validateDeterministicLagCompensatedShot3D(history, occluders, shot)` | Stateless validation (no history object). |

***

## Determinism notes

- The history buffer is **part of simulation state** — call `snapshot()` in your
  state serialization and `restore()` on rollback, or its checksum will diverge.
- All positions, directions, and radii are **fixed-point**; `latencyFrames` and
  frame numbers are integers. Rewinding interpolates deterministically between
  recorded frames.
- Record targets **every tick** at a consistent point in your step so the buffer is
  identical on every client.
- Lag compensation decides *hit/miss*; it does not by itself stop a lag-switch
  cheat — use the authoritative variant with `serverReceiveFrame` to bound rewind
  distance for untrusted clients.

***

## See also

- [Physics & collision](SYNCPLAY-PHYSICS.md) — shots resolve against 3D bodies and occluders.
- [Movement (KCC)](SYNCPLAY-MOVEMENT.md) — `stepDeterministicFpsAim` produces the aim direction shots use.
- [Syncplay guide](SYNCPLAY.md) · [built-in systems overview](SYNCPLAY.md#4-built-in-systems-all-deterministic)
