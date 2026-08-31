# Syncplay: Spatial Interaction

> **STABLE:** This module API passed independent FPS ammo-crate and ARPG loot
> consumers at the two-genre promotion gate.

Import the code-only module from:

```ts
import {
  createSyncplaySpatialInteractionSlice,
  spatialInteractionComponent,
  stepSyncplaySpatialInteraction,
} from '@series-inc/rundot-syncplay/modules/spatial-interaction'
```

The module deterministically filters authored candidates by enabled state,
fixed-unit distance, and facing cone; selects by squared distance then stable
ID; and owns focus, hold progress, cancellation, and one-shot completion.
Coincident candidates are always in-cone, and angle wrap uses the supplied
deterministic math context.

The caller owns the consequence of completion—such as an inventory transfer,
door action, or dialogue start—and all rendering. Malformed candidates, state,
input, or context fail closed with a stable `SYNCPLAY_SPATIAL_INTERACTION_*`
error.
