# Syncplay: Character Movement (BETA)

Deterministic **kinematic character controllers (KCC)** and movers — the "push a
character through the world with collision, slopes, step-up, and jump feel" logic
that every action game needs and that is notoriously easy to de-determinize. These
are fixed-point and pure, so a character lands on the exact same pixel on every
client.

Import from `@series-inc/rundot-syncplay/browser`. Builds on the
[Syncplay guide](SYNCPLAY.md); pairs naturally with [Physics](SYNCPLAY-PHYSICS.md).

For a side-view game, compose these lower-level movement primitives with the
generic code-only platformer module.

***

## The pattern

Every mover is a pure step: **body + input + world → next body**.

```
stepDeterministicKcc2D(body, input, world, frame) → { body, events }
```

You keep the returned `body` in your simulation state and feed it back next tick.
The `world` is your static collision description (walls, slopes, platforms); build
it once.

***

## 2D platformer controller — `stepDeterministicKcc2D`

Full platformer feel: gravity, grounded state, **coyote time**, **jump buffering**,
wall-slide, slopes, moving platforms, and one-way platforms.

```typescript
import { stepDeterministicKcc2D } from '@series-inc/rundot-syncplay/browser'

const result = stepDeterministicKcc2D(body, { moveX: input.dir, jumpPressed: input.jump }, world, ctx.frame)
// result.body → next body; result.events → ['land', 'jump', 'wall-slide', …]
```

The body carries the feel-state you persist per character:

```typescript
interface DeterministicKccBody {
  x: number; y: number; vx: number; vy: number   // fixed-point
  grounded: boolean
  coyoteFrames: number       // frames of grace to still jump after leaving ground
  jumpBufferFrames: number   // frames a queued jump stays buffered
  wallSlideSide: -1 | 0 | 1
  platformId?: string        // moving platform the body is riding
}

interface DeterministicKccInput {
  moveX: number              // -1 | 0 | 1 (or fixed-point axis)
  jumpPressed?: boolean
  dropPressed?: boolean      // drop through a one-way platform
}
```

The world describes static + moving collision:

```typescript
interface DeterministicMovementWorld {
  minX; maxX; minY; maxY: number          // bounds
  walls: number[]                          // wall segments
  slopes: DeterministicSlope[]             // { id, minX, maxX, baseY, … }
  steps: DeterministicMovementStep[]       // step-up ledges
  movingPlatforms: DeterministicMovingPlatform[]
  oneWayPlatforms: DeterministicOneWayPlatform[]
}
```

`DeterministicKccStepResult` = `{ body, events }`, where `events` is a list of
strings (e.g. `land`, `jump`, `wall-slide`) you can turn into SFX/animation
triggers — feed them to [Animation](SYNCPLAY-ANIMATION.md) parameters.

***

## Top-down & twin-stick — `stepDeterministicTopDownMover`

For top-down movers with no gravity: accel/friction on a `DeterministicTopDownBody`
(`x, y, vx, vy`). Same value-in/value-out shape.

```typescript
import { stepDeterministicTopDownMover } from '@series-inc/rundot-syncplay/browser'

const next = stepDeterministicTopDownMover(body, { moveX, moveY }, world, ctx.frame)
```

***

## FPS aim — `stepDeterministicFpsAim`

Deterministic aim/look integration for first-person games — advances a view
direction from look input with the same fixed-point discipline, so what one player
is aiming at is identical on every client (the basis for
[lag-compensated hitscan](SYNCPLAY-LAG-COMPENSATION.md)).

***

## 3D character controller — `stepDeterministicKcc3D`

A full 3D KCC that can resolve against a [3D physics world](SYNCPLAY-PHYSICS.md#3d-physics),
with collision filters, external impulses (wind, knockback, dashes), and custom
processors.

```typescript
import { stepDeterministicKcc3D } from '@series-inc/rundot-syncplay/browser'

const result = stepDeterministicKcc3D(
  body,                       // DeterministicKccBody3D
  { moveX, moveZ, jump },     // DeterministicKccInput3D
  world,                      // DeterministicKccWorld3D
  {
    frame: ctx.frame,
    physics,                              // optional DeterministicPhysicsWorld3D to collide against
    ignoredPhysicsBodyIds: ['trigger-1'], // bodies this character passes through
    externalImpulses: [                   // order-independent — summed deterministically
      { id: 'wind-z', vx: 0, vy: 0, vz: 2 },
      { id: 'dash-x', vx: 2, vy: 0, vz: 0 },
    ],
    // collisionFilters, processors also supported
  },
)
```

The options object is where 3D movement gets its power:

| Option | Purpose |
|---|---|
| `frame` | Current tick (required). |
| `physics` | A `DeterministicPhysicsWorld3D` to resolve collisions against. |
| `ignoredPhysicsBodyIds` | Bodies this character should pass through (triggers, own hitbox). |
| `collisionFilters` | Per-body collision rules. |
| `externalImpulses` | One-shot impulses (dash, wind, knockback). **Summed order-independently** so two clients that received impulses in different orders still converge. |
| `processors` | Custom movement processors run in a fixed order. |

### 3D KCC unit contract (frame units, not SI)

`stepDeterministicKcc3D` advances **one simulation tick** with hard-coded frame
kinematics. It is not metre/second integration and is not fixed-point SI:

| Quantity | Behavior (current package) |
|----------|----------------------------|
| Horizontal move | `vx = input.moveX`, `vz = input.moveZ` — world units **per frame** |
| Gravity | `vy -= 1` every airborne frame |
| Jump | on buffered jump while grounded/coyote: `vy = 10`, `y += 1` |
| Coyote / jump buffer | 4 frames each |
| `stepHeight` / `maxSlopeRisePerUnit` | world units / rise-per-horizontal-unit |

Games that author in metres at 60 Hz must retune `moveX`/`moveZ`, jump feel, and
`externalImpulses` in these frame units. There is no SI-parameterized 3D KCC API.

### Retuning gravity and jump

Gravity retunes through a **processor**, because processors run before the
`vy -= 1` in the step — write `desiredVy + 1` and the subtraction lands on target.

The jump impulse is applied **after** processors, so it cannot be scaled that
way. Use `options.jump` instead:

```ts
stepDeterministicKcc3D(body, input, world, {
  frame,
  jump: {
    impulse: 0.35,      // vy set on the jump frame. Default 10
    liftOff: 0.035,     // immediate unstick lift. Default impulse / 10
    coyoteFrames: 6,    // default 4
    bufferFrames: 6,    // default 4
  },
})
```

Every default reproduces the hardcoded behaviour bit-for-bit, so omitting `jump`
leaves existing checksums unchanged. Frame counts must be non-negative integers
and the scalars finite — bad values throw rather than silently desync peers.

### Static physics does not vertically ground the KCC

`options.physics` uses the TypeScript `DeterministicPhysicsWorld3D` from
`@series-inc/rundot-syncplay` / `/browser` (not a `/core/physics` WASM handle).
Slide resolution against static bodies (including heightfields) is **horizontal**.
`grounded` becomes true from `world.slopes`, `world.steps`, moving platforms,
standing on **dynamic** bodies, or the `minY` floor — not from static heightfield
contact alone.

Pass `groundOnStaticBodies: true` to ground the capsule on static bodies,
including heightfields. It samples the same triangles the solver collides
against, so a character stands exactly where a projectile lands — no rebuilt
slope geometry and no game-owned `heightAt` snap.

It is off by default so existing games keep bit-identical checksums. Without it,
static heightfields still only block horizontally and vertical support comes
from `world.slopes` / `steps` / platforms / `minY`.

***

## Crowds

`runDeterministicMovementCrowdSimulation`
drives many characters at once with stable ordering — useful for validating that N
controllers step identically regardless of iteration order. For gameplay crowds
that also path, combine with [Pathfinding](SYNCPLAY-PATHFINDING.md) agents.

***

## Putting it together

```typescript
function stepMovement(state: State): State {
  const players = state.players.map((p, slot) => {
    const input = state.inputs[slot]
    const { body, events } = stepDeterministicKcc2D(p.body, {
      moveX: input.dir,
      jumpPressed: input.jump,
    }, state.world, ctx.frame)
    return { ...p, body, anim: applyAnimEvents(p.anim, events) }
  })
  return { ...state, players }
}
```

***

## Custom movement, aim, and distance math — use `ctx.math`, never `Math.*`

For steering, aim, and distance work outside the built-in controllers, do the
math on `ctx.math`. The determinism gate **blocks** `Math.sin/cos/tan/atan2/
sqrt/hypot/pow` (and `Math.random`/`Date.now`) in simulation code — they diverge
in low bits across engines and desync the match. `ctx.math` is the pure-integer,
byte-identical replacement:

- **Aim / facing:** `ctx.math.atan2(dy, dx)` → turns in `[0, fixedScale)`, or
  `ctx.math.atan2Signed(dy, dx)` → `[-fixedScale / 2, fixedScale / 2)` with the
  negative x-axis represented as `-fixedScale / 2`;
  `ctx.math.vec2FromAngleTurns(turns, speed)` to turn a heading back into a
  velocity; `ctx.math.angleDeltaTurns(from, to)` for the shortest turn to steer
  toward. Angles are **turns** everywhere (one revolution == `fixedScale`).
- **Distance / range checks:** `ctx.math.vec2Distance(a, b)` /
  `vec2DistanceSq` (cheaper, no `sqrt`), `ctx.math.hypot(dx, dy)`,
  `ctx.math.vec2Length`. Normalize a direction with `ctx.math.vec2Normalize`
  (zero vector → `{0,0}`).
- **Plain integer square root:** `ctx.math.integerSqrt(distanceSquared)` returns
  `floor(sqrt(distanceSquared))` for any non-negative safe integer through
  `Number.MAX_SAFE_INTEGER`. It throws for negatives, fractions, non-finite
  numbers, and unsafe integers. Unlike `ctx.math.sqrt`, this is not fixed-point.
- **Rotation:** `ctx.math.vec2Rotate(v, turns)`, `vec2Perp`, `vec2Dot`,
  `vec2Cross` for projections and side tests.

Never approximate these (octagonal magnitude, cross-product angle sorts, a
hand-rolled minimax) — the shared library already ships the accurate, certified
versions.

```typescript
const distance = ctx.math.integerSqrt(distanceSquared)
const signedFacing = ctx.math.atan2Signed(dy, dx)
```

## Determinism notes

- Persist the returned `body` (with its `coyoteFrames`/`jumpBufferFrames`/
  `platformId`) **in simulation state** — the feel-state must roll back too.
- **2D movers** (`stepDeterministicKcc2D`, top-down) use **fixed-point** positions
  and velocities. `moveX` is typically `-1|0|1`; convert analog sticks to a
  fixed-point axis, never a float.
- **3D KCC** (`stepDeterministicKcc3D`) uses ordinary numbers in **frame units**
  (see unit contract above). Quantize only by game discipline so peers stay bit-
  identical; it is not the fixed-point SI path.
- `externalImpulses` are summed order-independently by `id`; give each a **stable
  id** so a reordered list (from packet reordering) still resolves identically.
- The `world` should be identical on every client — derive it from the same cooked
  level data, not from anything client-local.

***

## See also

- [Physics & collision](SYNCPLAY-PHYSICS.md) — the world 3D KCC resolves against.
- [Animation](SYNCPLAY-ANIMATION.md) — drive animation from movement events.
- [Syncplay guide](SYNCPLAY.md) · [built-in systems overview](SYNCPLAY.md#4-built-in-systems-all-deterministic)
