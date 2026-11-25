// The *Last Light* (step 9b): Orrick's flagship as a Phase II boss. It plugs into assault.js, which owns
// the arena, the player, bolts, escorts and the HUD frame; this module owns the ship and its three phases.
// Owner, 2026-11-25: "a phase 2 arcade fight with a new flagship as orrick and a difficult multiphase fight".
//
// Arena space (assault.js): the player flies on the z = 0 plane, the camera sits behind at +Z. The flagship
// lies broadside across the far end of the arena, too big to fit the screen, its nose to the left.
//   1. BATTERIES: four gun batteries on the hull (each a target) fire aimed spreads; the main guns in the
//      nose light a LANE across the player's plane (a warning band), then fire down it. Raider escorts dive.
//   2. BROADSIDE: the batteries are gone; the belly armour opens on a cycle to show the core, the only
//      target. While it is shut the ship fires WALLS: a curtain of shells with one gap. Lancers dive.
//   3. THE QUIET: at 40% core the Quiet closes in. The arena shrinks, the core stays open, walls and lanes
//      come faster, and a slow spiral sweeps the plane. Then the ship breaks.
import * as THREE from 'three';
import { cloneModel, onModel } from './models.js';

const HULL = { at: new THREE.Vector3(0, 14, -380), length: 470 };
// within the guns' reach: the arena is widened to x ±88 for this fight (the bolts fly almost straight)
const BATTERIES = [[-78, 26, -318], [-28, 30, -314], [28, 30, -314], [78, 26, -318]]; // y inside the arena's reach too
const ARENA = { x: 88, y: 40, shrinkX: 36, shrinkY: 14 };
const CORE = new THREE.Vector3(0, -14, -306);
const LANE = { w: 22, warn: 1.25, fire: 0.45, dmg: 35 };

export function createLastLightFight(A) {
  // A: { root, player, S(), spawn, startDive, slotsFor, fireAt, enemyFire, hurtPlayer, flash, particles, sfx, say, line, bounds }
  const g = new THREE.Group();
  A.root.add(g);

  // ---------- the ship ----------
  const hull = new THREE.Group();
  hull.position.copy(HULL.at);
  g.add(hull);
  const lit = new THREE.PointLight('#ffb08a', 5200, 900, 1.2); lit.position.set(0, 160, -180); g.add(lit); // a key on the hull's face
  const glowRed = new THREE.PointLight('#ff3a2a', 2600, 500, 1.3); glowRed.position.set(0, -10, -250); g.add(glowRed);
  const hullMats = [];
  function fitModel() {
    hull.clear();
    const m = cloneModel('lastlight');
    if (!m) return;
    m.scale.setScalar(HULL.length);
    m.rotation.y = -Math.PI / 2; // nose (model -Z) to the arena's -X: broadside on, nose to the left
    m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); hullMats.push({ m: o.material, base: o.material.emissive ? o.material.emissive.clone() : null }); } });
    hull.add(m);
  }
  onModel('lastlight', fitModel);

  // batteries: dark housings with twin barrels toward the player and a crimson ring that glows before a volley
  const housingMat = new THREE.MeshStandardMaterial({ color: '#3a2b3a', roughness: 0.7, metalness: 0.3 });
  const barrelMat = new THREE.MeshStandardMaterial({ color: '#2a2228', roughness: 0.6, metalness: 0.4 });
  const batts = BATTERIES.map((p) => {
    const o = new THREE.Group(); o.position.fromArray(p); g.add(o);
    const box = new THREE.Mesh(new THREE.BoxGeometry(26, 14, 22), housingMat); o.add(box);
    for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 26, 8), barrelMat); b.rotation.x = Math.PI / 2; b.position.set(s * 5, 1, 18); o.add(b); }
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.3, 0.3) });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 1.6, 6, 20), ringMat); ring.position.z = 11.5; o.add(ring);
    return { o, ringMat, e: null, fireT: 0, dead: false, smokeT: 0 };
  });
  // the core and its armour plates
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.6, 1.1) });
  const core = new THREE.Mesh(new THREE.SphereGeometry(13, 20, 14), coreMat); core.position.copy(CORE); g.add(core);
  const plateMat = new THREE.MeshStandardMaterial({ color: '#4a2430', roughness: 0.7, metalness: 0.3, emissive: new THREE.Color('#2a0a08') });
  const plates = [-1, 1].map((s) => { const m = new THREE.Mesh(new THREE.BoxGeometry(34, 34, 8), plateMat); m.position.set(CORE.x + s * 17, CORE.y, CORE.z + 16); g.add(m); return { m, s }; });

  // lanes: a warning band on the player's plane, then the main guns fire down it
  const laneMat = () => new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.25, 0.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const lanes = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), laneMat()); m.visible = false; g.add(m); return { m, t: 0, on: false, kind: 'col', c: 0, hit: false }; });

  let P = null; // fight state
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  const rand = (a, b) => a + Math.random() * (b - a);

  function start(d) {
    P = { d, phase: 1, t: 0, laneT: 3, escortT: 1, diveT: 4, wallT: 2.5, spiralA: 0, spiralT: 0,
      coreHp: Math.round(100 * d), coreMax: Math.round(100 * d), coreOpen: 0, cycle: 0, cycleT: 0,
      quietK: 0, dying: 0, boomT: 0, said: new Set() };
    g.visible = true; hull.visible = true; core.visible = true;
    plates.forEach((p) => { p.m.visible = true; p.m.position.x = CORE.x + p.s * 17; });
    batts.forEach((b, i) => {
      b.dead = false; b.o.visible = true; b.fireT = 2 + i * 0.7;
      b.e = A.part({ pos: b.o.position, radius: 14, hp: Math.round(34 * d), onHit: (n, at) => hitBattery(b, n, at) });
    });
    P.coreE = null;
    lanes.forEach((l) => { l.on = false; l.m.visible = false; });
    A.setBounds(ARENA.x, ARENA.y);
    A.line('ll-wren-1');
  }
  function stop() { if (P) { lanes.forEach((l) => { l.on = false; l.m.visible = false; }); } P = null; g.visible = false; }

  // ---------- damage ----------
  function hitBattery(b, n, at) {
    if (b.dead) return;
    b.e.hp -= n; b.e.flash = 1;
    A.particles.emit(at, 6, { speed: 60, life: 0.3, size: 2.4, colors: [[4, 3.5, 2], [5, 1.4, 0.8]], drag: 4 });
    A.sfx.hit();
    if (b.e.hp > 0) return;
    b.dead = true; b.e.alive = false;
    A.flash(b.o.position, 70, 0.5);
    A.particles.emit(b.o.position, 120, { speed: 120, life: 1.2, size: 6, colors: [[5, 2.6, 0.9], [4, 1, 2.4], [5, 4.4, 2.6]], drag: 2 });
    A.sfx.explode(true);
    A.S().shake = Math.max(A.S().shake, 1.4); A.S().hitstop = 0.06;
    b.o.children.forEach((c) => { if (c.material === housingMat) c.scale.set(1, 0.5, 1); });
    b.ringMat.color.setRGB(0.15, 0.05, 0.05);
    const left = batts.filter((x) => !x.dead).length;
    if (left > 0) A.say(left === 1 ? 'One battery left.' : left + ' batteries left.');
    else toPhase(2);
  }
  function hitCore(n, at) {
    if (P.coreOpen < 0.6 || P.dying) { A.particles.emit(at, 4, { speed: 40, life: 0.25, size: 2, colors: [[2, 1.6, 1.4]], drag: 5 }); return; }
    P.coreHp -= n; P.coreE.flash = 1;
    A.particles.emit(at, 8, { speed: 70, life: 0.35, size: 2.6, colors: [[5, 3, 1.2], [5, 4.6, 3]], drag: 4 });
    A.sfx.hit();
    if (P.phase === 2 && P.coreHp <= P.coreMax * 0.4) toPhase(3);
    if (P.coreHp <= 0) die();
  }
  function toPhase(n) {
    P.phase = n; P.t = 0;
    const S = A.S();
    if (n === 2) {
      S.banner = { text: 'THE HULL OPENS', t: 0 };
      P.cycle = 0; P.cycleT = 3.2; P.wallT = 1.5; P.escortT = 2;
      P.coreE = A.part({ pos: core.position, radius: 15, hp: 9999, onHit: (k, at) => hitCore(k, at) });
      A.line('ll-orrick-1'); A.line('ll-wren-2');
    } else if (n === 3) {
      S.banner = { text: 'THE QUIET CLOSES IN', t: 0 };
      A.line('ll-wren-3'); A.line('ll-orrick-2');
    }
    A.sfx.wave();
  }
  function die() {
    P.dying = 0.001; P.boomT = 0;
    const S = A.S();
    S.slowmo = 1.4; S.shake = 3;
    A.line('ll-orrick-end');
    lanes.forEach((l) => { l.on = false; l.m.visible = false; });
    for (const e of S.enemies) if (e.alive && !e.part) A.kill(e);
  }

  // ---------- attacks ----------
  function lane(kind, c) {
    const l = lanes.find((x) => !x.on);
    if (!l) return;
    const B = A.bounds();
    l.on = true; l.t = 0; l.kind = kind; l.c = c; l.hit = false;
    l.m.visible = true;
    if (kind === 'col') { l.m.scale.set(LANE.w, B.y * 2 + 30, 1); l.m.position.set(c, 0, 0); }
    else { l.m.scale.set(B.x * 2 + 40, LANE.w, 1); l.m.position.set(0, c, 0); }
    A.sfx.alert();
  }
  function updateLanes(dt) {
    const pl = A.player;
    for (const l of lanes) {
      if (!l.on) continue;
      l.t += dt;
      const mat = l.m.material;
      if (l.t < LANE.warn) {
        mat.opacity = 0.12 + 0.2 * (0.5 + 0.5 * Math.sin(l.t * 22)) * (l.t / LANE.warn);
        mat.color.setRGB(2.2, 0.25, 0.2);
      } else if (l.t < LANE.warn + LANE.fire) {
        if (!l.fired) {
          l.fired = true;
          A.sfx.explode(false); A.S().shake = Math.max(A.S().shake, 0.8);
          for (let k = 0; k < 10; k++) {
            v.copy(l.m.position);
            if (l.kind === 'col') v.y = rand(-40, 40); else v.x = rand(-70, 70);
            A.particles.emit(v, 6, { speed: 90, life: 0.4, size: 4, colors: [[5, 1.4, 0.8], [5, 3.6, 2]], drag: 3 });
          }
        }
        mat.opacity = 0.75; mat.color.setRGB(5, 1.6, 0.9);
        const inside = l.kind === 'col' ? Math.abs(pl.pos.x - l.c) < LANE.w / 2 + 2 : Math.abs(pl.pos.y - l.c) < LANE.w / 2 + 2;
        if (inside && !l.hit) { l.hit = true; A.hurtPlayer(LANE.dmg); }
      } else { l.on = false; l.fired = false; l.m.visible = false; }
    }
  }
  // a curtain of shells across the plane with one gap the player has to find
  function wall(gapX, gapY, gapR) {
    const B = A.bounds();
    const src = core.position;
    let n = 0;
    for (let x = -B.x; x <= B.x + 0.1; x += 15) for (let y = -B.y; y <= B.y + 0.1; y += 15) {
      if (Math.hypot(x - gapX, y - gapY) < gapR) continue;
      if (A.fireAt(src, w.set(x + rand(-2, 2), y + rand(-2, 2), 0), 165)) n++;
    }
    if (n) A.sfx.enemyShot();
  }
  function spiral(dt) {
    P.spiralT -= dt;
    if (P.spiralT > 0) return;
    P.spiralT = 0.16 / P.d;
    P.spiralA += 0.55;
    const B = A.bounds();
    for (const s of [0, Math.PI]) {
      const a = P.spiralA + s, r = Math.min(B.x, B.y) * 0.9;
      A.fireAt(core.position, w.set(Math.cos(a) * r, Math.sin(a) * r, 0), 150);
    }
  }

  // ---------- per frame ----------
  function update(dt) {
    if (!P) return;
    const S = A.S();
    P.t += dt;
    const pl = A.player;

    // the ship heaves slowly; the parts ride with it
    const bob = Math.sin(S.time * 0.35) * 4;
    hull.position.y = HULL.at.y + bob; hull.rotation.z = Math.sin(S.time * 0.22) * 0.015;
    batts.forEach((b, i) => { b.o.position.y = BATTERIES[i][1] + bob; });
    core.position.y = CORE.y + bob; plates.forEach((p) => { p.m.position.y = CORE.y + bob; });

    if (P.dying) {
      P.dying += dt; P.boomT -= dt;
      if (P.boomT <= 0 && P.dying < 3.2) {
        P.boomT = 0.12;
        v.set(rand(-HULL.length / 2, HULL.length / 2), HULL.at.y + rand(-30, 40), HULL.at.z + rand(20, 60));
        A.flash(v, rand(40, 90), 0.4);
        A.particles.emit(v, 50, { speed: 110, life: 1.1, size: 6, colors: [[5, 2.6, 0.9], [4, 1, 2.4], [5, 4.4, 2.6]], drag: 2 });
        A.sfx.explode(Math.random() < 0.4);
        S.shake = Math.max(S.shake, 1.2);
      }
      hull.rotation.z = -0.05 * P.dying; hull.position.y -= dt * 8 * P.dying;
      if (P.dying >= 3.2 && hull.visible) {
        hull.visible = false; core.visible = false; plates.forEach((p) => { p.m.visible = false; }); batts.forEach((b) => { b.o.visible = false; });
        A.flash(v.set(0, 0, HULL.at.z + 60), 260, 1.2, new THREE.Color(5, 3.4, 2));
        A.particles.emit(v, 300, { speed: 220, life: 2.2, size: 9, colors: [[5, 2.6, 0.9], [4, 1, 2.4], [5, 4.4, 2.6], [1.2, 0.5, 0.9]], drag: 1.6 });
        A.sfx.explode(true); S.shake = 3.5;
        if (P.coreE) P.coreE.alive = false;
        S.over = { win: true, t: 0 };
        S.banner = { text: 'THE LAST LIGHT BREAKS', t: 0 };
        A.line('ll-wren-end');
      }
      return;
    }
    if (S.over) return;

    // the Quiet: in phase 3 the arena closes in
    if (P.phase === 3) P.quietK = Math.min(1, P.quietK + dt / 4);
    A.setBounds(ARENA.x - ARENA.shrinkX * P.quietK, ARENA.y - ARENA.shrinkY * P.quietK);

    // escorts: Scrap Crown fighters launch from the flagship and dive on us (none once the Quiet closes)
    const escorts = S.enemies.filter((e) => e.alive && !e.part);
    P.escortT -= dt;
    if (P.phase < 3 && P.escortT <= 0 && escorts.length < 2) {
      P.escortT = 11;
      const kind = P.phase === 1 ? 'raider' : 'lancer', n = P.phase === 1 ? 5 : 4;
      S.slots = A.slotsFor({ groups: [{ kind, n }] }); S.slotNext = 0;
      for (let k = 0; k < n; k++) setTimeout(() => { if (P && !P.dying && A.S()) A.spawn(kind, k % 2 ? 1 : -1); }, k * 240);
    }
    P.diveT -= dt;
    if (P.diveT <= 0) {
      P.diveT = rand(2.2, 3.2) / P.d;
      const ready = escorts.filter((e) => e.state === 'slot');
      const divers = escorts.filter((e) => e.state === 'dive').length;
      if (ready.length && divers < 2) A.startDive(ready[(Math.random() * ready.length) | 0]);
    }

    // lanes from the main guns
    P.laneT -= dt;
    if (P.laneT <= 0) {
      const B = A.bounds();
      P.laneT = (P.phase === 1 ? 4.6 : P.phase === 2 ? 4.2 : 2.9) / P.d;
      // aimed where we are, so sitting still is never safe; phase 3 sometimes crosses two
      if (Math.random() < 0.6) lane('col', THREE.MathUtils.clamp(pl.pos.x + rand(-8, 8), -B.x + 8, B.x - 8));
      else lane('row', THREE.MathUtils.clamp(pl.pos.y + rand(-6, 6), -B.y + 8, B.y - 8));
      if (P.phase === 3 && Math.random() < 0.5) lane('col', rand(-B.x + 10, B.x - 10));
    }
    updateLanes(dt);

    if (P.phase === 1) {
      for (const b of batts) {
        if (b.dead) { b.smokeT -= dt; if (b.smokeT <= 0) { b.smokeT = 0.15; A.particles.emit(b.o.position, 2, { speed: 14, life: 1.4, size: 9, colors: [[0.5, 0.3, 0.35], [0.9, 0.4, 0.2]], drag: 1, dir: v.set(0, 18, 6) }); } continue; }
        b.fireT -= dt;
        const warm = THREE.MathUtils.clamp(1 - b.fireT / 0.8, 0, 1);
        b.ringMat.color.setRGB(2.4 + warm * 3, 0.3 + warm * 1.4, 0.3 + warm * 0.6);
        if (b.fireT <= 0) { b.fireT = rand(2.4, 3.4) / P.d; A.enemyFire(b.e, 3); }
        if (b.e.flash > 0) b.e.flash = Math.max(0, b.e.flash - dt * 8);
        b.o.scale.setScalar(1 + (b.e.flash || 0) * 0.12);
      }
    } else {
      // the core cycle: shut (walls) then open (vulnerable). Phase 3 keeps it open.
      if (P.phase === 2) {
        P.cycleT -= dt;
        if (P.cycleT <= 0) { P.cycle ^= 1; P.cycleT = P.cycle ? 6 : 3.5; if (P.cycle) { A.say('Core open. Now!'); A.sfx.lanceReady(); } }
      } else P.cycle = 1;
      P.coreOpen += ((P.cycle ? 1 : 0) - P.coreOpen) * Math.min(1, dt * 3);
      plates.forEach((p) => { p.m.position.x = CORE.x + p.s * (17 + 34 * P.coreOpen); });
      const pulse = 0.7 + 0.3 * Math.sin(S.time * 6);
      coreMat.color.setRGB(5 * pulse * (0.4 + 0.6 * P.coreOpen) + (P.coreE.flash || 0) * 3, 2.6 * pulse, 1.1);
      if (P.coreE.flash > 0) P.coreE.flash = Math.max(0, P.coreE.flash - dt * 8);
      // walls while shut (phase 2), and on a faster beat in phase 3
      P.wallT -= dt;
      if (P.wallT <= 0 && (P.phase === 3 || !P.cycle)) {
        const B = A.bounds();
        P.wallT = (P.phase === 2 ? 2.1 : 3.4) / P.d;
        wall(rand(-B.x * 0.7, B.x * 0.7), rand(-B.y * 0.6, B.y * 0.6), P.phase === 2 ? 17 : 15);
      }
      if (P.phase === 3) spiral(dt);
    }
  }

  // bolts that miss the parts still hit the hull, not empty space behind it
  function hullHit(p) {
    if (!P || P.dying >= 3.2) return false;
    return Math.abs(p.x - HULL.at.x) < HULL.length / 2 - 10 && p.y > HULL.at.y - 42 && p.y < HULL.at.y + 48 && p.z < HULL.at.z + 52 && p.z > HULL.at.z - 60;
  }

  function drawHud(ctx, W, H, ui) {
    if (!P) return;
    const live = batts.filter((b) => !b.dead).length;
    const label = P.phase === 1 ? 'PHASE 1 · BATTERIES ' + live + ' / 4' : P.phase === 2 ? 'PHASE 2 · ' + (P.coreOpen > 0.6 ? 'CORE OPEN · FIRE' : 'CORE SHUT · FIND THE GAP') : 'PHASE 3 · THE QUIET CLOSES IN';
    ui.text(ctx, label, W / 2, 48, ui.sc * 16 + 6, P.phase === 2 && P.coreOpen > 0.6 ? '255,211,106' : '110,242,255', 0.95, 'center', 700);
    // one bar for the whole ship: batteries are the first 40%, the core the rest
    const battFrac = batts.reduce((a, b) => a + (b.dead ? 0 : Math.max(0, b.e.hp) / b.e.maxHp), 0) / 4;
    const frac = P.phase === 1 ? 0.6 + 0.4 * battFrac : 0.6 * Math.max(0, P.coreHp) / P.coreMax;
    const bw = Math.min(560, W * 0.52);
    ui.bar(ctx, W / 2 - bw / 2, 84, bw, 10, frac, '255,77,109', 'THE LAST LIGHT · DAGAN ORRICK', '');
    // the Quiet at the arena's edge: it eats the space the player can use
    if (P.quietK > 0.01) {
      const k = P.quietK * 0.85;
      for (const [x0, y0, x1, y1] of [[0, 0, W * 0.16 * P.quietK + 1, 0], [W, 0, W - W * 0.16 * P.quietK - 1, 0], [0, 0, 0, H * 0.14 * P.quietK + 1], [0, H, 0, H - H * 0.14 * P.quietK - 1]]) {
        const gr = ctx.createLinearGradient(x0, y0, x1 || x0, y1 || y0);
        gr.addColorStop(0, `rgba(4,2,8,${k})`); gr.addColorStop(1, 'rgba(4,2,8,0)');
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      }
    }
    // lane warnings read on the HUD too: a red bar at each end of a lit lane
    for (const l of lanes) {
      if (!l.on || l.t >= LANE.warn) continue;
      const a = 0.5 + 0.5 * Math.sin(l.t * 22);
      const p = ui.toScreen(l.m.position, W, H);
      ctx.fillStyle = `rgba(255,77,109,${a})`;
      if (l.kind === 'col') { ctx.fillRect(p.x - 14, H - 14, 28, 8); ctx.fillRect(p.x - 14, 6, 28, 8); }
      else { ctx.fillRect(6, p.y - 14, 8, 28); ctx.fillRect(W - 14, p.y - 14, 8, 28); }
    }
  }

  g.visible = false;
  return {
    start, stop, update, drawHud, hullHit,
    get phase() { return P ? P.phase : 0; },
    get debug() { return { P, batts, lanes, core }; },
  };
}
