// Kessa wildlife: cinder skitters (harmless, skittish, in little herds) and magma hounds
// (hunt the rover, lunge and bite). Both are built from primitives and can be shot or rammed.
// A fixed pool keeps a band of life around the rover: creatures that fall far behind respawn ahead.
import * as THREE from 'three';
import { pathInfo } from './terrain.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();

const KIND = {
  skitter: { hp: 1, r: 0.75, speed: 5.5, flee: 11, fleeR: 20, scale: 1 },
  hound: { hp: 5, r: 1.35, speed: 7, chase: 14.5, sight: 48, bite: 6, scale: 1 },
};
const N_SKITTER = 20, N_HOUND = 7;
const SPAWN_MIN = 75, SPAWN_MAX = 150, DESPAWN = 230;

function makeSkitter(mats) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6).scale(1, 0.55, 1.35), mats.shell); body.position.y = 0.42; g.add(body);
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 4).scale(1, 0.4, 1.3), mats.glow); back.position.set(0, 0.62, 0.05); g.add(back);
  const legs = [];
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1, row = Math.floor(i / 2) - 1;
    const pivot = new THREE.Group(); pivot.position.set(side * 0.32, 0.4, row * 0.32); g.add(pivot);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.06), mats.dark); leg.position.x = side * 0.2; leg.rotation.z = side * -0.7; pivot.add(leg);
    legs.push({ pivot, phase: (i % 2 ? 0 : Math.PI) + row * 0.6 });
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, body, legs, glow: back };
}

function makeHound(mats) {
  const g = new THREE.Group();
  const torso = new THREE.Group(); torso.position.y = 1.15; g.add(torso);
  const chest = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0).scale(1, 0.85, 1.25), mats.hide); chest.position.z = -0.35; torso.add(chest);
  const hips = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0).scale(1, 0.85, 1.2), mats.hide); hips.position.z = 0.7; torso.add(hips);
  const crack = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 1.6), mats.glow); crack.position.set(0, 0.6, 0.1); torso.add(crack);
  for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) { // molten seams down the flanks
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5 - i * 0.08, 0.1), mats.glow);
    seam.position.set(sd * 0.72, 0.05, -0.75 + i * 0.42); seam.rotation.x = 0.35; crack.parent.add(seam);
  }
  for (let i = 0; i < 4; i++) { // dorsal spines
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55, 4), mats.dark); sp.position.set(0, 0.7, -0.55 + i * 0.38); sp.rotation.x = 0.5; torso.add(sp);
  }
  const head = new THREE.Group(); head.position.set(0, 0.25, -1.2); torso.add(head);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.7), mats.hide); head.add(skull);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.6), mats.dark); jaw.position.set(0, -0.26, -0.12); head.add(jaw);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.5), mats.glow); mouth.position.set(0, -0.18, -0.14); head.add(mouth);
  for (const s of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), mats.eye); eye.position.set(s * 0.2, 0.08, -0.36); head.add(eye); }
  const legs = [];
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1, front = i < 2;
    const pivot = new THREE.Group(); pivot.position.set(side * 0.5, -0.15, front ? -0.6 : 0.75); torso.add(pivot);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.1, 0.24), mats.dark); leg.position.y = -0.5; pivot.add(leg);
    legs.push({ pivot, phase: (front ? 0 : Math.PI) + (side > 0 ? Math.PI * 0.5 : 0) });
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, torso, head, jaw, legs, glow: crack };
}

export function createFauna({ root, def, terrain, fx }) {
  const mats = {
    shell: new THREE.MeshStandardMaterial({ color: '#7a5e4c', roughness: 0.5, metalness: 0.25, flatShading: true, emissive: '#2a0c02' }),
    hide: new THREE.MeshStandardMaterial({ color: '#6a5244', roughness: 0.75, flatShading: true, emissive: '#3a0e02' }),
    dark: new THREE.MeshStandardMaterial({ color: '#33281f', roughness: 0.85, emissive: '#140400' }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.1, 0.2) }),
    eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.6, 0.6) }),
  };
  const list = [];
  for (let i = 0; i < N_SKITTER; i++) list.push({ kind: 'skitter', k: KIND.skitter, ...makeSkitter(mats) });
  for (let i = 0; i < N_HOUND; i++) list.push({ kind: 'hound', k: KIND.hound, ...makeHound(mats) });
  for (const c of list) {
    c.g.visible = false; root.add(c.g);
    Object.assign(c, { alive: false, x: 0, z: 0, y: 0, yaw: 0, vx: 0, vz: 0, hp: 0, gait: 0, flash: 0, state: 'roam', t: 0, cd: 0, wander: 0, dead: 0, mood: 0 });
  }

  const okSpot = (x, z, kind, rover) => {
    const lim = def.size * 0.42;
    if (Math.abs(x) > lim || Math.abs(z) > lim) return false;
    const h = terrain.heightAt(x, z);
    if (h < def.lava + 1.2) return false;
    if (Math.hypot(x - def.pad.x, z - def.pad.z) < def.pad.r * 2) return false;
    if (Math.hypot(x - def.vault.x, z - def.vault.z) < 95) return false; // keep the arena and vent field to the Titan
    if (kind === 'hound' && def.canyon && pathInfo(def.canyon.pts, x, z).d < def.canyon.wall + 10) return false; // the canyon is the geysers' fight
    if (rover && Math.hypot(x - rover.x, z - rover.z) < SPAWN_MIN * 0.8) return false;
    return true;
  };

  // where a creature may walk (the pad is fine; lava, the arena and, for hounds, the canyon are not)
  const canWalk = (x, z, kind) => {
    const lim = def.size * 0.42;
    if (Math.abs(x) > lim || Math.abs(z) > lim) return false;
    if (terrain.heightAt(x, z) < def.lava + 0.8) return false;
    if (Math.hypot(x - def.vault.x, z - def.vault.z) < 90) return false;
    if (kind === 'hound' && def.canyon && pathInfo(def.canyon.pts, x, z).d < def.canyon.wall + 6) return false;
    return true;
  };

  function spawn(c, around, heading) {
    for (let tries = 0; tries < 30; tries++) {
      // prefer ahead of the rover so the world in front feels alive
      const a = heading + (Math.random() - 0.5) * Math.PI * 1.4;
      const d = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      const x = around.x - Math.sin(a) * d, z = around.z - Math.cos(a) * d;
      if (!okSpot(x, z, c.kind, around)) continue;
      // skitters come in herds: if a living skitter is near this point, join it
      Object.assign(c, { alive: true, x, z, y: terrain.heightAt(x, z), yaw: Math.random() * 6.28, vx: 0, vz: 0, hp: c.k.hp, flash: 0, state: 'roam', t: 0, cd: 0, wander: Math.random() * 6.28, dead: 0, mood: Math.random() * 4 });
      if (c.kind === 'skitter') {
        const mate = list.find((o) => o !== c && o.alive && o.kind === 'skitter' && Math.hypot(o.x - around.x, o.z - around.z) > SPAWN_MIN && Math.random() < 0.6);
        if (mate) { c.x = mate.x + (Math.random() - 0.5) * 8; c.z = mate.z + (Math.random() - 0.5) * 8; if (!okSpot(c.x, c.z, 'skitter')) { c.x = x; c.z = z; } c.wander = mate.wander; }
        c.y = terrain.heightAt(c.x, c.z);
      }
      c.g.visible = true; c.g.scale.setScalar(1); c.g.rotation.set(0, c.yaw, 0);
      return true;
    }
    c.alive = false; c.g.visible = false;
    return false;
  }

  function reset(roverPos, heading) {
    for (const c of list) { c.alive = false; c.g.visible = false; c.respawn = Math.random() * 3; }
    if (roverPos) for (const c of list) spawn(c, roverPos, heading + (Math.random() - 0.5) * 6);
  }
  function hideAll() { for (const c of list) { c.alive = false; c.g.visible = false; } }

  function kill(c, by) {
    c.alive = false; c.dead = 1.1; c.respawn = 6 + Math.random() * 8;
    v1.set(c.x, c.y + (c.kind === 'hound' ? 1.2 : 0.5), c.z);
    if (c.kind === 'hound') {
      fx.emit(v1, 40, { speed: 9, life: 0.9, size: 2.2, colors: [[5, 1.8, 0.3], [4, 2.8, 0.8], [0.4, 0.3, 0.28]], drag: 2 });
      fx.emit(v1, 14, { speed: 4, life: 1.6, size: 4, colors: [[0.5, 0.35, 0.3]], drag: 1.5, dir: v2.set(0, 3, 0) });
    } else {
      fx.emit(v1, 18, { speed: 6, life: 0.6, size: 1.4, colors: [[4, 1.6, 0.3], [0.45, 0.35, 0.3]], drag: 3 });
    }
    return by;
  }

  // segment-vs-sphere against the living creatures; returns the nearest hit
  const hitP = new THREE.Vector3();
  function hitTest(a, b) {
    v2.subVectors(b, a); const L2 = v2.lengthSq() || 1;
    let best = 2, hit = null;
    for (const c of list) {
      if (!c.alive) continue;
      v1.set(c.x, c.y + (c.kind === 'hound' ? 1.1 : 0.45), c.z);
      if (Math.abs(v1.x - a.x) > 260 || Math.abs(v1.z - a.z) > 260) continue;
      const u = clamp(v3.subVectors(v1, a).dot(v2) / L2, 0, 1);
      v3.copy(a).addScaledVector(v2, u);
      if (v3.distanceToSquared(v1) < c.k.r * c.k.r && u < best) { best = u; hit = c; hitP.copy(v3); }
    }
    return hit ? { c: hit, p: hitP, u: best } : null;
  }

  // returns true if it died
  function damage(c, n) {
    if (!c.alive) return false;
    c.hp -= n; c.flash = 0.12;
    if (c.kind === 'hound') { c.state = 'chase'; c.t = 0; } // shooting one wakes it
    else { c.state = 'flee'; c.t = 0; }
    fx.emit(hitP, 6, { speed: 5, life: 0.3, size: 1.1, colors: [[5, 2.2, 0.5]], drag: 4 });
    if (c.hp <= 0) { kill(c); return true; }
    return false;
  }

  // ctx: { rover, heading, damage(n), shake(k), say(id,line), quiet } — quiet = the Titan fight, no wildlife
  function update(dt, time, ctx) {
    const R = ctx.rover.pos;
    let houndsHunting = 0;
    for (const c of list) {
      if (c.dead > 0) { c.dead -= dt; c.g.scale.setScalar(Math.max(0.01, c.dead)); c.g.position.y -= dt * 0.8; if (c.dead <= 0) c.g.visible = false; }
      if (!c.alive) {
        if (ctx.quiet) continue;
        c.respawn = (c.respawn || 0) - dt;
        if (c.respawn <= 0) { if (!spawn(c, R, ctx.heading)) c.respawn = 2; }
        continue;
      }
      if (ctx.quiet) { c.alive = false; c.g.visible = false; c.respawn = 1; continue; }
      const dx = R.x - c.x, dz = R.z - c.z, dist = Math.hypot(dx, dz);
      if (dist > DESPAWN) { c.alive = false; c.g.visible = false; c.respawn = 0.5 + Math.random() * 2; continue; }
      c.t += dt; c.cd -= dt; c.flash = Math.max(0, c.flash - dt);
      let want = 0, wantYaw = c.yaw;
      const toward = Math.atan2(dx, dz); // yaw facing the rover (+z forward in creature space is -z... see below)
      if (c.kind === 'skitter') {
        if (dist < c.k.fleeR) { c.state = 'flee'; c.t = 0; }
        if (c.state === 'flee') {
          want = c.k.flee; wantYaw = toward + Math.PI;
          if (c.t > 2.5 && dist > c.k.fleeR * 1.4) c.state = 'roam';
        } else {
          c.mood -= dt;
          if (c.mood < 0) { c.mood = 1.5 + Math.random() * 3; c.wander += (Math.random() - 0.5) * 2; c.idle = Math.random() < 0.35; }
          want = c.idle ? 0 : c.k.speed; wantYaw = c.wander;
        }
      } else {
        if (c.state === 'roam' && dist < c.k.sight) { c.state = 'stalk'; c.t = 0; ctx.say && ctx.say('hound', 'Contacts. Magma hounds, and they have our scent. Outrun them or use the turret.'); }
        if (c.state === 'roam') {
          c.mood -= dt;
          if (c.mood < 0) { c.mood = 2 + Math.random() * 3; c.wander += (Math.random() - 0.5) * 2.5; }
          want = c.k.speed * 0.6; wantYaw = c.wander;
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
          if (dist > c.k.sight * 2.2) { c.state = 'roam'; }
        }
      }
      // turn, then move along the facing (creature forward is -Z like the rover, so yaw atan2(-dx,-dz))
      let dy = (wantYaw - c.yaw); dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      c.yaw += clamp(dy, -6 * dt, 6 * dt);
      const fx_ = Math.sin(c.yaw), fz_ = Math.cos(c.yaw);
      const k = 1 - Math.exp(-5 * dt);
      c.vx += (fx_ * want - c.vx) * k; c.vz += (fz_ * want - c.vz) * k;
      let nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
      if (!canWalk(nx, nz, c.kind)) {
        // lava or off-limits ahead: turn away and stop
        c.wander += Math.PI * (0.6 + Math.random() * 0.6); c.vx *= -0.3; c.vz *= -0.3; nx = c.x; nz = c.z;
        if (c.state === 'flee') c.state = 'roam';
      }
      c.x = nx; c.z = nz;
      const gy = terrain.heightAt(c.x, c.z);
      c.y += (gy - c.y) * (1 - Math.exp(-14 * dt));
      // rammed by the rover
      const rs = Math.hypot(ctx.rover.vel.x, ctx.rover.vel.z);
      if (dist < c.k.r + 1.7 && Math.abs(R.y - c.y) < 3) {
        if (rs > 9) { if (c.kind === 'hound') { c.hp -= 2; c.flash = 0.12; ctx.shake(0.35); } else c.hp = 0; if (c.hp <= 0) { kill(c); ctx.onKill && ctx.onKill(c, 'ram'); continue; } }
        const nx2 = -dx / (dist || 1), nz2 = -dz / (dist || 1);
        c.x += nx2 * 0.6; c.z += nz2 * 0.6; c.vx += nx2 * 8; c.vz += nz2 * 8;
      }
      // animate
      const sp = Math.hypot(c.vx, c.vz);
      c.gait += dt * sp * (c.kind === 'hound' ? 1.6 : 4.5);
      const sw = clamp(sp / 4, 0, 1);
      for (const L of c.legs) {
        if (c.kind === 'hound') L.pivot.rotation.x = Math.sin(c.gait + L.phase) * 0.7 * sw;
        else L.pivot.rotation.y = Math.sin(c.gait + L.phase) * 0.5 * sw;
      }
      if (c.kind === 'hound') {
        c.torso.position.y = 1.15 + Math.abs(Math.sin(c.gait)) * 0.12 * sw;
        const lunge = c.state === 'chase' && dist < 7;
        c.jaw.rotation.x = lunge ? 0.35 + Math.sin(time * 18) * 0.25 : 0.05;
        c.head.rotation.x = c.state === 'stalk' ? 0.25 : 0;
      } else {
        c.body.position.y = 0.42 + Math.abs(Math.sin(c.gait * 0.5)) * 0.05;
      }
      c.g.position.set(c.x, c.y, c.z);
      c.g.rotation.y = c.yaw + Math.PI; // models are built facing -Z
      c.glow.scale.setScalar(c.flash > 0 ? 1.6 : 1);
    }
    return houndsHunting;
  }

  return { list, reset, hideAll, update, hitTest, damage, kill };
}
