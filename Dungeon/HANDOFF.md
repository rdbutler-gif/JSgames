# Dungeon Maze — Handoff (v18)

Single-file browser dungeon crawler on **three.js r160**. Click-to-move hero fights through
**4 procedurally generated levels** to a boss on L4. `index.html` is ~5,720 lines.

**v18 was a UI/presentation session.** It added typography, hover tooltips, ability-explainer
modals, potions in the shop, and a real loading bar — and touched **none** of the collision,
lighting, or generation code (verified by byte-comparing 24 functions against the previous
build; see "Verification pattern" below). The engine notes in this doc are inherited from v15
and remain accurate.

**No mandated job this session.** Ask the user. See "Suggested next steps".

---

## Corrections to the v15 doc (it had gone stale)

Read this before trusting any older handoff:

- **Fire Rain is DONE, not stubbed.** Full implementation: ported Godot shader as native GLSL
  on a flat `RingGeometry`, ground-targeted cast, 45 mana, 10 dmg × 5 ticks over 2.5s, 3×3
  tile footprint, 6-tile range, own `ShaderMaterial` warm-up in `warmUpProjectiles()`. The v15
  doc listing it as "the most-requested stub" was out of date.
- **Title screen + backstory are DONE** (procedural scrolling floorplan backdrop, splash art,
  instructions, Enter button).
- **`LANTERN_MANA_DRAIN` is a DEAD CONSTANT.** Declared, never referenced. Real behaviour is
  `MANA_REGEN*0.5` while lit (halved regen, never drains). **Still present — safe to delete.**
- **`test_collision.mjs` was not in the v18 working set.** It could not be run or parity-checked
  this session. Nothing v18 touched affects it, but re-verify parity before trusting it.

---

## How to run it

- **`index.html`** + **`assets/`** (GLBs, FBX anim packs, `assets/potions/*.glb`,
  `assets/audio/*`) + **`manifest.json`**.
- **Must be served over HTTP** — `file://` fails on CORS. `python3 -m http.server`.
- **New in v18:** fonts load from Google Fonts CDN (MedievalSharp + Cinzel). Offline, they fall
  back to `serif`/`Georgia` and everything still works — `display=swap` prevents invisible text.
- Missing `manifest.json` → clear on-screen error (replaces the whole loading screen).
  Missing prop GLB / sound → logged, skipped, non-fatal.

---

## Conventions / how to work on this safely

- **Verify against the code, not memory, and not this doc.** v15's doc was wrong about Fire
  Rain. Pull the real constant/line before claiming anything. Line numbers here are approximate.
- **Syntax-check every edit as a REAL ES MODULE:**
  ```
  sed -n '/<script type="module">/,/<\/script>/p' index.html | sed '1d;$d' > chk.mjs
  node --check chk.mjs
  ```
  A CJS check bails on top-level `await` first and reports nothing else — false confidence.
- **Naive brace/paren counting is unreliable** on this file. Parens are imbalanced in the
  *original* too (string literals). Braces are a useful smoke test; `node --check` is the truth.
- **Watch `str_replace` on repeated blocks.** Walk/idle/steer/pursue is near-duplicated across
  enemy classes and the hero. Anchor on a class-unique token, assert exactly 1 match.
- **Headless-test logic before playtest.** This caught real bugs in every recent session,
  including two in v18 (see changelog). Extract the function with a regex, mock its deps, run
  it under `node`. For DOM/layout, drive Playwright and assert on computed values.
- **`let` is not hoisted-initialized.** A function that *assigns* a module-level `let` throws
  `ReferenceError` if it runs before the declaration line executes. Bit us in v18 (`gamePaused`).
  Declare shared flags above all users.
- **Ship to `/mnt/user-data/outputs/`**, present the file, keep scratch out of outputs.
- **State assumptions, flag tradeoffs, let the user decide.** CS background; catches
  hand-waving. No flattery.

### Verification pattern for "did I touch the danger zones?"

Cheap and worth running after any non-trivial edit:

```python
import re
orig=open('previous_index.html').read(); new=open('index.html').read()
blk=lambda s,n:(re.search(r'\nfunction '+n+r'\([^)]*\)\{.*?\n\}',s,re.S) or [None])
# compare blk(orig,name) == blk(new,name) for:
#   propsBlockCircle propSlideStep pathArriveR addPropCollider findPath mobSteer
#   mobPursue mobWalkable reachableCount lineOfSight isFloorCell isCellFree
#   initDynLightPool assignFlameLights place generateMaze spawnCreatures
```
Note the signatures in code differ from this doc's prose — e.g. `propSlideStep(m, x, z, mx,
mz, R)`, not `(m,px,pz,...)`. Grep the real signature; a wrong regex reports "not found" and
looks like a deletion.

---

## Performance — READ BEFORE TOUCHING LIGHTS

three.js bakes the **light COUNT into every lit material's shader**; changing the number of
lights forces a scene-wide recompile (multi-second freeze). Total count is **fixed (~21)**:

1. **Projectile/impact lights pooled** — `DYN_LIGHT_POOL_SIZE=6`.
2. **Flame sconce lights pooled + capped** — `MAX_FLAME_LIGHTS=10`, nearest-to-focus,
   reassigned ~5×/sec (`assignFlameLights`).
3. **Icon glows are additive SPRITES** (`makeGlowSprite`), never lights. Any new glowing thing
   gets a sprite or a pooled light, **never a fresh `PointLight`**.

Other standing machinery:
- **Creature render culling** (`_renderCull` + `root.visible`), threshold `3200 + cam→target`.
  AI runs while hidden; only rendering + ALIVE mixer skipped. DEATH mixer ungated.
- **Static matrix freeze**: `place()`/`mountCandle` set `matrixAutoUpdate=false` after one
  `updateMatrix()`. **Moving a placed prop requires calling `.updateMatrix()`.**
  `addPropColliderFromInstance` relies on the baked matrix being current — it runs immediately
  after `place()`. **Keep that ordering.**
- Floors/slabs `castShadow=false` (`NO_CAST`). PixelRatio cap 1.5, PCFShadowMap, torch
  `shadow.camera.far` 2800.
- **Collision perf rule:** prop-circle tests are neighbour-limited via `m.propGrid`. Never loop
  all `m.propColliders` in a per-frame path.

**Next big lever if perf demands it:** instance static level geometry (`InstancedMesh`). Safe —
nothing raycasts level geometry. Not scheduled.

---

## Coordinate system & collision model (v15 — unchanged through v18)

- World `(x,z)` → cell `(round(x/CELL), round(z/CELL))`, **`CELL=600`**. Minimap flips both axes.
- **Two layers.** Floor/walls cell-based; props are circles:
  - **`isFloorCell(m,i,j)`** — movement/pathing floor gate.
  - **`m.blocked`** — still marks propped cells but is **NOT a movement or A\* wall**. It is the
    placement/target gate and an A* cost.
  - **`isCellFree`** = floor AND not blocked. **Placement/targeting only** — spawns, wander
    targets, portal drops, cast spots, `nearestFloor` remaps, approach cells, pickup scatter.
    **Do not reintroduce into movement or A\* passability.**
  - **`m.propColliders`** — `{x,z,r}` per prop. Radii **measured** via
    `addPropColliderFromInstance`: Box3 of the placed instance, centred on bbox centre,
    `r = clamp(0.25*(sx+sz), 60, 240)`, fallback `(fx,fz,150)`.
  - **`m.propGrid`** — `Map "i,j"→[colliders]`, registered under every cell the bbox overlaps.
- **Movement**: floor via `isFloorCell` (4 corners + centre) + **`propsBlockCircle`**. Bodies
  may legally stand inside a propped cell.
- **`propSlideStep(m, x, z, mx, mz, R)`** — tangential full-speed slide when a **prop** blocks;
  returns `null` for a **wall** so the classic axis slide applies. Fixes the dead-ahead grind
  that axis-slides alone can't (heading locks on target, perpendicular component → 0). Wired
  into `mobSteer`, `Boss._steer`, `Hero._steer`.
- **A\*** (`findPath`): floor-only `inb`; blocked cells cost **`PROP_CROSS_COST=2.0`** extra.
  Heuristic stays admissible (costs only increase).
- **`pathArriveR(bodyR,ci,cj,base)`** — inflated arrival radius in propped cells so followers
  don't orbit an unreachable node centre. Used by `mobPursue`, `mobReturnHome`, `Boss._pursue`
  (base 40), `Hero._followPath` (base `CELL*0.34`).
- **Generation untouched since v14.** `tryBlock` + `reachableCount` byte-identical; seeds and
  layouts reproduce. Prop jitter ±70, suppressed toward adjacent walls.
- **v14 stall detection** (`_stall`/`_pathCommit`) retained as a safety net. It should
  essentially never fire — **if playtest shows it firing, that's a bug signal, not a tuning task.**
- Each level logs `L<depth> PROP COLLIDERS: <n> (r <min>-<max>)`; typical ~60–190.

---

## LOADING SEQUENCE (rewritten in v18 — read before touching startup)

**The ordering is the important part and it is not obvious.** The module has **seven
sequential top-level `await`s** (manifest → props → skeleton → hero → sorceress → boss →
zombie → potions), then `genLevel()` builds the first level, and **only then** does the
`initTitle()` IIFE run.

Two facts that together dictate where the bar can live:

1. **`#title` is z-index 60 and opaque; `#loading` is z-index 20.** The title screen's
   *markup* is in the HTML from the first paint, so it **covers `#loading` for the entire
   load**. A progress bar on `#loading` renders correctly and is never visible. (This was
   shipped wrong once — the bar was built on `#loading` on the theory that the title "doesn't
   exist yet". The title IIFE hasn't *run*, but the div is already there and painted.)
2. **The browser DOES paint between top-level `await`s.** Verified with a Playwright probe
   sampling rendered width across awaits: intermediate values appear. So a bar updated from
   the load pipeline genuinely animates rather than snapping to 100% at the end.

Therefore the bar lives on the **title screen** (`#tload` / `#tlfill` / `#tltext`), in the slot
the old "Sound begins when you enter" line occupied. `#loading` is retained **only** as the
surface the manifest-failure error writes to.

- **`#enterbtn` ships `disabled`** and is enabled by `finishLoading()`. Without this the
  player can click Enter into a level that does not exist yet. The `initTitle()` keydown
  handler (Enter/Space → `enter()`) is bound *after* `finishLoading()` runs, so it cannot
  fire early — verified by line order, but keep that ordering in mind if startup is rearranged.
- **The manifest-failure path hides `#title` and raises `#loading` to z-index 100.** Otherwise
  the error is painted underneath the opaque title screen and the player sees a frozen bar with
  no explanation — the exact silent hang that block exists to prevent.

Machinery:
- **`LOAD_STAGES`** — `[key, weight]`, **weighted by real cost** (hero pack 22, props 14,
  potions 6...). Equal weighting made the bar race then crawl.
- **`_loadDone` is seeded with the `manifest` weight**, because that fetch completes *above*
  the tracker's definition and no `beginLoadStage()` ever banks it. Without the seed the bar
  tops out at ~98.3%.
- **`beginLoadStage(key, txt)`** — banks the previous stage's full weight (bar can never go
  backwards), sets the caption, resets intra-stage progress. Replaced the old `setLoadStage`.
- **`setLoadProgress(frac)`** — 0..1 *within* the current stage; clamped.
- **`finishLoading()`** — fills to 100%, sets "Ready", enables + focuses Enter, then **two
  nested rAFs** before fading `#tload` and hiding `#loading`. The double rAF matters: on a
  single frame the width and opacity transitions start together and the bar visibly never
  reaches the end.
- **Adding a load stage:** add `[key, weight]` to `LOAD_STAGES` **and** call
  `beginLoadStage(key, caption)` at the boundary. A key not in the table sets index −1 and
  silently freezes the bar. Cross-check:
  `grep -o "beginLoadStage('\w*" index.html` against the table.

---

## UI LAYER (v18)

### Typography
`--font-display` (MedievalSharp) / `--font-body` (Cinzel) CSS vars in `:root`, both with serif
fallbacks. Display → titles, banners, key labels, buttons, store/panel headers, section heads.
Body → instructions, prose, descriptions. **HUD, toasts and tooltips stay system sans on
purpose** — they update constantly during play and readability beats theme. Note both faces
render smaller than the old monospace at a given px; sizes were nudged up where swapped.

### Hover tooltips — `hoverTipFor()`
One `#hovertip` element, text set at runtime. Covers **11 targets**: red exit ("Descend"),
town portal, lantern, 3 spell scrolls, 4 potions, fruit bowl.
- **Hit priority mirrors the left-click handler exactly** (portal → exit → pickup → potion →
  bowl). If they diverge, the tooltip advertises one action while the click does another.
  **Keep them in sync.**
- Labels derive from `POTION_TYPES` and the `label` that `spawnPickup` already stores; only
  `PICKUP_TIP_GLYPH` is new, with a `✨` fallback. Adding a scroll needs no tooltip edit.
- Enemies deliberately excluded (they have healthbars + target halo).

### Learn modal — `LEARN_INFO` / `openLearn()` / `closeLearn()`
Fires on spell-scroll and lantern pickup, pauses via `gamePaused`. Close: Continue button,
Enter, Space, Escape. **No click-backdrop-to-close** (unlike the store) — it appears unprompted
the instant you step on a pickup, and a stray click aimed at the dungeon would dismiss it unread.
- **Each entry is a FUNCTION, not an object — this is load-bearing.** The table sits ~1,900
  lines above the constants it interpolates (`MANA_COST`, `FIRERAIN_COST`, ...). An eager
  object literal throws `ReferenceError: Cannot access before initialization`. Lazy evaluation
  defers the read until the modal actually opens.
- Numbers are interpolated from real constants so retuning a spell can't leave the tutorial
  lying.

### Store — potions added
`STORE_POTIONS` (price only) + `STORE_POTION_ORDER`; `buyPotion()` mirrors `buyUpgrade()` but
is **repeatable** — no "owned" branch, stacks into the same `inventory` the world pickups feed,
so the left panel and `usePotion()` needed no changes. Small 100g / Large 200g.
`renderStore()` now emits two `.store-sect` sections (Upgrades / Potions); potion rows show a
**"×N held"** badge instead of "Owned". Effect text pulled from `POTION_TYPES` at render time.
`#storeitems` got `max-height:62vh; overflow-y:auto` (7 rows now).

### `gamePaused`
**Moved to ~line 1683, above all four users** (`openLearn`, `closeLearn`, `openStore`,
`closeStore`). It previously sat *below* the store functions and worked only because the store
opens long after init. Keep it above.

---

## AUDIO (v14 model — unchanged)

- **`SFX`** IIFE: decode-once buffers, every sound an ARRAY of variants, no-immediate-repeat
  picker, `pitchJitter`, silent-safe on missing files. `MANIFEST` maps name → filenames in
  `assets/audio/` (spaces/capitals; URLs `encodeURIComponent`'d).
- **Per-enemy map:** each class sets `this.sfxName`; `creatureSound(c,event)` plays
  `sfxName+event`. **Adding an enemy = set `sfxName` + drop files named `<name><Event>`; zero
  new wiring.** This is the seam the class-abstraction work should mirror.
- **`BGM`** IIFE: streaming `<audio>` loop per depth, `volume=0.35`, toggle `#bgmtoggle`,
  `BGM.setLevel(depth)` folded into `genLevel()`. Unlocks on first pointerdown.
- **Cross-check sound filenames against disk** whenever sounds change.

---

## Key function map (search names; line numbers ~v18)

| System | Function | ~Line |
|---|---|---|
| **Load stage table (weighted)** | `LOAD_STAGES` | ~623 |
| **Advance load stage** | `beginLoadStage` | ~655 |
| **Finish + fade loading screen** | `finishLoading` | ~5118 |
| Floor gate (movement/pathing) | `isFloorCell` | ~1366 |
| Placement/target gate | `isCellFree` | ~1376 |
| Body-circle vs props | `propsBlockCircle` | ~1408 |
| Tangential prop slide | `propSlideStep` | ~1429 |
| Prop-aware arrival radius | `pathArriveR` | ~1454 |
| **Global pause flag (declare high!)** | `gamePaused` | ~1695 |
| **Ability explainer table (lazy!)** | `LEARN_INFO` | ~1706 |
| Open/close explainer | `openLearn` / `closeLearn` | ~1758 |
| **Buy consumable potion** | `buyPotion` | ~1846 |
| Store render (2 sections) | `renderStore` | ~1863 |
| Mob steer / pursue / return home | `mobSteer` / `mobPursue` / `mobReturnHome` | ~1936 / 1976 / 2036 |
| Hero steer (+prop slide) | `Hero._steer` | ~2729 |
| A* (floor-only + cross cost) | `findPath` | ~3100 |
| Fire Rain shader / spawn | `FIRERAIN_VERT` / `spawnFireRain` | ~3382 / 3467 |
| **Store potion prices** | `STORE_POTIONS` | ~3651 |
| Measure + register collider | `addPropColliderFromInstance` | ~4533 |
| Level build | `build` | ~4588 |
| genLevel (+BGM) | `genLevel` | ~5045 |
| **Tooltip glyphs / resolver** | `PICKUP_TIP_GLYPH` / `hoverTipFor` | ~5615 / 5623 |

---

## Session changelog (v15 → v18)

*(Fire Rain and the title screen landed between v15's doc and this one; they are folded in here
as pre-existing rather than claimed as v18 work.)*

**v18 (this session) — all UI; zero engine changes:**
- **Transparent title art.** Luminance-keyed alpha on `titleSplash.png` (soft ramp so ember
  glow feathers), verified against light and coloured backgrounds — no halo.
- **Typography.** MedievalSharp/Cinzel via CSS vars; key-label column widened 104→132px with
  `nowrap` (MedievalSharp is wider than the old monospace and "Left-click" wrapped).
- **Hover tooltips** generalized from fruit-bowl-only to 11 targets, click-priority mirrored.
- **Learn modals** for 3 spells + lantern, pausing the game; lazy-evaluated to dodge the TDZ.
- **`gamePaused` moved above its users** (latent `ReferenceError` — assignment-before-declaration
  verified to throw).
- **Store potions**: small 100g / large 200g, stackable, "×N held" badges, sectioned layout.
- **Loading bar** on the **title screen** (`#tload`), in the slot the "Sound begins when you
  enter" line held. Weighted stages, monotonic, exactly 100%, then fades as Enter is enabled
  and focused. `#enterbtn` now ships `disabled` so nobody can click into an unbuilt level.
  **Manifest-failure path now hides `#title` and raises `#loading`'s z-index** — otherwise that
  error renders underneath the opaque title screen and is invisible.
- **Removed dead `setLoadStage`** helper (superseded). `LANTERN_MANA_DRAIN` still dead —
  left alone as it's outside this session's scope.
- Bugs caught before playtest: bar topping out at 98.3% (unbanked manifest weight);
  `finishLoading` needing a double rAF or the bar never visibly completes; **bar initially
  built on `#loading`, where the opaque title screen covers it — invisible in practice, caught
  only when the user reported not seeing it.** Lesson: verify a UI element is actually
  *on screen*, not merely present and correctly styled.

---

## Suggested next steps (user decides; do not start unprompted)

- **Warrior class / class abstraction** — data-driven hero kit (resource, abilities, ranges,
  anims, upgrades); mirror the `sfxName` pattern. **Biggest structural item.**
- **Real low-poly meshes** for lantern / scrolls / portal (still primitives).
- **Delete `LANTERN_MANA_DRAIN`** (dead constant, contradicts actual behaviour).
- **Restore/parity-check `test_collision.mjs`** — not present in the v18 working set.
- **itch.io polish:** spell VFX, ambient/UI sound, mobile/touch input, economy balance
  (note: 10–100g per kill vs 100g potions / 500g+ upgrades — verify the curve in playtest).
- **Per-track BGM volume** if some loops are hotter than others.
- (Perf, only if needed: instance static level geometry.)
