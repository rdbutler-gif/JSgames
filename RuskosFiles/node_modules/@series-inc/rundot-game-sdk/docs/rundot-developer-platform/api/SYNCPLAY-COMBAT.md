# Syncplay combat modules

> **STABLE:** This module API passed the FPS and ARPG promotion gate.

`@series-inc/rundot-syncplay/modules/combat` provides three pure deterministic
components:

- `combatantComponent` resolves sorted hits into health, resistance,
  invulnerability frames, hitstop, knockback payloads, and defeat;
- `meleeCombatComponent` resolves inclusive active-frame arcs against explicit
  hurtboxes and prevents one attack from hitting one owner twice;
- `projectileCombatComponent` advances travelling projectiles through the
  existing deterministic 3D shape cast and validates hitscan through the
  existing authoritative lag-compensation path.

```ts
import {
  createCombatantSlice,
  projectCombatant,
  stepCombatant,
} from '@series-inc/rundot-syncplay/modules/combat'

const result = stepCombatant(
  createCombatantSlice({
    id: 'player-1',
    health: 100,
    maxHealth: 100,
    resistances: { physical: 250 },
  }),
  {
    hits: [{
      id: 'swing-7:player-1',
      sourceId: 'player-2',
      targetId: 'player-1',
      damageKind: 'physical',
      baseDamage: 20,
      knockback: { x: 2, y: 1, z: 0 },
      sourceHitstopFrames: 2,
      targetHitstopFrames: 3,
      invulnerabilityFrames: 8,
    }],
  },
  { frame, tickRateHz: 60, math },
)

if (projectCombatant(result.slice).canAct) {
  // Step the owning movement/weapon module.
}
```

Resistance uses a fixed permille scale of `COMBAT_RESISTANCE_SCALE === 1000`.
New hitstop and invulnerability timers do not decrement on their landing frame.
Apply `damage-applied.hit.knockback` as an external impulse in the owning
character controller, and carry the maximum `sourceHitstopFrames` to the source
combatant on the following frame.

## Melee and projectiles

Melee inputs contain stable attack IDs, source IDs, active-frame bounds, origin,
facing in deterministic turns, vertical limits, and the hit payload. Hurtboxes
are explicit context and are normalized before resolution.

Travelling projectiles use explicit position, velocity, radius, lifetime, hit
payload, and a deterministic physics world. `bodyOwners` maps a shape-cast body
ID to the combat target ID.

Hitscan inputs contain the existing lag-compensated shot and immutable
authoritative context. Targets, occluders, accepted frame, server frame, history
window, and latency ceiling stay visible to the existing validator. Rejection
events preserve its reason rather than inventing a fallback hit.

## Stable errors

- `SYNCPLAY_COMBAT_INPUT_INVALID`
- `SYNCPLAY_COMBAT_CONTEXT_INVALID`
- `SYNCPLAY_COMBAT_SLICE_INVALID`

Malformed input, context, or hydrated state fails before an output slice or
event list is returned. Random spread, critical hits, and loot must arrive as
explicit synchronized authority input; the combat module owns no random stream.
