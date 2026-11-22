# The Last Wayline — Working Plan

This is the plan we build from. The owner's `gameplan.md` (the long production brief at
`\\LAPTOP-ILH3Q3AS\RussOldPC\OpenGames\The Last Wayline\gameplan.md`) is the **source of lore
and ideas**, and it is a loose suggestion: anything in it can change if the game needs it. When
the two disagree, this file wins, and this file changes whenever the owner decides something new.

*Last updated: 2026-11-20. Session handoff: `docs/HANDOFF.md`.*

---

## 1. Decisions so far

| Topic | Decision | Notes |
|---|---|---|
| Title | **The Last Wayline** (not final) | Was "Relic Run" |
| Structure | Three phases: **I** cockpit flight, **II** chase-cam formation fights, **III** rover on the planet surface | Phase III uses the brief's planet content (armory sites, vault, guardian) |
| Planet order | **Any order.** WREN's memories unlock by **count**: 1st relic = *Purpose*, 2nd = *Truth*, 3rd = *Fate* | Lantern's lane dies after the **first** relic, whichever planet it is |
| Scope | As much of the brief as we can, **in steps** (Section 6). Each step must ship playable | Cut features rather than ship them thin |
| Art | **In between stylized and realistic**: painted, readable, chunky silhouettes, lit by real lights and shadows, matte materials, no cel outlines | Current ship and raider models are the reference for this look |
| Raider look | **Keep the current raider** (plum, crimson, gold). It is the Scrap Crown fighter | Variants by tint and emissive, not new models, unless a new role needs a new silhouette |
| Raider difficulty | Squadrons have **threat levels**; WREN assesses them on contact; upgrades are the answer to the high ones | Section 3 |
| Dialog | Every line serves the **mission goal at that moment**: what to do, why it matters, what changed | Section 5 |
| Controls | Gamepad first, mouse and keyboard fully supported. The owner plays **Y inverted**; check the vertical sense of every new control scheme with the owner | Phase II stick/mouse vertical is the opposite of Phase I by the owner's choice |

---

## 2. Canon we keep from the brief

- **Setting:** the Veyra Cluster. The Wardens built the **Waylines** and vanished 200 years ago. A Wayline is a line of light between worlds that carries air, water and power; every colony lives on one. Warden **relays** (rings along the line) keep the light steady. Every line runs to one place the charts call **the Heart**. The lines are going dark: **the Quiet**. (Owner, 2026-11-19: never call them "gate roads".)
- **The player:** a Runner flying the *Wayfarer* out of **Lantern Station**, which is about to be cut off.
- **WREN:** the ship's navigator AI. She was built by the Wardens, and learns over the game that she *is* the restart, and that it will overwrite her.
- **The three worlds and relics:**
  - **Kessa:** fire and foundries. The **Ember Core** (power). Natives: **Forgekin**.
  - **Vireo:** violet fog and floating rock. The **Veil Lens** (memory / sight). Natives: **the Hollowed**.
  - **Thalor:** ice and rings. The **Rime Compass** (direction). Natives: **Sentinels**.
- **The Scrap Crown:** the Raiders, led by **Dagan "Ashjaw" Orrick**, with the ace **Vex Calloway**. Orrick wants to restart one lane and hold every colony hostage.
- **Lantern Station:** Dockmaster **Ilsa Brandt**. It has no world of its own; everything it breathes comes down its Wayline from the Heart. The line dies the moment the first relic leaves its vault (WREN: "I don't think that was chance"), and Lantern goes on reserve air.
- **Endings:** **Restart** (WREN becomes the road) or **Sever** (WREN lives, the roads die). Surrender is a stretch goal.

---

## 3. Raider threat levels

Every squadron in Phase I has a **threat level, 1–5**, shown on the scanner and the target bracket. On contact WREN assesses it ("Scrap Crown wing. Threat three. They brought lancers.") and suggests an answer if the player has one.

| Level | Where | Phase II fight | Reward |
|---|---|---|---|
| 1 | Open space near the start | 2 waves of raiders, no boss | Low Wayshards |
| 2 | Lanes between planets | 3 waves, lancers, no boss | Low–medium |
| 3 | Planet approaches | 3 waves + **Warbreaker** | Medium + chance of a ship part |
| 4 | After the first relic (Orrick hunts you) | Faster divers, **Hexers** (EMP, weapon jam), Warbreaker with escorts | High |
| 5 | **Vex Calloway's** wing; the Final Gate | Vex as a named ace (dodges, taunts), Warbreaker Mk II | Unique part, story beat |

- Higher levels change **how they fight**, not just their health: new enemy roles (Hexer, Reaver with boarding hooks), denser fire patterns, smarter divers.
- **Upgrades are the counter.** Each ship upgrade beats one raider behaviour: e.g. Cinder Repeater burns through Warbreaker armour, Veil Mantle breaks Hexer locks, Rime Railgun pierces dive lines.
- Threat in the system rises with relics held (Orrick knows what you carry), so the cluster gets harder as the story escalates.
- A fight can be **declined**: slip past at cruise, or out-run them. High-level fights are a choice, not a wall.

---

## 4. Planets (Phase III, rover)

Each planet is one rover expedition, landing at a site the player chooses from orbit.

1. **Landing zone:** a safe start. WREN states the goal in one line.
2. **Armory sites (up to 3):** found by exploring. Each has a small challenge and a **WREN memory fragment**. One holds the planet's **gate module** for the rover.
3. **The Vault:** needs that gate module:
   - **Kessa:** **Forgeplate** plating, to cross lava vents.
   - **Vireo:** **Phase Blink**, to pass veil gates.
   - **Thalor:** **Compass Trim**, to read lanes through the ice maze.
4. **The Guardian:** the boss at the vault: Foundry Titan, Hollowed Matriarch, Sentinel Prime (rover-scale versions). Each is weak to the planet's armory weapon.
5. **Relic secured:** WREN's memory beat (by count), then back to orbit.

The rover: wheels that turn and grip, suspension that handles rough ground, a turret, and **upgrades for guns, armour and speed**.

**Upgrade split:**
- **Ship upgrades** help in space against raiders (Phase I and II).
- **Rover modules** open vaults and fight natives (Phase III).
- **Relic powers** work in both (e.g. Ember Core Overdrive, Veil Lens weak-point sight, Rime Compass Waylock).

**Currency:** **Wayshards** (the current "salvage" gets renamed). They come from raider fights, caches and natives, and buy Mk II/III upgrades at Lantern.

---

## 5. Dialog rules

- **Every line serves the mission goal at that moment.** It tells the player what to do, why it matters, or what just changed. Flavour rides along; it never replaces the goal.
- Short and human. Serious sci-fi with warmth and dry humour. No grandiosity.
- **WREN** grows over the game: clipped and formal (0 relics) → warmer (1) → hesitant (2) → human and vulnerable (3). The same line can have three readings.
- **Orrick** speaks rarely, and each transmission changes what the player wants to do (threat, offer, grievance).
- **Ilsa** gives the stakes in numbers ("fourteen days if the scrubbers hold").
- **Vex** taunts in fights and gives tactical tells the player can learn from.
- Combat barks are 2–4 words and must match what is on screen.
- Lines are written **when the mission they belong to is built**, then voiced.

---

## 6. Build steps

Each step ends playable, with the owner testing before the next.

| Step | Content | Status |
|---|---|---|
| 1 | Phase I flight, cockpit, three planets, raider squadrons, entry sequence | **Done** |
| 2 | Phase II formation fight: 3 waves, Warbreaker, dodge, rewards, generated ship models and SFX | **Done**, owner tested |
| 3 | **Raider threat levels** + WREN assessment + Wayshards rename + canon names in dialog | **Done** |
| 4 | **Phase III vertical slice on one planet** (Kessa), in three parts: **4a** rover driving, landing and lift-off; **4b** armory site, Forgeplate module, vault behind the lava vents; **4c** guardian, Ember Core, memory #1 | 4a, 4b done. 4c built 2026-11-19 (turret, Foundry Titan, Ember Core, memory #1 "Purpose"), awaiting owner playtest |
| 4d | **Opening** (owner, 2026-11-19): title scene, PLAY/CONTINUE/NEW GAME/SETTINGS, save, intro card, undock from Lantern, WREN's step-by-step flight tutorial, radio from Ilsa and Orrick, cruise lore beats, planets spread for ~45 s cruise trips, Lantern's line dies after relic 1. Voiced (WREN, Ilsa, Orrick) | **Done**, owner approved 2026-11-20 |
| 5 | **Lantern Station** hub: dock back at Lantern, Ilsa briefing, Workshop (upgrades for Wayshards), the air clock on screen | **Built 2026-11-20**, awaiting owner playtest. Air clock at zero is not (yet) a game over: owner to decide |
| 6 | The other two planets (reusing the Phase III systems with their own terrain, natives, gate and guardian) | Thalor 6a done (Rime Shielding 300, owner approved). 6b built 2026-11-21: Rime Spire, Compass Trim, ice maze with whiteout, Thalor creatures (rime crawlers, shardbacks). 6c built 2026-11-21: Sentinel Prime fight, Rime Compass, WREN memory Truth. Vireo 7a built 2026-11-21: Veil Sounder gate (300), mesas over the veil, land bridges, floating rock, light gravity (owner chose low gravity and 300). 7b built 2026-11-21: veil wall round the vault, Veil Shrine with Phase Blink, the Hollowed and veil drifters, Warden launch ramps (owner liked jumping in low gravity). 7c built 2026-11-21: Hollowed Matriarch (blink through her veil waves, shoot her heart when solid), Veil Lens, WREN memory 3 FATE voiced. All three worlds are now playable end to end |
| 7 | Ship upgrades that counter raider levels; Hexers, Reavers, Vex encounters | |
| 8 | Voices: WREN (three stages), Orrick, Ilsa, Vex; music per planet | Started in 4d: WREN = Melz, Ilsa = Cass, Orrick = Obsidian (ElevenLabs library voices) |
| 9 | Final Gate run, *Last Light* boss, ending choice | |
| 10 | Polish, performance, accessibility, trailer, jam submission | |

Order can change. Voices and music can start earlier where a step needs them.

---

## 7. Asset rules

- Generate on the owner's accounts; the owner has pre-approved spend. Report the totals and stop when a balance runs low.
- Prove one asset in the game before generating a batch of that kind.
- Every paid job is logged in `tools/spend-log.md`. Source images live in `assets-src/`; shipped files live in `public/`.
- Models: Meshy image-to-3D from an approved concept image, smart topology (4–8k triangles for ships and enemies), textures shrunk to 1024 with `tools/glb-texture.mjs`.
- Sounds: ElevenLabs, two takes. Pick the take whose attack lands on the event, trim, fade and normalise.
- No franchise names in prompts. No text baked into images.
