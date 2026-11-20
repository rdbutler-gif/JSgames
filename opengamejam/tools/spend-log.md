# Asset spend log

Starting Meshy balance: 1,120 credits (2026-11-18). Each row is logged before its call starts.

| Date | Provider | Job | Est. cost | Task / request ID | Result | Running total |
|---|---|---|---|---|---|---|
| 2026-11-18 | Meshy | raider fighter concept image (nano-banana-2) | 6 cr | 01a1f1ac-482a-7142-8230-e8b7fbed4652 | assets-src/raider-concept.png, accepted | 6 cr |
| 2026-11-18 | Meshy | raider 3D, image-to-3d meshy-t2 4k tris + meshy-n1 texture | 15 cr | 01a1f1ac-dec4-71a1-9511-d54495955326 | public/models/raider.glb (3.2 MB) | 21 cr |
| 2026-11-18 | Meshy | player ship concept image (nano-banana-2) | 6 cr | 01a1f1ac-e189-728e-9a23-4fdd40421b00 | assets-src/player-concept.png, accepted | 27 cr |
| 2026-11-18 | Meshy | player ship 3D, image-to-3d meshy-t2 5k tris + meshy-n1 | 15 cr | 01a1f1ae-78ab-7431-968f-d74449c35c82 | public/models/player.glb (3.0 MB) | 42 cr |
| 2026-11-18 | ElevenLabs | SFX x3 (laser, boom, boom-big), 2 takes each, eleven_text_to_sound_v3, flow cXaLksmBbeIQIdNN9EK7 | 100 cr ($0.02) | sessions in flow | public/sfx/laser.mp3, boom.mp3, boom-big.mp3 (take A of each) | EL 100 cr |
| 2026-11-18 | Meshy | rover body concept image (nano-banana-2) | 6 cr | 01a1f1f8-8b94-7270-87a8-8704c49484f6 | assets-src/rover-concept.png, accepted | 48 cr |
| 2026-11-18 | Meshy | rover body 3D, image-to-3d meshy-t2 6k tris + meshy-n1 | 15 cr | 01a1f1f9-0c0d-76e3-9352-d4faf034fb1b | public/models/rover.glb (450 KB after shrink) | 63 cr |
| 2026-11-18 | Meshy | Forge Gate concept image (nano-banana-2) | 6 cr | 01a1f207-f3b7-715e-80cf-fe814d13e145 | assets-src/forgegate-concept.png, accepted | 69 cr |
| 2026-11-18 | Meshy | armory crate concept image (nano-banana-2) | 6 cr | 01a1f207-f54d-70ab-a48f-f70f2bcf8a7e | assets-src/crate-concept.png, accepted | 75 cr |
| 2026-11-18 | Meshy | Forge Gate 3D, meshy-t2 7k + meshy-n1 | 15 cr | 01a1f208-c635-74ef-8bb6-891cb3f3b40b | public/models/forgegate.glb (616 KB) | 90 cr |
| 2026-11-18 | Meshy | armory crate 3D, meshy-t2 2.5k + meshy-n1 | 15 cr | 01a1f208-c93e-77e3-b4ef-63bbe3dca882 | public/models/crate.glb (408 KB) | 105 cr |

**Totals 2026-11-18:** Meshy 105 credits (balance about 1,015). ElevenLabs 100 credits. fal $0.
| 2026-11-19 | ElevenLabs | SFX: rover autocannon shot, eleven_text_to_sound_v3, 4 takes, flow cXaLksmBbeIQIdNN9EK7 | 67 cr | node yXhZVVz6eBoJKvGoojQ5 | public/sfx/cannon.mp3 (take u5DRMp1E, trimmed); raw takes in assets-src/sfx-raw/ | EL 167 cr |
| 2026-11-19 | ElevenLabs | SFX: Foundry Titan roar, eleven_text_to_sound_v3, 4 takes, flow cXaLksmBbeIQIdNN9EK7 | 67 cr | node fb4RGwXzWNQ5QsaCjp4Z | public/sfx/titan-roar.mp3 (take 4WLK9V5k); alt take in assets-src/sfx-raw/ | EL 234 cr |

**Totals 2026-11-19:** ElevenLabs +134 credits (about 234 total). Meshy unchanged (about 1,015 left).
| 2026-11-19 | fal | space sky panorama A, fal-ai/flux/dev 2048x1024, seed 7104 (tools/gen-skybox.mjs) | ~$0.075 | 01a1f4e7-8376-76b2-8360-2ef9e77a162f | assets-src/sky-raw/skyA.png, accepted -> public/sky/nebula.jpg | fal ~$0.075 |
| 2026-11-19 | ElevenLabs | VO probe: WREN 't-hello' (voice Melz y66JgmQLcHTfsKiZJM5q), eleven_v4, 1 take | ~60 chars | | | |
| 2026-11-19 | ElevenLabs | VO probe result: t-hello, 60 cr, 4.4 s, flow cMPVKLNH5kRKNqmCKqLh, gen Spzc4VNGKIhGo4FM2ZM8 | 60 cr | | public/vo/t-hello.mp3, accepted | EL 294 cr |
| 2026-11-19 | ElevenLabs | VO batch: remaining 33 script lines (src/story.js LINES), eleven_v4, 1 take each. WREN = Melz y66JgmQLcHTfsKiZJM5q, Ilsa = Cass gOZRcEzY40chlRuMDmLV, Orrick = Obsidian QjEdRoRdZC2i3ncmFpNy | ~2,100 cr (1 cr/char) | flow cMPVKLNH5kRKNqmCKqLh | | |
| 2026-11-19 | ElevenLabs | VO batch result: 33 lines, 1 take each, all downloaded to public/vo/<line id>.mp3 (34 files with the probe, 3.1 MB) | 2131 cr | flow cMPVKLNH5kRKNqmCKqLh | accepted (owner has not heard them yet) | EL ~2425 cr |

**Totals 2026-11-19 (VO):** ElevenLabs +2191 credits for voice (34 lines, about $0.44). The account showed 5,220 of 40,000 monthly characters used before the batch.
| 2026-11-20 | ElevenLabs | VO: 5 WREN raider-lesson lines (t-raid-1..3, t-raid-won, t-raid-skip), Melz y66JgmQLcHTfsKiZJM5q, eleven_v4, 1 take each | 399 cr (75+114+104+52+54) | flow cMPVKLNH5kRKNqmCKqLh | accepted; all takes then normalised to -18 LUFS (ffmpeg gain + limiter), originals kept outside the repo | EL ~2,590 cr this month |
| 2026-11-20 | ElevenLabs | VO: 23 Lantern-hub lines (dock-*, hub-*, air-*; src/story.js), eleven_v4, 1 take each. Ilsa = Cass gOZRcEzY40chlRuMDmLV, WREN = Melz y66JgmQLcHTfsKiZJM5q. Account at 7,810 / 40,000 chars before | ~1,700 cr (1 cr/char) | flow cMPVKLNH5kRKNqmCKqLh | | |
| 2026-11-20 | ElevenLabs | VO batch result: 23 Lantern-hub lines, 1 take each, normalised to -18 LUFS -> public/vo/<line id>.mp3; raw takes kept outside the repo | 1,488 cr | flow cMPVKLNH5kRKNqmCKqLh | accepted (owner has not heard them yet) | EL ~4,080 cr this month |
| 2026-11-20 | ElevenLabs | VO: 3 Thalor ring-storm lines (thalor-storm-1/2 WREN Melz, hub-rime Ilsa Cass), eleven_v4, 1 take each | ~270 cr | flow cMPVKLNH5kRKNqmCKqLh | | |
| 2026-11-20 | ElevenLabs | VO result: thalor-storm-1, thalor-storm-2, hub-rime, normalised to -18 LUFS -> public/vo/ | 283 cr | flow cMPVKLNH5kRKNqmCKqLh | accepted (owner has not heard them yet) | EL ~4,360 cr this month |
