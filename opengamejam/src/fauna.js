// Kessa wildlife: cinder skitters (harmless, skittish, in little herds) and magma hounds
// (hunt the rover, lunge and bite). Both are built from primitives and can be shot or rammed.
// - A skitter herd lives by the landing pad (turret practice) and respawns there.
// - Other skitters roam in a band around the rover, respawning ahead as they fall behind.
// - Hounds live in packs of two or three along the causeways, guard a home stretch,
//   and stay dead until the next landing, so a causeway can be cleared.
import * as THREE from 'three';
import { pathInfo, pathPoint } from './terrain.js';
import { createDeathFx } from './gibs.js';
import { bakeStatic } from './bake.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();

// anim: which body/gait code drives it. pred: a homed predator (packs, no roaming respawn, stays dead).
// hitY/barY/barW: where shots test it and where its health bar sits. shards: Wayshards on a kill.
const KIND = {
  skitter: { hp: 1, r: 0.75, speed: 5.5, flee: 11, fleeR: 20, scale: 1, anim: 'skitter', shards: 1, hitY: 0.45, barY: 1.0, barW: 34 },
  hound: { hp: 5, r: 1.35, speed: 7, chase: 14.5, sight: 48, bite: 6, scale: 1, anim: 'hound', pred: true, big: true, torsoY: 1.15, shards: 4, hitY: 1.1, barY: 2.35, barW: 56 },
  // Thalor
  crawler: { hp: 2, r: 0.9, speed: 4.2, flee: 9.5, fleeR: 18, scale: 1, anim: 'skitter', ice: true, shards: 1, hitY: 0.5, barY: 1.25, barW: 36 },
  shardback: { hp: 9, r: 1.9, speed: 4.5, charge: 23, sight: 58, ram: 11, push: 15, scale: 1, anim: 'hound', pred: true, big: true, ice: true, torsoY: 1.0, shards: 7, hitY: 1.2, barY: 2.9, barW: 66 },
};

// Rime crawler (Thalor): a skitter-sized grazer under a ridge of ice crystals, cyan along its seams.
function makeCrawler(mats) {
  const c = makeSkitter(mats);
  for (let i = 0; i < 5; i++) { // a crest of crystals down the back, tallest in the middle
    const h = 0.38 + (2 - Math.abs(i - 2)) * 0.14;
    const cr = new THREE.Mesh(new THREE.ConeGeometry(0.09, h, 5).translate(0, h / 2, 0), mats.crystal);
    cr.position.set((i % 2 ? 0.08 : -0.08), 0.24, -0.22 + i * 0.16); cr.rotation.set(0.35, i * 0.7, (i % 2 ? -0.25 : 0.25));
    c.body.add(cr);
  }
  for (const s of [-1, 1]) { const side = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 4).translate(0, 0.15, 0), mats.crystal); side.position.set(s * 0.36, 0.12, 0.2); side.rotation.z = -s * 1.0; c.body.add(side); }
  return c;
}

// Shardback (Thalor): a low, heavy grazer-turned-hunter about 3.2 m long, its back grown over with ice
// plates and a wedge of crystal on its brow that it leads with when it charges.
function makeShardback(mats) {
  const g = new THREE.Group();
  const torso = new THREE.Group(); torso.position.y = 1.0; g.add(torso);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 9).scale(1.05, 0.72, 1.45), mats.hide); body.position.set(0, 0.05, 0.1); torso.add(body);
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.78, 12, 8).scale(1.15, 0.85, 0.9), mats.hide); shoulders.position.set(0, 0.18, -0.65); torso.add(shoulders);
  // ice plates: big tilted slabs along the back, glowing in the cracks between them
  for (let i = 0; i < 6; i++) {
    for (const s of [-1, 1]) {
      const w = 0.5 + (i < 3 ? 0.1 : 0), h = 0.7 - i * 0.06;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, w), mats.crystal);
      p.position.set(s * (0.28 + i * 0.02), 0.62 - i * 0.03, -0.75 + i * 0.32); p.rotation.set(-0.3, 0, s * 0.45); torso.add(p);
    }
  }
  const glow = new THREE.Group(); torso.add(glow);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 2.0), mats.glow); spine.position.set(0, 0.62, 0); glow.add(spine);
  for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 1.6), mats.glow); f.position.set(s * 0.82, -0.05, 0.05); glow.add(f); }
  // head: low and broad, with the ram crest
  const head = new THREE.Group(); head.position.set(0, 0.0, -1.45); torso.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.46, 10, 8).scale(1.1, 0.75, 1.1), mats.hide));
  const crest = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 4).rotateX(-Math.PI / 2 - 0.5).translate(0, 0.3, -0.35), mats.crystal); head.add(crest);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), mats.eye); eye.position.set(s * 0.3, 0.08, -0.32); head.add(eye);
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.55, 5).rotateX(-Math.PI / 2 + 0.3), mats.bone); tusk.position.set(s * 0.3, -0.2, -0.45); tusk.rotation.y = s * 0.3; head.add(tusk);
  }
  const jaw = new THREE.Group(); jaw.position.set(0, -0.22, -0.1); head.add(jaw);
  jaw.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5).translate(0, 0, -0.2), mats.plate));
  // short thick tail
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 6).rotateX(Math.PI / 2 + 0.3).translate(0, -0.1, 0.45), mats.hide); tail.position.set(0, 0.0, 1.35); torso.add(tail);
  // legs: four pillars with broad splayed feet (for the ice)
  const legs = [];
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1, front = i < 2;
    const pivot = new THREE.Group(); pivot.position.set(side * 0.62, -0.15, front ? -0.65 : 0.75); torso.add(pivot);
    pivot.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.85, 7).translate(0, -0.42, 0), mats.hide));
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.12, 7), mats.plate); foot.position.y = -0.84; pivot.add(foot);
    legs.push({ pivot, phase: (front ? 0 : Math.PI) + (side > 0 ? Math.PI * 0.5 : 0) });
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, torso, head, jaw, legs, glow };
}
const N_SKITTER = 20, N_PAD_HERD = 9;
const PACKS = [{ t: 150, n: 2 }, { t: 260, n: 3 }, { t: 370, n: 2 }, { t: 470, n: 3 }]; // metres along each causeway
const N_HOUND = PACKS.reduce((a, p) => a + p.n, 0);
// extra packs (owner, 2026-11-19): two guarding the Forge Gate apron, and a few out in open country
const FORGE_PACKS = [{ back: 15, side: -6, n: 3 }, { back: 22, side: 6, n: 2 }];
// packs on the canyon ridge road itself, between the geysers (t = metres along the canyon; vents at 170, 240, ... 545)
const RIDGE_PACKS = [{ t: 80, n: 2 }, { t: 205, n: 3 }, { t: 338, n: 2 }, { t: 462, n: 3 }];
const N_WILD_PACKS = 5, N_EXTRA = FORGE_PACKS.reduce((a, p) => a + p.n, 0) + RIDGE_PACKS.reduce((a, p) => a + p.n, 0) + N_WILD_PACKS * 3;
const SPAWN_MIN = 75, SPAWN_MAX = 150, DESPAWN = 230;
// Thalor's shardback packs (sizes); placed like Kessa's wild packs, plus two guarding the Rime Spire (def.spire)
const THALOR_PACKS = [2, 2, 1, 2, 1, 2, 2, 2];
const DRAW_R = 200, SHADOW_R = 70; // creatures are hidden past DRAW_R and cast shadows only inside SHADOW_R

// Cinder skitter: a basalt-shelled beetle about a metre long, glowing only along its shell seams.
function makeSkitter(mats) {
  const g = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 0.3; g.add(body);
  // carapace: two domed wing-cases split down the middle, with the hot seam showing between them
  for (const s of [-1, 1]) {
    const cas = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI, 0, Math.PI / 2).rotateY(s > 0 ? -Math.PI / 2 : Math.PI / 2).scale(1, 0.75, 1.25), mats.shell);
    cas.position.set(s * 0.035, 0.02, 0.08); body.add(cas);
  }
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 5).scale(1.05, 0.35, 1.3), mats.dark); belly.position.set(0, -0.02, 0.08); body.add(belly);
  const seams = new THREE.Group(); body.add(seams);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.6), mats.glowSoft); spine.position.set(0, 0.26, 0.08); seams.add(spine); // seen through the split
  for (const s of [-1, 1]) { const rim = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.6), mats.glowSoft); rim.position.set(s * 0.43, 0.03, 0.08); seams.add(rim); }
  // head, eyes, mandibles, antennae
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6).scale(1.2, 0.8, 1), mats.dark); head.position.set(0, 0.02, -0.5); body.add(head);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), mats.eye); eye.position.set(s * 0.11, 0.07, -0.62); body.add(eye);
    const mand = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 4).rotateX(-Math.PI / 2), mats.bone); mand.position.set(s * 0.07, -0.05, -0.68); mand.rotation.y = -s * 0.5; body.add(mand);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.45, 4).translate(0, 0.22, 0), mats.dark); ant.position.set(s * 0.08, 0.1, -0.6); ant.rotation.set(-0.9, 0, -s * 0.45); body.add(ant);
  }
  // six two-part legs: out and up to the knee, then down to the ground
  const legs = [];
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1, row = Math.floor(i / 2) - 1;
    const pivot = new THREE.Group(); pivot.position.set(side * 0.36, 0.28, row * 0.3 + 0.05); g.add(pivot);
    const up = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.05).translate(side * 0.17, 0, 0), mats.dark); up.rotation.z = side * 0.55; pivot.add(up);
    const knee = new THREE.Group(); knee.position.set(side * 0.29, 0.16, 0); pivot.add(knee);
    const low = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.46, 0.04).translate(0, -0.23, 0), mats.dark); low.rotation.z = side * -0.3; knee.add(low);
    legs.push({ pivot, phase: (i % 2 ? 0 : Math.PI) + row * 0.6 });
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, body, legs, glow: seams };
}

// Magma hound: a lean basalt-plated predator about 2.6 m long, molten under its plates.
function makeHound(mats) {
  const g = new THREE.Group();
  const torso = new THREE.Group(); torso.position.y = 1.15; g.add(torso);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 9).scale(0.95, 0.95, 1.25), mats.hide); chest.position.set(0, 0.05, -0.38); torso.add(chest);
  const waist = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8).scale(0.9, 0.85, 1.2), mats.hide); waist.position.set(0, 0, 0.25); torso.add(waist);
  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.48, 10, 8).scale(1, 0.95, 1.1), mats.hide); hips.position.set(0, 0.05, 0.75); torso.add(hips);
  // basalt armour plates over the back and shoulders; the glow shows in the gaps between them
  const plates = [[0, 0.58, -0.62, 0.95, 0.5], [0, 0.55, -0.12, 0.8, 0.45], [0, 0.5, 0.38, 0.75, 0.45], [0, 0.52, 0.82, 0.85, 0.5]];
  for (const [x, y, z, w, d] of plates) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), mats.plate); p.position.set(x, y, z); p.rotation.x = -0.12; torso.add(p);
  }
  for (const s of [-1, 1]) {
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.6), mats.plate); sh.position.set(s * 0.55, 0.15, -0.42); sh.rotation.z = s * 0.3; torso.add(sh);
    const hp = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.48), mats.plate); hp.position.set(s * 0.44, 0.18, 0.78); hp.rotation.z = s * 0.3; torso.add(hp);
  }
  const glow = new THREE.Group(); torso.add(glow);
  for (const z of [-0.37, 0.13, 0.6]) { const seam = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.05), mats.glow); seam.position.set(0, 0.6, z); glow.add(seam); }
  for (const s of [-1, 1]) { const flank = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 1.3), mats.glow); flank.position.set(s * 0.5, -0.25, 0.1); glow.add(flank); }
  for (let i = 0; i < 5; i++) { // dorsal spines, swept back
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.42 - Math.abs(i - 1.5) * 0.06, 5), mats.plate); sp.position.set(0, 0.68, -0.72 + i * 0.36); sp.rotation.x = 0.7; torso.add(sp);
  }
  // neck and head: wedge snout, brow ridge, ember eyes, a hinged jaw lined with teeth
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 0.6, 8).rotateX(Math.PI / 2 - 0.5), mats.hide); neck.position.set(0, 0.18, -1.0); torso.add(neck);
  const head = new THREE.Group(); head.position.set(0, 0.38, -1.32); torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8).scale(1, 0.8, 1.05), mats.hide); head.add(skull);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.5).translate(0, 0, -0.25), mats.hide); snout.position.set(0, -0.02, -0.15); snout.rotation.x = 0.08; head.add(snout);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.22), mats.plate); brow.position.set(0, 0.16, -0.12); brow.rotation.x = -0.25; head.add(brow);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4).scale(1.4, 0.7, 1), mats.eye); eye.position.set(s * 0.16, 0.08, -0.24); head.add(eye);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.38, 5), mats.bone); horn.position.set(s * 0.18, 0.2, 0.12); horn.rotation.set(1.1, 0, -s * 0.35); head.add(horn);
  }
  const jaw = new THREE.Group(); jaw.position.set(0, -0.12, 0.05); head.add(jaw);
  const lower = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.62).translate(0, 0, -0.31), mats.plate); jaw.add(lower);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.48).translate(0, 0.06, -0.3), mats.glow); jaw.add(mouth);
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 4), mats.bone); t.position.set(s * 0.12, 0.09, -0.52 + i * 0.12); jaw.add(t);
    const u = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 4).rotateX(Math.PI), mats.bone); u.position.set(s * 0.13, -0.15, -0.5 + i * 0.12); head.add(u);
  }
  // tail: three tapering segments, ember tip
  let parent = torso;
  for (let i = 0; i < 3; i++) {
    const seg = new THREE.Group(); seg.position.set(0, i ? 0 : 0.1, i ? 0.42 : 1.15); seg.rotation.x = i ? -0.18 : 0.45; parent.add(seg);
    seg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11 - i * 0.03, 0.15 - i * 0.03, 0.45, 6).rotateX(Math.PI / 2).translate(0, 0, 0.22), mats.hide));
    parent = seg;
  }
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 5).rotateX(Math.PI / 2).translate(0, 0, 0.5), mats.glow); parent.add(tip);
  // legs: thigh, then a shin bent the other way, then a broad paw (back legs digitigrade)
  const legs = [];
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1, front = i < 2;
    const pivot = new THREE.Group(); pivot.position.set(side * 0.42, -0.1, front ? -0.5 : 0.8); torso.add(pivot);
    const thighA = front ? 0.25 : -0.45, shinA = front ? -0.35 : 0.75;
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.58, 0.3).translate(0, -0.27, 0), mats.hide); thigh.rotation.x = thighA; pivot.add(thigh);
    const knee = new THREE.Group(); knee.position.set(0, -0.54 * Math.cos(thighA), -0.54 * Math.sin(thighA)); pivot.add(knee);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.18).translate(0, -0.25, 0), mats.plate); shin.rotation.x = shinA; knee.add(shin);
    const paw = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.34), mats.plate); paw.position.set(0, -0.5 * Math.cos(shinA) - 0.02, -0.5 * Math.sin(shinA) - 0.08); knee.add(paw);
    for (const c of [-1, 0, 1]) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 4).rotateX(-Math.PI / 2), mats.bone); claw.position.set(c * 0.08, -0.03, -0.2); paw.add(claw); }
    legs.push({ pivot, phase: (front ? 0 : Math.PI) + (side > 0 ? Math.PI * 0.5 : 0) });
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, torso, head, jaw, legs, glow };
}

export function createFauna({ root, def, terrain, fx }) {
  const thalor = def.fauna === 'thalor';
  const mats = thalor ? {
    shell: new THREE.MeshStandardMaterial({ color: '#c9dbe6', roughness: 0.3, metalness: 0.1, flatShading: true, emissive: '#0a1a24' }),
    hide: new THREE.MeshStandardMaterial({ color: '#7d8f9c', roughness: 0.75, flatShading: true, emissive: '#06121a' }),
    plate: new THREE.MeshStandardMaterial({ color: '#4c5d6b', roughness: 0.6, metalness: 0.1, flatShading: true }),
    dark: new THREE.MeshStandardMaterial({ color: '#3a4855', roughness: 0.8 }),
    bone: new THREE.MeshStandardMaterial({ color: '#eef4f7', roughness: 0.4 }),
    crystal: new THREE.MeshStandardMaterial({ color: '#bfeaff', roughness: 0.12, metalness: 0.05, flatShading: true, emissive: '#1e5a74', transparent: true, opacity: 0.9 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.0, 2.8) }),
    glowSoft: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1.3, 1.8) }),
    eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.8, 3.4) }),
  } : {
    shell: new THREE.MeshStandardMaterial({ color: '#5c4638', roughness: 0.35, metalness: 0.35, flatShading: true, emissive: '#1c0802' }),
    hide: new THREE.MeshStandardMaterial({ color: '#5a4033', roughness: 0.7, flatShading: true, emissive: '#2c0a02' }),
    plate: new THREE.MeshStandardMaterial({ color: '#2f2723', roughness: 0.6, metalness: 0.15, flatShading: true }),
    dark: new THREE.MeshStandardMaterial({ color: '#2a211b', roughness: 0.8, emissive: '#100300' }),
    bone: new THREE.MeshStandardMaterial({ color: '#d9c9ad', roughness: 0.5 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.8, 0.15) }),
    glowSoft: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.5, 0.1) }),
    eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 2.2, 0.5) }),
  };
  const list = [];
  if (thalor) {
    // Thalor: rime crawler herds (one by the pad) and shardback packs out on the shelves and the sea ice
    for (let i = 0; i < N_SKITTER; i++) list.push({ kind: 'crawler', k: KIND.crawler, ...makeCrawler(mats) });
    for (let i = 0; i < THALOR_PACKS.reduce((a, n) => a + n, 0); i++) list.push({ kind: 'shardback', k: KIND.shardback, ...makeShardback(mats) });
  } else {
    for (let i = 0; i < N_SKITTER; i++) list.push({ kind: 'skitter', k: KIND.skitter, ...makeSkitter(mats) });
    for (let i = 0; i < N_HOUND * Math.max(1, (def.causeways || []).length) + N_EXTRA; i++) list.push({ kind: 'hound', k: KIND.hound, ...makeHound(mats) });
  }
  // merge each creature's rigid parts (75 meshes per hound -> about 20); gibs keep the separate parts
  for (const c of list) {
    const anchors = [...c.legs.map((L) => L.pivot), c.glow, ...(c.k.anim === 'hound' ? [c.torso, c.head, c.jaw] : [c.body])];
    const baked = bakeStatic(c.g, anchors);
    c.gibParts = baked.parts; c.meshes = baked.meshes; c.shadow = true;
  }
  for (const c of list) {
    c.g.visible = false; root.add(c.g);
    Object.assign(c, { alive: false, x: 0, z: 0, y: 0, yaw: 0, vx: 0, vz: 0, hp: 0, gait: 0, flash: 0, state: 'roam', t: 0, cd: 0, wander: 0, dead: 0, mood: 0 });
  }

  const nearForge = (x, z) => def.canyon && def.canyon.forge && Math.hypot(x - def.canyon.forge.x, z - def.canyon.forge.z) < def.canyon.forge.r + 8;
  const okSpot = (x, z, kind, rover) => {
    const lim = def.size * 0.42;
    if (Math.abs(x) > lim || Math.abs(z) > lim) return false;
    const h = terrain.heightAt(x, z);
    if (h < def.lava + 1.2) return false;
    if (Math.hypot(x - def.pad.x, z - def.pad.z) < def.pad.r * 2) return false;
    if (Math.hypot(x - def.vault.x, z - def.vault.z) < 95) return false; // keep the arena and vent field to the Titan
    if (kind === 'hound' && def.canyon && !nearForge(x, z) && pathInfo(def.canyon.pts, x, z).d < def.canyon.wall + 10) return false; // the canyon is the geysers' fight
    if (rover && Math.hypot(x - rover.x, z - rover.z) < SPAWN_MIN * 0.8) return false;
    return true;
  };

  // where a creature may walk (the pad is fine; lava, the arena and, for hounds, the canyon are not)
  const canWalk = (x, z, kind) => {
    const lim = def.size * 0.42;
    if (Math.abs(x) > lim || Math.abs(z) > lim) return false;
    if (!thalor && terrain.heightAt(x, z) < def.lava + 0.8) return false; // lava; Thalor's sea ice is walkable
    if (Math.hypot(x - def.vault.x, z - def.vault.z) < 90) return false;
    if (kind === 'hound' && def.canyon && !nearForge(x, z)) { const d = pathInfo(def.canyon.pts, x, z).d; if (d < def.canyon.wall + 6 && d > def.canyon.half - 0.8) return false; }
    return true;
  };

  // the pad herd's meadow: dry, open ground 40-60 m from the pad, in the rover's opening view
  // (it starts facing the vault), off the two roads out and clear of the parked Wayfarer
  let meadow = null;
  const toVault = Math.atan2(def.vault.z - def.pad.z, def.vault.x - def.pad.x);
  const clearOfRoads = (x, z) => (def.causeways || []).every((c) => pathInfo(c.pts, x, z).d > c.half + 22) && (!def.canyon || pathInfo(def.canyon.pts, x, z).d > def.canyon.wall);
  for (let tries = 0; tries < 300 && !meadow; tries++) {
    const side = tries < 200 ? -1 : 1, spread = 0.45 + Math.random() * (0.5 + tries / 300); // -1 = the side away from the parked ship
    const a = toVault + side * spread, d = 40 + Math.random() * 20;
    const x = def.pad.x + Math.cos(a) * d, z = def.pad.z + Math.sin(a) * d;
    let ok = clearOfRoads(x, z) && Math.hypot(x - def.pad.x - 6, z - def.pad.z - 4) > 30;
    for (let k = 0; k < 8 && ok; k++) { const b = (k / 8) * 6.28; ok = canWalk(x + Math.cos(b) * 14, z + Math.sin(b) * 14, 'skitter') && terrain.heightAt(x + Math.cos(b) * 14, z + Math.sin(b) * 14) > def.lava + 2.5; }
    if (ok) meadow = { x, z, r: 16 };
  }
  const herd = list.filter((c) => c.kind === 'skitter').slice(0, meadow ? N_PAD_HERD : 0);
  herd.forEach((c) => { c.home = meadow; c.herd = true; });
  // hound packs along the causeways, on the road itself
  const hounds = list.filter((c) => c.k.pred);
  let hi = 0;
  for (const cw of def.causeways || []) for (const p of PACKS) {
    const q = pathPoint(cw.pts, p.t);
    if (!q) continue;
    for (let i = 0; i < p.n && hi < hounds.length; i++) hounds[hi++].home = { x: q.x, z: q.z, r: 16, dx: q.dx, dz: q.dz };
  }
  const packHomes = [];
  if (def.canyon) for (const p of RIDGE_PACKS) {
    const q = pathPoint(def.canyon.pts, p.t);
    if (q) packHomes.push({ x: q.x, z: q.z, r: 12, n: p.n, dx: q.dx, dz: q.dz, ridge: true });
  }
  if (def.canyon && def.canyon.forge) {
    // on the apron in front of the gate, facing the way the rover comes up the canyon
    const F = def.canyon.forge, pts = def.canyon.pts, a = pts[pts.length - 1], b = pts[pts.length - 2];
    const L = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, ux = (a[0] - b[0]) / L, uz = (a[1] - b[1]) / L;
    for (const p of FORGE_PACKS) packHomes.push({ x: F.x - ux * p.back - uz * p.side, z: F.z - uz * p.back + ux * p.side, r: 9, n: p.n });
  }
  // Thalor: two shardbacks guard the Rime Spire (the armory)
  if (thalor && def.spire) packHomes.push({ x: def.spire.x + 16, z: def.spire.z - 10, r: 10, n: THALOR_PACKS[0] });
  const wildSizes = thalor ? THALOR_PACKS.slice(def.spire ? 1 : 0) : null;
  // wild packs: open, dry ground away from the pad, the vault, the canyon, and each other
  const taken = (x, z) => packHomes.some((h) => !h.ridge && Math.hypot(h.x - x, h.z - z) < 130) ||
    (def.causeways || []).some((c) => PACKS.some((p) => { const q = pathPoint(c.pts, p.t); return q && Math.hypot(q.x - x, q.z - z) < 110; }));
  for (let tries = 0, made = 0; tries < 600 && made < (wildSizes ? wildSizes.length : N_WILD_PACKS); tries++) {
    const lim = def.size * 0.38, x = (Math.random() * 2 - 1) * lim, z = (Math.random() * 2 - 1) * lim;
    if (Math.hypot(x - def.pad.x, z - def.pad.z) < 170 || Math.hypot(x - def.vault.x, z - def.vault.z) < 130) continue;
    if (def.canyon && pathInfo(def.canyon.pts, x, z).d < def.canyon.wall + 25) continue;
    if (taken(x, z) || terrain.heightAt(x, z) < def.lava + 2.5) continue;
    let ok = true;
    for (let k = 0; k < 8 && ok; k++) { const t = (k / 8) * 6.28; ok = canWalk(x + Math.cos(t) * 12, z + Math.sin(t) * 12, 'hound'); }
    if (ok && def.spire && Math.hypot(x - def.spire.x, z - def.spire.z) < 90) ok = false;
    if (!ok) continue;
    packHomes.push({ x, z, r: 14, n: wildSizes ? wildSizes[made] : 2 + (Math.random() < 0.5 ? 1 : 0) }); made++;
  }
  for (const h of packHomes) for (let i = 0; i < h.n && hi < hounds.length; i++) hounds[hi++].home = h.dx !== undefined ? { x: h.x, z: h.z, r: h.r, dx: h.dx, dz: h.dz } : { x: h.x, z: h.z, r: h.r };
  for (; hi < hounds.length; hi++) hounds[hi].home = null; // unused

  // place a creature at its home (herd/pack) or, for roamers, in the band ahead of the rover
  function spawnHome(c) {
    const h = c.home;
    for (let tries = 0; tries < 20; tries++) {
      const along = (Math.random() - 0.5) * 2 * h.r * 0.7, side = (Math.random() - 0.5) * (c.k.pred ? 6 : h.r);
      const x = h.dx !== undefined ? h.x + h.dx * along - h.dz * side : h.x + along, z = h.dz !== undefined ? h.z + h.dz * along + h.dx * side : h.z + side;
      if (!canWalk(x, z, c.kind)) continue;
      Object.assign(c, { alive: true, x, z, y: terrain.heightAt(x, z), yaw: Math.random() * 6.28, vx: 0, vz: 0, hp: c.k.hp, flash: 0, state: 'roam', t: 0, cd: 0, wander: Math.random() * 6.28, dead: 0, mood: Math.random() * 4 });
      c.g.visible = true; c.g.scale.setScalar(1); c.g.position.set(c.x, c.y, c.z);
      return true;
    }
    return false;
  }

  function spawn(c, around, heading) {
    if (c.home) return spawnHome(c);
    if (c.k.pred) return false;
    for (let tries = 0; tries < 30; tries++) {
      // prefer ahead of the rover so the world in front feels alive
      const a = heading + (Math.random() - 0.5) * Math.PI * 1.4;
      const d = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      const x = around.x - Math.sin(a) * d, z = around.z - Math.cos(a) * d;
      if (!okSpot(x, z, c.kind, around)) continue;
      // skitters come in herds: if a living skitter is near this point, join it
      Object.assign(c, { alive: true, x, z, y: terrain.heightAt(x, z), yaw: Math.random() * 6.28, vx: 0, vz: 0, hp: c.k.hp, flash: 0, state: 'roam', t: 0, cd: 0, wander: Math.random() * 6.28, dead: 0, mood: Math.random() * 4 });
      if (!c.k.pred) {
        const mate = list.find((o) => o !== c && o.alive && o.kind === c.kind && !o.herd && Math.hypot(o.x - around.x, o.z - around.z) > SPAWN_MIN && Math.random() < 0.6);
        if (mate) { c.x = mate.x + (Math.random() - 0.5) * 8; c.z = mate.z + (Math.random() - 0.5) * 8; if (!okSpot(c.x, c.z, c.kind)) { c.x = x; c.z = z; } c.wander = mate.wander; }
        c.y = terrain.heightAt(c.x, c.z);
      }
      c.g.visible = true; c.g.scale.setScalar(1); c.g.rotation.set(0, c.yaw, 0);
      return true;
    }
    c.alive = false; c.g.visible = false;
    return false;
  }

  function reset(roverPos, heading) {
    deathFx.clear();
    for (const c of list) { c.alive = false; c.g.visible = false; c.respawn = Math.random() * 3; }
    if (roverPos) for (const c of list) { c.gone = false; spawn(c, roverPos, heading + (Math.random() - 0.5) * 6); }
  }
  function hideAll() { for (const c of list) { c.alive = false; c.g.visible = false; } deathFx.clear(); }

  const deathFx = createDeathFx({ root, terrain, fx });
  function kill(c, by) {
    c.alive = false; c.dead = 0; c.respawn = c.herd ? 5 + Math.random() * 6 : 6 + Math.random() * 8;
    if (c.k.pred) c.gone = true; // packs stay cleared until the next landing
    deathFx.burst(c); // the body bursts into its own burning parts
    c.g.visible = false;
    return by;
  }

  // segment-vs-sphere against the living creatures; returns the nearest hit
  const hitP = new THREE.Vector3();
  function hitTest(a, b) {
    v2.subVectors(b, a); const L2 = v2.lengthSq() || 1;
    let best = 2, hit = null;
    for (const c of list) {
      if (!c.alive) continue;
      v1.set(c.x, c.y + c.k.hitY, c.z);
      if (Math.abs(v1.x - a.x) > 260 || Math.abs(v1.z - a.z) > 260) continue;
      const u = clamp(v3.subVectors(v1, a).dot(v2) / L2, 0, 1);
      v3.copy(a).addScaledVector(v2, u);
      if (v3.distanceToSquared(v1) < c.k.r * c.k.r && u < best) { best = u; hit = c; hitP.copy(v3); }
    }
    return hit ? { c: hit, p: hitP, u: best } : null;
  }

  // returns true if it died
  function damage(c, n, quiet) {
    if (!c.alive) return false;
    c.hp -= n; c.flash = 0.12;
    if (c.kind === 'hound') { c.state = 'chase'; c.t = 0; } // shooting one wakes it
    else if (c.kind === 'shardback') { if (c.state === 'roam') { c.state = 'stalk'; c.t = 0; } }
    else { c.state = 'flee'; c.t = 0; }
    if (!quiet) fx.emit(hitP, 6, { speed: 5, life: 0.3, size: 1.1, colors: [[5, 2.2, 0.5]], drag: 4 });
    if (c.hp <= 0) { kill(c); return true; }
    return false;
  }

  // ctx: { rover, heading, damage(n), shake(k), say(id,line), quiet } — quiet = the Titan fight, no wildlife
  function update(dt, time, ctx) {
    deathFx.update(dt);
    const R = ctx.rover.pos;
    let houndsHunting = 0;
    for (const c of list) {
      if (!c.alive) {
        if (ctx.quiet || c.gone || (c.k.pred && !c.home)) continue;
        c.respawn = (c.respawn || 0) - dt;
        if (c.respawn <= 0) { if (!spawn(c, R, ctx.heading)) c.respawn = 2; }
        continue;
      }
      if (ctx.quiet) { c.alive = false; c.g.visible = false; c.respawn = 1; continue; }
      const dx = R.x - c.x, dz = R.z - c.z, dist = Math.hypot(dx, dz);
      if (!c.home && dist > DESPAWN) { c.alive = false; c.g.visible = false; c.respawn = 0.5 + Math.random() * 2; continue; }
      if (c.home && dist > 320) { c.g.visible = false; continue; } // homed creatures just sleep when far away
      c.g.visible = dist < DRAW_R;
      const sh = dist < SHADOW_R;
      if (sh !== c.shadow) { c.shadow = sh; for (const m of c.meshes) m.castShadow = sh; }
      // homed creatures drift back when they stray (and hounds give up a chase that drags them off)
      const hx = c.home ? c.home.x - c.x : 0, hz = c.home ? c.home.z - c.z : 0, fromHome = Math.hypot(hx, hz);
      c.t += dt; c.cd -= dt; c.flash = Math.max(0, c.flash - dt);
      let want = 0, wantYaw = c.yaw;
      const toward = Math.atan2(dx, dz); // yaw facing the rover (+z forward in creature space is -z... see below)
      if (c.k.anim === 'skitter') {
        if (dist < c.k.fleeR) { c.state = 'flee'; c.t = 0; }
        if (c.state === 'flee') {
          want = c.k.flee; wantYaw = toward + Math.PI;
          if (c.t > 2.5 && dist > c.k.fleeR * 1.4) c.state = 'roam';
        } else {
          c.mood -= dt;
          if (c.mood < 0) { c.mood = 1.5 + Math.random() * 3; c.wander += (Math.random() - 0.5) * 2; c.idle = Math.random() < 0.35; }
          want = c.idle ? 0 : c.k.speed; wantYaw = c.wander;
          if (c.home && fromHome > c.home.r) { wantYaw = Math.atan2(hx, hz); want = c.k.speed; c.wander = wantYaw; }
        }
        if (c.state === 'flee' && c.home && fromHome > c.home.r * 2.2) c.state = 'roam';
      } else if (c.kind === 'shardback') {
        // roam -> stalk (face us, head down, ~1.3 s: the tell) -> charge (straight, barely steering) -> stun (skids, ~1.8 s: shoot it now)
        if (c.state === 'roam' && dist < c.k.sight) { c.state = 'stalk'; c.t = 0; ctx.say && ctx.say('shard', 'Shardbacks. They charge in a straight line. Get out of the way, then shoot them while they recover.'); }
        if (c.state === 'roam') {
          c.mood -= dt;
          if (c.mood < 0) { c.mood = 2 + Math.random() * 3; c.wander += (Math.random() - 0.5) * 2.5; }
          want = c.k.speed * 0.5; wantYaw = c.wander;
          if (c.home && fromHome > c.home.r) { wantYaw = Math.atan2(hx, hz); c.wander = wantYaw; }
        } else if (c.state === 'stalk') {
          want = c.t < 0.6 ? c.k.speed * 0.6 : 0; wantYaw = toward;
          if (c.t > 1.3) { c.state = 'charge'; c.t = 0; c.cdir = toward; c.hit = false; }
          if (dist > c.k.sight * 1.6 || (c.home && fromHome > 120)) c.state = 'roam';
        } else if (c.state === 'charge') {
          houndsHunting++;
          let dd = toward - c.cdir; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
          c.cdir += clamp(dd, -0.5 * dt, 0.5 * dt); // a little homing, not much: it can be dodged
          want = c.k.charge * Math.min(1, 0.35 + c.t * 1.4); wantYaw = c.cdir;
          if (!c.hit && dist < c.k.r + 2.3 && Math.abs(R.y - c.y) < 3) {
            c.hit = true;
            ctx.damage(c.k.ram); ctx.shake(0.9);
            if (ctx.push) ctx.push(Math.sin(c.cdir) * c.k.push, Math.cos(c.cdir) * c.k.push);
            ctx.say && ctx.say('shard-hit', 'It hit us! It has to stop and turn now. Shoot it!');
          }
          const off = Math.abs(Math.atan2(Math.sin(toward - c.cdir), Math.cos(toward - c.cdir)));
          if (c.t > 2.2 || (c.hit && c.t > 0.3) || (c.t > 1.2 && off > 1.4)) { c.state = 'stun'; c.t = 0; }
        } else if (c.state === 'stun') {
          want = 0; wantYaw = c.yaw;
          if (c.t > 1.8) { c.state = dist < c.k.sight ? 'stalk' : 'roam'; c.t = 0; }
        }
      } else {
        if (c.state === 'roam' && dist < c.k.sight) { c.state = 'stalk'; c.t = 0; ctx.say && ctx.say('hound', 'Contacts. Magma hounds, and they have our scent. Outrun them or use the turret.'); }
        if (c.state === 'roam') {
          c.mood -= dt;
          if (c.mood < 0) { c.mood = 2 + Math.random() * 3; c.wander += (Math.random() - 0.5) * 2.5; }
          want = c.k.speed * 0.6; wantYaw = c.wander;
          if (c.home && fromHome > c.home.r) { wantYaw = Math.atan2(hx, hz); c.wander = wantYaw; }
        } else if (c.state === 'stalk') {
          // a short circling stalk telegraphs the hunt before the run
          want = c.k.speed; wantYaw = toward + 0.9;
          if (c.t > 1.4) { c.state = 'chase'; c.t = 0; }
        } else if (c.state === 'chase') {
          houndsHunting++;
          want = c.k.chase; wantYaw = toward;
          if (dist < 4.2 && c.cd <= 0) {
            c.cd = 1.5;
            const rs = Math.hypot(ctx.rover.vel.x, ctx.rover.vel.z);
            if (rs < 18) { ctx.damage(c.k.bite); ctx.shake(0.45); }
            c.vx -= Math.sin(c.yaw) * 6; c.vz -= Math.cos(c.yaw) * 6; // recoil off the hull
          }
          if (dist > c.k.sight * 2.2 || (c.home && fromHome > 110)) { c.state = 'roam'; }
        }
      }
      // turn, then move along the facing (creature forward is -Z like the rover, so yaw atan2(-dx,-dz))
      let dy = (wantYaw - c.yaw); dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      c.yaw += clamp(dy, -6 * dt, 6 * dt);
      const fx_ = Math.sin(c.yaw), fz_ = Math.cos(c.yaw);
      const k = 1 - Math.exp(-(c.state === 'stun' && c.t < 0.8 ? 1.2 : c.state === 'charge' ? 3 : 5) * dt); // a stunned shardback skids to a stop
      c.vx += (fx_ * want - c.vx) * k; c.vz += (fz_ * want - c.vz) * k;
      let nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
      if (!canWalk(nx, nz, c.kind)) {
        // lava or off-limits ahead: turn away and stop
        c.wander += Math.PI * (0.6 + Math.random() * 0.6); c.vx *= -0.3; c.vz *= -0.3; nx = c.x; nz = c.z;
        if (c.state === 'flee') c.state = 'roam';
        if (c.state === 'charge') { c.state = 'stun'; c.t = 0; }
      }
      c.x = nx; c.z = nz;
      const gy = terrain.heightAt(c.x, c.z);
      c.y += (gy - c.y) * (1 - Math.exp(-14 * dt));
      // rammed by the rover
      const rs = Math.hypot(ctx.rover.vel.x, ctx.rover.vel.z);
      if (dist < c.k.r + 1.7 && Math.abs(R.y - c.y) < 3) {
        if (rs > 9) { if (c.k.pred) { c.hp -= 2; c.flash = 0.12; ctx.shake(0.35); } else c.hp = 0; if (c.hp <= 0) { kill(c); ctx.onKill && ctx.onKill(c, 'ram'); continue; } }
        const nx2 = -dx / (dist || 1), nz2 = -dz / (dist || 1);
        c.x += nx2 * 0.6; c.z += nz2 * 0.6; c.vx += nx2 * 8; c.vz += nz2 * 8;
      }
      // animate
      const sp = Math.hypot(c.vx, c.vz);
      c.gait += dt * sp * (c.k.anim === 'hound' ? (c.kind === 'shardback' ? 1.2 : 1.6) : 4.5);
      const sw = clamp(sp / 4, 0, 1);
      for (const L of c.legs) {
        if (c.k.anim === 'hound') L.pivot.rotation.x = Math.sin(c.gait + L.phase) * (c.kind === 'shardback' ? 0.45 : 0.7) * sw;
        else L.pivot.rotation.y = Math.sin(c.gait + L.phase) * 0.5 * sw;
      }
      if (c.kind === 'shardback') {
        c.torso.position.y = c.k.torsoY + Math.abs(Math.sin(c.gait)) * 0.08 * sw;
        c.head.rotation.x = c.state === 'stalk' || c.state === 'charge' ? 0.35 : c.state === 'stun' ? -0.2 : 0; // crest down to charge
        c.jaw.rotation.x = c.state === 'stun' ? -0.25 : 0;
        c.torso.rotation.z = c.state === 'stalk' && c.t > 0.6 ? Math.sin(time * 30) * 0.03 : 0; // a shiver before the run
      } else if (c.kind === 'hound') {
        c.torso.position.y = 1.15 + Math.abs(Math.sin(c.gait)) * 0.12 * sw;
        const lunge = c.state === 'chase' && dist < 7;
        c.jaw.rotation.x = lunge ? -(0.35 + Math.sin(time * 18) * 0.25) : -0.05; // negative opens
        c.head.rotation.x = c.state === 'stalk' ? 0.25 : 0;
      } else {
        c.body.position.y = 0.3 + Math.abs(Math.sin(c.gait * 0.5)) * 0.05;
      }
      c.g.position.set(c.x, c.y, c.z);
      c.g.rotation.y = c.yaw + Math.PI; // models are built facing -Z
      c.glow.scale.setScalar(c.flash > 0 ? 1.12 : 1);
      if (c.kind === 'shardback') c.glow.visible = c.state !== 'stun' || Math.floor(time * 10) % 2 === 0; // flickers while stunned
    }
    return houndsHunting;
  }

  return { list, reset, hideAll, update, hitTest, damage, kill, meadow, deathFx, packHomes };
}
