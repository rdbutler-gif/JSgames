# Syncplay: Animation (BETA)

A deterministic animation state machine — clips, transitions, blend trees, and
layers that advance **in lockstep with the simulation**. This matters when
animation drives gameplay: attack hitboxes, i-frames, and footstep events must fire
on the same tick on every client, and must survive rollback without double-firing.

Import from `@series-inc/rundot-syncplay/browser`. Builds on the
[Syncplay guide](SYNCPLAY.md).

{% hint style="info" %}
**Gameplay animation vs. cosmetic animation.** Use this system when animation
affects outcomes (hit frames, root motion that moves the character). Purely
cosmetic animation that never touches `state` can run in your renderer with normal
floats — it doesn't need to be deterministic.
{% endhint %}

***

## The pattern

```
cookDeterministicAnimation(source)                → a descriptor (states/clips/transitions)
createDeterministicAnimationRuntimeState(desc)    → per-character runtime state
stepDeterministicAnimation(desc, state, params)   → { state, events, sampledPose, … } each tick
```

The **descriptor** is the graph (shared, cook once). The **runtime state** is
per-character and lives in your simulation `state`. Each tick you pass in parameter
updates (booleans/numbers/strings that drive transitions and blends) and get back
the next runtime state plus the events and pose sampled this tick.

***

## Authoring the graph

```typescript
import { cookDeterministicAnimation } from '@series-inc/rundot-syncplay/browser'

const anim = cookDeterministicAnimation({
  id: 'hero',
  initialState: 'idle',
  clips: [
    { id: 'idle', durationFrames: 60, loop: true },
    { id: 'run',  durationFrames: 30, loop: true },
    { id: 'attack', durationFrames: 24, loop: false,
      events: [{ frame: 8, id: 'hit-active' }, { frame: 14, id: 'hit-end' }] },
  ],
  states: [
    { id: 'idle', clipId: 'idle' },
    { id: 'run',  clipId: 'run' },
    { id: 'attack', clipId: 'attack' },
  ],
  transitions: [
    { from: 'idle', to: 'run',    when: { parameter: 'speed', equals: 1 } },
    { from: 'run',  to: 'idle',   when: { parameter: 'speed', equals: 0 } },
    { from: 'idle', to: 'attack', when: { parameter: 'attack', equals: true }, consumeTrigger: 'attack' },
    { from: 'attack', to: 'idle', exitFrame: 24 },  // auto-exit when the clip ends
  ],
})
```

The authoring types:

| Type | Key fields |
|---|---|
| `DeterministicAnimationClip` | `id`, `durationFrames`, `loop`, optional `events[]` (`{ frame, id }` — the gameplay hooks), `tracks[]` (keyframed values), `rootMotionTrackId`. |
| `DeterministicAnimationState` | `id`, `clipId`, optional `blendTree` (`parameter` + `clips` with `threshold`s — 1D blend). |
| `DeterministicAnimationTransition` | `from`, `to`, `when: { parameter, equals }`, optional `priority`, `consumeTrigger`, `exitFrame`, `durationFrames` (cross-fade length). |
| `DeterministicAnimationDescriptor` | `id`, `initialState`, `clips[]`, `states[]`, `transitions[]`, optional `layers[]`, `eventReconstruction`. |

**Events** on a clip (`{ frame, id }`) are the whole point for gameplay: an
`attack` clip fires `hit-active` on frame 8, and your step turns that into a hitbox
— identically on every client.

***

## Stepping per tick

```typescript
import { createDeterministicAnimationRuntimeState, stepDeterministicAnimation }
  from '@series-inc/rundot-syncplay/browser'

let animState = createDeterministicAnimationRuntimeState(anim)

// each tick, drive it with parameters derived from gameplay:
const out = stepDeterministicAnimation(anim, animState, {
  speed: isMoving ? 1 : 0,
  attack: attackPressed,   // a trigger parameter
})
animState = out.state

for (const event of out.events) {
  if (event.id === 'hit-active') enableHitbox(slot)
  if (event.id === 'hit-end')    disableHitbox(slot)
}
```

`stepDeterministicAnimation(descriptor, state, parameterUpdates)` returns
`DeterministicAnimationStepResult`:

| Field | Meaning |
|---|---|
| `state` | Next runtime state — reassign and persist it. |
| `events` | Clip events that fired this tick (`{ id, clipId, frame }`) — your gameplay hooks. |
| `sampledPose` | The sampled track values this tick (`Record<trackId, number>`), for rendering. |
| `layerPoses` | Per-layer sampled poses (additive/override layers). |
| `rootMotionDelta` | Root-motion movement this tick (feed into your mover). |
| `blendWeight` / `transitionBlendActive` | Cross-fade state. |
| `transitionCount` / `exitFrameTransitionCount` | Diagnostics. |
| `checksum` | Deterministic hash of the runtime state. |

The runtime state (`DeterministicAnimationRuntimeState`) tracks `stateId`,
`clipFrame`, `parameters`, `consumedTriggers`, and any in-flight `transitionBlend` —
all of which you persist in your simulation `state`.

***

## Rollback & events

Because rollback re-simulates ticks, a naive event scheme would fire `hit-active`
twice. Set `eventReconstruction: 'synchronized'` on the descriptor and use
`reconstructDeterministicAnimationEvents(...)` to recover exactly which events
should be considered fired at a given frame after a rollback — so footsteps and hit
frames fire **exactly once** even across corrections.

***

## Determinism notes

- Persist the **runtime state** (`stateId`, `clipFrame`, `parameters`,
  `consumedTriggers`, `transitionBlend`) in simulation `state` so animation rolls
  back with gameplay. A module-level animation player would desync.
- Parameters are `boolean | number | string`; keep numeric blend parameters
  **integer / fixed-point**. `sampledPose` values are fixed-point too — convert to
  float only in the renderer.
- Everything advances in whole ticks at your descriptor's rate; there is no
  wall-clock `deltaTime`. Interpolate between frames for display only.
- Trigger parameters (`consumeTrigger`) are consumed deterministically — the
  `consumedTriggers` list is part of the checksummed state.

***

## See also

- [Movement (KCC)](SYNCPLAY-MOVEMENT.md) — turn movement events into animation parameters, and consume `rootMotionDelta`.
- [Syncplay guide](SYNCPLAY.md) · [built-in systems overview](SYNCPLAY.md#4-built-in-systems-all-deterministic)
