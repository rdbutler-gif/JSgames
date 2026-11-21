// The Thalor vault guardian: Sentinel Prime. A Warden ice construct that rises out of the vault and
// hovers over it. Four ice shields orbit its core and take the rover's shots. It fights in a cycle:
//   guard  - ice spikes erupt under the rover (a glowing ring first)
//   charge - one band of the arena floor (inner or outer: the one we are in) glows: a sweep is coming
//   sweep  - a frost blade turns round the arena over that band; get to the other band (nitro!)
//   expose - the shields fly wide and the core opens: the only time it takes damage
// Three stages by core HP (60 / 40 / 20): stage 2 freezes the arena floor (slick, like the sea ice),
// stage 3 sweeps with two blades and throws spikes in threes.
// Same interface as the Foundry Titan (guardian.js), so the surface fight code drives either.
import * as THREE from 'three';
import { VLight } from './lightpool.js';
import { sfx, noise, blip } from './audio.js';

const clamp = THREE.MathUtils.clamp;
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();

export const SENTINEL_HP = 60;
const STAGE = [
  { guard: 4.6, spikeEvery: 2.0, spikes: 1, sweepSpeed: 0.85, blades: 1, expose: 4.6 },
  { guard: 4.0, spikeEvery: 1.6, spikes: 2, sweepSpeed: 1.05, blades: 1, expose: 4.0 },
  { guard: 3.4, spikeEvery: 1.3, spikes: 3, sweepSpeed: 1.2, blades: 2, expose: 3.4 },
];
const HOVER = 7.5;       // core height above the vault top
const SCALE = 1.35;     // the whole construct (hit sizes follow)
const SHIELD_R = 3.6 * SCALE; // shields' orbit, closed
const CHARGE_T = 1.5;    // the floor band glows this long before a sweep
const SPIKE_T = 1.1;     // ring warning before a spike erupts

// one sentinel-ish sound: a resonant glassy chord (synth; no sample)
function cry(big) {
  [880, 1320, 1760].forEach((f, i) => blip(f * (big ? 0.5 : 1), big ? 1.4 : 0.6, 'sine', big ? 0.09 : 0.05, i * 0.05, 0.85));
  noise(big ? 1.6 : 0.6, big ? 0.3 : 0.15, 6000, 900, 2);
}

export function createSentinel({ root, def, terrain, fx }) {
  const C = new THREE.Vector3(def.vault.x, terrain.vaultH + 2.5, def.vault.z);
  const AR = def.arenaR || 36;
  const BAND = [[11, 23.5], [23.5, AR - 0.5]]; // inner and outer sweep bands (the vault base fills r < 10)

  // ---------- the body ----------
  const iceM = new THREE.MeshStandardMaterial({ color: '#cfeaf7', roughness: 0.12, metalness: 0.1, emissive: '#0d3546', flatShading: true });
  const stoneM = new THREE.MeshStandardMaterial({ color: '#7f8b95', roughness: 0.6, metalness: 0.3, flatShading: true });
  const glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 2.6, 3.4) });
  const coreM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 3.4, 4) });
  const body = new THREE.Group(); root.add(body); body.visible = false; body.scale.setScalar(SCALE);
  // spindle: two long crystal halves that part to show the core
  const halves = [-1, 1].map((s) => {
    const g = new THREE.Group(); body.add(g);
    const h = new THREE.Mesh(new THREE.OctahedronGeometry(2.2, 0).scale(0.55, 3.2, 1), iceM); h.position.x = s * 0.62; g.add(h);
    h.castShadow = true;
    return { g, s };
  });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), coreM); body.add(core);
  const coreLight = new VLight('#9fe6ff', 0, 30, 1.5); body.add(coreLight);
  // Warden collar and a crown of three blades
  const collar = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.35, 6, 24), stoneM); collar.rotation.x = Math.PI / 2; collar.position.y = -2.6; body.add(collar);
  const crown = new THREE.Group(); crown.position.y = 5.6; body.add(crown);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3.2, 4), iceM); const a = (i / 3) * Math.PI * 2;
    b.position.set(Math.cos(a) * 1.1, 0.6, Math.sin(a) * 1.1); b.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45); crown.add(b);
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), glowM); eye.position.y = 4.2; body.add(eye);
  // the four shields
  const shields = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.6, 0.55), iceM); m.castShadow = true; root.add(m); m.visible = false; m.scale.setScalar(SCALE);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.14, 0.6), glowM); rim.position.y = 1.7; m.add(rim);
    shields.push({ m, a: (i / 4) * Math.PI * 2, p: new THREE.Vector3() });
  }
  const shieldLight = new VLight('#8fe8ff', 0, 40, 1.4); shieldLight.position.copy(C).add(v1.set(0, 3, 0)); root.add(shieldLight);

  // ---------- the floor: sweep bands, the frozen arena ----------
  const bandMeshes = BAND.map(([r0, r1]) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 72, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.2, 3), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(C.x, terrain.vaultH + 0.12, C.z); m.visible = false; root.add(m);
    return m;
  });
  const frost = new THREE.Mesh(new THREE.CircleGeometry(AR, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#cbe9f6', roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0 }));
  frost.position.set(C.x, terrain.vaultH + 0.08, C.z); frost.receiveShadow = true; frost.visible = false; root.add(frost);
  // the frost blades: tall additive sheets from the centre outward, over one band
  const blades = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.8, 3.6), transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.visible = false; root.add(m);
    return m;
  });
  const bladeLight = new VLight('#9fe6ff', 0, 26, 1.6); root.add(bladeLight);
  // ice spikes: a ring marker, then a cluster of crystals that bursts up and sinks back
  const spikeGeo = new THREE.ConeGeometry(0.7, 1, 5).translate(0, 0.5, 0);
  const spikes = [];
  for (let i = 0; i < 9; i++) {
    const mk = new THREE.Mesh(new THREE.RingGeometry(3.2, 4.2, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.2, 3), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    mk.visible = false; root.add(mk);
    const g = new THREE.Group(); g.visible = false; root.add(g);
    for (let k = 0; k < 6; k++) {
      const c = new THREE.Mesh(spikeGeo, iceM); const a = (k / 6) * Math.PI * 2, r = k ? 1.4 : 0;
      c.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); c.scale.set(1, k ? 3.2 : 5, 1); c.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3); g.add(c);
    }
    spikes.push({ mk, g, on: false, t: 0, x: 0, z: 0, y: 0, hit: false });
  }

  const T = {
    state: 'dormant', t: 0, hp: SENTINEL_HP, stage: 0, act: 'guard', actT: 0, open: 0, flash: 0, hitMark: 0,
    spin: 0, band: 0, sweepA: 0, sweepDone: 0, spikeT: 0, armourHits: 0, coreHits: 0, icy: 0, bladeHit: 0,
  };
  const S = () => STAGE[T.stage];
  function stageOf(hp) { return hp > 40 ? 0 : hp > 20 ? 1 : 2; }
  const restY = C.y + HOVER, sunkY = C.y - 14;

  function wake() {
    Object.assign(T, { state: 'rising', t: 0, hp: SENTINEL_HP, stage: 0, act: 'guard', actT: 0, open: 0, icy: 0, spikeT: 1.5 });
    body.visible = true; body.position.set(C.x, sunkY, C.z);
    shields.forEach((s) => { s.m.visible = true; });
    cry(true); noise(3, 0.45, 2400, 200, 0.8);
  }
  function reset() {
    T.state = 'dormant'; T.icy = 0; body.visible = false;
    shields.forEach((s) => { s.m.visible = false; });
    spikes.forEach((s) => { s.on = false; s.mk.visible = false; s.g.visible = false; });
    blades.forEach((b) => { b.visible = false; });
    bandMeshes.forEach((m) => { m.visible = false; });
    frost.visible = false; frost.material.opacity = 0; coreLight.intensity = 0; shieldLight.intensity = 0; bladeLight.intensity = 0;
  }

  function throwSpikes(ctx) {
    const R = ctx.rover, n = S().spikes;
    for (let k = 0; k < n; k++) {
      const s = spikes.find((q) => !q.on);
      if (!s) return;
      // the first lands where we will be; the others flank it
      const lead = 0.8;
      let x = R.pos.x + R.vel.x * lead, z = R.pos.z + R.vel.z * lead;
      if (k > 0) { const a = Math.random() * 6.28; x += Math.cos(a) * 7; z += Math.sin(a) * 7; }
      const d = Math.hypot(x - C.x, z - C.z);
      if (d > AR - 2) { x = C.x + (x - C.x) * (AR - 2) / d; z = C.z + (z - C.z) * (AR - 2) / d; }
      if (d < 12) { x = C.x + (x - C.x) * 12 / Math.max(d, 1); z = C.z + (z - C.z) * 12 / Math.max(d, 1); }
      Object.assign(s, { on: true, t: 0, x, z, y: ctx.ground(x, z), hit: false });
      s.mk.visible = true; s.mk.position.set(x, s.y + 0.15, z);
      s.g.position.set(x, s.y, z); s.g.scale.setScalar(0.01); s.g.visible = false;
    }
    blip(1400, 0.2, 'triangle', 0.05, 0, 0.6);
  }

  // shots: the shields and the spindle are armour; the core only counts while it is open
  const hitP = new THREE.Vector3(), coreW = new THREE.Vector3();
  function segSphere(a, b, c, r) {
    v2.subVectors(b, a); const L2 = v2.lengthSq() || 1;
    const u = clamp(v3.subVectors(c, a).dot(v2) / L2, 0, 1);
    v3.copy(a).addScaledVector(v2, u);
    return v3.distanceToSquared(c) < r * r ? u : -1;
  }
  function hitTest(a, b) {
    if (T.state !== 'fight' && T.state !== 'rising') return null;
    core.getWorldPosition(coreW);
    let best = 2, kind = null;
    for (const s of shields) { const u = segSphere(a, b, s.p, 1.9 * SCALE); if (u >= 0 && u < best) { best = u; kind = 'armour'; hitP.copy(v3); } }
    if (T.open > 0.6) { const u = segSphere(a, b, coreW, 1.8 * SCALE); if (u >= 0 && u < best) { best = u; kind = 'core'; hitP.copy(v3); } }
    else { const u = segSphere(a, b, coreW, 1.9 * SCALE); if (u >= 0 && u < best) { best = u; kind = 'armour'; hitP.copy(v3); } }
    v1.copy(coreW).add(v2.set(0, 3.2 * SCALE, 0));
    { const u = segSphere(a, b, v1, 1.4 * SCALE); if (u >= 0 && u < best) { best = u; kind = 'armour'; hitP.copy(v3); } }
    return kind ? { kind, p: hitP } : null;
  }
  function onBolt(hit, ctx, n = 1, quiet = false) {
    if (hit.kind === 'core') {
      T.hp -= n; T.coreHits++; T.flash = 0.12; T.hitMark = 0.15;
      if (!quiet) { fx.emit(hit.p, 10, { speed: 8, life: 0.5, size: 1.4, colors: [[2, 3.4, 4], [1.2, 2.4, 3.2]], drag: 2 }); sfx.hit(); }
      if (T.coreHits === 1) ctx.say('Core hit! Keep on it while the shields are out.');
      const st = stageOf(T.hp);
      if (T.hp <= 0) { die(ctx); return; }
      if (st !== T.stage) {
        T.stage = st; T.act = 'shatter'; T.actT = 0;
        cry(true); ctx.shake(1);
        ctx.say(st === 1 ? 'It is freezing the whole arena floor. We will slide now. Steer early, and use the nitro.'
          : 'Two blades now, and the spikes come in threes. It is cracking. Nearly there.');
      }
    } else if (!quiet) {
      T.armourHits++;
      fx.emit(hit.p, 4, { speed: 6, life: 0.3, size: 0.7, colors: [[2, 3, 3.6]], drag: 3 });
      if (T.armourHits % 3 === 0) blip(4200 + Math.random() * 800, 0.03, 'sine', 0.02);
      if (T.armourHits === 14 && T.coreHits === 0) ctx.say('The shields take everything. Wait for them to fly out, after its sweep. Then hit the core.');
    }
  }
  function die(ctx) {
    T.state = 'dying'; T.t = 0; T.open = 1;
    spikes.forEach((s) => { s.on = false; s.mk.visible = false; s.g.visible = false; });
    blades.forEach((b) => { b.visible = false; }); bandMeshes.forEach((m) => { m.visible = false; });
    cry(true); ctx.shake(1);
    ctx.say('It is breaking apart. Get clear!');
  }

  function update(dt, ctx) {
    if (T.state === 'dormant' || T.state === 'dead') return null;
    T.t += dt; T.actT += dt;
    const R = ctx.rover;
    let out = null;
    const st = S();
    const rr = Math.hypot(R.pos.x - C.x, R.pos.z - C.z), ra = Math.atan2(R.pos.z - C.z, R.pos.x - C.x);

    if (T.state === 'rising') {
      const u = clamp(T.t / 3.2, 0, 1);
      body.position.y = sunkY + (restY - sunkY) * (1 - Math.pow(1 - u, 3));
      if (Math.random() < 0.5) fx.emit(v1.set(C.x + (Math.random() - 0.5) * 10, C.y, C.z + (Math.random() - 0.5) * 10), 3, { speed: 4, life: 1, size: 1.6, colors: [[1.6, 2.4, 3], [0.8, 0.9, 1]], drag: 1, dir: v2.set(0, 6, 0) });
      ctx.shake(0.3);
      if (u >= 1) { T.state = 'fight'; T.act = 'guard'; T.actT = 0; cry(true); out = 'awake'; }
    } else if (T.state === 'fight') {
      switch (T.act) {
        case 'shatter': // a stage change: a cry and a burst of shards, then on with the fight
          if (T.actT < 0.1 && Math.random() < 0.5) fx.emit(body.position, 40, { speed: 12, life: 1, size: 1, colors: [[1.8, 2.6, 3.2]], drag: 1.2 });
          if (T.actT > 1.6) { T.act = 'guard'; T.actT = 0; }
          break;
        case 'guard':
          T.spikeT -= dt;
          if (T.spikeT <= 0) { T.spikeT = st.spikeEvery; throwSpikes(ctx); }
          if (T.actT > st.guard) {
            // the sweep hits the band we are in now
            T.act = 'charge'; T.actT = 0; T.band = rr < BAND[0][1] ? 0 : 1;
            bandMeshes[T.band].visible = true; cry(false);
            ctx.say && T.sweepsSaid !== true && (T.sweepsSaid = true, ctx.say(T.band ? 'The outer ring is lighting up. Get inside, fast. Nitro!' : 'The inner ring is lighting up. Get out to the edge, fast. Nitro!'));
          }
          break;
        case 'charge':
          bandMeshes[T.band].material.opacity = 0.2 + 0.35 * Math.abs(Math.sin(T.actT * 12));
          if (T.actT > CHARGE_T) { T.act = 'sweep'; T.actT = 0; T.sweepA = ra + Math.PI * 0.75; T.sweepDone = 0; T.bladeHit = 0; noise(1.2, 0.3, 3000, 800, 1.2); }
          break;
        case 'sweep': {
          const w = st.sweepSpeed * (T.stage >= 2 ? 1 : 1);
          T.sweepA += w * dt; T.sweepDone += w * dt;
          bandMeshes[T.band].material.opacity = 0.18;
          const [r0, r1] = BAND[T.band];
          blades.forEach((b, i) => {
            const on = i < st.blades;
            b.visible = on; if (!on) return;
            const a = T.sweepA + i * Math.PI;
            b.position.set(C.x + Math.cos(a) * r0, terrain.vaultH, C.z + Math.sin(a) * r0);
            b.rotation.set(0, -a, 0); b.scale.set(r1 - r0, 4.2, 1);
            // the blade passing over the rover in its band
            let da = ra - a; da = Math.atan2(Math.sin(da), Math.cos(da));
            if (rr > r0 - 1 && rr < r1 + 1 && Math.abs(da) * rr < 2.2 && T.bladeHit <= 0) {
              T.bladeHit = 0.8;
              ctx.damage(18); ctx.shake(1);
              R.vel.x += -Math.sin(a) * 9; R.vel.z += Math.cos(a) * 9; R.vel.y += 4; // flung along the sweep
              fx.emit(R.pos, 30, { speed: 9, life: 0.7, size: 1, colors: [[1.6, 2.6, 3.2], [2.6, 3, 3.4]], drag: 1.6 });
            }
            if (Math.random() < 0.6) { const t = r0 + Math.random() * (r1 - r0); fx.emit(v1.set(C.x + Math.cos(a) * t, terrain.vaultH + 0.5, C.z + Math.sin(a) * t), 1, { speed: 2, life: 0.6, size: 1.2, colors: [[1.6, 2.6, 3.2]], drag: 1, dir: v2.set(0, 2, 0) }); }
          });
          T.bladeHit -= dt;
          const lead = blades[0]; bladeLight.position.copy(lead.position).add(v1.set(0, 2, 0)); bladeLight.intensity = 40;
          if (T.sweepDone > Math.PI * 2 / st.blades) {
            blades.forEach((b) => { b.visible = false; }); bandMeshes.forEach((m) => { m.visible = false; m.material.opacity = 0; });
            bladeLight.intensity = 0;
            T.act = 'expose'; T.actT = 0; cry(false); blip(300, 0.5, 'sine', 0.06, 0, 0.5);
          }
          break;
        }
        case 'expose':
          if (T.actT > st.expose) { T.act = 'guard'; T.actT = 0; T.spikeT = 0.8; blip(500, 0.25, 'triangle', 0.05); }
          break;
      }
    } else if (T.state === 'dying') {
      const u = clamp(T.t / 4, 0, 1);
      body.position.y = restY - u * u * (HOVER + 1.5);
      body.rotation.z = Math.sin(T.t * 5) * 0.12 * u;
      if (Math.random() < 0.3) {
        v1.set((Math.random() - 0.5) * 3, (Math.random() - 0.2) * 7, (Math.random() - 0.5) * 3).add(body.position);
        fx.emit(v1, 40, { speed: 10, life: 1, size: 1, colors: [[1.8, 2.6, 3.2], [2.6, 3, 3.4], [1, 1.2, 1.4]], drag: 1.4 });
        if (Math.random() < 0.5) noise(0.5, 0.3, 5000, 700, 1.6);
        ctx.shake(0.5);
      }
      if (T.t > 4.4) {
        T.state = 'dead'; body.visible = false; shields.forEach((s) => { s.m.visible = false; });
        fx.emit(body.position, 160, { speed: 16, life: 1.6, size: 1.4, colors: [[1.8, 2.6, 3.2], [2.6, 3, 3.4]], drag: 1.2 });
        sfx.explode(true); out = 'dead';
      }
    }

    // pose: hover bob, spin, shields orbit (wide and slow while exposed), spindle halves part
    if (T.state === 'fight') body.position.y = restY + Math.sin(T.t * 1.3) * 0.5;
    const exposed = T.state === 'dying' || (T.state === 'fight' && T.act === 'expose' && T.actT > 0.4 && T.actT < S().expose - 0.3);
    T.open += ((exposed ? 1 : 0) - T.open) * (1 - Math.exp(-(exposed ? 6 : 10) * dt));
    T.spin += dt * (T.act === 'sweep' ? 2.4 : exposed ? 0.4 : 1.1 + T.stage * 0.3);
    body.rotation.y = T.spin * 0.4;
    halves.forEach((h) => { h.g.position.x = h.s * T.open * 1.1; });
    crown.rotation.y = -T.spin;
    const shR = SHIELD_R + T.open * 7.5, shY = (exposed ? 1.5 : 0) + Math.sin(T.t * 2) * 0.3;
    shields.forEach((s, i) => {
      const a = T.spin + i * Math.PI / 2;
      s.p.set(body.position.x + Math.cos(a) * shR, body.position.y + shY, body.position.z + Math.sin(a) * shR);
      s.m.position.copy(s.p); s.m.rotation.set(0, -a + Math.PI / 2, 0);
    });
    shieldLight.intensity = T.state === 'fight' ? 18 : 0;
    // core glow
    T.flash = Math.max(0, T.flash - dt); T.hitMark = Math.max(0, T.hitMark - dt);
    const ck = (0.35 + T.open * 0.9) * (0.8 + 0.2 * Math.sin(T.t * 7)) + T.flash * 6;
    coreM.color.setRGB(1.6 * ck, 3.4 * ck, 4 * ck); core.scale.setScalar(1 + T.flash * 1.4);
    coreLight.intensity = T.open * 45 + T.flash * 160;
    glowM.color.setRGB(0.8 + T.stage * 0.4, 2.6, 3.4);
    // the frozen floor (stage 2 on): fades in, and the surface reads T.icy for tyre grip
    const wantIce = T.state === 'fight' && T.stage >= 1 ? 1 : 0;
    T.icy += (wantIce - T.icy) * Math.min(1, dt * 1.2);
    frost.visible = T.icy > 0.02; frost.material.opacity = T.icy * 0.85;

    // spikes
    for (const s of spikes) {
      if (!s.on) continue;
      s.t += dt;
      if (s.t < SPIKE_T) { s.mk.material.opacity = 0.3 + 0.6 * (s.t / SPIKE_T) * (0.6 + 0.4 * Math.sin(s.t * 28)); continue; }
      if (!s.g.visible) {
        s.g.visible = true; s.mk.visible = false;
        fx.emit(v1.set(s.x, s.y + 1, s.z), 24, { speed: 7, life: 0.7, size: 1, colors: [[1.8, 2.6, 3.2], [2.6, 3, 3.4]], drag: 1.6, dir: v2.set(0, 6, 0) });
        noise(0.35, 0.3, 4000, 600, 1.4);
        const d = Math.hypot(R.pos.x - s.x, R.pos.z - s.z);
        if (d < 3.8 && R.pos.y - s.y < 4) { ctx.damage(16); ctx.shake(0.9); R.vel.y += 7; v1.set(R.pos.x - s.x, 0, R.pos.z - s.z).normalize(); R.vel.addScaledVector(v1, 5); }
      }
      const u = s.t - SPIKE_T;
      s.g.scale.set(1, clamp(u * 8, 0, 1) * (u > 0.7 ? clamp(1 - (u - 0.7) / 0.5, 0, 1) : 1), 1);
      if (u > 1.2) { s.on = false; s.g.visible = false; }
    }
    return out;
  }

  return {
    wake, reset, update, hitTest, onBolt,
    centre: C,
    arenaR: AR,
    get state() { return T.state; },
    get hp() { return T.hp; },
    get open() { return T.open; },
    get hitMark() { return T.hitMark; },
    get act() { return T.act; },
    get icy() { return T.icy > 0.5; },
    corePos: (out) => core.getWorldPosition(out),
    debug: T,
  };
}
