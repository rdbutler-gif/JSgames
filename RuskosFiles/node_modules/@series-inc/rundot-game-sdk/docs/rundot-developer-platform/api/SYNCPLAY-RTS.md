# Syncplay: RTS Module (PROVISIONAL)

Import the generic, code-only RTS contract from:

```ts
import {
  createSyncplayRtsSlice,
  projectSyncplayRts,
  rtsComponent,
  stepSyncplayRts,
} from '@series-inc/rundot-syncplay/modules/rts'
```

This API is **PROVISIONAL**. It defines deterministic RTS configuration, unit,
building, team, command, event, projection, and component types while reusing
the public deterministic navmesh for movement. Rendering, content, health
resolution, room lifecycle, and terminal game rules stay outside the module.

The implementation now provides exact-shape validation plus deterministic
selection, bounded order queues, formations, navmesh movement, attack intents,
fog, income, placement, and production. The no-argument constructor returns the
frozen pristine module slice; the authored constructor creates a validated game
slice. Malformed configuration, state, input, or context fails closed with a
stable `SYNCPLAY_RTS_*` error rather than entering simulation.

Attack-move acquisition is represented by the unit's explicit
`acquiredTargetId`, separate from its authored `orders`. That transient target
must be a live enemy unit or building. It does not consume queue capacity;
queued orders preserve it, a replacement clears it, and target retirement
clears it so the original attack-move resumes. Hydration rejects unresolved,
nonliving, self, or friendly acquired targets. An authored `attack-target`,
whether hydrated or issued, must also resolve to a live opposing unit or
building; self, friendly, queued, retired, and missing targets fail closed.
