# Syncplay: 2D Platformer Module (PROVISIONAL)

Import the generic, code-only platformer controller from:

```ts
import { createDeterministicMath } from '@series-inc/rundot-syncplay'
import {
  PLATFORMER_2D_DEFAULT_CONFIG,
  createPlatformer2DSlice,
  projectPlatformer2D,
  stepPlatformer2DController,
} from '@series-inc/rundot-syncplay/modules/platformer-2d'

const world = Object.freeze({
  minX: -100,
  maxX: 100,
  minY: 0,
  maxY: 100,
  walls: Object.freeze([]),
  slopes: Object.freeze([]),
  steps: Object.freeze([]),
  movingPlatforms: Object.freeze([]),
  oneWayPlatforms: Object.freeze([]),
})
const input = Object.freeze({
  moveX: 1,
  jumpHeld: false,
  dropHeld: false,
  pauseAutoMovement: false,
  resumeAutoMovement: false,
  reverseAutoMovement: false,
})
const context = Object.freeze({
  frame: 1,
  tickRateHz: 60,
  math: createDeterministicMath(),
  world,
  environment: Object.freeze({ atWall: false, atEdge: false }),
  config: PLATFORMER_2D_DEFAULT_CONFIG,
})

const initial = createPlatformer2DSlice({ key: 'player-1' })
const stepped = stepPlatformer2DController(initial, input, context)
const projection = projectPlatformer2D(stepped.slice)
```

This API is **PROVISIONAL** until the two-genre promotion gate. It owns a
deterministic character slice and delegates collision and movement to
`stepDeterministicKcc2D`. Games provide movement-world geometry,
wall/edge facts, frame input, and configuration as explicit data.

The controller supports manual movement, deterministic auto movement,
pause/resume/reverse requests, latched wall and edge reversal, rising-edge jump
input, and one-way drop priority. Manual horizontal input overrides auto
movement without mutating its direction. Jump and drop on the same frame resolve
to drop.

`projectPlatformer2D(slice)` returns only render-safe position, velocity,
facing, grounded state, the canonical `idle | run | jump` clip, and
rollback-safe animation events. Rendering, clocks, randomness, binary assets,
and game-specific level formats remain outside the module.

## Stable validation errors

| Code | Cause |
|---|---|
| `SYNCPLAY_PLATFORMER_2D_SLICE_INVALID` | The authoritative slice or initial slice is malformed. |
| `SYNCPLAY_PLATFORMER_2D_INPUT_INVALID` | An input field is missing, has the wrong type, or uses a horizontal value other than `-1`, `0`, or `1`. |
| `SYNCPLAY_PLATFORMER_2D_CONFIG_INVALID` | Auto-movement configuration is malformed or contradictory. |
| `SYNCPLAY_PLATFORMER_2D_CONTEXT_INVALID` | The frame context, movement world, deterministic math, or wall/edge facts are malformed. |

Use `platformer2DComponent` with the shared component-model composition and
certification tools.
