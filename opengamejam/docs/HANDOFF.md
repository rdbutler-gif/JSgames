# The Last Wayline — Session Handoff

*Updated 2026-11-19. Read this first, then `docs/GAMEPLAN.md` (the working plan).*

## Where we are

| Step | What | Status |
|---|---|---|
| 1 | Phase I: cockpit flight, three planets, raider squadrons | Done |
| 2 | Phase II: chase-cam formation fights (waves, Warbreaker, dodge) | Done, owner tested ("feels good") |
| 3 | Raider threat levels 1–5, WREN assessments, Wayshards, canon names | Done |
| 4a | Rover driving on Kessa (raycast vehicle), landing pad, lift-off | Done, owner approved the driving; Meshy rover body fitted |
| 4b | Magma Canyon, geysers, Forge Gate, Forgeplate pickup, vault vent field | Done, owner re-tested ("fine") |
| 4c | Rover turret, Foundry Titan fight, Ember Core, WREN memory #1 | **Built 2026-11-19, bot-tested headless, awaiting owner playtest** |

Then: step 5 Lantern Station hub, 6 the other two planets, 7 ship upgrades vs raider levels, 8 voices and music, 9 Final Gate and endings, 10 polish and jam submission (see GAMEPLAN §6).

## First thing next session

1. Ask the owner to play 4c on gamepad (Y inverted): drive to the vault with Forgeplate, ENTER THE VAULT, fight the Titan, take the Ember Core. Things to ask:
   - **Aim vertical sense**: owner said it was wrong; right-stick term flipped 2026-11-19 (`-inp.lookY` in the surface camera). Reconfirm. Turret also lowered onto the cab roof (TURRET_POS y 0.6, z 0.15) after "floating" note.
   - Fight length and difficulty (core HP 60, three stages; each vent can take at most one stage), shell damage, slam.
   - Do the cannon and roar samples sound right (`public/sfx/cannon.mp3`, `titan-roar.mp3`)?
   - **Kessa wildlife + shootable rocks (added 2026-11-19 on owner request):** do hounds feel fair (bite 6, 5 hp), are there enough/too many creatures, is the causeway clear now?
2. Then step 5, Lantern Station (GAMEPLAN §6).

### How 4c works
- **Turret** (`surface.js`): `input.gun` = RB / left mouse / E (RT drives, Space is the handbrake). The aim ray goes through the crosshair at NDC y = `AIM_NDC_Y` (above centre so the rover never covers it). Bolts are projectiles (240 m/s) tested against the Titan's spheres, then the ground. Soft aim assist onto an open core (stronger on pad).
- **Fight camera:** in the fight, camera yaw holds its world direction while the rover turns, the view lifts (`S.aimLift`) and can look further up.
- **Titan** (`src/guardian.js`, procedural parts): rises from the vault shaft; loop idle → barrage (mortar shells with ground rings) → slam if you are within 15–20 m (shockwave ring hurts grounded rovers) → vent (chest plates open: the only time the core takes damage) → idle. Stage 2 shells leave lava pools; stage 3 the vent-ring geysers wake. A heat curtain at r 64 holds you in. Hull 0 in the fight respawns you at the arena edge with 70 hull; the Titan keeps its damage.
- **After the kill:** the Ember Core rises; TAKE THE EMBER CORE → `hooks.relic` → `relicSecured` in `main.js` sets `G.relics.kessa` and shows WREN memory by relic count (`MEMORIES`: Purpose written; Truth and Fate are placeholders). Objective becomes "Return to the Wayfarer". Landing on Kessa again after the relic skips the vault.
- The vault plateau was widened (flat to r 62) to make room for the arena; rocks are kept out to r 72.
- Test: `node tools/test/cdp.mjs tools/test/titan-bot.example.mjs` (circling bot that shoots during vents; set `S` at the top first).
- An open-chest armour hit whose line carries on into the core within 7 m counts as a core hit (the torso hit sphere encloses the core; needed after the turret was lowered).

### Kessa wildlife, rocks and roads (owner request 2026-11-19)
- **Roads:** `makeRocks` skips anything within 7 m of a causeway or the canyon ridge (`onRoad`).
- **Rocks:** big boulders (about 260) carry `idx/hp/max`; bolts test them (`rockHit`) and chip them (`hitRock`: shrink, then burst and drop collision at 0 hp, hp ≈ 2.2 × radius). Broken rocks stay broken until reload.
- **Creatures** (`src/fauna.js`, procedural): cinder skitters (harmless beetles, flee within 20 m, 1 hp) and magma hounds (roam → stalk 1.4 s → chase 14.5 m/s, bite 6 hull every 1.5 s, 5 hp; rammed above 9 m/s for 2 dmg; skitters die to a ram). Hidden while the Titan fight runs.
  - **Placement (owner, 2026-11-19):** hounds never spawn near the start. They live in packs of 2–3 on the causeway road (`PACKS`: 150/260/370/470 m along it, nearest ~195 m from the pad), leash 16 m, give up a chase 110 m from home, and stay dead until the next landing. A herd of 9 skitters lives in a "meadow" 40–60 m from the pad (ahead-left of the start view, away from the ship and both roads) and respawns there; the other 11 skitters roam 75–150 m around the rover.
  - **Target practice:** on a first landing the objective is "Target practice · shoot cinder skitters by the pad n/5" (compass ◆ SKITTERS, gun hint). Five turret kills → `upgrades.turretTrained`, victory sting, objective returns to vault/cross. Driving 220 m from the pad skips it (also sets the flag).
  - Soft aim pull onto the nearest creature within 0.06 rad (pad) / 0.025 (mouse), 4–140 m.
- Bolts test Titan → creatures/rocks (nearest) → ground; the aim ray does the same so bolts converge on what is under the crosshair. Crosshair hit marker covers creatures and rocks (`S.hitMark`).
- **Creature health bars (owner, 2026-11-19):** `drawHud` projects a bar over every wounded, visible creature within 140 m (none at full health). It scales with distance, fades out past 110 m, and is amber above half health and red below.
- **Hull mends** 2.5/s after 6 s without damage, never in the Titan fight.
- **Deaths (owner request 2026-11-19, "they just shrink"):** `src/gibs.js` bursts the body into its own meshes (biggest 14 for a hound, 7 for a skitter), which tumble, bounce on the terrain, trail fire and smoke, then sink after about 4 s. Each death adds a fireball, sparks, a smoke ball (its own normally blended `makeSmoke` points), a short pooled point-light flash, a fire that burns where the body was, and a scorch decal that follows the terrain and fades over 14 s.
- **Heat lance (owner, 2026-11-19):** the first special weapon. Owner wants a selectable special eventually, so `SPECIALS` in `surface.js` is a table and `S.special` picks one. Hold right mouse / Q / LB (`input.special`). It's a beam from the turret to the aim point (75 m reach) that burns titan core, creatures and rocks at 3 → 9 dps, ramping over 1 s on the same target. Heat fills in 3.2 s; on overheat it locks until heat drops to 0.3. The turret cannot fire bolts while the lance is on. HUD heat bar sits above the hull bar. `lanceHum` in `audio.js` is the looping sound and goes silent by itself if updates stop (pause). `onBolt(hit, ctx, n, quiet)` and `fauna.damage(c, n, quiet)` take a damage amount.
- **More hounds (owner, 2026-11-19):** `FORGE_PACKS` puts 3 + 2 hounds on the Forge Gate apron. Hounds may walk within `forge.r + 8` of the gate but still not up the canyon. `N_WILD_PACKS` 5 packs of 2–3 sit at random dry spots (over 170 m from the pad, 130 m from the vault, clear of the canyon and of each other). 28 homed hounds in total.
- **Plate objective (owner, 2026-11-19):** the "get the Forgeplate" objective no longer fires 170 m out. The player drives into the heat wall (30–56 m from the vault), gets pushed back and burned, and only then gets the objective and WREN's line about the forge.
- **Forge Gate "black wall" (owner, 2026-11-19):** `forgegate.glb` had 6 zero-length normals; real GPUs normalise them to NaN and bloom smeared the NaN pixels into a screen-filling black block as the gate came into view (headless software rendering hid it). `models.js` `fixNormals` now gives every zero normal its face normal on load, and `post.js` runs a sanitize pass before bloom that zeroes any NaN or infinite pixel.
- **Surface particles were never stepped before this** (`T.fx.update` was missing), so rock bursts, muzzle flash, geyser spray and the Titan's shells and slams had never shown. They show now, scaled by `FX_GAIN` 0.4 in `surface.js` because full strength turned into white blobs; `raw: true` on an emit skips the scaling (gibs use it). Owner has not seen any of these yet.
- Dev-only: `window.__relic.camera` and `surface.debug.mesh` were exposed for close-up test shots.

### Cockpit remodel and post chain (owner request 2026-11-19, awaiting owner look)
- `src/cockpit.js` is now built from PBR materials with procedural maps from `src/cockpit-art.js`: panel seams, rivets, wear and grime turned into albedo, roughness and normal maps, all generated on canvases.
- The cockpit has:
  - a glareshield with an amber lip and a warm light strip, plus a HUD projector and vents
  - recessed screen bezels with screws, soft keys and glass
  - side consoles with backlit keys and LEDs, guarded toggles, knobs, and a throttle quadrant
  - two live gauges (CELL = boost energy, DRIVE = speed)
  - outer consoles with breakers, a vent, a stencil and a grab bar
  - riveted canopy struts with a recessed light channel
  - canopy glass whose smudges catch the sun
- Lighting: the sun casts shadows, plus RoomEnvironment reflections at 0.26 and a RectAreaLight under the hood. `cockpit.debugSun` (test hook) overrides the sun direction.
- `src/post.js` owns the frame: world → cockpit → GTAO (cockpit only, glass hidden) → bloom → lens pass (grade, vignette, chromatic aberration, grain) → output.
  - The composer target has 4× MSAA.
  - Grade values per phase live in `LOOK`. There is still no tone curve, so lava brightness is unchanged.
  - Boost and cruise push chromatic aberration and vignette up a little.
  - `post.watch` turns AO off after 3 s below 40 fps. `?hq` in the URL pins full quality for headless captures.

### Performance pass (owner, 2026-11-19: "lags pretty bad" on an older laptop)
- **Measured before:** flight 768 draw calls (cockpit had 253 meshes, drawn for colour, shadow and GTAO); Kessa about 1,000 calls, 2,800 shadow casters (each hound was 75 meshes), 8 point lights in every lit shader.
- **Merging:** `src/bake.js` `bakeStatic(root, anchors, keep)` merges every mesh that never moves into one mesh per material under its nearest moving anchor. Cockpit 253 → 63 meshes (anchors: throttle, needles; glass kept). Creatures merge per moving part (legs, torso, head, jaw, glow). The original pieces are kept as `c.gibParts` so deaths still throw separate parts.
- **Creature LOD:** hidden past 200 m (`DRAW_R`), cast shadows only inside 70 m (`SHADOW_R`).
- **Light pool:** `src/lightpool.js`. Every surface point light is now a `VLight` (data only). `createLightPool(root, 3)` owns 3 real PointLights and gives them to the strongest, nearest virtual lights each frame. New surface point lights must be `VLight`s.
- **After:** flight 103 calls; Kessa pad 461 calls, 6 lights.
- **Graphics quality:** `QUALITY` in `main.js`.
  - HIGH: render scale 1, MSAA 4, cockpit AO, full bloom, 2048 shadows.
  - MEDIUM: 0.85, MSAA 2, no AO, half-size bloom, 1024 shadows.
  - LOW: 0.7, no MSAA, otherwise as MEDIUM.
  - `settings.quality` is auto, high, medium or low; GRAPHICS appears in the title and pause menus.
  - Auto starts HIGH (MEDIUM on an integrated GPU, judged from the WebGL renderer string) and steps down, never up, after about 2.5 s averaging over 22 ms a frame.
  - `?hq` pins HIGH (`post.pinned`). The old one-shot `post.watch` AO cut is gone.
- **Owner laptop, round 1:** Auto settled on MEDIUM and still lagged; LOW by hand was "playable, a little sluggish". Round 2 changes:
  - **Terrain:** the mesh is now an 8×8 grid of chunks in `terrain.js`. They share the vertex buffers (so `heightAt` still matches what's drawn exactly), and each has its own index and bounds, so the camera and shadow box skip unseen chunks.
  - **Boulders:** split into a 4×4 grid of InstancedMeshes; each rock keeps `r.inst` and `r.idx`.
  - **Result:** Kessa pad went from 589k to 261k triangles and from 461 to 363 calls.
  - **Low** is now render scale 0.6 with bloom at 0.35 size.
  - **Auto** now steps down when frames average over 19 ms (1/52 s) for 2 s; it used to wait for 22 ms over 2.5 s.

## Owner decisions to respect (also in GAMEPLAN §1)

- The brief (`\\LAPTOP-ILH3Q3AS\RussOldPC\OpenGames\The Last Wayline\gameplan.md`) is a loose guide; build in steps; each step ends playable and the owner tests it.
- Planets in any order; WREN memories by relic count; Lantern goes dark after the first relic.
- Art sits between stylized and realistic. Keep the current raider model.
- Dialog must serve the mission goal at that moment.
- Generate assets as needed without asking; report spend; stop when credits run low. **Don't commit until the owner asks.**
- Phase II stick/mouse vertical is deliberately the opposite of Phase I.
- Lava: the owner prefers it bright. The current value is bright orange; earlier values went white up close.

## How to run and test

- Dev server: `npm run dev` → http://127.0.0.1:5173/ . Build: `npm run build`.
- Dev-only hooks (`import.meta.env.DEV`): `window.__relic` = `{ G, ship, assault, startAssault, surface, enterSurface, step, draw, input }`. `window.__bot = (input, G) => {...}` overrides input each frame (for test pilots).
- Headless tests: `node tools/test/cdp.mjs <script.mjs>` drives headless Chrome over DevTools (no Puppeteer). A script exports `default async ({ ev, shot, sleep, key, send })`. Examples in `tools/test/*.example.mjs` (they write screenshots to a hard-coded scratch path; change `S` at the top before use). Step the game faster than real time with `R.step(1/60)` loops inside `ev(...)`.
- Model check: `/tools/modelview.html?m=<name>` renders a GLB top and side views with axes.
- Generated GLBs: Meshy output faces **−X**; `src/models.js` turns each by `yaw: -Math.PI / 2`. Shrink textures with `node tools/glb-texture.mjs <in.glb> <out.glb> 1024 4` (ffmpeg; raw files in `assets-src/models-raw/`).

## Code map

| File | What |
|---|---|
| `src/main.js` | Game states (title, flight, assault, surface, pause, events), wiring, render loop |
| `src/ship.js`, `cockpit.js`, `hud.js`, `world.js` | Phase I flight model, cockpit screens, canopy HUD, space scene |
| `src/fighters.js`, `data.js` | Squadrons with threat levels (`SQUAD_ANCHORS`, `THREAT`), planet data |
| `src/assault.js` | Phase II: waves by threat level, enemies, Warbreaker, dodge, particles (`makeParticles` is exported) |
| `src/terrain.js` | Surface heightfields (`SURFACES.kessa`), canyon carve, graded causeways, `pathInfo`/`pathPoint` |
| `src/surface.js` | Phase III: rover physics (`R` tuning), lava crust, camera, geysers, Forge Gate, vent field, missions, HUD |
| `src/models.js` | GLB loading and normalising (by length or height), `cloneModel`, `onModel` |
| `src/input.js`, `audio.js`, `ui.js`, `settings.js` | Input (pad, mouse, keys), synth and sample audio, menus, saved settings |

## Assets and spend

- Models in `public/models/`: raider, player (the *Wayfarer*), rover, forgegate, crate. Concepts are in `assets-src/`.
- Sky: `public/sky/nebula.jpg` (168 KB) is a fal FLUX dev 2048x1024 equirectangular nebula (`tools/gen-skybox.mjs`, dry run unless `--go`; raw + request record in `assets-src/sky-raw/`). `world.js` maps it with a tilt, cross-fades the wrap seam over 6% of the width, fades the poles, and falls back to the procedural sky until it loads. Owner has not seen it yet.
- SFX in `public/sfx/`: laser, boom, boom-big, cannon, titan-roar (ElevenLabs); raw takes in `assets-src/sfx-raw/`.
- Spend log: `tools/spend-log.md`. Meshy 105 credits used (about 1,015 left); ElevenLabs about 234 credits; fal about $0.075 (one sky image). Keys: fal in `tools/.env` (git-ignored); Meshy and ElevenLabs are MCP servers.

## Known issues / loose ends

- Nothing is committed: the whole `opengamejam/` folder is untracked in the `jsgames` repo.
- Thalor and Vireo landings still show the Phase III placeholder card (no surfaces yet).
- Wayshards are earned but there is nothing to spend them on yet (Lantern Workshop is step 5).
- Mouse feel for Phase I flight has never been tested by the owner (they played on gamepad/touchpad).
- The rover HUD's "THREAT"/raider systems do not appear on the surface (no raiders on planets yet).
- `docs/GAMEPLAN.md` is the source of truth for the plan; keep it updated as decisions change.
