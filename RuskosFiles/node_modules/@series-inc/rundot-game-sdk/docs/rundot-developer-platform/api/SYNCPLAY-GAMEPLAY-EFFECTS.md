# Syncplay: Gameplay Effects

> **STABLE:** This module API passed independent FPS damage and ARPG
> ability/status/damage consumers at the two-genre promotion gate.

Import the code-only module from:

```ts
import {
  applySyncplayGameplayEffectCommands,
  createSyncplayGameplayEffectsSlice,
  gameplayEffectsComponent,
  stepSyncplayGameplayEffects,
} from '@series-inc/rundot-syncplay/modules/gameplay-effects'
```

Definitions contain ordered typed damage, healing, resource, status, or ability
interrupt operations with exact integer amount formulas. Immediate effects emit
on application. Periodic effects use canonical duration, tick interval, tick
ordinal, and `add`, `refresh`, or `replace` duplicate semantics.

The composition helper prevalidates the complete command roster and target map,
then applies combat and stats/abilities changes atomically in target and command
ID order. A missing target or rejected nested operation leaves every caller
slice unchanged. Every target explicitly declares `statsFrame: 'advance'` when
the compositor owns that frame's stats timer step, or
`statsFrame: 'already-advanced'` when the game already stepped abilities and
statuses. This prevents accidental double advancement while keeping the target
contract fail-closed.

Target selection, aim, crits, random failure, encounter balance, presentation,
and item-consumption policy remain caller-owned. Malformed state, definitions,
commands, or target maps fail closed with stable `SYNCPLAY_GAMEPLAY_EFFECTS_*`
errors.
