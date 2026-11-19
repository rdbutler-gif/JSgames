// Phase II: Formation Assault. A chase-camera formation shooter, fought where you engaged the
// raiders: the arena is a frame fixed at the engagement point, with the system as its backdrop.
// Arena space: player flies on the z = 0 plane, the formation holds near z = FORM_Z ahead (-Z).
import * as THREE from 'three';
import { makeFighter, toon } from './fighters.js';
import { cloneModel, hasModel } from './models.js';
import { settings } from './settings.js';
import { sfx } from './audio.js';

const BOUNDS = { x: 62, y: 34 };
const FORM_Z = -175;
const CAM_BACK = 40, CAM_UP = 9;
const FONT = '"Chakra Petch", sans-serif';
const CYAN = '110,242,255', AMBER = '255,179,90', RED = '255,77,109', GOLD = '255,211,106';

const KINDS = {
  raider: { hp: 3, value: 10, scale: 1, emissive: null, radius: 9 },
  lancer: { hp: 5, value: 15, scale: 1.08, emissive: '#5a1800', radius: 9.5 },
  warden: { hp: 110, value: 250, scale: 2.5, emissive: '#3a2600', radius: 22 },
};

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
const clamp = THREE.MathUtils.clamp;
const rand = (a, b) => a + Math.random() * (b - a);

// ---------- meshes ----------
function makePlayerFallback() {
  const g = new THREE.Group();
  const white = toon('#e9ecef'), teal = toon('#2fb8b0'), amber = toon('#f0a03c'), dark = toon('#3a3f48');
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, 16, 8), white);
  body.rotation.x = -Math.PI / 2; g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.6, 4, 8), teal);
  nose.rotation.x = -Math.PI / 2; nose.position.z = -10; g.add(nose);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 6), white);
    w.position.set(s * 5.5, -0.3, 2); w.rotation.y = s * 0.25; g.add(w);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 5), amber);
    tip.position.set(s * 9.4, -0.3, 2.8); g.add(tip);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3, 3), amber);
    fin.position.set(s * 2.4, 2, 5.5); fin.rotation.z = s * 0.3; g.add(fin);
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 4, 10), dark);
    eng.rotation.x = Math.PI / 2; eng.position.set(s * 2.2, -0.6, 7); g.add(eng);
  }
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.6, 1.8) }));
  canopy.scale.set(0.9, 0.6, 1.8); canopy.position.set(0, 1.4, -4); g.add(canopy);
  return g;
}

function collectMats(obj) {
  const list = [];
  obj.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.emissive) return;
    list.push({ m: o.material, base: o.material.emissive.clone() });
  });
  return list;
}

function makeEnemyMesh(kind) {
  const K = KINDS[kind];
  const holder = new THREE.Group();
  let body = cloneModel('raider');
  if (!body) { body = makeFighter(); body.remove(body.userData.glow); body.scale.setScalar(1.8); }
  else if (kind !== 'raider') {
    // Generated textures use MeshStandardMaterial: an emissive tint marks the variant.
    body.traverse((o) => { if (o.isMesh && o.material.emissive) o.material.emissive.set(K.emissive); });
  }
  if (K.emissive && !hasModel('raider')) body.traverse((o) => { if (o.isMesh && o.material.emissive && o.material.color) o.material.emissive.set(K.emissive); });
  holder.add(body);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), new THREE.MeshBasicMaterial({ color: kind === 'lancer' ? new THREE.Color(4, 1.6, 0.4) : new THREE.Color(3.2, 0.7, 1.8) }));
  glow.scale.set(1, 1, 0.6); glow.position.set(0, 0, 11.5);
  holder.add(glow);
  holder.scale.setScalar(K.scale);
  holder.userData.mats = collectMats(body);
  return holder;
}

function radialTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- particles ----------
export function makeParticles(N) {
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
  const vel = new Float32Array(N * 3), life = new Float32Array(N), max = new Float32Array(N), drag = new Float32Array(N), s0 = new Float32Array(N);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { pr: { value: 1 } },
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
      uniform float pr;
      void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*pr*(420.0/max(1.0,-mv.z)); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main(){ vec2 d=gl_PointCoord-0.5; float r=dot(d,d)*4.0; if(r>1.0) discard; float a=(1.0-r); gl_FragColor=vec4(vC*a*vA, 1.0); }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  let next = 0;
  return {
    pts, mat,
    emit(p, n, o) {
      for (let k = 0; k < n; k++) {
        const i = next; next = (next + 1) % N;
        const sp = rand(o.speed * 0.3, o.speed);
        v1.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(sp);
        if (o.dir) v1.add(o.dir);
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        vel[i * 3] = v1.x; vel[i * 3 + 1] = v1.y; vel[i * 3 + 2] = v1.z;
        const c = o.colors[(Math.random() * o.colors.length) | 0];
        col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
        max[i] = life[i] = rand(o.life * 0.5, o.life);
        s0[i] = size[i] = rand(o.size * 0.6, o.size);
        drag[i] = o.drag ?? 2.5;
        alpha[i] = 1;
      }
    },
    update(dt) {
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) { if (alpha[i] !== 0) { alpha[i] = 0; } continue; }
        life[i] -= dt;
        const f = Math.exp(-drag[i] * dt);
        vel[i * 3] *= f; vel[i * 3 + 1] *= f; vel[i * 3 + 2] *= f;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const k = Math.max(0, life[i] / max[i]);
        alpha[i] = k;
        size[i] = s0[i] * (0.4 + 0.6 * k);
      }
      g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true;
      g.attributes.size.needsUpdate = true; g.attributes.color.needsUpdate = true;
    },
    clear() { life.fill(0); alpha.fill(0); g.attributes.alpha.needsUpdate = true; },
  };
}

// ---------- speed streaks: the arena is still, so motion is told by streaks rushing past ----------
function makeStreaks() {
  const N = 260, pos = new Float32Array(N * 6), col = new Float32Array(N * 6), P = [];
  for (let i = 0; i < N; i++) {
    let x, y;
    do { x = rand(-320, 320); y = rand(-200, 200); } while (Math.abs(x) < 70 && Math.abs(y) < 45);
    P.push(new THREE.Vector3(x, y, rand(-1100, 120)));
    const b = rand(0.25, 0.7);
    col.set([b * 0.7, b * 0.9, b, 0, 0, 0], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  mesh.frustumCulled = false;
  return {
    mesh,
    update(dt, speed) {
      const len = speed * 0.045;
      for (let i = 0; i < N; i++) {
        const p = P[i];
        p.z += speed * dt;
        if (p.z > 140) p.z -= 1240;
        pos.set([p.x, p.y, p.z, p.x, p.y, p.z - len], i * 6);
      }
      g.attributes.position.needsUpdate = true;
    },
  };
}

// ---------- the mode ----------
export function createAssault(scene, camera, hooks) {
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);
  root.add(new THREE.HemisphereLight('#cfe8ff', '#3a2440', 1.4));
  // Key light from over the player's shoulder so the raiders' faces read against the dark sky.
  const key = new THREE.DirectionalLight('#fff2e0', 2.6); key.position.set(0.4, 1, 1.2); root.add(key); root.add(key.target);
  const rim = new THREE.DirectionalLight('#ff7ad9', 1.4); rim.position.set(-0.6, 0.3, -1); root.add(rim); root.add(rim.target);

  const particles = makeParticles(2200);
  root.add(particles.pts);
  const streaks = makeStreaks();
  root.add(streaks.mesh);
  const flashTex = radialTex();

  // player
  const player = {
    obj: new THREE.Group(), body: null, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    shield: 100, hull: 100, invuln: 0, regenDelay: 0, fireCd: 0, gun: 0,
    dodgeT: 0, dodgeCd: 0, dodgeDir: 1, dodgePrev: false, bank: 0, hitFlash: 0, muzzle: 0,
  };
  root.add(player.obj);
  function setPlayerBody() {
    if (player.body) player.obj.remove(player.body);
    player.body = cloneModel('player') || makePlayerFallback();
    player.obj.add(player.body);
  }
  const engines = [-1.6, 1.6].map((x) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: new THREE.Color(0.35, 0.9, 1.2), blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.set(x, 0, 10.2); s.scale.setScalar(2.6);
    player.obj.add(s);
    return s;
  });

  // pools
  const boltGeo = new THREE.BoxGeometry(0.55, 0.55, 9);
  const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 4.2, 5) });
  const pBolts = Array.from({ length: 70 }, () => { const m = new THREE.Mesh(boltGeo, boltMat); m.visible = false; root.add(m); return { m, vel: new THREE.Vector3(), life: 0 }; });
  const eBoltGeo = new THREE.SphereGeometry(1.7, 10, 8);
  const eBoltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.9, 2.6) });
  const eBolts = Array.from({ length: 90 }, () => {
    const m = new THREE.Mesh(eBoltGeo, eBoltMat); m.visible = false;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: new THREE.Color(1.6, 0.25, 0.8), blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(5.5); m.add(halo);
    root.add(m); return { m, vel: new THREE.Vector3(), life: 0 };
  });
  const flashes = Array.from({ length: 20 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: new THREE.Color(4, 2.6, 1.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.visible = false; root.add(s); return { s, t: 0, dur: 0, size: 0 };
  });
  const orbGeo = new THREE.OctahedronGeometry(1.6);
  const orbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.4, 0.8) });
  const orbs = Array.from({ length: 40 }, () => { const m = new THREE.Mesh(orbGeo, orbMat); m.visible = false; root.add(m); return { m, vel: new THREE.Vector3(), life: 0 }; });

  // state
  let S = null;
  const camLocal = new THREE.Vector3(0, CAM_UP, CAM_BACK);
  const lookLocal = new THREE.Vector3(0, 0, -140);
  const camShake = new THREE.Vector3();

  function flash(p, size, dur, color) {
    const f = flashes.find((x) => !x.s.visible) || flashes[0];
    f.s.visible = true; f.s.position.copy(p); f.t = 0; f.dur = dur; f.size = size;
    f.s.material.color.copy(color || new THREE.Color(4, 2.6, 1.6));
  }

  // ---------- waves ----------
  // Threat level shapes the fight: more waves, new roles and denser fire, not just more health.
  // d scales dive rate, fire rate, shot speed and Warbreaker health.
  const LEVEL_D = { 1: 0.8, 2: 0.95, 3: 1.05, 4: 1.3, 5: 1.5 };
  const g = (kind, n, side, at) => ({ kind, n, side, at });
  function wavesFor(level) {
    const d = LEVEL_D[level] || 1;
    const formation = { name: 'FORMATION', dive: 2.8 / d, maxDivers: 2, fire: 0.06 * d, groups: [g('raider', 5, -1, 0), g('raider', 5, 1, 1.4)] };
    const lancers = { name: 'LANCER STRIKE', dive: 1.9 / d, maxDivers: 3, fire: 0.085 * d,
      groups: [g('raider', 4, 1, 0), g('lancer', 3, -1, 1.0), g('raider', 4, -1, 2.2), g('lancer', 3, 1, 3.2)] };
    const boss = (escorts) => ({ name: 'WARBREAKER INBOUND', dive: 2.3 / d, maxDivers: level >= 4 ? 4 : 3, fire: 0.07 * d, boss: true,
      groups: [g('warden', 1, 0, 0), g('raider', escorts, -1, 0.8), g('lancer', escorts, 1, 1.8)] });
    if (level <= 1) return [
      { name: 'SCOUT SWEEP', dive: 3.4 / d, maxDivers: 1, fire: 0.05 * d, groups: [g('raider', 3, -1, 0), g('raider', 3, 1, 1.2)] },
      { name: 'REGROUP', dive: 3.0 / d, maxDivers: 2, fire: 0.05 * d, groups: [g('raider', 4, 1, 0), g('raider', 4, -1, 1.2)] },
    ];
    if (level === 2) return [formation, lancers,
      { name: 'LAST STAND', dive: 1.8 / d, maxDivers: 3, fire: 0.08 * d, groups: [g('lancer', 4, -1, 0), g('raider', 6, 1, 1.0), g('lancer', 2, 0, 2.4)] }];
    if (level === 3) return [formation, lancers, boss(4)];
    return [
      { ...formation, groups: [g('raider', 6, -1, 0), g('lancer', 3, 1, 1.0), g('raider', 4, 1, 2.0)] },
      { ...lancers, groups: [...lancers.groups, g('lancer', 3, 0, 4.0)] },
      boss(6),
    ];
  }

  function slotsFor(wave) {
    // Rows of up to 7, back rows a little higher and further away. Warbreaker takes the centre top slot.
    const slots = [];
    let count = 0;
    for (const g of wave.groups) if (g.kind !== 'warden') count += g.n;
    const perRow = 7;
    for (let i = 0; i < count; i++) {
      const r = Math.floor(i / perRow), c = i % perRow;
      const inRow = Math.min(perRow, count - r * perRow);
      slots.push(new THREE.Vector3((c - (inRow - 1) / 2) * 17, 6 - r * 14, FORM_Z + r * 12));
    }
    return slots;
  }

  function startWave(i) {
    const w = S.waves[i];
    S.wave = i; S.waveT = 0; S.diveT = 2.5;
    S.slots = slotsFor(w); S.slotNext = 0;
    S.pending = w.groups.map((g) => ({ ...g, spawned: 0 }));
    S.banner = { text: 'WAVE ' + (i + 1) + ' · ' + w.name, t: 0 };
    sfx.wave();
    // WREN calls what is new in this wave, so the line always matches the screen.
    const hasLancers = w.groups.some((x) => x.kind === 'lancer');
    if (w.boss) hooks.say('Warbreaker inbound. It fires in spreads. Dodge through them, and keep its escorts off us.');
    else if (hasLancers && !S.lancersCalled) { S.lancersCalled = true; hooks.say('Lancers. Orange engines. They dive faster and take more hits.'); }
    else if (i === 0) hooks.say('Weapons free. Break the formation before they dive on us.');
  }

  function entryPath(side, slot) {
    const sx = side || (Math.random() < 0.5 ? -1 : 1);
    if (side === 0) {
      return new THREE.CatmullRomCurve3([v1.set(0, 90, -1000).clone(), new THREE.Vector3(0, 60, -600), new THREE.Vector3(0, 40, -380), slot.clone()]);
    }
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx * 240, rand(-30, 30), -1000),
      new THREE.Vector3(sx * 130, 10, -480),
      new THREE.Vector3(sx * 30, -16, -170),
      new THREE.Vector3(-sx * 40, 4, -120),
      new THREE.Vector3(-sx * 20, 28, -200),
      slot.clone(),
    ]);
  }

  function spawn(kind, side, idx) {
    const K = KINDS[kind];
    const e = {
      kind, hp: Math.round(K.hp * (kind === 'warden' ? S.d : 1)), maxHp: 0, value: K.value, radius: K.radius * K.scale / (kind === 'warden' ? K.scale : 1),
      obj: makeEnemyMesh(kind), pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(),
      state: 'enter', t: 0, dur: kind === 'warden' ? 5 : 4.2, path: null, slot: null, flash: 0, fireT: rand(1, 3), shots: 0, alive: true, roll: 0,
    };
    if (kind === 'warden') { e.radius = 22; e.slot = new THREE.Vector3(0, 26, FORM_Z - 20); }
    else e.slot = S.slots[S.slotNext++] || new THREE.Vector3(rand(-50, 50), rand(-20, 10), FORM_Z);
    e.maxHp = e.hp;
    e.path = entryPath(side, e.slot);
    e.path.getPoint(0, e.pos); e.prev.copy(e.pos);
    e.obj.position.copy(e.pos);
    root.add(e.obj);
    S.enemies.push(e);
    if (kind === 'warden') S.warden = e;
  }

  function formationOffset(out) {
    const t = S.time;
    return out.set(Math.sin(t * 0.45) * 18, Math.sin(t * 0.31) * 5, 0);
  }
  function slotWorld(e, out) {
    if (e.kind === 'warden') {
      const t = S.time;
      return out.set(Math.sin(t * 0.55) * 34, 26 + Math.sin(t * 0.9) * 6, FORM_Z - 20);
    }
    const s = 1 + 0.07 * Math.sin(S.time * 1.1);
    formationOffset(out);
    return out.set(e.slot.x * s + out.x, e.slot.y * s + out.y, e.slot.z);
  }

  function enemyFire(e, spreadN = 1) {
    const speed = 170 + S.wave * 22 + (S.d - 1) * 60;
    // Lead the target by most of the travel time, so strafing in a straight line is not a free pass.
    const travel = e.pos.distanceTo(player.pos) / speed;
    const lead = travel * rand(0.4, 0.9);
    const to = v2.copy(player.pos).add(v3.set(player.vel.x * lead, player.vel.y * lead, 0)).sub(e.pos).normalize();
    for (let k = 0; k < spreadN; k++) {
      const b = eBolts.find((x) => x.life <= 0);
      if (!b) return;
      const ang = spreadN > 1 ? (k - (spreadN - 1) / 2) * 0.11 : 0;
      b.vel.copy(to).applyAxisAngle(v1.set(0, 1, 0), ang).multiplyScalar(speed);
      b.m.position.copy(e.pos).addScaledVector(to, e.radius * 0.8);
      b.m.visible = true; b.life = 6;
    }
    sfx.enemyShot();
  }

  function startDive(e) {
    const side = e.pos.x > 0 ? 1 : -1;
    const tgt = v1.copy(player.pos);
    e.state = 'dive'; e.t = 0; e.dur = e.kind === 'lancer' ? 2.5 : 3.3; e.shots = 0;
    e.path = new THREE.CatmullRomCurve3([
      e.pos.clone(),
      new THREE.Vector3(e.pos.x + side * 34, e.pos.y + 22, e.pos.z + 50),
      new THREE.Vector3(tgt.x * 0.4 + side * 20, tgt.y * 0.5, -130),
      new THREE.Vector3(tgt.x, tgt.y, -10),
      new THREE.Vector3(tgt.x - side * 30, tgt.y - 24, 80),
    ]);
    sfx.dive();
  }

  function damageEnemy(e, dmg, at) {
    e.hp -= dmg;
    e.flash = 1;
    particles.emit(at, 7, { speed: 60, life: 0.3, size: 2.2, colors: [[4, 3.5, 2], [2, 4, 5]], drag: 4 });
    if (e.hp > 0) { sfx.hit(); return; }
    killEnemy(e);
  }

  function killEnemy(e, byCollision) {
    e.alive = false;
    root.remove(e.obj);
    const big = e.kind === 'warden';
    const now = S.time;
    S.combo = now - S.lastKill < 1.6 ? Math.min(5, S.combo + 1) : 1;
    S.lastKill = now;
    S.kills++;
    S.score += e.value * S.combo;
    if (e.kind !== 'warden' && S.combo > 1) S.popups.push({ text: 'x' + S.combo, pos: e.pos.clone(), t: 0 });
    particles.emit(e.pos, big ? 260 : 60, { speed: big ? 150 : 85, life: big ? 1.6 : 0.85, size: big ? 7 : 4.5,
      colors: [[5, 2.6, 0.9], [4, 1, 2.4], [5, 4.4, 2.6], [1.2, 0.5, 0.9]], drag: 2.2 });
    particles.emit(e.pos, big ? 60 : 18, { speed: big ? 60 : 30, life: big ? 2.2 : 1.2, size: big ? 14 : 8, colors: [[1.4, 0.6, 0.5], [0.8, 0.4, 0.6]], drag: 1.2 });
    flash(e.pos, big ? 90 : 34, big ? 0.6 : 0.28);
    sfx.explode(big);
    const drops = big ? 14 : (Math.random() < (e.kind === 'lancer' ? 0.6 : 0.35) ? 1 : 0);
    for (let k = 0; k < drops; k++) {
      const o = orbs.find((x) => x.life <= 0);
      if (!o) break;
      o.m.position.copy(e.pos); o.vel.set(rand(-30, 30), rand(-30, 30), rand(20, 60)); o.life = 9; o.m.visible = true;
    }
    if (big) {
      S.slowmo = 1.1; S.shake = Math.max(S.shake, 2.2);
      hooks.say('Warbreaker down. The rest are breaking.');
    } else {
      S.hitstop = 0.03; S.shake = Math.max(S.shake, byCollision ? 1.2 : 0.35);
    }
  }

  function hurtPlayer(dmg) {
    if (player.invuln > 0 || player.dodgeT > 0 || S.over) return;
    S.hitsTaken++;
    player.invuln = 0.7; player.regenDelay = 4; player.hitFlash = 1;
    S.shake = Math.max(S.shake, 1.6);
    const hadShield = player.shield > 0;
    player.shield -= dmg;
    if (player.shield < 0) { player.hull += player.shield; player.shield = 0; }
    if (hadShield && player.shield <= 0) { sfx.shieldDown(); hooks.say('Shields are down!'); }
    sfx.playerHit(!hadShield);
    particles.emit(player.pos, 24, { speed: 70, life: 0.5, size: 3, colors: [[1.5, 4, 5], [5, 4, 3]] });
    if (player.hull <= 0) {
      player.hull = 0;
      S.over = { win: false, t: 0 };
      particles.emit(player.pos, 140, { speed: 110, life: 1.3, size: 5, colors: [[5, 2.6, 0.9], [1.5, 4, 5]] });
      flash(player.pos, 60, 0.5);
      sfx.explode(true);
      player.obj.visible = false;
      hooks.say('Hull breach! Emergency jump, now!');
    }
  }

  // segment–sphere hit test for fast bolts
  const sAB = new THREE.Vector3(), sAC = new THREE.Vector3(), sP = new THREE.Vector3(), boltPrev = new THREE.Vector3();
  function segHit(a, b, c, r) {
    sAB.subVectors(b, a); sAC.subVectors(c, a);
    const L = sAB.lengthSq();
    const t = L > 0 ? clamp(sAC.dot(sAB) / L, 0, 1) : 0;
    sP.copy(a).addScaledVector(sAB, t);
    return sP.distanceToSquared(c) < r * r;
  }

  // ---------- public API ----------
  function start({ origin, quat, level = 1, shield = 1, hull = 1, squadName = 'RAIDERS' }) {
    root.position.copy(origin);
    root.quaternion.copy(quat);
    root.updateMatrixWorld(true);
    root.visible = true;
    setPlayerBody();
    player.obj.visible = true;
    player.pos.set(0, -6, 0); player.vel.set(0, 0, 0);
    player.shield = 100 * shield; player.hull = 100 * hull;
    player.invuln = 1.5; player.regenDelay = 0; player.fireCd = 0; player.dodgeT = 0; player.dodgeCd = 0; player.bank = 0;
    S = {
      d: LEVEL_D[level] || 1, level, time: 0, waves: wavesFor(level), wave: 0, waveT: 0, enemies: [], warden: null,
      pending: [], slots: [], slotNext: 0, diveT: 0, score: 0, kills: 0, combo: 1, lastKill: -9, hitsTaken: 0,
      banner: null, shake: 0, hitstop: 0, slowmo: 0, over: null, intermission: 0, popups: [], squadName,
      shards: 0, lock: null, hint: 7, lancersCalled: false,
    };
    camLocal.set(0, CAM_UP + 30, CAM_BACK + 80);
    startWave(0);
  }

  function stop() {
    if (!S) return;
    for (const e of S.enemies) root.remove(e.obj);
    pBolts.forEach((b) => { b.life = 0; b.m.visible = false; });
    eBolts.forEach((b) => { b.life = 0; b.m.visible = false; });
    orbs.forEach((o) => { o.life = 0; o.m.visible = false; });
    flashes.forEach((f) => { f.s.visible = false; });
    particles.clear();
    root.visible = false;
    S = null;
  }

  function update(rawDt, input) {
    if (!S) return null;
    // time control: hitstop freezes a couple of frames on kills; slow motion after the Warbreaker falls
    let dt = rawDt;
    if (S.hitstop > 0) { S.hitstop -= rawDt; dt = rawDt * 0.08; }
    if (S.slowmo > 0) { S.slowmo -= rawDt; dt = rawDt * 0.3; }
    S.time += dt;
    S.waveT += dt;
    S.hint -= rawDt;
    if (S.banner) S.banner.t += rawDt;

    // ----- player -----
    if (!S.over) {
      const accel = 1 - Math.exp(-11 * dt);
      player.vel.x += (input.moveX * 100 - player.vel.x) * accel;
      player.vel.y += (input.moveY * 80 - player.vel.y) * accel;
      const inv = settings.invertY ? -1 : 1;
      player.pos.x += input.mouseDX * 0.085;
      player.pos.y += input.mouseDY * 0.085 * inv; // same sense as the stick here
      // dodge roll: a burst sideways with a short window where nothing hits you
      player.dodgeCd -= dt;
      if (input.dodge && !player.dodgePrev && player.dodgeCd <= 0) {
        player.dodgeDir = input.moveX < -0.15 ? -1 : input.moveX > 0.15 ? 1 : (input.mouseDX < 0 ? -1 : 1);
        player.dodgeT = 0.42; player.dodgeCd = 1.1;
        player.vel.x += player.dodgeDir * 150;
        sfx.dodge();
      }
      player.dodgePrev = input.dodge;
      player.dodgeT = Math.max(0, player.dodgeT - dt);
      player.pos.addScaledVector(player.vel, dt);
      if (Math.abs(player.pos.x) > BOUNDS.x) { player.pos.x = Math.sign(player.pos.x) * BOUNDS.x; player.vel.x *= -0.2; }
      if (Math.abs(player.pos.y) > BOUNDS.y) { player.pos.y = Math.sign(player.pos.y) * BOUNDS.y; player.vel.y *= -0.2; }
      const targetBank = -player.vel.x * 0.0075;
      player.bank += (targetBank - player.bank) * (1 - Math.exp(-8 * dt));
      const spin = player.dodgeT > 0 ? -player.dodgeDir * (1 - player.dodgeT / 0.42) * Math.PI * 2 : 0;
      player.obj.position.copy(player.pos);
      player.obj.rotation.set(player.vel.y * 0.004, -player.vel.x * 0.0018, player.bank + spin);
      player.invuln = Math.max(0, player.invuln - dt);
      player.obj.visible = player.invuln <= 0 || Math.floor(S.time * 20) % 2 === 0 || player.invuln > 1.2;

      // shield regen
      player.regenDelay -= dt;
      if (player.regenDelay <= 0 && player.shield < 100) player.shield = Math.min(100, player.shield + 9 * dt);

      // aim assist: nearest enemy inside a small cone ahead of the guns
      S.lock = null;
      let best = 0.045;
      for (const e of S.enemies) {
        if (!e.alive || e.pos.z > -25 || e.pos.z < -420) continue;
        v1.subVectors(e.pos, player.pos);
        const ang = Math.atan2(Math.hypot(v1.x, v1.y), -v1.z);
        const cone = best + e.radius / Math.max(40, -v1.z) * 0.35;
        if (ang < cone) { best = ang; S.lock = e; }
      }

      // fire
      player.fireCd -= dt;
      player.muzzle = Math.max(0, player.muzzle - dt * 12);
      if (input.fire && player.fireCd <= 0) {
        player.fireCd = 0.13;
        player.gun ^= 1;
        const b = pBolts.find((x) => x.life <= 0);
        if (b) {
          const gx = player.gun ? 3.4 : -3.4;
          b.m.position.set(player.pos.x + gx * Math.cos(player.bank), player.pos.y - 0.6 + gx * Math.sin(player.bank), player.pos.z - 9);
          const speed = 1150;
          if (S.lock) {
            const tt = Math.abs(S.lock.pos.z - b.m.position.z) / speed;
            v1.copy(S.lock.pos).addScaledVector(S.lock.vel, tt).sub(b.m.position).normalize();
          } else v1.set(0, 0, -1);
          b.vel.copy(v1).multiplyScalar(speed);
          b.m.lookAt(root.localToWorld(v2.copy(b.m.position).add(b.vel))); // lookAt wants world space
          b.m.visible = true; b.life = 0.9;
          player.muzzle = 1;
          sfx.shoot();
        }
      }
    } else {
      S.over.t += rawDt;
    }
    engines.forEach((s) => s.scale.setScalar(2.4 + Math.random() * 0.6 + Math.abs(input.moveY) * 0.8));

    // ----- waves & spawning -----
    const w = S.waves[S.wave];
    for (const g of S.pending) {
      while (g.spawned < g.n && S.waveT >= g.at + g.spawned * 0.24) { spawn(g.kind, g.side, g.spawned); g.spawned++; }
    }
    const allSpawned = S.pending.every((g) => g.spawned >= g.n);
    const alive = S.enemies.filter((e) => e.alive);
    if (!S.over && allSpawned && alive.length === 0) {
      if (S.wave < S.waves.length - 1) {
        if (S.intermission <= 0) { S.intermission = 2.6; S.score += 50 * (S.wave + 1); sfx.pickup(); S.banner = { text: 'WAVE CLEAR', t: 0 }; }
        S.intermission -= dt;
        if (S.intermission <= 0) startWave(S.wave + 1);
      } else {
        S.over = { win: true, t: 0 };
        sfx.victory();
        S.banner = { text: 'FORMATION BROKEN', t: 0 };
        if (S.hitsTaken === 0) hooks.say('Not a scratch on us. Beautiful flying.');
      }
    }

    // dives
    if (!S.over) {
      S.diveT -= dt;
      const divers = alive.filter((e) => e.state === 'dive').length;
      if (S.diveT <= 0 && S.waveT > 4) {
        S.diveT = w.dive * rand(0.7, 1.3);
        const ready = alive.filter((e) => e.state === 'slot' && e.kind !== 'warden');
        const n = Math.min(w.maxDivers - divers, S.wave >= 1 && Math.random() < 0.5 ? 2 : 1);
        for (let k = 0; k < n && ready.length; k++) startDive(ready.splice((Math.random() * ready.length) | 0, 1)[0]);
      }
    }

    // ----- enemies -----
    for (const e of S.enemies) {
      if (!e.alive) continue;
      e.prev.copy(e.pos);
      e.t += dt;
      if (e.state === 'enter' || e.state === 'return') {
        const pts = e.path.points;
        slotWorld(e, pts[pts.length - 1]);
        const u = Math.min(1, e.t / e.dur);
        const eased = u < 1 ? 1 - Math.pow(1 - u, 1.6) : 1;
        e.path.getPoint(eased, e.pos);
        if (u >= 1) e.state = e.kind === 'warden' ? 'boss' : 'slot';
        if (e.state === 'enter' && S.wave >= 1 && e.shots === 0 && u > 0.45 && Math.random() < 0.25) { e.shots = 1; enemyFire(e); }
      } else if (e.state === 'slot' || e.state === 'boss') {
        slotWorld(e, v1);
        e.pos.lerp(v1, 1 - Math.exp(-4 * dt));
        e.fireT -= dt;
        if (e.kind === 'warden') {
          const enraged = e.hp < e.maxHp * 0.5;
          if (e.fireT <= 0 && !S.over) { e.fireT = enraged ? 1.6 : 2.5; enemyFire(e, enraged ? 7 : 5); }
          e.cmdT = (e.cmdT ?? 6) - dt;
          if (e.cmdT <= 0 && !S.over) {
            e.cmdT = enraged ? 5 : 7.5;
            const ready = S.enemies.filter((x) => x.alive && x.state === 'slot');
            for (let k = 0; k < 2 && ready.length; k++) startDive(ready.splice((Math.random() * ready.length) | 0, 1)[0]);
          }
        } else if (!S.over && Math.random() < w.fire * dt * (e.kind === 'lancer' ? 1.4 : 1)) {
          enemyFire(e);
        }
      } else if (e.state === 'dive') {
        const u = Math.min(1, e.t / e.dur);
        e.path.getPoint(u, e.pos);
        if (!S.over && ((e.shots === 0 && u > 0.3) || (e.shots === 1 && u > 0.45) || (e.kind === 'lancer' && e.shots === 2 && u > 0.55))) { e.shots++; enemyFire(e); }
        if (u >= 1) {
          // loop round: re-enter from far ahead and take the slot again
          e.state = 'return'; e.t = 0; e.dur = 2.4;
          e.pos.set(e.slot.x * 1.4, e.slot.y + 70, -950);
          e.path = new THREE.CatmullRomCurve3([e.pos.clone(), new THREE.Vector3(e.slot.x, e.slot.y + 40, -500), e.slot.clone()]);
        }
        // ramming
        if (!S.over && e.pos.distanceTo(player.pos) < e.radius * 0.75 + 3) { hurtPlayer(35); killEnemy(e, true); continue; }
      }
      e.vel.subVectors(e.pos, e.prev).divideScalar(Math.max(dt, 1e-4));
      // face the direction of travel when moving fast, otherwise face the player
      const sp = e.vel.length();
      e.obj.position.copy(e.pos);
      // lookAt takes a world-space point; +Z of the holder points at it, so aim it behind the nose.
      if (sp > 40) v1.copy(e.pos).sub(e.vel);
      else v1.set(e.pos.x * 2 - player.pos.x, e.pos.y * 2 - player.pos.y, e.pos.z * 2 - player.pos.z);
      e.obj.lookAt(root.localToWorld(v1));
      e.roll += (clamp(-e.vel.x * 0.006, -1, 1) - e.roll) * (1 - Math.exp(-5 * dt));
      e.obj.rotateZ(e.roll);
      // hit flash
      if (e.flash > 0) {
        e.flash = Math.max(0, e.flash - dt * 8);
        for (const { m, base } of e.obj.userData.mats) m.emissive.setRGB(base.r + e.flash * 1.2, base.g + e.flash * 1.2, base.b + e.flash * 1.2);
      }
    }
    S.enemies = S.enemies.filter((e) => e.alive);

    // ----- player bolts -----
    for (const b of pBolts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      boltPrev.copy(b.m.position);
      b.m.position.addScaledVector(b.vel, dt);
      if (b.life <= 0) { b.m.visible = false; continue; }
      for (const e of S.enemies) {
        if (!e.alive) continue;
        if (segHit(boltPrev, b.m.position, e.pos, e.radius)) {
          damageEnemy(e, 1, b.m.position);
          b.life = 0; b.m.visible = false;
          break;
        }
      }
    }
    // ----- enemy bolts -----
    for (const b of eBolts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.m.position.addScaledVector(b.vel, dt);
      if (b.life <= 0 || b.m.position.z > 90) { b.life = 0; b.m.visible = false; continue; }
      if (!S.over && b.m.position.distanceTo(player.pos) < 4.3) {
        b.life = 0; b.m.visible = false;
        hurtPlayer(S.warden && S.warden.alive ? 22 : 18);
      }
    }
    // ----- Wayshard pickups drift to the player -----
    for (const o of orbs) {
      if (o.life <= 0) continue;
      o.life -= dt;
      v1.subVectors(player.pos, o.m.position);
      const d = v1.length();
      o.vel.multiplyScalar(Math.exp(-1.5 * dt)).addScaledVector(v1.normalize(), (d < 120 ? 260 : 60) * dt);
      o.m.position.addScaledVector(o.vel, dt);
      o.m.rotation.y += dt * 4; o.m.rotation.x += dt * 2.5;
      if (d < 6 && !S.over) { o.life = 0; S.shards += 5; S.score += 5; sfx.pickup(); }
      if (o.life <= 0) o.m.visible = false;
    }
    for (const f of flashes) {
      if (!f.s.visible) continue;
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) { f.s.visible = false; continue; }
      f.s.scale.setScalar(f.size * (0.6 + k * 0.8));
      f.s.material.opacity = 1 - k;
    }
    for (const p of S.popups) p.t += rawDt;
    S.popups = S.popups.filter((p) => p.t < 0.9);

    particles.update(dt);
    streaks.update(dt, 650);

    // ----- camera -----
    S.shake = Math.max(0, S.shake - rawDt * 3);
    player.hitFlash = Math.max(0, player.hitFlash - rawDt * 2.5);
    const ck = 1 - Math.exp(-5 * rawDt);
    camLocal.lerp(v1.set(player.pos.x * 0.55, player.pos.y * 0.5 + CAM_UP, CAM_BACK), ck);
    lookLocal.lerp(v1.set(player.pos.x * 0.72, player.pos.y * 0.6 + 3, -140), ck);
    camShake.set(rand(-1, 1), rand(-1, 1), 0).multiplyScalar(S.shake * S.shake * 0.5);
    camera.position.copy(camLocal).add(camShake);
    root.localToWorld(camera.position);
    camera.up.set(Math.sin(player.bank * 0.25), 1, 0).normalize().applyQuaternion(root.quaternion);
    camera.lookAt(root.localToWorld(v2.copy(lookLocal)));
    const fov = 68 + (player.dodgeT > 0 ? 4 : 0);
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, rawDt * 8); camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();

    if (S.over && S.over.t > (S.over.win ? 2.6 : 2.2)) {
      return {
        win: S.over.win, kills: S.kills, score: S.score, hitsTaken: S.hitsTaken,
        // reward scales with threat: harder squadrons carry more
        wayshards: Math.round((S.shards + S.score / 10 + (S.over.win && S.hitsTaken === 0 ? 50 : 0)) * ({ 1: 0.6, 2: 0.8, 3: 1, 4: 1.4, 5: 1.8 }[S.level] || 1)),
        shield: player.shield / 100, hull: Math.max(0, player.hull) / 100,
      };
    }
    return null;
  }

  // ---------- HUD ----------
  const proj = new THREE.Vector3();
  function toScreen(local, W, H) {
    proj.copy(local); root.localToWorld(proj); proj.project(camera);
    return { x: (proj.x * 0.5 + 0.5) * W, y: (-proj.y * 0.5 + 0.5) * H, ok: proj.z < 1 };
  }
  function text(ctx, str, x, y, size, rgb, a = 1, align = 'center', weight = 600, font = FONT) {
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(${rgb},${a})`;
    ctx.fillText(str, x, y);
  }
  function bar(ctx, x, y, w, h, frac, rgb, label, value) {
    ctx.fillStyle = 'rgba(6,12,22,0.72)'; ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
    ctx.strokeStyle = `rgba(${rgb},0.5)`; ctx.lineWidth = 1; ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
    ctx.fillStyle = `rgba(${rgb},0.18)`; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = `rgba(${rgb},0.95)`; ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
    text(ctx, label, x, y - 14, 13, rgb, 0.9, 'left');
    text(ctx, value, x + w, y - 14, 13, rgb, 0.9, 'right');
  }

  function drawHud(ctx, W, H, device) {
    if (!S) return;
    const sc = Math.min(W, H) / 900;

    // damage vignette / low hull pulse
    const low = player.hull < 35 ? (0.25 + 0.15 * Math.sin(S.time * 8)) : 0;
    const vig = Math.max(player.hitFlash * 0.55, low);
    if (vig > 0.01) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(255,40,60,0)'); g.addColorStop(1, `rgba(255,40,60,${vig})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    // reticle where the guns converge on the formation plane
    if (!S.over) {
      const r = toScreen(v1.set(player.pos.x, player.pos.y - 0.6, FORM_Z), W, H);
      const R = 16 * sc + 4;
      ctx.strokeStyle = `rgba(${CYAN},0.85)`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.x, r.y, R, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(r.x + dx * R * 0.55, r.y + dy * R * 0.55); ctx.lineTo(r.x + dx * R * 1.5, r.y + dy * R * 1.5); }
      ctx.stroke();
      if (S.lock && S.lock.alive) {
        const t = toScreen(S.lock.pos, W, H);
        if (t.ok) {
          const s = (S.lock.radius * 1.1) * (H / 2) / Math.max(30, Math.abs(S.lock.pos.z - camLocal.z)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) + 8;
          ctx.strokeStyle = `rgba(${AMBER},0.95)`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(t.x, t.y - s); ctx.lineTo(t.x + s, t.y); ctx.lineTo(t.x, t.y + s); ctx.lineTo(t.x - s, t.y); ctx.closePath(); ctx.stroke();
        }
      }
    }

    // combo popups
    for (const p of S.popups) {
      const t = toScreen(p.pos, W, H);
      if (t.ok) text(ctx, p.text, t.x, t.y - 20 - p.t * 40, 22 * sc + 8, GOLD, 1 - p.t / 0.9, 'center', 700);
    }

    // top: wave + remaining
    const remaining = S.enemies.filter((e) => e.alive).length + S.pending.reduce((a, g) => a + g.n - g.spawned, 0);
    text(ctx, 'PHASE II · ' + S.squadName + ' · THREAT ' + S.level, W / 2, 26, 13 * sc + 5, AMBER, 0.85);
    text(ctx, `WAVE ${S.wave + 1}/${S.waves.length} · HOSTILES ${remaining}`, W / 2, 48, 16 * sc + 6, CYAN, 0.95, 'center', 700);

    // warden health
    if (S.warden && S.warden.alive && S.warden.state !== 'enter') {
      const bw = Math.min(520, W * 0.5), bx = W / 2 - bw / 2;
      bar(ctx, bx, 84, bw, 9, S.warden.hp / S.warden.maxHp, RED, 'SCRAP CROWN WARBREAKER', S.warden.hp < S.warden.maxHp * 0.5 ? 'ENRAGED' : '');
    }

    // bottom-left: shield & hull
    const bw = 220 * sc + 60;
    bar(ctx, 30, H - 74, bw, 10, player.shield / 100, CYAN, 'SHIELD', Math.round(player.shield) + '%');
    bar(ctx, 30, H - 34, bw, 10, Math.max(0, player.hull) / 100, player.hull < 35 ? RED : AMBER, 'HULL', Math.round(Math.max(0, player.hull)) + '%');
    // dodge pip
    const ready = player.dodgeCd <= 0;
    text(ctx, ready ? 'DODGE READY' : 'DODGE', 30 + bw + 30, H - 30, 13, ready ? CYAN : '120,150,170', ready ? 0.95 : 0.6, 'left');

    // bottom-right: score
    text(ctx, String(S.score).padStart(6, '0'), W - 30, H - 56, 26 * sc + 8, '255,255,255', 0.95, 'right', 700);
    text(ctx, `WAYSHARDS ${S.shards}` + (S.combo > 1 && S.time - S.lastKill < 1.6 ? `   COMBO x${S.combo}` : ''), W - 30, H - 26, 14, GOLD, 0.9, 'right');

    // banner
    if (S.banner && S.banner.t < 2.6) {
      const t = S.banner.t, a = Math.min(1, t * 4) * Math.min(1, (2.6 - t) * 2);
      text(ctx, S.banner.text, W / 2, H * 0.3, 34 * sc + 12, '255,255,255', a, 'center', 900, 'Orbitron, sans-serif');
    }

    // controls hint at the start
    if (S.hint > 0) {
      const a = Math.min(1, S.hint);
      const pad = device === 'gamepad';
      text(ctx, pad ? 'LEFT STICK move · RT or RB fire · LT, B or LB dodge' : 'MOUSE or WASD move · CLICK or SPACE fire · SHIFT dodge', W / 2, H * 0.58, 15 * sc + 5, CYAN, a * 0.9);
    }
  }

  return {
    start, stop, update, drawHud,
    get active() { return !!S; },
    get debug() { return { S, player, eBolts }; },
    setPixelRatio(pr) { particles.mat.uniforms.pr.value = pr; },
    refreshModels() { if (S) setPlayerBody(); },
  };
}
