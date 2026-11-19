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
- **Creatures** (`src/fauna.js`, procedural): 20 cinder skitters (harmless, herd, flee within 20 m, 1 hp) and 7 magma hounds (roam → stalk 1.4 s → chase 14.5 m/s, bite 6 hull every 1.5 s, 5 hp; rammed above 9 m/s for 2 dmg; skitters die to a ram). A pool keeps them 75–150 m from the rover, mostly ahead; despawn beyond 230 m; never in lava, within 90–95 m of the vault, or (hounds) in the canyon. Hidden while the Titan fight runs.
- Bolts test Titan → creatures/rocks (nearest) → ground; the aim ray does the same so bolts converge on what is under the crosshair. Crosshair hit marker covers creatures and rocks (`S.hitMark`).
- **Hull mends** 2.5/s after 6 s without damage, never in the Titan fight.
- Dev-only: `window.__relic.camera` and `surface.debug.mesh` were exposed for close-up test shots.

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
- SFX in `public/sfx/`: laser, boom, boom-big, cannon, titan-roar (ElevenLabs); raw takes in `assets-src/sfx-raw/`.
- Spend log: `tools/spend-log.md`. Meshy 105 credits used (about 1,015 left); ElevenLabs about 234 credits; fal unused. Keys: fal in `tools/.env` (git-ignored); Meshy and ElevenLabs are MCP servers.

## Known issues / loose ends

- Nothing is committed: the whole `opengamejam/` folder is untracked in the `jsgames` repo.
- Thalor and Vireo landings still show the Phase III placeholder card (no surfaces yet).
- Wayshards are earned but there is nothing to spend them on yet (Lantern Workshop is step 5).
- Mouse feel for Phase I flight has never been tested by the owner (they played on gamepad/touchpad).
- The rover HUD's "THREAT"/raider systems do not appear on the surface (no raiders on planets yet).
- `docs/GAMEPLAN.md` is the source of truth for the plan; keep it updated as decisions change.
