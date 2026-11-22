// The Vireo vault guardian: the Hollowed Matriarch. A vast Hollowed, robed in veil, that tears out of the vault
// and hangs over the arena. She fights in a cycle:
//   veiled - ghostly and out of phase: shots pass through her. She drifts, throws homing veil orbs (shootable)
//            and sends shades (small Hollowed that glide in, flare their eyes, and lunge)
//   gather - she rises and her eyes flare: a wave is coming
//   wave   - a ring of veil spreads across the arena floor from under her. Phase Blink through it as it reaches
//            you (or take a hit and a shove)
//   solid  - she sinks low, turns solid, and the heart in her chest opens: the only time she takes damage
// Three stages by heart HP (60 / 40 / 20): stage 2 sends two waves and more shades; stage 3 also steps through
// the veil to a new spot between waves. Same interface as guardian.js / sentinel.js.
import * as THREE from 'three';
import { VLight } from './lightpool.js';
import { sfx, noise, blip } from './audio.js';

const clamp = THREE.MathUtils.clamp;
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();

export const MATRIARCH_HP = 60;
const STAGE = [
  { veiled: 5.5, orbEvery: 2.2, shades: 1, waves: 1, waveSpeed: 13, solid: 4.6, relocate: false },
  { veiled: 5.0, orbEvery: 1.8, shades: 2, waves: 2, waveSpeed: 15, solid: 4.0, relocate: false },
  { veiled: 4.4, orbEvery: 1.4, shades: 3, waves: 2, waveSpeed: 17, solid: 3.6, relocate: true },
];
const SCALE = 3.4;          // about 11 m tall
const HOVER = 8.5, LOW = 3.2; // her height over the arena floor: drifting, and when solid
const GATHER_T = 1.4;       // the tell before a wave
const WAVE_GAP = 3.8;       // seconds between the two waves of a pair: longer than Phase Blink's recharge (3.5 s)
const WAVE_H = 3.2;         // a wave's height: anything lower than this above the floor is caught

// her voice: a low, breathy chord that falls (synth)
function keen(big) {
  [220, 277, 330].forEach((f, i) => blip(f * (big ? 0.5 : 1), big ? 1.8 : 0.8, 'triangle', big ? 0.08 : 0.045, i * 0.06, 0.55));
  noise(big ? 2 : 0.8, big ? 0.3 : 0.15, 1800, 300, 0.9);
}

export function createMatriarch({ root, def, terrain, fx }) {
  const floorY = terrain.vaultH;
  const C = new THREE.Vector3(def.vault.x, floorY, def.vault.z);
  const AR = def.arenaR || 50;

  // ---------- her body (own materials: she fades as a whole) ----------
  const mk = (o) => new THREE.MeshStandardMaterial({ transparent: true, ...o });
  const M = {
    robe: mk({ color: '#2a2238', roughness: 0.9, flatShading: true, emissive: '#160c28' }),
    rag: mk({ color: '#3d3058', roughness: 0.95, flatShading: true, emissive: '#1c1032', side: THREE.DoubleSide }),
    bone: mk({ color: '#d8cde6', roughness: 0.5, emissive: '#221a30' }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 0.8, 3.6), transparent: true }),
  };
  const heartM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.1, 4) });
  const body = new THREE.Group(); body.visible = false; root.add(body);
  const fig = new THREE.Group(); fig.scale.setScalar(SCALE); body.add(fig);
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.6, 12, 4, true).translate(0, -0.8, 0), M.rag); fig.add(robe);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 9).scale(1.2, 1, 0.85), M.robe); chest.position.set(0, 0.55, -0.1); fig.add(chest);
  // the heart: a lens of light behind the robe's split, which opens when she is solid
  const flaps = [-1, 1].map((s) => {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.9, 0.12), M.robe); f.position.set(s * 0.21, 0.55, -0.62); fig.add(f);
    return { f, s };
  });
  const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), heartM); heart.position.set(0, 0.55, -0.55); fig.add(heart);
  const heartLight = new VLight('#c49cff', 0, 40, 1.5); body.add(heartLight);
  for (let i = 0; i < 10; i++) { // tatters
    const a = (i / 10) * Math.PI * 2, len = 0.5 + (i % 3) * 0.2;
    const r = new THREE.Mesh(new THREE.ConeGeometry(0.16, len, 4).rotateX(Math.PI).translate(0, -len / 2, 0), M.rag);
    r.position.set(Math.cos(a) * 0.9, -2.05, Math.sin(a) * 0.9); fig.add(r);
  }
  const head = new THREE.Group(); head.position.set(0, 1.3, -0.3); fig.add(head);
  head.add(new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 9).rotateX(-0.35).translate(0, 0.12, 0.05), M.robe));
  const face = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 6, 16), M.bone); face.position.set(0, -0.05, -0.36); head.add(face);
  const eyes = new THREE.Group(); head.add(eyes);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), M.glow); e.position.set(s * 0.1, -0.02, -0.37); eyes.add(e); }
  // a crown of thin bone spines
  for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.6, 4), M.bone); sp.position.set((i - 2) * 0.13, 0.75, 0.05); sp.rotation.z = (i - 2) * 0.25; head.add(sp); }
  const arms = [-1, 1].map((s) => {
    const p = new THREE.Group(); p.position.set(s * 0.82, 0.8, -0.15); fig.add(p);
    p.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.07, 1.9, 6).translate(0, -0.95, 0), M.robe));
    const hook = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.6, 5).rotateX(-1.1).translate(0, -2, -0.22), M.bone); p.add(hook);
    return { p, s };
  });
  body.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  // ---------- the waves: rings of veil across the floor ----------
  const waveMat = () => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.55, 2), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const waves = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, WAVE_H, 96, 1, true).translate(0, WAVE_H / 2, 0), waveMat());
    m.visible = false; root.add(m);
    return { m, on: false, r: 0, x: 0, z: 0, hit: false, delay: 0 };
  });
  const gatherRing = new THREE.Mesh(new THREE.RingGeometry(4, 7, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.6, 2.2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  gatherRing.visible = false; root.add(gatherRing);

  // ---------- veil orbs (shootable) ----------
  const orbGeo = new THREE.IcosahedronGeometry(0.7, 1);
  const orbs = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.9, 3.2) })); m.visible = false; root.add(m);
    orbs.push({ m, on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 0 });
  }

  // ---------- shades: small Hollowed she sends ----------
  const shades = [];
  for (let i = 0; i < 3; i++) {
    const own = { robe: mk({ color: '#2a2238', roughness: 0.9, flatShading: true, emissive: '#160c28' }), glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.7, 3.2) }) };
    const g = new THREE.Group(); g.visible = false; root.add(g);
    const fg = new THREE.Group(); fg.position.y = 1.9; g.add(fg);
    fg.add(new THREE.Mesh(new THREE.ConeGeometry(0.7, 2, 8, 2, true).translate(0, -0.6, 0), own.robe));
    fg.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), own.robe).translateY(0.5));
    const hd = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 7).rotateX(-0.35), own.robe); hd.position.set(0, 1.1, -0.2); fg.add(hd);
    const ey = new THREE.Group(); ey.position.set(0, 1.05, -0.5); fg.add(ey);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), own.glow); e.position.x = s * 0.09; ey.add(e); }
    shades.push({ g, fg, ey, on: false, x: 0, z: 0, y: 0, yaw: 0, st: 'glide', t: 0, hp: 2, dir: 0, hit: false });
  }

  const T = {
    state: 'dormant', t: 0, hp: MATRIARCH_HP, stage: 0, act: 'veiled', actT: 0, open: 0, flash: 0, hitMark: 0,
    solid: 0.35, orbT: 0, shadeT: 0, wavesLeft: 0, pos: new THREE.Vector3(), drift: 0, armourHits: 0, coreHits: 0, saidWave: false, saidSolid: false,
  };
  T.waves = waves; T.shades = shades; T.orbs = orbs; // for tests
  const S = () => STAGE[T.stage];
  const stageOf = (hp) => (hp > 40 ? 0 : hp > 20 ? 1 : 2);
  const sunkY = floorY - 12;

  function setFade(a) { for (const m of Object.values(M)) m.opacity = a; heartM.opacity = 1; }

  function wake() {
    Object.assign(T, { state: 'rising', t: 0, hp: MATRIARCH_HP, stage: 0, act: 'veiled', actT: 0, open: 0, solid: 0.35, orbT: 1.5, shadeT: 3, drift: 0, saidWave: false, saidSolid: false });
    T.pos.set(C.x, sunkY, C.z);
    body.visible = true; body.position.copy(T.pos);
    keen(true); noise(3, 0.45, 1400, 120, 0.8);
  }
  function clearAll() {
    waves.forEach((w) => { w.on = false; w.m.visible = false; });
    orbs.forEach((o) => { o.on = false; o.m.visible = false; });
    shades.forEach((s) => { s.on = false; s.g.visible = false; });
    gatherRing.visible = false;
  }
  function reset() { T.state = 'dormant'; body.visible = false; clearAll(); heartLight.intensity = 0; }

  function throwOrb() {
    const o = orbs.find((q) => !q.on); if (!o) return;
    const hand = arms[Math.random() < 0.5 ? 0 : 1];
    hand.p.getWorldPosition(o.p); o.p.y -= 3;
    o.v.set(0, 2, 0); o.on = true; o.t = 0; o.m.visible = true; o.m.position.copy(o.p);
    blip(660, 0.25, 'sine', 0.04, 0, 0.5);
  }
  function sendShade() {
    const s = shades.find((q) => !q.on); if (!s) return;
    const a = Math.random() * 6.28;
    Object.assign(s, { on: true, x: T.pos.x + Math.cos(a) * 6, z: T.pos.z + Math.sin(a) * 6, st: 'glide', t: 0, hp: 2, hit: false });
    s.y = floorY; s.g.visible = true;
    fx.emit(v1.set(s.x, floorY + 1.5, s.z), 20, { speed: 4, life: 0.8, size: 1.4, colors: [[1.4, 0.7, 2.6], [0.6, 0.4, 1]], drag: 1.5 });
  }
  function startWaves() {
    const n = S().waves;
    waves.forEach((w, i) => { if (i < n) Object.assign(w, { on: true, r: 5, x: T.pos.x, z: T.pos.z, hit: false, delay: i * WAVE_GAP }); });
    keen(false);
  }

  // ---------- shots ----------
  const hitP = new THREE.Vector3(), heartW = new THREE.Vector3();
  function segSphere(a, b, c, r) {
    v2.subVectors(b, a); const L2 = v2.lengthSq() || 1;
    const u = clamp(v3.subVectors(c, a).dot(v2) / L2, 0, 1);
    v3.copy(a).addScaledVector(v2, u);
    return v3.distanceToSquared(c) < r * r ? u : -1;
  }
  function hitTest(a, b) {
    if (T.state !== 'fight' && T.state !== 'rising') return null;
    let best = 2, kind = null, ref = null;
    for (const o of orbs) if (o.on) { const u = segSphere(a, b, o.p, 1.3); if (u >= 0 && u < best) { best = u; kind = 'orb'; ref = o; hitP.copy(v3); } }
    for (const s of shades) if (s.on) { const u = segSphere(a, b, v1.set(s.x, s.y + 1.9, s.z), 1.3); if (u >= 0 && u < best) { best = u; kind = 'shade'; ref = s; hitP.copy(v3); } }
    // her body only stops shots when she is solid enough to be there at all
    if (T.solid > 0.75) {
      heart.getWorldPosition(heartW);
      // the open heart wins over the robe round it (the robe's sphere used to swallow every shot at the heart)
      if (T.open > 0.6) { const u = segSphere(a, b, heartW, 2.4); if (u >= 0) return { kind: 'core', p: hitP.copy(v3), ref: null }; }
      v1.copy(body.position).add(v2.set(0, 1.5, 0));
      { const u = segSphere(a, b, v1, 3.4); if (u >= 0 && u < best) { best = u; kind = 'armour'; ref = null; hitP.copy(v3); } }
    }
    return kind ? { kind, p: hitP, ref } : null;
  }
  function popOrb(o) { o.on = false; o.m.visible = false; fx.emit(o.p, 18, { speed: 6, life: 0.5, size: 1, colors: [[1.8, 0.9, 3.2], [2.6, 1.8, 3.6]], drag: 2 }); }
  function killShade(s) { s.on = false; s.g.visible = false; fx.emit(v1.set(s.x, s.y + 1.8, s.z), 30, { speed: 7, life: 0.8, size: 1.2, colors: [[1.6, 0.8, 2.8], [2.2, 1.4, 3.2]], drag: 1.6 }); noise(0.4, 0.2, 2600, 500, 1.4); }
  function onBolt(hit, ctx, n = 1, quiet = false) {
    if (T.state !== 'fight') return; // (hits while she is dying used to restart her death)
    if (hit.kind === 'orb') { popOrb(hit.ref); return; }
    if (hit.kind === 'shade') { hit.ref.hp -= n; if (hit.ref.hp <= 0) killShade(hit.ref); else if (!quiet) sfx.hit(); return; }
    if (hit.kind === 'core') {
      T.hp -= n; T.coreHits++; T.flash = 0.12; T.hitMark = 0.15;
      if (!quiet) { fx.emit(hit.p, 10, { speed: 8, life: 0.5, size: 1.4, colors: [[2.4, 1.2, 4], [1.6, 0.8, 3]], drag: 2 }); sfx.hit(); }
      if (T.coreHits === 1) ctx.say('That hurt her! Keep on the heart while it is open.');
      if (T.hp <= 0) { die(ctx); return; }
      const st = stageOf(T.hp);
      if (st !== T.stage) {
        T.stage = st; T.act = 'shatter'; T.actT = 0; keen(true); ctx.shake(1);
        ctx.say(st === 1 ? 'She is splitting the veil twice now. Blink, then blink again.'
          : 'She is stepping through the veil herself. Watch where she comes back. Nearly there.');
      }
    } else if (!quiet) {
      T.armourHits++;
      fx.emit(hit.p, 4, { speed: 6, life: 0.3, size: 0.7, colors: [[1.6, 1, 2.6]], drag: 3 });
      if (T.armourHits === 12 && T.coreHits === 0) ctx.say('Her robe takes the shots. Wait for the heart to open, when she sinks low.');
    }
  }
  function die(ctx) {
    T.state = 'dying'; T.t = 0; T.open = 1; clearAll();
    keen(true); ctx.shake(1);
    ctx.say('She is coming apart. Get clear!');
  }

  function update(dt, ctx) {
    if (T.state === 'dormant' || T.state === 'dead') return null;
    T.t += dt; T.actT += dt;
    const R = ctx.rover, st = S();
    let out = null, wantSolid = 0.35, wantY = floorY + HOVER;

    if (T.state === 'rising') {
      const u = clamp(T.t / 3.4, 0, 1);
      T.pos.y = sunkY + (floorY + HOVER - sunkY) * (1 - Math.pow(1 - u, 3)); wantY = T.pos.y;
      wantSolid = 0.2 + u * 0.4;
      if (Math.random() < 0.6) fx.emit(v1.set(C.x + (Math.random() - 0.5) * 14, floorY + 0.5, C.z + (Math.random() - 0.5) * 14), 3, { speed: 3, life: 1.4, size: 2, colors: [[1, 0.5, 1.8], [0.5, 0.35, 0.8]], drag: 1, dir: v2.set(0, 5, 0) });
      ctx.shake(0.3);
      if (u >= 1) { T.state = 'fight'; T.act = 'veiled'; T.actT = 0; keen(true); out = 'awake'; }
    } else if (T.state === 'fight') {
      switch (T.act) {
        case 'shatter':
          wantSolid = 0.5;
          if (T.actT > 1.6) { T.act = 'veiled'; T.actT = 0; }
          break;
        case 'veiled': {
          wantSolid = 0.35;
          // drift slowly round the middle of the arena
          T.drift += dt * 0.35;
          v1.set(C.x + Math.cos(T.drift) * 9, 0, C.z + Math.sin(T.drift * 1.3) * 9);
          T.pos.x += (v1.x - T.pos.x) * Math.min(1, dt * 0.8); T.pos.z += (v1.z - T.pos.z) * Math.min(1, dt * 0.8);
          T.orbT -= dt; if (T.orbT <= 0) { T.orbT = st.orbEvery; throwOrb(); }
          T.shadeT -= dt; if (T.shadeT <= 0) { T.shadeT = 6; if (shades.filter((s) => s.on).length < st.shades) sendShade(); }
          if (T.actT > st.veiled) { T.act = 'gather'; T.actT = 0; gatherRing.visible = true; keen(false); }
          break;
        }
        case 'gather':
          wantSolid = 0.6; wantY = floorY + HOVER + 2.5;
          gatherRing.position.set(T.pos.x, floorY + 0.15, T.pos.z);
          gatherRing.material.opacity = 0.3 + 0.5 * Math.abs(Math.sin(T.actT * 10));
          gatherRing.scale.setScalar(1 + T.actT * 0.4);
          if (T.actT > GATHER_T) {
            gatherRing.visible = false; T.act = 'wave'; T.actT = 0; startWaves();
            if (!T.saidWave) { T.saidWave = true; ctx.say('A wave of veil! Blink through it as it reaches us.'); }
          }
          break;
        case 'wave':
          wantSolid = 0.5;
          if (waves.every((w) => !w.on)) { T.act = 'solid'; T.actT = 0; keen(false); blip(300, 0.5, 'sine', 0.06, 0, 0.5); }
          break;
        case 'solid':
          wantSolid = 1; wantY = floorY + LOW;
          if (!T.saidSolid && T.actT > 0.6) { T.saidSolid = true; ctx.say('She is solid! The light in her chest. Shoot it!'); }
          if (T.actT > st.solid) {
            T.act = 'veiled'; T.actT = 0; T.orbT = 0.8;
            if (st.relocate) { // she steps through the veil to somewhere else in the arena
              fx.emit(body.position, 60, { speed: 10, life: 0.8, size: 1.6, colors: [[1.6, 0.8, 2.8]], drag: 1.4 });
              const a = Math.random() * 6.28, r = 8 + Math.random() * 14;
              T.pos.x = C.x + Math.cos(a) * r; T.pos.z = C.z + Math.sin(a) * r;
              T.solid = 0; noise(0.6, 0.3, 3200, 500, 1.6);
            }
          }
          break;
      }
    } else if (T.state === 'dying') {
      const u = clamp(T.t / 4.2, 0, 1);
      wantSolid = 1 - u; wantY = floorY + LOW + u * 10;
      body.rotation.z = Math.sin(T.t * 4) * 0.1 * u;
      if (Math.random() < 0.35) {
        v1.set((Math.random() - 0.5) * 6, Math.random() * 12 - 4, (Math.random() - 0.5) * 6).add(body.position);
        fx.emit(v1, 30, { speed: 7, life: 1.2, size: 1.6, colors: [[1.6, 0.8, 2.8], [2.4, 1.6, 3.4], [0.6, 0.4, 1]], drag: 1.2 });
        ctx.shake(0.4);
      }
      if (T.t > 4.6) {
        T.state = 'dead'; body.visible = false; heartLight.intensity = 0;
        fx.emit(body.position, 180, { speed: 16, life: 1.8, size: 1.6, colors: [[1.6, 0.8, 2.8], [2.6, 1.8, 3.6]], drag: 1.2 });
        sfx.explode(true); out = 'dead';
      }
    }

    // pose
    if (T.state !== 'rising') T.pos.y += (wantY + (T.state === 'fight' ? Math.sin(T.t * 1.1) * 0.6 : 0) - T.pos.y) * Math.min(1, dt * 2.2);
    body.position.copy(T.pos);
    body.rotation.y = Math.atan2(-(R.pos.x - T.pos.x), -(R.pos.z - T.pos.z)); // she faces the rover: her front (and heart) is -Z (owner, 2026-11-22: an extra half-turn hid the heart behind her)
    T.solid += (wantSolid - T.solid) * Math.min(1, dt * 3);
    setFade(T.solid);
    const exposed = T.state === 'dying' || (T.state === 'fight' && T.act === 'solid' && T.actT > 0.5 && T.actT < st.solid - 0.3);
    T.open += ((exposed ? 1 : 0) - T.open) * (1 - Math.exp(-(exposed ? 6 : 10) * dt));
    flaps.forEach((f) => { f.f.position.x = f.s * (0.21 + T.open * 0.32); f.f.rotation.y = f.s * T.open * 0.8; });
    arms.forEach((a) => { a.p.rotation.x = T.act === 'gather' ? -2.3 : T.act === 'solid' ? 0.3 : -0.4 + Math.sin(T.t * 1.2 + a.s) * 0.25; a.p.rotation.z = a.s * (T.act === 'gather' ? 0.5 : 0.15); });
    eyes.scale.setScalar(T.act === 'gather' ? 1.6 + Math.sin(T.t * 20) * 0.3 : 1);
    T.flash = Math.max(0, T.flash - dt); T.hitMark = Math.max(0, T.hitMark - dt);
    const hk = (0.4 + T.open * 1.1) * (0.85 + 0.15 * Math.sin(T.t * 6)) + T.flash * 5;
    heartM.color.setRGB(2.2 * hk, 1.1 * hk, 4 * hk); heart.scale.setScalar(1 + T.open * 0.8 + T.flash * 1.2);
    heartLight.position.copy(heart.getWorldPosition(v1)); heartLight.intensity = T.state === 'fight' || T.state === 'dying' ? 10 + T.open * 50 + T.flash * 120 : 0;

    // waves
    for (const w of waves) {
      if (!w.on) continue;
      if (w.delay > 0) { w.delay -= dt; continue; }
      w.r += st.waveSpeed * dt;
      w.m.visible = true; w.m.position.set(w.x, floorY, w.z); w.m.scale.set(w.r, 1, w.r);
      w.m.material.opacity = 0.65 * clamp(1 - (w.r - AR * 0.85) / (AR * 0.25), 0, 1);
      const rr = Math.hypot(R.pos.x - w.x, R.pos.z - w.z);
      if (!w.hit && Math.abs(rr - w.r) < 1.4 && R.pos.y - ctx.ground(R.pos.x, R.pos.z) < WAVE_H && !(ctx.blinking && ctx.blinking())) {
        w.hit = true; ctx.damage(15); ctx.shake(0.9);
        v1.set(R.pos.x - w.x, 0, R.pos.z - w.z).normalize(); R.vel.addScaledVector(v1, 9); R.vel.y += 5;
        fx.emit(R.pos, 30, { speed: 8, life: 0.7, size: 1.2, colors: [[1.6, 0.8, 2.8], [2.4, 1.6, 3.4]], drag: 1.6 });
        ctx.say && T.coreHits === 0 && ctx.say('Blink right as it reaches us. It cannot touch us mid-blink.');
      }
      if (w.r > AR + 4) { w.on = false; w.m.visible = false; }
    }
    // orbs: slow, homing a little; shoot them down or dodge
    for (const o of orbs) {
      if (!o.on) continue;
      o.t += dt;
      v1.set(R.pos.x, R.pos.y + 0.6, R.pos.z).sub(o.p).normalize().multiplyScalar(10);
      o.v.lerp(v1, Math.min(1, dt * 1.1));
      o.p.addScaledVector(o.v, dt);
      o.m.position.copy(o.p); o.m.rotation.y += dt * 3; o.m.scale.setScalar(0.85 + 0.15 * Math.sin(o.t * 12));
      if (Math.random() < 0.5) fx.emit(o.p, 1, { speed: 0.5, life: 0.4, size: 0.9, colors: [[1.2, 0.6, 2.2]], drag: 2 });
      if (o.p.distanceTo(R.pos) < 2) { ctx.damage(9); ctx.shake(0.5); popOrb(o); continue; }
      if (o.t > 6 || o.p.y < ctx.ground(o.p.x, o.p.z)) popOrb(o);
    }
    // shades: glide in, flare (the tell), lunge
    for (const s of shades) {
      if (!s.on) continue;
      s.t += dt;
      const dx = R.pos.x - s.x, dz = R.pos.z - s.z, d = Math.hypot(dx, dz) || 1, toward = Math.atan2(dx, dz);
      let sp = 0;
      if (s.st === 'glide') { sp = 8; s.dir = toward; if (d < 13 && s.t > 1) { s.st = 'tell'; s.t = 0; } }
      else if (s.st === 'tell') { sp = 0; s.dir = toward; if (s.t > 0.7) { s.st = 'lunge'; s.t = 0; s.hit = false; } }
      else if (s.st === 'lunge') {
        sp = 22; let dd = toward - s.dir; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); s.dir += clamp(dd, -0.8 * dt, 0.8 * dt);
        if (!s.hit && d < 2.6) { s.hit = true; ctx.damage(8); ctx.shake(0.5); }
        if (s.t > 0.75) { s.st = 'glide'; s.t = 0; }
      }
      s.x += Math.sin(s.dir) * sp * dt; s.z += Math.cos(s.dir) * sp * dt;
      const ax = s.x - C.x, az = s.z - C.z, ad = Math.hypot(ax, az); // they stay in the arena
      if (ad > AR - 2) { s.x = C.x + ax * (AR - 2) / ad; s.z = C.z + az * (AR - 2) / ad; }
      s.y = ctx.ground(s.x, s.z);
      s.g.position.set(s.x, s.y, s.z); s.g.rotation.y = s.dir + Math.PI;
      s.fg.position.y = 1.9 + Math.sin(T.t * 2 + s.x) * 0.2; s.fg.rotation.x = s.st === 'lunge' ? -0.4 : 0;
      s.ey.scale.setScalar(s.st === 'tell' ? 1.7 + Math.sin(s.t * 30) * 0.3 : 1);
    }
    return out;
  }

  return {
    wake, reset, update, hitTest, onBolt,
    centre: new THREE.Vector3(C.x, floorY + 2.5, C.z),
    arenaR: AR,
    get state() { return T.state; },
    get hp() { return T.hp; },
    get open() { return T.open; },
    get hitMark() { return T.hitMark; },
    get act() { return T.act; },
    get icy() { return false; },
    corePos: (out) => heart.getWorldPosition(out),
    debug: T,
  };
}
