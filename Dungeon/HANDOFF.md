# Dungeon Maze — Handoff (v12)

Single-file browser dungeon crawler on **three.js r160**. Click-to-move hero fights through
**4 procedurally generated levels** to a boss on L4, now with a lantern, a spell system,
found abilities (lantern + scrolls), a town-portal shop, and gold upgrades. `index.html` is
~4,180 lines. This doc is the current state of play; it deliberately does **not** recap the
full history — just what a fresh thread needs to keep building.

---

## How to run it

- Everything is in **`index.html`** plus an **`assets/`** folder (character/prop GLBs +
  animation FBXs, and `assets/potions/*.glb`) and a **`manifest.json`** listing the props.
- **Must be served over HTTP** — models load by relative URL, so `file://` fails on CORS.
  Run `python3 -m http.server` from the folder with `index.html` and open the localhost URL.
- If `manifest.json` can't be fetched, the loading screen now shows a **clear error** instead
  of hanging (see "Loading is defensive" below). A missing individual prop GLB is logged and
  skipped, not fatal.

---

## Conventions / how to work on this safely

These are the lessons that have actually bitten us. Follow them.

- **Verify against the code, not memory.** Pull the real constant / line number before making
  a claim or an edit. Line numbers in this doc are approximate — search the name.
- **Syntax-check every edit as a REAL ES MODULE**, not as a plain script. The distinction
  matters and has hidden a fatal bug before:
  ```
  python3 - <<'PY'
  import re; s=open('index.html').read()
  m=re.search(r'<script type="module">(.*?)</script>', s, re.S)
  open('chk.mjs','w').write(re.sub(r'^\s*import .*$','',m.group(1),flags=re.M))
  PY
  node --check chk.mjs      # MUST be .mjs — a .js/CJS check bails on top-level await FIRST
  ```
  A CommonJS `node --check` hits the top-level-`await` error and reports nothing else, giving
  false confidence while a brace imbalance sails through. A brace imbalance that dumps class
  method bodies into class scope shows up as `Unexpected token 'this'` — that means an earlier
  `}` closed a method/class too early (this exact bug froze the loading screen once; the
  browser silently fails to parse the module and nothing runs).
- **Watch `str_replace` on repeated blocks.** Several systems share near-identical
  walk/idle/steer code across the four enemy classes and the hero's target-handlers
  (potion / pickup / portal / exit blocks all look alike). A replace that spans a block
  boundary can silently drop an opener like `if(this.exitTarget){`. After any such edit,
  re-view the surrounding braces.
- **Headless-test logic in isolation** (spawn invariants, cooldown/economy math, flee/return
  geometry, pause state machine). For init-time crashes, a stubbed-three.js+DOM harness that
  runs the module top-to-bottom catches runtime throws `node --check` can't.
- **Ship to `/mnt/user-data/outputs/`, present the file, keep scratch out of outputs.**
- **State assumptions, flag tradeoffs, let the user decide.** They have a CS background and
  catch hand-waving. No flattery.

---

## Performance — READ BEFORE TOUCHING LIGHTS

three.js bakes the **light COUNT into every lit material's shader**, so changing how many
lights are in the scene forces a scene-wide recompile (multi-second freeze / slow-motion).
Two standing fixes keep the total light count **fixed (~21) and constant at runtime**:

1. **Projectile/impact lights are pooled** — `DYN_LIGHT_POOL_SIZE=6` (~line 2419). Fireballs
   and ice-bolt impacts borrow from a fixed pool of always-present point lights. If the pool
   is exhausted mid-barrage the extra bolt renders without a glow — no recompile.
   `clearProjectiles()` releases handles on teardown. `warmUpProjectiles` (~2545) compiles
   shader variants per level.
2. **Flame sconce lights are pooled + capped** — `MAX_FLAME_LIGHTS=10` (~line 781). Every
   sconce gets its glow **sprite** (that's what reads as torchlit), but only the 10 nearest
   the camera focus get a real `PointLight`, reassigned ~5×/sec (`assignFlameLights` ~817).

3. **(v13) Icon lights are GONE** — the lantern/scroll/portal icons now glow via additive
   **sprites** (`makeGlowSprite`, near `buildLanternIcon`), not PointLights. The scene light
   count is now **fixed at all times during play** (torch, hero lantern, 10-flame pool,
   6-dyn pool, per-level exit light — the last two swap within a single frame on rebuild, so
   the count never changes *between renders*). Collecting a pickup or opening/closing a town
   portal no longer recompiles shaders. **Keep it that way**: any new glowing thing gets a
   sprite or a pooled light, never a fresh PointLight.

Other standing v13 perf machinery (see the v13 changelog for rationale):
- **Creature render culling** in the main loop: `_renderCull` + `root.visible` per creature,
  threshold `3200 + cam→target distance` (adaptive with zoom). AI still runs while hidden;
  only rendering + the ALIVE-branch mixer are skipped. The DEATH-branch mixer is deliberately
  ungated so corpses always settle. The Hero's mixer (in `class Hero`) is never gated.
- **Static matrix freeze**: everything placed via `place()` / `mountCandle` gets
  `matrixAutoUpdate=false` after one `updateMatrix()`. **If future code moves a placed prop,
  call `.updateMatrix()` on it or nothing visibly moves.** Potions/pickups/portal/creatures/
  hero don't go through `place()` and are unaffected.
- **Floors/slabs `castShadow=false`** (`NO_CAST` set in `place()`); they still receive.
- Renderer knobs (all commented at the setup block, ~line 255): pixelRatio cap **1.5**
  (was 2), **PCFShadowMap** (was PCFSoft), torch `shadow.camera.far` **2800** (was 4000),
  `powerPreference:'high-performance'`.

---

## Coordinate system & asset caveats

- World `(x,z)` → grid cell `(round(x/CELL), round(z/CELL))`, `CELL=600`. Minimap flips both
  axes (`drawMinimap`).
- Dungeon props get their material **replaced** with a vertex-color MeshStandardMaterial.
  Potions do **not** (baked texture atlas). Any new textured GLB asset needs the same
  treatment as `loadPotion`. The new ability/portal icons are **pure three.js primitives**
  built in code — no assets, no material replacement.
- `place(name,...)` (~3417) now **returns null and skips** if the prop proto is missing
  (graceful asset-skip). Callers that use the return value must null-check (the fruit-bowl
  spawner does).

---

## Current gameplay state

### Progression & abilities (NEW this session)
- **Ability/upgrade state lives at MODULE scope**, not on the Hero instance (which is rebuilt
  every level/respawn), so it survives descend & death and resets only on a fresh run.
  See the block near line 2596: `hasLantern`, `learnedSpells` (Set), `selectedSpell`,
  `upgrades{boots,cloak,wand}`, plus `SPELLS`, `SPELL_META`, `UPGRADE_META`.
  `resetProgression()` (~2612) clears it all + removes any portal; called from **New Dungeon**
  and **Play Again**.
- **Hero starts with NOTHING** — no lantern, no spells. `learnedSpells` empty,
  `hasLantern=false`, `HERO_LANTERN_ON=false`. `setLantern` refuses to light until found.

### Found abilities — exit-room pickups (NEW)
- Placed by `placeExitPickups()` (an IIFE ~line 3650 inside `build`): finds the room
  containing the exit, spreads pickups on free floor cells nearest the exit (never on the
  exit/entrance cell, spaced ≥2 apart, don't block their cell).
  - **L1 exit room:** the **Lantern** + the **Fireball scroll**.
  - **L2 exit room:** the **Town Portal scroll** + the **Fire Rain scroll**.
- Pickups are **primitive icons** (`buildLanternIcon` ~1000, `buildScrollIcon(tint)` ~1023,
  color-coded per spell). Left-click one → hero `walkToPickup` → `onCollect()` on arrival
  (`grantLantern` / `learnSpell`). System mirrors world-potions: `worldPickups[]` (~997),
  `spawnPickup` / `removePickup` / `clearWorldPickups` / `updateWorldPickups` (bob+spin).
  Cleared on level teardown. **Flagged for later:** swap the primitives for real low-poly GLBs.

### Spells & the Selected-Spell toggle (NEW)
- Three spells cycle on the HUD **Selected Spell** button: `fireball → firerain → townportal`.
  Unlearned spells still appear but render **greyed/locked**; selecting one is allowed (to
  preview), casting it is blocked with a toast.
- **Right-click behavior depends on the selected spell** (in the contextmenu/pointerup
  handler): `fireball` → click an enemy to cast (gated on learned + mana + cooldown);
  `townportal` → click empty floor to open a portal (costs mana); `firerain` → **AOE not
  implemented**, currently a no-op stub with a "coming soon" toast. **This is the obvious next
  feature** — the user plans to animate real spell effects later.

### Cast cooldown — now a REAL controllable value (was animation-driven)
- `CAST_COOLDOWN=2.2`s base (a `let`), tracked by `hero.castTimer` which ticks every frame
  independent of the animation. `effectiveCastCooldown()` applies the wand: `CAST_CD_WAND_MULT
  =0.5` → ~1.1s with the Wand of Haste. **Base is the original slow rate; the wand is the
  fast rate.** In `_doAction`'s cast branch (~2945): gated on `castTimer<=0`, sets the timer
  on fire, the "busy" (animation-lock) window is **capped to the cooldown** so a short cooldown
  actually fires faster (the old busy window silently capped fire rate — don't reintroduce
  that). The cast clip's `timeScale` scales up when cooldown < clip length so the pose keeps
  pace.

### Lantern
- Toggle via the HUD **Lantern** button, the **`L`** key, or `window.toggleLantern()` — all
  no-op until found. **Drains `LANTERN_MANA_DRAIN=1` mana/sec while lit AND suppresses regen**
  (so net cost > 1/s). Auto-gutters (turns off) at 0 mana. Note the button is
  disabled/"Not found" until the L1 pickup.

### Town Portal + Store (NEW)
- Right-click empty floor with Town Portal selected → `spawnPortal` (primitive spinning
  portal, ~1107), **costs `TOWN_PORTAL_COST=70` mana**. Only one portal at a time.
- Left-click the portal → hero `walkToPortal` → on arrival: **portal is removed** (one-use)
  and `openStore()` runs. `updatePortal` pulses it each frame.
- **Store** (`openStore`/`closeStore`/`renderStore`/`buyUpgrade` ~1129–1200): sells **Boots**
  (500g, ×2 walk speed), **Cloak** (600g, ½ damage taken), **Wand** (700g, ½ cast cooldown).
  Owned/affordable states handled. Effects applied live: boots via `heroMoveSpeed()` /
  `heroWalkTimeScale()` (~508), cloak in `hero.takeDamage`, wand in `effectiveCastCooldown`.
- **Opening the store PAUSES the game** via `gamePaused` (~1089): the loop skips all creature
  and hero updates while true (in-flight fireball FX are currently NOT gated — harmless, but a
  one-liner if you want a hard freeze). Cleared on close.

### HUD toggles (NEW)
Three buttons below the HP/MP bars, synced by `updateAbilityHUD()` (~3352):
- **Selected Spell** — cycles/greys as above.
- **Cam** — follow-hero on/off. `setCameraFollow` now refreshes the HUD on EVERY path, so a
  manual right-click pan / orbit / zoom that auto-disengages follow also flips the button to
  "Off." (`C` key toggles too.)
- **Lantern** — as above.

### Levels, enemies, loot (largely stable)
- **4 levels**, `LEVELS[]` (~3820), sizes ramp 16×12 → 40×32; `applyLevelSize` + `genLevel`
  (`build`) generate. **Descend** advances (new seed from current); **New Dungeon** / **Play
  Again** restart at L1 fresh (clear gold + inventory + progression). Win = kill L4 boss.
- Enemies in `creatures[]`, spawned by `spawnCreatures` (~2124), **≥1 per room**, hero start
  room empty. Skeleton (HP60), Zombie (`ZOMBIE_HP=70`), Sorceress (`SORC_HP=45`, ranged
  ice-kite with a real mana economy), Boss (`BOSS_HP=220`, telegraphed big attack, L4 exit
  room). Density `densPerLevel=[0.060,0.076,0.092,0.110]`.
- **Return-home on respawn:** every enemy records `homeCell` at spawn; when the hero respawns,
  `deaggroCreature` (~1305) drops aggro and sends them **walking back to spawn**
  (`mobReturnHome` ~1263) before resuming wander — stops the entrance pile-up from kiting.
  Sight-aggro is suppressed while `returning` and while the hero is dead, so they actually make
  it home; being hit still re-aggros them.
- Gold: `LOOT_SKELETON/ZOMBIE/SORCERESS/BOSS = 10/20/50/100`. Gold now has a **sink** (the
  store).

### Hero combat constants (~2576–2624)
`HERO_MAX_HP=100`; move base × `HERO_SPEED_MULT=1.7` (×`BOOTS_SPEED_MULT=2` with boots);
`CAST_RANGE=CELL*3.5` (a `let`, upgradeable); `SPELL_DMG=25`, `MELEE_DMG=18`,
`MELEE_RANGE=CELL*0.6`; `MANA_MAX=100`, `MANA_COST=35`, `MANA_REGEN=3`/s.

### Potions & inventory (stable)
Four types in `POTION_TYPES` (~664, +25/+60 HP, +30/+70 MP), baked-atlas GLBs via `loadPotion`.
`worldPotions[]` bob/spin, left-click to walk-and-grab. Inventory = left panel, `usePotion`
consumes/heals with clamp+toast, `renderInventory` redraws. No cap, flat restore (intentional).

---

## Key function map (search names; line numbers approximate)

| System | Function | ~Line |
|---|---|---|
| Toast messages | `showToast` | 244 |
| Potion load (keeps atlas) | `loadPotion` | 671 |
| Maze gen | `generateMaze` | 700 |
| Flame light assignment | `assignFlameLights` | 817 |
| Use a potion | `usePotion` | 950 |
| Potion world spawn | `spawnWorldPotion` | 965 |
| **Pickup icons** | `buildLanternIcon` / `buildScrollIcon` | 1000 / 1023 |
| **Pickup spawn/anim** | `spawnPickup` / `updateWorldPickups` | 1048 / 1064 |
| **Grant ability** | `grantLantern` / `learnSpell` | 1072 / 1077 |
| **Portal** | `spawnPortal` / `removePortal` / `updatePortal` | 1107 / 1115 / 1119 |
| **Store** | `openStore` / `renderStore` / `buyUpgrade` | 1137 / 1144 / 1129 |
| Sorceress flee/kite | `mobFlee` | 1207 |
| Enemy pursuit | `mobPursue` | 1222 |
| **Return-home on respawn** | `mobReturnHome` | 1263 |
| Drop aggro / send home | `deaggroCreature` | 1305 |
| Enemy spawning (per-room) | `spawnCreatures` | 2124 |
| Projectile warm-up | `warmUpProjectiles` | 2545 |
| **Cast cooldown (wand)** | `effectiveCastCooldown` | 2588 |
| **Reset run progression** | `resetProgression` | 2612 |
| Hero cast/melee dispatch | `_doAction` (in Hero) | ~2940 |
| **Hero walk-to-pickup / portal** | `walkToPickup` / `walkToPortal` | 2801 / 2815 |
| Hero (re)spawn + de-aggro all | `spawnHero` | 3289 |
| Inventory panel render | `renderInventory` | 3308 |
| **HUD toggles sync** | `updateAbilityHUD` | 3352 |
| Place a prop (null-safe) | `place` | 3417 |
| Level build (spawns everything) | `build` | 3469 |
| **Exit-room ability pickups** | `placeExitPickups` (IIFE in build) | 3650 |
| Minimap static / blip | `drawMinimap` / `renderMinimap` | 3766 / 3792 |
| Level list / sizing | `LEVELS` / `applyLevelSize` / `genLevel` | 3820 / 3829 / 3830 |
| Camera follow | `setCameraFollow` | 3900 |
| Raycast pickers | `pickPotion` / `pickPickup` / `pickPortal` | 3961 / 4006 / 4025 |

---

## Loading is defensive (don't undo it)

`manifest.json` fetch is wrapped: failure shows an on-screen "serve over HTTP" message and
stops with an explanation instead of a silent freeze. `loadAsset` resolves-on-failure (skips
a missing prop) rather than rejecting the whole `Promise.all`. `place()` null-checks the proto.
Keep this behavior — the old hard-fail bricked the loading screen with no clue why.

---

## Suggested next steps (open threads)

- **Fire Rain (AOE)** — the one selectable spell with no effect yet. Right-click currently
  stubs it. Needs a target-on-ground cast + area damage + effect. User will supply/animate a
  real spell visual; wire the mechanic to accept a swapped-in mesh/particle later.
- **Real low-poly meshes** for the lantern, the four scrolls, and the portal (all primitives
  now). Pickup/portal code already isolates the `build*Icon` functions for a clean swap.
- **"itch.io-worthy" polish pass** (user's stated bar). Likely items: pickup/portal sound +
  particle, store UX (currently opens on portal-arrival — consider a visible "shop" affordance
  and maybe letting the portal persist as a re-usable shop vs. one-use), spell VFX, a title/menu
  screen, mobile/touch input, and a balance pass on the new economy (gold income vs. 500/600/700
  upgrade costs; lantern mana tax vs. casting; wand fire-rate feel).
- **Balance playtest** — L4 is dense casters + boss; verify the hero's speed, the potion +
  gold economy, and whether the paused-store / one-use portal loop feels right.

---

## Session changelog (v11 → v12)

- Return-home-on-respawn for all enemies (v11's work, retained).
- Hero starts with no lantern / no spells; both found as **exit-room pickups** (L1 lantern +
  fireball, L2 town portal + fire rain) rendered as **primitive 3D icons**.
- **Spell system**: 3-way Selected-Spell HUD toggle with greyed unlearned spells; right-click
  dispatches per selected spell.
- **Cast cooldown decoupled from animation** into a real value (`CAST_COOLDOWN`), base = slow
  original rate, **Wand of Haste** halves it.
- **HUD toggles**: Selected Spell, Cam-on-hero (syncs to "Off" on manual-pan override), Lantern.
- **Lantern** drains 1 mana/sec (down from 2) + suppresses regen, auto-gutters at 0.
- **Town Portal**: costs 70 mana; hero walks to it before the store opens; portal is one-use
  (removed after); **store open pauses the game**.
- **Store** with Boots (×2 speed) / Cloak (½ damage) / Wand (½ cooldown), applied live; gold
  finally has a sink.
- **Defensive loading**: visible error on manifest failure, skip-on-missing GLBs, null-safe
  `place()`.
- Fixed a fatal brace imbalance (dropped `if(this.exitTarget){`) that had frozen the loading
  screen; established the ESM `node --check` discipline that catches it.

---

## Session changelog (v12 → v13) — performance pass (L3/L4 lag)

Diagnosis first (verified in code, not guessed): the L3/L4 lag was **not** mainly the flame
lights (already pooled) — it was (a) the torch's 6-face cube **shadow pass** redrawing every
floor tile and every skinned creature each frame, (b) **all creatures** (`frustumCulled=false`)
rendering + skinning + mixer-updating every frame regardless of distance (~77 on L4), and
(c) the pickup/portal **PointLights changing the scene light count** at runtime → scene-wide
shader recompile (the multi-second freeze class), worst on L3/L4 where the material set is
biggest.

Changes, in impact order:
1. **Creature render culling** (main loop + a one-condition gate on the alive-branch
   `mixer.update` in all 4 creature classes). Hidden creatures cost ~nothing on GPU (main
   pass AND all 6 shadow faces) and skip bone animation on CPU. Threshold scales with camera
   zoom so a pulled-back camera still shows the whole faintly-moonlit level — no visible
   pop-in. AI/aggro/pathing unaffected.
2. **Fixed light count, for real**: lantern/scroll/portal icon PointLights → additive glow
   sprites. No more recompile hitch on pickup collect or portal open/close. (Side effect:
   the portal's click target is a bit more generous — the sprite raycasts. Arguably better.)
3. **Shadow diet**: floors/slabs no longer cast (nothing is under a floor); torch shadow far
   4000→2800; PCFSoft→PCF (point-light PCFSoft is one of three.js's priciest fragment paths;
   in a dark flickering dungeon the difference is nearly invisible — one-line revert if the
   look bothers you).
4. **Static matrix freeze** for all `place()`/`mountCandle` output — stops three.js
   recomposing thousands of static local matrices per frame. See the caveat above.
5. **pixelRatio 2→1.5** and `powerPreference:'high-performance'`. The ratio cap is the one
   change with a visible cost (slight softness on 2x-DPI displays); it's a commented one-line
   knob at the renderer setup.

**Not done, next big lever if still needed**: merge/instance the static level geometry.
Floors use 5 protos and walls ~3; an `InstancedMesh` per (geometry,material) pair would
collapse a few thousand draw calls into ~a dozen. Safe because *nothing raycasts the level
geometry* (click-to-move uses a math ground plane; pickers target specific objects) — but
it interacts with the shared-prototype-geometry disposal rule above, so do it in its own
session with before/after draw-call counts (`renderer.info.render.calls`).

Cheap remaining knobs if a low-end machine still struggles: `MAX_FLAME_LIGHTS` 10→8 and
`DYN_LIGHT_POOL_SIZE` 6→4 (every lit fragment loops over every light), `antialias:false`.
