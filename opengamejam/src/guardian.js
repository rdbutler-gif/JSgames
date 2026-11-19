// The Kessa vault guardian: the Foundry Titan. It climbs half out of the vault shaft and
// fights from there. Its armour shrugs off the rover's cannon; after each furnace barrage it
// has to vent, and the chest plates open on the core. Three heat stages (core HP 60 / 40 / 20).
import * as THREE from 'three';
import { sfx, noise, blip } from './audio.js';

const clamp = THREE.MathUtils.clamp;
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();

export const TITAN_HP = 60;
const STAGE = [ // by heat stage: shells per barrage, shell flight time, vent window, turn rate
  { shells: 3, flight: 1.9, vent: 4.6, turn: 0.55, idle: 2.2 },
  { shells: 5, flight: 1.7, vent: 4.0, turn: 0.75, idle: 1.7 },
  { shells: 6, flight: 1.5, vent: 3.4, turn: 0.95, idle: 1.3 },
];
const SHOULDER_H = 10.5; // shoulder height above the arena floor
const ARM = 14;          // shoulder to knuckles

function mats() {
  const std = (c, r, m, e) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, emissive: e || '#000000' });
  return {
    iron: std('#76655a', 0.5, 0.5, '#1a0904'),
    dark: std('#3a302a', 0.65, 0.45, '#120502'),
    brass: std('#a8783a', 0.4, 0.7),
    seam: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.1, 0.2) }),
    core: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.2, 0.7) }),
    visor: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 1.2, 0.25) }),
  };
}

function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true;
  return o;
}

function buildBody(M) {
  const body = new THREE.Group();
  // waist column down into the shaft
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 9, 10), M.dark);
  waist.position.y = -3.5; waist.castShadow = true; body.add(waist);
  for (let i = 0; i < 3; i++) body.add(box(5.6, 0.25, 4.2, M.seam, 0, -1 - i * 2.2, 0));
  // torso: a furnace block with brass ribs
  const torso = new THREE.Group(); torso.position.y = 5; body.add(torso);
  torso.add(box(7.2, 7.6, 5, M.iron));
  torso.add(box(7.6, 0.5, 5.4, M.brass, 0, 3.6, 0));
  torso.add(box(7.6, 0.5, 5.4, M.brass, 0, -3.4, 0));
  torso.add(box(8.8, 2.2, 4.4, M.iron, 0, 2.7, 0.2)); // shoulder yoke
  // the core, recessed in the chest, and the two plates that cover it
  const coreHole = box(4.2, 4.6, 0.4, M.dark, 0, -0.2, -2.45); torso.add(coreHole);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 1), M.core);
  core.position.set(0, -0.2, -2.55); torso.add(core);
  const coreLight = new THREE.PointLight('#ff8a30', 0, 26, 1.6); coreLight.position.set(0, -0.2, -4); torso.add(coreLight);
  const plates = [-1, 1].map((s) => {
    const hinge = new THREE.Group(); hinge.position.set(s * 2.35, -0.2, -2.6); torso.add(hinge);
    const p = box(2.35, 4.8, 0.55, M.iron, -s * 1.175, 0, -0.05); hinge.add(p);
    hinge.add(box(0.3, 4.4, 0.62, M.brass, -s * 2.2, 0, -0.08));
    hinge.add(box(1.6, 0.18, 0.62, M.seam, -s * 1.2, 1.2, -0.12));
    hinge.add(box(1.6, 0.18, 0.62, M.seam, -s * 1.2, -1.2, -0.12));
    return { hinge, s };
  });
  // head with a slit visor
  const head = new THREE.Group(); head.position.y = 10.6; body.add(head);
  head.add(box(3, 2.2, 3, M.iron));
  head.add(box(3.3, 0.35, 3.3, M.brass, 0, 1.1, 0));
  head.add(box(2.4, 0.32, 0.2, M.visor, 0, 0.15, -1.52));
  // back furnace stacks (the mortar tubes)
  const stacks = [-1, 1].map((s) => {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 6, 10), M.dark);
    st.position.set(s * 2.1, 11, 2.2); st.castShadow = true; body.add(st);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.18, 6, 12), M.seam);
    lip.rotation.x = Math.PI / 2; lip.position.set(s * 2.1, 14, 2.2); body.add(lip);
    return new THREE.Vector3(s * 2.1, 14.2, 2.2);
  });
  // arms: shoulder pivot -> upper arm -> elbow pivot -> forearm -> fist; they hang along -Y
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group(); sh.position.set(s * 5.4, 7.9, -0.2); body.add(sh);
    sh.add(box(2.6, 2.6, 2.6, M.brass));
    sh.add(box(1.7, 6, 1.9, M.iron, 0, -3.2, 0));
    const el = new THREE.Group(); el.position.y = -6.2; sh.add(el);
    el.add(box(2.2, 7, 2.3, M.iron, 0, -3.5, 0));
    el.add(box(2.35, 0.3, 2.45, M.seam, 0, -1.4, 0));
    const fist = box(3.1, 2.6, 3.1, M.dark, 0, -7.6, 0); el.add(fist);
    fist.add(box(3.3, 0.3, 3.3, M.brass, 0, 0.9, 0));
    return { sh, el, fist, s, a: 0.25, e: 0.35 };
  });
  return { body, torso, core, coreLight, plates, head, stacks, arms };
}

export function createTitan({ root, def, terrain, fx }) {
  const M = mats();
  const C = new THREE.Vector3(def.vault.x, terrain.vaultH + 2.5, def.vault.z); // arena centre, top of the vault base
  const B = buildBody(M);
  root.add(B.body);
  B.body.visible = false;
  // the open shaft glows: it lights the Titan from below and the arena floor around it
  const shaftLight = new THREE.PointLight('#ff7a2a', 0, 80, 1.3);
  shaftLight.position.set(C.x, C.y + 2.5, C.z); root.add(shaftLight);
  const restY = C.y + 0.5, sunkY = C.y - 18;

  // shell, marker and lava-pool pools
  const shellGeo = new THREE.IcosahedronGeometry(0.75, 1);
  const shellMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.6, 0.4) });
  const markGeo = new THREE.RingGeometry(3.6, 4.6, 40).rotateX(-Math.PI / 2);
  const poolGeo = new THREE.CircleGeometry(3.4, 18).rotateX(-Math.PI / 2);
  const shells = [], pools = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(shellGeo, shellMat); m.visible = false; root.add(m);
    const mk = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.25, 0.1), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    mk.visible = false; root.add(mk);
    shells.push({ m, mk, on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), tgt: new THREE.Vector3(), t: 0, tf: 1 });
  }
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.6, 0.1), transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false; root.add(m);
    pools.push({ m, on: false, x: 0, z: 0, t: 0 });
  }
  // slam shockwave
  const wave = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.3, 0.35), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  wave.visible = false; root.add(wave);
  const W = { on: false, x: 0, z: 0, r: 0, hit: false };

  const T = {
    state: 'dormant', t: 0, hp: TITAN_HP, stage: 0, yaw: 0,
    act: 'idle', actT: 0, fired: 0, open: 0, flash: 0, slamAt: new THREE.Vector3(), slamArm: 0,
    armourHits: 0, coreHits: 0, deadT: 0, hitMark: 0,
  };

  function stageOf(hp) { return hp > 40 ? 0 : hp > 20 ? 1 : 2; }
  const S = () => STAGE[T.stage];

  function wake(face) {
    T.state = 'rising'; T.t = 0; T.hp = TITAN_HP; T.stage = 0; T.act = 'idle'; T.actT = 0; T.open = 0;
    T.yaw = Math.atan2(-(face.x - C.x), -(face.z - C.z));
    B.body.visible = true; B.body.position.set(C.x, sunkY, C.z); B.body.rotation.y = T.yaw;
    sfx.engage(); noise(3.2, 0.5, 300, 40, 0.6);
  }
  function reset() {
    T.state = 'dormant'; B.body.visible = false; shaftLight.intensity = 0;
    shells.forEach((s) => { s.on = false; s.m.visible = false; s.mk.visible = false; });
    pools.forEach((p) => { p.on = false; p.m.visible = false; });
    W.on = false; wave.visible = false;
  }

  function fireShell(ctx, k) {
    const s = shells.find((q) => !q.on);
    if (!s) return;
    const R = ctx.rover;
    const tf = S().flight;
    // first shell straight at the rover, the rest leading it and scattered, so a straight line is never safe
    const lead = k === 0 ? 0.15 : 0.55 + Math.random() * 0.5;
    s.tgt.set(R.pos.x + R.vel.x * tf * lead, 0, R.pos.z + R.vel.z * tf * lead);
    if (k > 0) { s.tgt.x += (Math.random() - 0.5) * 12; s.tgt.z += (Math.random() - 0.5) * 12; }
    s.tgt.y = ctx.ground(s.tgt.x, s.tgt.z);
    B.body.localToWorld(s.p.copy(B.stacks[k % 2]));
    s.v.subVectors(s.tgt, s.p).divideScalar(tf); s.v.y += 0.5 * 14 * tf;
    s.t = 0; s.tf = tf; s.on = true; s.m.visible = true;
    s.mk.visible = true; s.mk.position.set(s.tgt.x, s.tgt.y + 0.15, s.tgt.z);
    fx.emit(s.p, 14, { speed: 6, life: 0.8, size: 2.4, colors: [[4, 1.6, 0.4], [0.5, 0.35, 0.3]], drag: 1.2, dir: v1.set(0, 8, 0) });
    blip(70, 0.3, 'sawtooth', 0.12, 0, 0.5); noise(0.3, 0.25, 900, 120);
  }

  function explodeShell(s, ctx) {
    s.on = false; s.m.visible = false; s.mk.visible = false;
    fx.emit(s.p, 60, { speed: 12, life: 1.1, size: 3, colors: [[4, 1.4, 0.3], [5, 3, 0.9], [0.5, 0.3, 0.25]], drag: 1.6 });
    sfx.explode(false);
    const R = ctx.rover;
    const d = Math.hypot(R.pos.x - s.p.x, R.pos.z - s.p.z);
    if (d < 6 && R.pos.y - s.p.y < 5) {
      const k = 1 - d / 6;
      ctx.damage(8 + 14 * k);
      v1.set(R.pos.x - s.p.x, 0, R.pos.z - s.p.z).normalize();
      R.vel.addScaledVector(v1, 6 * k); R.vel.y += 4 + 4 * k;
      ctx.shake(0.9);
    } else if (d < 22) ctx.shake(0.3);
    // from stage 2 the Titan reroutes the lava: shells leave burning ground
    if (T.stage >= 1) {
      const p = pools.find((q) => !q.on) || pools.reduce((a, b) => (a.t > b.t ? a : b));
      p.on = true; p.t = 0; p.x = s.p.x; p.z = s.p.z;
      p.m.visible = true; p.m.position.set(p.x, ctx.ground(p.x, p.z) + 0.1, p.z);
    }
  }

  // segment test for the rover's bolts: returns 'core', 'armour' or null, and the hit point
  const spheres = [{ o: B.torso, p: new THREE.Vector3(0, 0, 0), r: 4.6 }, { o: B.head, p: new THREE.Vector3(), r: 2.1 },
    { o: B.body, p: new THREE.Vector3(0, -2, 0), r: 3.4 }, ...B.arms.flatMap((a) => [{ o: a.fist, p: new THREE.Vector3(), r: 2.2 }, { o: a.el, p: new THREE.Vector3(0, -3.5, 0), r: 1.8 }, { o: a.sh, p: new THREE.Vector3(0, -3, 0), r: 1.8 }])];
  function segSphere(a, b, c, r) {
    v2.subVectors(b, a); const L2 = v2.lengthSq();
    const u = clamp(v3.subVectors(c, a).dot(v2) / L2, 0, 1);
    v3.copy(a).addScaledVector(v2, u);
    return v3.distanceToSquared(c) < r * r ? u : -1;
  }
  const hitP = new THREE.Vector3(), corePos = new THREE.Vector3();
  function hitTest(a, b) {
    if (T.state !== 'fight' && T.state !== 'rising') return null;
    B.core.getWorldPosition(corePos);
    if (T.open > 0.6 && segSphere(a, b, corePos, 2.0) >= 0) { hitP.copy(v3); return { kind: 'core', p: hitP }; }
    let best = 2;
    for (const s of spheres) {
      s.o.localToWorld(v1.copy(s.p));
      const u = segSphere(a, b, v1, s.r);
      if (u >= 0 && u < best) { best = u; hitP.copy(v3); }
    }
    if (best > 1) return null;
    // the open chest is a hole onto the core: anything landing in it counts
    if (T.open > 0.6 && hitP.distanceTo(corePos) < 3.2) return { kind: 'core', p: hitP };
    // the hit spheres are rough and the torso one encloses the core: if this shot's line carries
    // on into the core within a few metres, it went in through the open chest
    if (T.open > 0.6) {
      v1.subVectors(b, a).normalize();
      const save = hitP.clone();
      v2.copy(save).addScaledVector(v1, 7);
      if (segSphere(save, v2, corePos, 2.3) >= 0) { hitP.copy(v3); return { kind: 'core', p: hitP }; }
      hitP.copy(save);
    }
    return { kind: 'armour', p: hitP };
  }
  // n = damage (bolts do 1); quiet = a continuous beam calling every frame (no per-hit sound or burst)
  function onBolt(hit, ctx, n = 1, quiet = false) {
    if (hit.kind === 'core') {
      T.hp -= n; T.coreHits++; T.flash = 0.12; T.hitMark = 0.15;
      if (!quiet) { fx.emit(hit.p, 10, { speed: 8, life: 0.5, size: 1.6, colors: [[5, 3, 1], [4, 1.5, 0.3]], drag: 2 }); sfx.hit(); }
      if (T.coreHits === 1) ctx.say('That is the core. Keep firing!');
      const st = stageOf(T.hp);
      if (T.hp <= 0) { die(ctx); return; }
      if (st !== T.stage) {
        T.stage = st; T.act = 'roar'; T.actT = 0;
        sfx.roar(); ctx.shake(1);
        ctx.say(st === 1 ? 'It is rerouting the lava. Its shells will leave fire on the ground now. Keep moving.'
          : 'It is burning itself out. Faster shells. Stay off the bright ground, nearly there.');
      }
    } else if (!quiet) {
      T.armourHits++;
      fx.emit(hit.p, 4, { speed: 6, life: 0.3, size: 0.8, colors: [[3, 2.4, 1.4]], drag: 3 });
      if (T.armourHits % 3 === 0) blip(3200 + Math.random() * 600, 0.03, 'square', 0.015);
      if (T.armourHits === 14 && T.coreHits === 0) ctx.say('The armour is too thick. Wait for it to vent. The chest opens after it fires.');
    }
  }
  function die(ctx) {
    T.state = 'dying'; T.t = 0; T.open = 1;
    shells.forEach((s) => { if (s.on) { s.on = false; s.m.visible = false; s.mk.visible = false; } });
    sfx.explode(true); ctx.shake(1);
    ctx.say('The core is failing. Get clear!');
  }

  function poseArms(dt, targets) {
    for (const a of B.arms) {
      const tg = targets[a.s < 0 ? 0 : 1];
      const k = 1 - Math.exp(-(tg.k || 6) * dt);
      a.a += (tg.a - a.a) * k; a.e += (tg.e - a.e) * k;
      a.sh.rotation.x = a.a; a.el.rotation.x = a.e;
    }
  }

  function update(dt, ctx) {
    if (T.state === 'dormant' || T.state === 'dead') return null;
    T.t += dt;
    const R = ctx.rover;
    const dx = R.pos.x - C.x, dz = R.pos.z - C.z, dist = Math.hypot(dx, dz);
    let out = null;
    const rest = { a: 0.28 + Math.sin(T.t * 1.3) * 0.05, e: 0.4 };
    let armT = [rest, rest];

    if (T.state === 'rising') {
      const u = clamp(T.t / 3.2, 0, 1);
      B.body.position.y = sunkY + (restY - sunkY) * (1 - Math.pow(1 - u, 3));
      ctx.shake(0.5 * (1 - u) + 0.1);
      if (Math.random() < 0.5) fx.emit(v1.set(C.x + (Math.random() - 0.5) * 10, C.y + 1, C.z + (Math.random() - 0.5) * 10), 4, { speed: 5, life: 1.2, size: 2.2, colors: [[3, 1.2, 0.3], [0.5, 0.35, 0.3]], drag: 0.8, dir: v2.set(0, 6, 0) });
      armT = [{ a: 2.6 * u, e: 0.3 }, { a: 2.6 * u, e: 0.3 }];
      if (u >= 1) { T.state = 'fight'; T.act = 'idle'; T.actT = 0; sfx.roar(); out = 'awake'; }
    } else if (T.state === 'fight') {
      // turn toward the rover (slowly: circling it is how you dodge the slam)
      const want = Math.atan2(-dx, -dz);
      let dy = want - T.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const turn = S().turn * (T.act === 'vent' ? 0.5 : T.act === 'slam' ? 0.25 : 1);
      T.yaw += clamp(dy, -turn * dt, turn * dt);
      T.actT += dt;
      const st = S();
      switch (T.act) {
        case 'idle':
          if (dist < 15 && T.actT > 0.6) { T.act = 'slam'; T.actT = 0; T.slamArm = dy > 0 ? 0 : 1; break; }
          if (T.actT > st.idle) { T.act = 'barrage'; T.actT = 0; T.fired = 0; }
          break;
        case 'barrage': {
          armT = [{ a: 0.5, e: 1.1 }, { a: 0.5, e: 1.1 }];
          const want2 = Math.floor(T.actT / 0.38);
          while (T.fired < st.shells && T.fired <= want2) fireShell(ctx, T.fired++);
          if (T.fired >= st.shells && T.actT > st.shells * 0.38 + 0.6) {
            if (dist < 20) { T.act = 'slam'; T.actT = 0; T.slamArm = dy > 0 ? 0 : 1; } else { T.act = 'vent'; T.actT = 0; T.ventSaid = false; }
          }
          break;
        }
        case 'slam': {
          // wind up (1.3 s), drop, recover
          const raise = { a: 2.7, e: 0.25, k: 5 }, drop = { a: Math.acos(SHOULDER_H / ARM), e: 0, k: 22 };
          const i = T.slamArm;
          armT = [rest, rest];
          if (T.actT < 1.3) {
            armT[i] = raise;
            const fist = B.arms[i].fist; fist.material = M.dark;
            if (T.actT > 0.7) B.arms[i].fist.children[0].material = Math.sin(T.t * 30) > 0 ? M.seam : M.brass;
          } else armT[i] = drop;
          if (T.actT >= 1.3 && !W.on && T.actT < 1.6) {
            // where the fist meets the ground: in front of the shoulder, along the Titan's facing
            const sh = B.arms[i].sh.getWorldPosition(v1);
            const f = Math.sqrt(ARM * ARM - SHOULDER_H * SHOULDER_H);
            W.x = sh.x - Math.sin(T.yaw) * f; W.z = sh.z - Math.cos(T.yaw) * f;
          }
          if (T.actT >= 1.5 && !W.on && T.actT < 1.7) {
            W.on = true; W.r = 1; W.hit = false;
            wave.visible = true; wave.position.set(W.x, ctx.ground(W.x, W.z) + 0.3, W.z);
            sfx.explode(true); noise(0.8, 0.5, 200, 40); ctx.shake(1);
            fx.emit(v1.set(W.x, wave.position.y + 0.5, W.z), 70, { speed: 14, life: 1, size: 3, colors: [[3, 1.3, 0.3], [0.5, 0.35, 0.3]], drag: 2 });
            B.arms[i].fist.children[0].material = M.brass;
          }
          if (T.actT > 2.6) { T.act = 'vent'; T.actT = 0; T.ventSaid = false; }
          break;
        }
        case 'vent':
          if (!T.ventSaid) { T.ventSaid = true; noise(st.vent, 0.18, 5000, 1800, 1.5); if (T.coreHits < 6) ctx.say(T.coreHits ? 'Venting again. The core!' : 'It is venting. The chest is open. Shoot the core!'); }
          armT = [{ a: 0.15, e: 0.25 }, { a: 0.15, e: 0.25 }];
          if (Math.random() < 0.7) {
            B.core.getWorldPosition(v1);
            fx.emit(v1.add(v2.set((Math.random() - 0.5) * 3, 1.5, 0)), 2, { speed: 2, life: 1.4, size: 2.6, colors: [[0.7, 0.6, 0.55], [1.2, 0.7, 0.4]], drag: 0.5, dir: v3.set(0, 4, 0) });
          }
          if (T.actT > st.vent) { T.act = 'idle'; T.actT = 0; blip(90, 0.25, 'square', 0.08); }
          break;
        case 'roar':
          armT = [{ a: 1.9, e: 1.2, k: 8 }, { a: 1.9, e: 1.2, k: 8 }];
          if (T.actT > 1.6) { T.act = 'barrage'; T.actT = 0; T.fired = 0; }
          break;
      }
    } else if (T.state === 'dying') {
      const u = clamp(T.t / 4, 0, 1);
      armT = [{ a: 1.2 + Math.sin(T.t * 9) * 0.4, e: 1.5, k: 3 }, { a: 0.9 + Math.cos(T.t * 8) * 0.4, e: 1.3, k: 3 }];
      if (Math.random() < 0.25) {
        v1.set((Math.random() - 0.5) * 8, Math.random() * 12, (Math.random() - 0.5) * 5);
        B.body.localToWorld(v1);
        fx.emit(v1, 40, { speed: 10, life: 1, size: 3, colors: [[4, 1.4, 0.3], [5, 3, 0.9], [0.5, 0.3, 0.25]], drag: 1.6 });
        if (Math.random() < 0.5) sfx.explode(Math.random() < 0.3);
        ctx.shake(0.6);
      }
      if (T.t > 1.5) B.body.position.y = restY + (sunkY - restY) * Math.pow(clamp((T.t - 1.5) / 3, 0, 1), 2);
      B.body.rotation.z = Math.sin(T.t * 3) * 0.04 * u;
      if (T.t > 4.6) { T.state = 'dead'; B.body.visible = false; shaftLight.intensity = 60; out = 'dead'; sfx.explode(true); }
    }

    B.body.rotation.y = T.yaw;
    poseArms(dt, armT);
    shaftLight.intensity = T.state === 'dying' ? 260 * (1 - clamp(T.t / 4.6, 0, 1)) + 60 : 220 + 40 * Math.sin(T.t * 3.1) + 30 * Math.sin(T.t * 7.3);
    // chest plates and core glow
    const wantOpen = T.state === 'dying' || (T.state === 'fight' && T.act === 'vent' && T.actT > 0.4 && T.actT < S().vent - 0.3) ? 1 : 0;
    T.open += (wantOpen - T.open) * (1 - Math.exp(-(wantOpen ? 6 : 12) * dt));
    for (const p of B.plates) p.hinge.rotation.y = p.s * T.open * 1.75;
    T.flash = Math.max(0, T.flash - dt); T.hitMark = Math.max(0, T.hitMark - dt);
    const pulse = 0.75 + 0.25 * Math.sin(T.t * 6);
    const ck = (0.4 + T.open * 0.8) * pulse + T.flash * 8;
    B.core.material.color.setRGB(4 * ck, 2.2 * ck, 0.7 * ck);
    B.core.scale.setScalar(1 + T.flash * 1.5);
    B.coreLight.intensity = T.open * 60 + T.flash * 200;
    M.seam.color.setRGB(3.2 * (0.6 + T.stage * 0.25), 1.1 * (0.6 + T.stage * 0.25), 0.2);

    // shells in flight
    for (const s of shells) {
      if (!s.on) continue;
      s.t += dt; s.v.y -= 14 * dt; s.p.addScaledVector(s.v, dt);
      s.m.position.copy(s.p);
      const u = s.t / s.tf;
      s.mk.material.opacity = 0.35 + 0.5 * u * (0.6 + 0.4 * Math.sin(s.t * 26));
      s.mk.scale.setScalar(1.25 - 0.25 * u);
      if (Math.random() < 0.8) fx.emit(s.p, 1, { speed: 0.5, life: 0.5, size: 1.8, colors: [[3, 1, 0.25], [0.4, 0.3, 0.28]], drag: 1 });
      if (s.t >= s.tf || s.p.y < ctx.ground(s.p.x, s.p.z)) explodeShell(s, ctx);
    }
    // lava pools
    for (const p of pools) {
      if (!p.on) continue;
      p.t += dt;
      p.m.material.opacity = clamp(Math.min(p.t * 3, (7 - p.t) / 1.5), 0, 0.95);
      if (p.t > 7) { p.on = false; p.m.visible = false; continue; }
      if (Math.hypot(R.pos.x - p.x, R.pos.z - p.z) < 3.6 && p.t > 0.3) ctx.burn();
    }
    // shockwave ring: hurts if it passes under you while you are on the ground
    if (W.on) {
      W.r += dt * 26;
      wave.scale.setScalar(W.r);
      wave.material.opacity = clamp(1 - W.r / 17, 0, 1) * 0.9;
      const d = Math.hypot(R.pos.x - W.x, R.pos.z - W.z);
      if (!W.hit && Math.abs(d - W.r) < 1.6 && ctx.grounded()) {
        W.hit = true; ctx.damage(22); ctx.shake(1);
        v1.set(R.pos.x - W.x, 0, R.pos.z - W.z).normalize(); R.vel.addScaledVector(v1, 9); R.vel.y += 6;
      }
      if (W.r > 17) { W.on = false; wave.visible = false; }
    }
    return out;
  }

  return {
    wake, reset, update, hitTest, onBolt,
    centre: C,
    get state() { return T.state; },
    get hp() { return T.hp; },
    get open() { return T.open; },
    get hitMark() { return T.hitMark; },
    get act() { return T.act; },
    corePos: (out) => B.core.getWorldPosition(out),
    debug: T,
  };
}
