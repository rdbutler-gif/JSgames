# Syncplay actors and AI

> **PROVISIONAL:** This module API may change without deprecation until the
> two-genre promotion gate.

`@series-inc/rundot-syncplay/modules/actors-ai` composes authored encounter
waves, deterministic target scoring, squad coordination, and the existing
cooked-navmesh crowd step behind one pure Syncplay component.

```ts
import {
  createActorsAiSlice,
  stepActorsAiEncounter,
  type ActorsAiEncounterDefinition,
} from '@series-inc/rundot-syncplay/modules/actors-ai'

const encounter: ActorsAiEncounterDefinition = {
  id: 'courtyard',
  waves: [{
    id: 'opening',
    startFrame: 0,
    actors: [{
      id: 'guard-a',
      teamId: 'guards',
      squadId: 'north',
      spawnMarkerId: 'north-gate',
      aggroRadius: 12,
      speedPerFrame: 1,
      initialThreat: 10,
      action: {
        id: 'basic-attack',
        cadenceFrames: 30,
        range: 2,
      },
    }],
  }],
}

const result = stepActorsAiEncounter(
  createActorsAiSlice(),
  { defeatedActorIds: [], threatChanges: [] },
  {
    frame,
    tickRateHz: 60,
    math,
    encounter,
    navmesh,
    avoidanceObstacles,
    externalTargets: [{
      id: 'external:player-0',
      teamId: 'players',
      alive: true,
      polygonId: playerPolygonId,
      position: playerPosition,
      threat: 20,
    }],
  },
)
```

The cooked navmesh must contain every referenced spawn marker. Waves and actors
are normalized by stable IDs before they enter state, so caller array order does
not affect spawning. A pristine slice adopts the encounter ID on its first
step; later encounter-ID changes fail closed.

## Targeting and squads

Each live actor considers live enemies inside its authored aggro radius. The
existing deterministic utility selector scores explicit threat, with stable
distance and target-ID tie breaks. A game may supply immutable external targets
for player-owned or otherwise separately simulated entities. External IDs must
use the `external:` namespace; each target supplies its team, alive state,
navmesh polygon, position, and threat for the current frame. Actors retain
mutually exclusive `targetActorId` or `targetExternalId` fields, and the
`target-changed` event exposes the same distinction. External targets are never
spawned, moved, defeated, or counted toward encounter completion by this
module. Missing/dead/out-of-range external targets are released on the next
step.

The lexically first live squad member is the
leader, and its valid target is shared by the squad. Untargeted actors remain on
their current navmesh polygon.

The module does not own a random stream, behavior-tree engine, pathfinder, or
avoidance implementation. Random encounter outcomes must arrive as explicit
authority input. Combat damage and defeat decisions belong to the combat
composition; feed confirmed defeat IDs into the next actors-AI input.

An actor may author a genre-neutral action ID, cadence in frames, and range.
When its current actor or external target is in range and the canonical
`nextReadyFrame` has arrived, the module emits one target-bound `action-ready`
event and advances that frame by the authored cadence. The consuming game owns
the action's damage or other effect. Missing action configuration preserves the
original targeting-only behavior. Moving avoidance obstacles use the public
deterministic navmesh obstacle shape and are consumed by the live crowd step.

## Events and completion

The step emits terminal `synced` records for:

- `wave-started`
- `actor-spawned`
- `actor-defeated`
- `action-ready`
- `target-changed`
- `encounter-completed`

Event IDs contain their semantic actor, wave, or encounter identity, and use a
stable ordinal independent of unrelated same-frame transitions. Unknown or
already-dead defeat IDs are ignored. Duplicate or unknown threat changes are
invalid. An encounter completes after every wave has spawned and no live actor
remains.

## Stable errors

- `SYNCPLAY_ACTORS_AI_SLICE_INVALID`
- `SYNCPLAY_ACTORS_AI_INPUT_INVALID`
- `SYNCPLAY_ACTORS_AI_ENCOUNTER_INVALID`
- `SYNCPLAY_ACTORS_AI_CONTEXT_INVALID`

Malformed authored data, slices, input, or context fails before an output slice
or event list is returned. Duplicate external IDs, IDs outside the `external:`
namespace, unknown polygons, invalid vectors/threat, and slices that set both
target fields fail closed.
