# The Last Wayline — Session Handoff

*Updated 2026-11-20. Read this first, then `docs/GAMEPLAN.md` (the working plan).*

## Where we are

| Step | What | Status |
|---|---|---|
| 1 | Phase I: cockpit flight, three planets, raider squadrons | Done |
| 2 | Phase II: chase-cam formation fights (waves, Warbreaker, dodge) | Done, owner tested ("feels good") |
| 3 | Raider threat levels 1–5, WREN assessments, Wayshards, canon names | Done |
| 4a | Rover driving on Kessa (raycast vehicle), landing pad, lift-off | Done, owner approved the driving; Meshy rover body fitted |
| 4b | Magma Canyon, geysers, Forge Gate, Forgeplate pickup, vault vent field | Done, owner re-tested ("fine") |
| 4c | Rover turret, Foundry Titan fight, Ember Core, WREN memory #1 | Done, owner played it through (Titan stays as is) |
| 4d | Opening: title scene, menus, save, intro, Lantern undock, WREN tutorial, radio, cruise lore, spread planets, voices | Done. Owner approved 2026-11-20: voice levels, tutorial pace, voice casting, cruise distances, nebula sky, cockpit, surface effects, performance on the weak laptop |
| 5 | Lantern hub: docking, Ilsa's briefings, Workshop, air clock, scrubber parts, saves on events | **Built 2026-11-20, headless-tested, awaiting owner playtest** |

Then: 6 the other two planets, 7 ship upgrades vs raider levels (the Workshop exists now), 8 voices and music, 9 Final Gate and endings, 10 polish and jam submission (see GAMEPLAN §6).

## First thing next session

0. **Ask the owner to play step 5.** Suggested path: take the Ember Core on Kessa, lift off and hear the line die. WREN sets the nav to LANTERN. Cruise home (cruise drops out ~4.4 km from Lantern), fly to the bay mouth, and DOCK AT LANTERN. In the hub: hear Ilsa's briefing, buy something in the WORKSHOP, buy SCRUBBER PARTS, then LAUNCH. Quit in a few places (on Kessa, docked, in flight) and CONTINUE each time. Ask:
   - Does CONTINUE now bring you back where you left off? (Owner bug 2026-11-20: landing on Kessa, quitting and continuing restarted the tutorial. Fixed, see below.)
   - Does docking feel right? WREN flies you in over 6–10 s. Is the hub view good?
   - Are the upgrade prices and effects right (`src/workshop.js`)? Is the Wayshard income right? It comes from fights, plus 4 per hound, 1 per skitter and 120 for the Titan.
   - **Air clock:** 14 days at 5 minutes of play per day (about 70 minutes). It ticks only in play, not in menus or while docked. Scrubber crates add 2 days each and cost 50, 75, 100… Wayshards. **At zero it is NOT a game over**: Ilsa says the outer ring is sealed and play goes on. Ask the owner whether zero should fail the run or feed the ending (step 9).
   - How do the 23 new voice lines (Ilsa and WREN) sound?

### How step 5 works (Lantern hub, owner request 2026-11-20: "Proceed with Lantern Station. Let's see what you come up with.")
- **The save fix:** the tutorial's LAND lesson only finished while in flight. Landing switches to the entry state first, so the lesson never finished, and quitting on Kessa restarted the tutorial. `startEntry` now calls `tutorial.complete()`.
- **What the save holds:** it records where we are (`G.where`: `space`, `hub` or `surface`, plus `surfaceId`/`surfaceOut`). CONTINUE puts you back on that landing pad, in the hub, or at the ship's pose.
- **Mid-tutorial saves:** from the radio call on, a save keeps the lesson (`tutorial.checkpoint` / `resume(k)`).
- **When it saves:** `autosave(loud)` in main.js.
  - Loud saves show "◆ PROGRESS SAVED" bottom right. They happen on events: landing, the Forgeplate, a relic, a fight won, lift-off, docking and purchases.
  - Quiet saves happen every 10 s in flight and every 15 s on a surface.
- **Nav:** after the tutorial, LANTERN is a fourth nav target (Tab/LB cycles the three worlds and Lantern).
  - The HUD puts a gold "LANTERN DOCK" diamond on the bay mouth. The scanner and the NAV screen show it too.
  - After relic 1 the nav switches to Lantern by itself (line `dock-home`).
- **Standing objective** (`updateObjective` in main.js, owner report 2026-11-20: "could not find the Lantern Station... no direction or guidance"). After the tutorial, a gold line at the top of the canopy always says what is next. Until the dark briefing at the dock it reads RETURN TO LANTERN, or SET NAV TO LANTERN plus the key if the nav is elsewhere. The LANTERN DOCK marker shows the whole way home, whatever the nav target. Then it reads RECOVER THE <relic> · <world>, or NEXT RELIC · ... · SET NAV. WREN nudges every 2 min on the way home when more than 20 km out. The nav switches to Lantern the moment the line dies, not after the dialogue, which a quit could cut short.
- **Cruise** drops out in Lantern's traffic zone once the tutorial is done (1.8 km plus the usual 2.6 km margin).
- **Docking:**
  - The DOCK AT LANTERN prompt appears within 1.5 km of the bay mouth, when you're in front of it (`station.local(...).z < BAY_MOUTH_Z`).
  - The first time, WREN explains docking (`dock-approach`, inside 4.5 km).
  - Accepting enters state `docking`: WREN flies a bezier from the ship to the bay axis, then down the bay nose first (6–10 s, eased). The clamps thunk (`sfx.clamp`), the screen fades, and `openHub` runs.
  - Behind the fade the ship is put in the dock pose facing out (the cradle turns it).
- **The hub view** (`src/hub.js`, #hub in index.html): the camera sits behind the Wayfarer's left quarter in the bay, looking out of the mouth at space (`camOffsets` in hub.js).
- **The hub panel:**
  - A status line: Wayshards, hull, WAYLINE LIVE or RESERVE AIR, and relics.
  - BRIEFING · ILSA (replays the latest briefing), WORKSHOP and LAUNCH.
  - A radio box showing the line being spoken.
- **Docked:** docking fully repairs hull, shield and boost. Pause works in the hub. The canopy HUD canvas is hidden while docked.
- **Briefings** (`BRIEFINGS` in story.js): each plays once when it applies, queued in order:
  - `first`: no relics yet.
  - `dark`: the line is dead; Ilsa gives the 14-day count.
  - `r2`: two relics.
  - `r3`: three relics; it points at the Final Gate, which is step 9.
  - Otherwise a short welcome-back line plays.
- **Workshop** (`src/workshop.js`): the `UPGRADES` table, 2 tiers each. Tiers are stored in `G.upgrades`, alongside `forgeplate` and `turretTrained`.
  - Wayfarer:
    - Ablative Plating: fight damage ×0.8 / ×0.65.
    - Shield Capacitor: regen 9 → 13 → 18 per second, regen delay 4 → 3 → 2.2 s.
    - Twin Feed Repeater: fire interval 0.13 → 0.108 → 0.093 s.
    - Boost Cell: boost lasts 4.5 → 6.5 → 9 s.
  - Rover:
    - Armour: damage ×0.8 / ×0.65, applied to any hull loss each frame.
    - Autocannon Bore: bolt damage ×1.35 / ×1.7.
    - Lance Heat Sink: heat ×0.72 / ×0.5.
  - Each system reads its upgrades through `eff(G.upgrades, id, key)`. The fight gets `mods` when it starts; the ship gets `boostSecs` and `boostRecharge` (`applyUpgrades`); the surface reads its own.
  - Scrubber parts appear in the Workshop once Lantern is dark.
- **Air clock** (`updateAir` in main.js, #airclock):
  - It sits top centre once the line is dead, saved as `G.air`.
  - At 3 days or less it turns red and pulses, and Ilsa says `air-low`.
  - At 0 it reads "OUTER RING SEALED", and Ilsa says `air-out`.
- **Station:** the bay has wall ribs, roof beams, cargo, floor stripes and a lit pad ring. They're merged with `bakeStatic`, have no collision, and stay off the flight lane. The bay lamp turns emergency red when the line is dead.
- **Tests:** `window.__relic` also has `hub, startDocking, openHub, startEntry, toTitle, launchFromHub, autosave`. Headless captures of the hub sometimes showed stale canopy-HUD pixels. Hiding the HUD canvas while docked settles that either way.

### How the opening works (4d, owner request 2026-11-19)
- **Title** (`index.html` #title, `main.js` `titleMenu`): a live 3D scene: `titleRig` holds the Wayfarer (`player.glb`) with the rover slung under it, off Lantern Station; `TITLE` sets the camera; post mode `title` has no cockpit. Menu: PLAY (no save) or CONTINUE + NEW GAME (save exists; NEW GAME asks to confirm, CANCEL first), SETTINGS (its own panel, also reachable from pause), CONTROLS.
- **Save** (`src/progress.js`, localStorage `wayline-progress-v1`): see "How step 5 works" for what it holds and when it saves.
- **Intro** (#intro): three lines on black on the wall clock, any key skips, then the cockpit in Lantern's dock bay.
- **Lantern Station** (`src/station.js`): procedural: spindle, habitat ring, dock bay (below the ring plane, opens toward -Z, clamps), the lantern crystal on top and **Lantern's Wayline**: an additive beam to `HEART` (`data.js`) that widens with distance so it stays visible as a thread, with cargo pulses flowing home and 8 relay rings. Ship-vs-station collision (spindle, ring, bay slabs). `setLineAlive(false)` fades it (after relic 1). The station's lamps are `VLight`s served by a 3-light pool in the space scene.
- **Story** (`src/story.js`): `LINES` is the whole voiced script (34 lines, id -> [speaker, text]); `public/vo/<id>.mp3` is each take, all normalised to -18 LUFS (ffmpeg gain + limiter; raw takes ranged -33 to -13). The radio chain (drive 1.4, gain 0.62) was measured offline to land at WREN's level; the first version ran radio ~8 dB hot and clipped (owner report 2026-11-20). `createStory` queues lines, plays the voice (radio speakers through a band-pass + drive + hiss in `audio.js playVoice`), times subtitles to the take, waits up to 2 s for a take still loading, ducks the engine, and runs on the wall clock (holds in menus). `say(text)` still works for unscripted WREN lines (text only, dropped if stale).
- **Tutorial** (`createTutorial`): one lesson at a time, each waits for the action (latched, so doing it early counts) and for WREN to finish: throttle out of the bay -> steer through a ring -> roll a full turn -> "that's Lantern's Wayline" (HUD tags the line) -> boost through a ring -> Ilsa's radio call (the Quiet; the three vaults; "Kessa's closest") -> nav target Kessa -> face it -> cruise -> on the trip: cruise tip, **Orrick's broadcast**, then RUST scouts drop us out of cruise and WREN teaches raider encounters (why cruise dropped, the threat tag, engage or steer wide; owner asked 2026-11-20) and answers how it ended (won / slipped past) -> cruise again (Wardens lore) -> "That's Kessa" -> landing ends it. HUD shows the task with its key (pad or keyboard). Pause has SKIP TUTORIAL. `tutorial.jump(k)` is a test hook.
- **Distances** (`data.js`): Lantern at the origin; Kessa, Thalor, Vireo ~110,000 u from it and ~190,000 u apart (cruise 3,400 u/s: ~35 s from Lantern, ~55 s world to world). Squadrons sit on the routes (level 1 out of Lantern, 2 between worlds, 3 on each approach). Camera far plane 420,000, near 1.
- **Lore during travel:** one beat per cruise trip, 7 s in, never over other talk (`LORE` in story.js: relays, Orrick's taunt after a relic, Ilsa's "only light they knew" once Lantern is dark, the Runners, the Core humming, the Heart).
- **After relic 1:** back in orbit, Lantern's line fades out and Ilsa + WREN call it (lines `r1-dark-*`). The air clock starts then (step 5).


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
- **Canyon ridge hounds (owner, 2026-11-19: "none on that narrow causeway"):** `RIDGE_PACKS` puts 2/3/2/3 hounds on the Magma Canyon ridge road at 80/205/338/462 m, between the geysers. Hounds may walk the ridge (`d < half - 0.8`) but not the trenches or walls. Erupting vents now scald creatures too (3 damage, 1.2 s apart), so a hound chasing you through a vent can die there. 38 homed hounds in total. Owner on the rest (2026-11-19): leave Titan difficulty as is, turret aim is good, sounds OK for now.
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
| `src/station.js` | Lantern Station, its Wayline beam and relays, station collision, dock pose |
| `src/story.js` | The voiced script (`LINES`), line queue and subtitles, the flight tutorial, cruise lore beats, Ilsa's hub briefings (`BRIEFINGS`) |
| `src/progress.js` | Save slot: load, save, clear (what it holds: see "How step 5 works") |
| `src/hub.js` | Lantern hub: the docked view, briefings, Workshop menu and purchases |
| `src/workshop.js` | Upgrade table (tiers, costs, effects), scrubber parts, `tier` / `eff` helpers |
| `public/vo/` | One mp3 per script line (ElevenLabs eleven_v4; WREN = Melz, Ilsa = Cass, Orrick = Obsidian) |

## Assets and spend

- Models in `public/models/`: raider, player (the *Wayfarer*), rover, forgegate, crate. Concepts are in `assets-src/`.
- Sky: `public/sky/nebula.jpg` (168 KB) is a fal FLUX dev 2048x1024 equirectangular nebula (`tools/gen-skybox.mjs`, dry run unless `--go`; raw + request record in `assets-src/sky-raw/`). `world.js` maps it with a tilt, cross-fades the wrap seam over 6% of the width, fades the poles, and falls back to the procedural sky until it loads. Owner has not seen it yet.
- SFX in `public/sfx/`: laser, boom, boom-big, cannon, titan-roar (ElevenLabs); raw takes in `assets-src/sfx-raw/`.
- Spend log: `tools/spend-log.md`. Meshy 105 credits used (about 1,015 left); ElevenLabs about 4,080 credits this month (SFX plus 80 voice lines; the account had about 30,700 of 40,000 monthly characters left on 2026-11-20); fal about $0.075 (one sky image). Keys: fal in `tools/.env` (git-ignored); Meshy and ElevenLabs are MCP servers.

## Known issues / loose ends

- Commits go to JSgames main together with the built `dist/` (that is the deploy), and only when the owner asks.
- Thalor and Vireo landings still show the Phase III placeholder card (no surfaces yet).
- Mouse feel for Phase I flight has never been tested by the owner (they played on gamepad/touchpad).
- The rover HUD's "THREAT"/raider systems do not appear on the surface (no raiders on planets yet).
- `docs/GAMEPLAN.md` is the source of truth for the plan; keep it updated as decisions change.
