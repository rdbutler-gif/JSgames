# Syncplay: Pathfinding (BETA)

Deterministic pathfinding — stable A\*, flow fields, and crowd avoidance whose
output is byte-identical on every client. Two flavors:

- **Navigation graphs** — grid / tilemap worlds. Nodes and edges; great for
  tile-based levels and flow-field crowds.
- **Navmeshes** — polygon meshes. Free-form 2.5D/3D worlds; corridor paths with
  off-mesh links (jumps, teleports, ladders).

Both follow the Syncplay **cook-once, query-per-need** shape and are exported from
`@series-inc/rundot-syncplay/browser`. Builds on the
[Syncplay guide](SYNCPLAY.md).

{% hint style="info" %}
This is **not** the [Navigation API](NAVIGATION.md) — that page is about navigating
between games in the app. This is in-simulation pathfinding for a Syncplay game.
{% endhint %}

***

## The pattern

```
cook a graph/navmesh   (once, at build or match start — from level data)
find a path            (when a goal changes)     → an ordered list of node/polygon ids
step agents            (per tick)                → agents advanced along their corridors
```

Cooked graphs and navmeshes are hashed and serializable (`bytes` + `hash`), so you
can bake them at build time and ship them. Paths return a `pathHash` for replay
verification.

***

## Navigation graphs (grid / tilemap)

### Cook

From a tilemap:

```typescript
import { cookTilemapNavigationGraph, findDeterministicPath } from '@series-inc/rundot-syncplay/browser'

const graph = cookTilemapNavigationGraph({
  id: 'level-1',
  width: 32, height: 32,
  blocked: ['12,4', '12,5'],          // impassable cells
  costs: { '10,10': 3 },              // per-cell movement cost (default 1)
  portals: { '0,0': '31,31' },        // teleport links
})
```

Or from an explicit node/edge graph via `cookDeterministicNavigationGraph(source)`
(a `DeterministicNavigationGraphSource` of `nodes`, `edges`, optional `regions`).
Cooking **sorts** nodes/edges/regions and rejects duplicate ids, so the graph is
canonical.

```typescript
interface CookedDeterministicNavigationGraph {
  id: string
  nodes: DeterministicNavNode[]
  edges: DeterministicNavEdge[]
  regions: DeterministicNavRegion[]  // toggleable groups of nodes
  bytes: string; hash: string        // serialized + identity
}
```

### Find a path

```typescript
const path = findDeterministicPath(graph, {
  start: '0,0',
  goal: '31,31',
  disabledRegionIds: ['locked-wing'],  // regions currently closed
  blockedNodeIds: ['3,3'],             // dynamic obstacles (a player, a hazard)
})

interface DeterministicPathResult {
  found: boolean
  nodes: string[]           // the ordered path
  cost: number
  visitedNodeCount: number  // search work (diagnostics)
  offMeshTraversals: number
  pathHash: string          // deterministic identity of this path
}
```

Because `disabledRegionIds` / `blockedNodeIds` are per-query, doors and hazards that
open and close mid-match re-path identically on every client.

### Flow fields & crowds

For many agents heading to one goal, compute a **flow field** once (a next-hop from
every node) instead of a path per agent:

```typescript
import { createDeterministicFlowField, stepDeterministicNavigationAgents }
  from '@series-inc/rundot-syncplay/browser'

const field = createDeterministicFlowField(graph, /* goal */ '31,31')
// field.nextByNodeId['10,10'] → the next node toward the goal
```

| Function | Purpose |
|---|---|
| `createDeterministicFlowField` | Precompute next-hop toward a goal for every node. |
| `smoothDeterministicPath` | Remove zig-zags from a grid path. |
| `applyDeterministicReciprocalAvoidance` | RVO-style avoidance between agents (deterministic ordering). |
| `stepDeterministicNavigationAgents` | Advance a set of `DeterministicNavigationAgent`s along the graph each tick. |

***

## Navmeshes (polygon)

### Cook

A navmesh is polygons + links. Links can be **off-mesh** (jumps, ladders,
teleports) and one- or two-directional:

```typescript
import { cookDeterministicNavmesh, findDeterministicNavmeshPath } from '@series-inc/rundot-syncplay/browser'

const navmesh = cookDeterministicNavmesh({
  id: 'arena',
  polygons: [
    { id: 'p0', vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], region: 'ground' },
    // …
  ],
  links: [
    { from: 'p0', to: 'p3', offMesh: true, bidirectional: false, cost: 2 }, // a jump
  ],
  regions: [{ id: 'ground', enabled: true }],
})
```

(`cookImportedDeterministicNavmesh` accepts an imported/authored mesh format.)

### Find a route

```typescript
const route = findDeterministicNavmeshPath(navmesh, {
  start: 'p0',                     // start polygon id
  goal: 'p7',                      // goal polygon id
  disabledRegions: ['lava'],
  blockedPolygons: ['p4'],
})

interface DeterministicNavmeshPath {
  found: boolean
  polygons: string[]                    // corridor of polygon ids
  points: DeterministicNavmeshPoint[]   // waypoints ({x, y, z?})
  offMeshTraversals: number             // jumps/teleports taken
  visitedPolygons: number
  pathHash: string
  startPolygonId?; goalPolygonId?: string
}
```

| Function | Purpose |
|---|---|
| `findDeterministicNavmeshPath` | Polygon-to-polygon corridor + waypoints. |
| `findDeterministicNavmeshPointPath` | Path between raw world points (locates polygons for you). |
| `locateDeterministicNavmeshPolygon` | Which polygon contains a point. |
| `smoothDeterministicNavmeshPath` | String-pull a corridor into a smooth path. |
| `stepDeterministicNavmeshOffMeshTraversal` | Advance an agent through an off-mesh link (jump/teleport) over several ticks. |

### Agents & crowds

`stepDeterministicNavmeshAgents(navmesh, agents, frame)` advances a whole crowd
along their corridors each tick with deterministic avoidance ordering. An agent
carries its target and movement params:

```typescript
interface DeterministicNavmeshAgent {
  id: string
  polygonId: string           // current polygon
  targetPolygonId: string     // goal polygon
  x?; y?; z?: number          // fixed-point position within the mesh
  speedPerFrame?: number
  updateIntervalFrames?: number  // re-plan cadence
  stoppingDistance?: number
  corridor?: string[]         // cached corridor
}
```

***

## Putting it together

```typescript
function stepEnemies(state: State): State {
  const enemies = state.enemies.map((e) => {
    // re-path only when the goal changed (paths are the expensive part)
    const path = e.goal === e.lastGoal
      ? e.path
      : findDeterministicNavmeshPath(state.navmesh, { start: e.polygonId, goal: e.goal })
    return advanceAlong(e, path)   // your fixed-point movement along path.points
  })
  return { ...state, enemies }
}
```

***

## Randomness, sampling & procedural noise — `ctx.random` and `noise`, never `Math.*`

AI and procedural generation lean on randomness and noise, and both are gated:
`Math.random` and the `Math.sin`-based value-hash trick are **cross-engine desync
bugs**, not shortcuts. Use the deterministic, seeded surfaces instead.

- **Sampling** on `ctx.random` (seed it deterministically, e.g. via
  `ctx.random.fork(entityId)`): `pickOne(items)` (throws on empty),
  `weighted(items, weights)` for weighted choice, `nextBool()`, `nextInt(min,
  max)`, `nextRangeFixed(min, max)` for a fixed value in a range,
  `nextAngleTurns(fixedScale)` for a random heading, `gaussian(ctx.math)` for
  spread/jitter. Same seed → identical sequence on every client.
- **Procedural noise** — imported pure functions (seed parameter, not on `ctx`):
  `hashUint32(x)` / `hash2(x, y)` for stable per-cell hashes (**use these for
  spread/scatter, never `Math.sin(id*…)`**), `valueNoise1D`/`valueNoise2D(ctx.math,
  x, y, seed)` for smooth fields, and `fbm2D` for multi-octave terrain-style noise.

```ts
import { fbm2D, hash2, hashUint32, valueNoise1D, valueNoise2D } from '@series-inc/rundot-syncplay/browser'
```

## Geometry for steering & line-of-sight — imported segment ops

Ray/segment queries (LOS, "does this path cross that wall", nearest point on an
edge) come from the package's segment geometry, all pure-integer:
`orientation`, `pointOnSegment`, `segmentsIntersect`, `closestPointOnSegment`,
`segmentPointDistance`, `segmentSegmentDistance` (the distance/closest ops take
`ctx.math` for their `sqrt`). Don't hand-roll these — the certified versions
match across engines.

```ts
import { closestPointOnSegment, orientation, pointOnSegment, segmentPointDistance, segmentSegmentDistance, segmentsIntersect } from '@series-inc/rundot-syncplay/browser'
```

## Determinism notes

- Cook from **shared level data**, not client-local input. The `hash`/`bytes` let
  you verify every client cooked the same graph.
- Node / polygon / region ids must be **stable and unique** (cooking throws on
  duplicates). Paths are ordered lists of these ids.
- Pass dynamic obstacles as `blockedNodeIds` / `blockedPolygons` and closed areas as
  `disabledRegionIds` / `disabledRegions` **per query** — never mutate the cooked
  graph mid-match.
- Agent positions and `speedPerFrame` are **fixed-point**. Re-plan on a cadence
  (`updateIntervalFrames`), not every tick, to keep cost bounded — the result is
  still deterministic.

***

## See also

- [Movement (KCC)](SYNCPLAY-MOVEMENT.md) — move agents along the paths you find.
- [Bots & AI](SYNCPLAY-BOTS.md) — decide *where* to path.
- [Syncplay guide](SYNCPLAY.md) · [built-in systems overview](SYNCPLAY.md#4-built-in-systems-all-deterministic)
