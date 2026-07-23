// Headless harness for the sub-tile prop collision work.
// Function bodies below are EXACT copies of what goes into index.html (minus THREE bbox
// measurement, which can't run headless — colliders are fed in directly here).

const CELL = 600;
let currentMaze = null;

// ---------- new/changed functions (verbatim parity with index.html) ----------
function isFloorCell(m, i, j) {
  if (!m) return false;
  if (i < 0 || i >= m.GW || j < 0 || j >= m.GH) return false;
  return !!m.floor[i][j];
}
function isCellFree(m, i, j) {
  if (!isFloorCell(m, i, j)) return false;
  if (m.blocked && m.blocked.has(i + ',' + j)) return false;
  return true;
}
function addPropCollider(m, x, z, r) {
  const c = { x, z, r };
  m.propColliders.push(c);
  const i0 = Math.round((x - r) / CELL), i1 = Math.round((x + r) / CELL);
  const j0 = Math.round((z - r) / CELL), j1 = Math.round((z + r) / CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const k = i + ',' + j;
    let l = m.propGrid.get(k); if (!l) { l = []; m.propGrid.set(k, l); }
    l.push(c);
  }
  return c;
}
function propsBlockCircle(m, x, z, R) {
  const g = m && m.propGrid; if (!g || g.size === 0) return false;
  const i0 = Math.round((x - R) / CELL), i1 = Math.round((x + R) / CELL);
  const j0 = Math.round((z - R) / CELL), j1 = Math.round((z + R) / CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const l = g.get(i + ',' + j); if (!l) continue;
    for (const c of l) {
      const dx = x - c.x, dz = z - c.z, rr = R + c.r;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
  }
  return false;
}
// When a step is stopped by a PROP, return a same-length TANGENTIAL step that slides
// around the blocking collider (null if no prop is responsible — i.e., a wall).
function propSlideStep(m, x, z, mx, mz, R) {
  const g = m && m.propGrid; if (!g || g.size === 0) return null;
  const tx = x + mx, tz = z + mz;
  let hit = null, hd = Infinity;
  const i0 = Math.round((tx - R) / CELL), i1 = Math.round((tx + R) / CELL);
  const j0 = Math.round((tz - R) / CELL), j1 = Math.round((tz + R) / CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const l = g.get(i + ',' + j); if (!l) continue;
    for (const c of l) {
      const dx = tx - c.x, dz = tz - c.z, rr = R + c.r, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 < hd) { hd = d2; hit = c; }
    }
  }
  if (!hit) return null;
  let nx = x - hit.x, nz = z - hit.z; const nd = Math.hypot(nx, nz) || 1; nx /= nd; nz /= nd;
  let sx = -nz, sz = nx;
  if (mx * sx + mz * sz < 0) { sx = -sx; sz = -sz; }
  const step = Math.hypot(mx, mz);
  return { x: sx * step, z: sz * step };
}
function pathArriveR(bodyR, ci, cj, base) {
  const g = currentMaze && currentMaze.propGrid;
  const l = g && g.get(ci + ',' + cj);
  if (!l || !l.length) return base;
  let mr = 0; for (const c of l) if (c.r > mr) mr = c.r;
  return Math.max(base, bodyR + mr + 50);
}
const PROP_CROSS_COST = 2.0;
function findPath(floor, GW, GH, start, goal, blocked) {
  if (!floor) return null;
  const key = (i, j) => i * GH + j;
  const bl = blocked || new Set();
  const inb = (i, j) => i >= 0 && i < GW && j >= 0 && j < GH && floor[i][j];
  if (!inb(start[0], start[1]) || !inb(goal[0], goal[1])) return null;
  if (start[0] === goal[0] && start[1] === goal[1]) return [start.slice()];
  const open = [start]; const came = new Map();
  const inOpen = new Set([key(start[0], start[1])]);
  const g = new Map([[key(start[0], start[1]), 0]]);
  const h = (i, j) => { const dx = Math.abs(i - goal[0]), dy = Math.abs(j - goal[1]);
    return (dx + dy) + (1.414 - 2) * Math.min(dx, dy); };
  const f = new Map([[key(start[0], start[1]), h(start[0], start[1])]]);
  const seen = new Set();
  while (open.length) {
    let bi = 0, bf = Infinity;
    for (let k = 0; k < open.length; k++) { const n = open[k]; const fv = f.get(key(n[0], n[1])) ?? Infinity; if (fv < bf) { bf = fv; bi = k; } }
    const cur = open.splice(bi, 1)[0]; const ck = key(cur[0], cur[1]); inOpen.delete(ck);
    if (cur[0] === goal[0] && cur[1] === goal[1]) {
      const path = [cur]; let k = ck;
      while (came.has(k)) { const p = came.get(k); path.push(p); k = key(p[0], p[1]); }
      return path.reverse();
    }
    seen.add(ck);
    const steps = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
                   [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    for (const [di, dj, cost] of steps) {
      const ni = cur[0] + di, nj = cur[1] + dj;
      if (!inb(ni, nj)) continue;
      if (di !== 0 && dj !== 0) {
        if (!inb(cur[0] + di, cur[1]) || !inb(cur[0], cur[1] + dj)) continue;
      }
      const nk = key(ni, nj); if (seen.has(nk)) continue;
      const tentative = (g.get(ck) ?? Infinity) + cost + (bl.has(ni + ',' + nj) ? PROP_CROSS_COST : 0);
      if (tentative < (g.get(nk) ?? Infinity)) {
        came.set(nk, cur); g.set(nk, tentative); f.set(nk, tentative + h(ni, nj));
        if (!inOpen.has(nk)) { open.push([ni, nj]); inOpen.add(nk); }
      }
    }
  }
  return null;
}
const worldToCell = (x, z) => [Math.round(x / CELL), Math.round(z / CELL)];
function lineOfSight(floor, GW, GH, a, b) {
  let x0 = a[0], y0 = a[1]; const x1 = b[0], y1 = b[1];
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  const inb = (i, j) => i >= 0 && i < GW && j >= 0 && j < GH && floor[i][j];
  if (!inb(x0, y0)) return false;
  while (!(x0 === x1 && y0 === y1)) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
    if (!inb(x0, y0)) return false;
  }
  return true;
}
function mobWalkable(self, x, z) {
  if (!currentMaze) return true;
  const R = self.bodyR || 150;
  for (const [px, pz] of [[x - R, z - R], [x + R, z - R], [x - R, z + R], [x + R, z + R], [x, z]]) {
    if (!isFloorCell(currentMaze, Math.round(px / CELL), Math.round(pz / CELL))) return false;
  }
  return !propsBlockCircle(currentMaze, x, z, R);
}
function mobSteer(self, dt, tx, tz) {
  const dx = tx - self.root.position.x, dz = tz - self.root.position.z; const dist = Math.hypot(dx, dz);
  if (dist < 1) return 0;
  const want = Math.atan2(dx, dz);
  let dh = want - self.heading; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
  self.heading += dh * Math.min(1, dt * 7);
  const step = Math.min((self.moveSpeed || 300) * dt, dist);
  const mx = Math.sin(self.heading) * step, mz = Math.cos(self.heading) * step;
  const px = self.root.position.x, pz = self.root.position.z;
  if (mobWalkable(self, px + mx, pz + mz)) { self.root.position.x = px + mx; self.root.position.z = pz + mz; }
  else {
    const s = propSlideStep(currentMaze, px, pz, mx, mz, self.bodyR || 150);
    if (s && mobWalkable(self, px + s.x, pz + s.z)) { self.root.position.x = px + s.x; self.root.position.z = pz + s.z; }
    else if (mobWalkable(self, px + mx, pz)) { self.root.position.x = px + mx; }
    else if (mobWalkable(self, px, pz + mz)) { self.root.position.z = pz + mz; }
  }
  self.cell = worldToCell(self.root.position.x, self.root.position.z);
  return dist - step;
}
// mobPursue, with the v14 stall net intact and the NEW pathArriveR waypoint radius.
function mobPursue(self, dt, hero) {
  if (!currentMaze || !hero || !hero.root) return;
  const { floor, GW, GH, blocked } = currentMaze;
  const a = worldToCell(self.root.position.x, self.root.position.z);
  const b = worldToCell(hero.root.position.x, hero.root.position.z);
  const _px = self.root.position.x, _pz = self.root.position.z;
  const commitActive = (self._pathCommit || 0) > 0;
  if (!commitActive && lineOfSight(floor, GW, GH, a, b)) {
    mobSteer(self, dt, hero.root.position.x, hero.root.position.z);
    self.path = null;
    const moved = Math.hypot(self.root.position.x - _px, self.root.position.z - _pz);
    self._stall = (moved < (self.moveSpeed || 300) * dt * 0.35) ? (self._stall || 0) + dt : 0;
    if (self._stall > 0.3) { self._pathCommit = 0.8; self._stall = 0; self.path = null; self.repathTimer = 0; }
    return;
  }
  if (commitActive) self._pathCommit -= dt;
  self.repathTimer = (self.repathTimer || 0) - dt;
  if (self.repathTimer <= 0 || !self.path) {
    self.repathTimer = 0.4;
    let goal = b;
    if (!isCellFree(currentMaze, goal[0], goal[1])) goal = goal; // nearestFloor stub: hero on clean cell in tests
    const path = findPath(floor, GW, GH, a, goal, blocked);
    if (path && path.length > 1) { self.path = path; self.pathIdx = 1; } else self.path = null;
  }
  if (self.path && self.pathIdx < self.path.length) {
    const [ci, cj] = self.path[self.pathIdx];
    const left = mobSteer(self, dt, ci * CELL, cj * CELL);
    if (left < pathArriveR(self.bodyR || 150, ci, cj, 40)) self.pathIdx++;
    const moved = Math.hypot(self.root.position.x - _px, self.root.position.z - _pz);
    self._stall = (moved < (self.moveSpeed || 300) * dt * 0.35) ? (self._stall || 0) + dt : 0;
    if (self._stall > 0.4) { self._stall = 0; self.repathTimer = 0; self.pathIdx++; }
  } else {
    mobSteer(self, dt, hero.root.position.x, hero.root.position.z);
  }
}

// ------------------------------- test helpers -------------------------------
let pass = 0, fail = 0;
const assert = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('FAIL:', msg); } };
function makeMaze(GW, GH, floorFn) {
  const floor = Array.from({ length: GW }, (_, i) => Array.from({ length: GH }, (_, j) => floorFn(i, j)));
  return { floor, GW, GH, blocked: new Set(), propColliders: [], propGrid: new Map() };
}
const mkMob = (x, z, R = 150, spd = 300) =>
  ({ root: { position: { x, z } }, heading: 0, bodyR: R, moveSpeed: spd, cell: worldToCell(x, z) });

// ------------------------------- T1: circle basics -------------------------------
{
  const m = makeMaze(3, 3, () => true);
  addPropCollider(m, 640, 570, 110);              // barrel, jittered off cell (1,1) center
  assert(propsBlockCircle(m, 640, 311, 150) === true, 'T1a just inside touch distance (259.99) blocks');
  assert(propsBlockCircle(m, 640, 400, 150) === true, 'T1b overlapping blocks');
  assert(propsBlockCircle(m, 640, 310, 150) === false, 'T1c exactly touching (260) is free (strict <)');
  assert(propsBlockCircle(m, 640, 250, 150) === false, 'T1d clear south of barrel is free');
  assert(propsBlockCircle(m, 340, 570, 150) === false, 'T1e beside the barrel, same cell, is free');
  // The whole point: a body CAN stand inside the propped cell, beside the prop.
  const mob = mkMob(340, 570);
  currentMaze = m;
  assert(mobWalkable(mob, 340, 570) === true, 'T1f mobWalkable passes inside a propped cell beside the prop');
  assert(mobWalkable(mob, 640, 570) === false, 'T1g mobWalkable fails on top of the prop');
  currentMaze = null;
}

// -------------------- T2: grid spill across cell boundaries --------------------
{
  const m = makeMaze(4, 1, () => true);
  addPropCollider(m, 880, 0, 110);                // near boundary between cells 1 and 2 (edge at 900)
  assert(m.propGrid.has('1,0') && m.propGrid.has('2,0'), 'T2a collider registered in both straddled cells');
  // body centered in cell 2, reaching back across the boundary
  assert(propsBlockCircle(m, 1100, 0, 150) === true, 'T2b body in neighbor cell still detects the collider');
  assert(propsBlockCircle(m, 1150, 0, 150) === false, 'T2c ...and is free once past touch distance');
}

// ------------------ T3: A* passable-at-a-cost through props ------------------
{
  // 5x1 corridor, middle cell propped: previously findPath returned NULL. Now it must route through.
  const m = makeMaze(5, 1, () => true);
  m.blocked.add('2,0');
  const p = findPath(m.floor, 5, 1, [0, 0], [4, 0], m.blocked);
  assert(!!p && p.length === 5, 'T3a corridor path exists THROUGH the propped cell (was null before)');

  // 3x3 open room, center propped: path should prefer AROUND (cost 2*1.414=2.83 < 1+2.0+1=4).
  const m2 = makeMaze(3, 3, () => true);
  m2.blocked.add('1,1');
  const p2 = findPath(m2.floor, 3, 3, [0, 1], [2, 1], m2.blocked);
  assert(!!p2, 'T3b open-room path exists');
  assert(!p2.some(([i, j]) => i === 1 && j === 1), 'T3c ...and detours around the propped center when a clean route is as short');
}

// -------- T4: the wedge exploit — dead-center prop, axis-aligned pursuit --------
// Old behavior: mob beelines (LOS clear), grinds on the cell-wide invisible wall,
// stall fires, A* returns the SAME blocked route, re-wedges forever. New behavior must
// deliver the mob to melee range.
{
  const m = makeMaze(5, 3, () => true);
  m.blocked.add('2,1');
  addPropCollider(m, 1230, 610, 110);            // barrel jittered +30,+10 off cell (2,1) center
  currentMaze = m;
  const mob = mkMob(0, 600);                     // cell (0,1)
  const hero = { root: { position: { x: 2400, z: 600 } } };   // cell (4,1) — dead ahead through the barrel
  const dt = 1 / 60;
  let t = 0, arrived = false;
  while (t < 12 && !arrived) {
    mobPursue(mob, dt, hero); t += dt;
    if (Math.hypot(hero.root.position.x - mob.root.position.x, hero.root.position.z - mob.root.position.z) < 360) arrived = true;
  }
  assert(arrived, `T4a mob reaches the hero past a dead-center barrel (took ${t.toFixed(2)}s, pos ${mob.root.position.x.toFixed(0)},${mob.root.position.z.toFixed(0)})`);
  assert(t < 12, 'T4b ...within the time budget');
  currentMaze = null;
}

// ---- T5: prop wall — a LINE of propped cells with a gap; A* threads the gap ----
{
  const m = makeMaze(5, 5, () => true);
  for (const j of [0, 1, 3, 4]) m.blocked.add('2,' + j);   // props at column 2 except row 2
  const p = findPath(m.floor, 5, 5, [0, 2], [4, 2], m.blocked);
  assert(!!p && !p.some(([i, j]) => m.blocked.has(i + ',' + j)), 'T5a A* threads the clean gap, never entering a propped cell');
}

// ------------- T6: return-home style: mob wedged mid-cell escapes -------------
// Mob starts INSIDE a propped cell (beside the prop) and must get out to a goal cell.
{
  const m = makeMaze(3, 3, () => true);
  m.blocked.add('1,1');
  addPropCollider(m, 620, 590, 110);
  currentMaze = m;
  const mob = mkMob(340, 600);                   // inside cell (1,1)'s free crescent
  const hero = { root: { position: { x: 1200, z: 1200 } } };  // cell (2,2)
  const dt = 1 / 60; let t = 0, ok = false;
  while (t < 10 && !ok) {
    mobPursue(mob, dt, hero); t += dt;
    if (Math.hypot(hero.root.position.x - mob.root.position.x, hero.root.position.z - mob.root.position.z) < 360) ok = true;
  }
  assert(ok, `T6a mob starting inside a propped cell escapes and arrives (t=${t.toFixed(2)}s)`);
  currentMaze = null;
}

// ---------------- T7: pathArriveR inflates only near colliders ----------------
{
  const m = makeMaze(3, 3, () => true);
  addPropCollider(m, 600, 600, 187);
  currentMaze = m;
  assert(pathArriveR(150, 1, 1, 40) === 150 + 187 + 50, 'T7a waypoint in a propped cell gets touch-distance arrival radius');
  assert(pathArriveR(150, 0, 0, 40) === 40, 'T7b clean-cell waypoint keeps the tight 40u radius');
  currentMaze = null;
}

// ------- T8: hero-scale check — 140R body through a table cell doorway --------
// Table (r up to 240 cap) in a room cell; hero clicks past it. Ensure a straight
// steer with slide gets around a big collider without wall contact (all-floor room).
{
  const m = makeMaze(3, 3, () => true);
  m.blocked.add('1,1');
  addPropCollider(m, 600, 600, 240);             // worst-case capped radius
  currentMaze = m;
  const mob = mkMob(0, 0, 140, 460);             // hero-ish: R=140, boots-ish speed
  const hero = { root: { position: { x: 1200, z: 1200 } } };
  const dt = 1 / 60; let t = 0, ok = false;
  while (t < 10 && !ok) {
    mobPursue(mob, dt, hero); t += dt;
    if (Math.hypot(hero.root.position.x - mob.root.position.x, hero.root.position.z - mob.root.position.z) < 200) ok = true;
  }
  assert(ok, `T8a 140R body diagonally past a 240r table (t=${t.toFixed(2)}s)`);
  currentMaze = null;
}

// -------- T9: WALL sliding unchanged — prop slide must not hijack wall hits --------
{
  const m = makeMaze(5, 1, () => true);          // 1-cell-tall corridor: walls north+south
  currentMaze = m;
  const mob = mkMob(300, 0);
  // steer diagonally into the north wall repeatedly: must slide along +x as before
  const dt = 1 / 60;
  for (let k = 0; k < 240; k++) mobSteer(mob, dt, 2400, 900);
  assert(mob.root.position.x > 1200, `T9a diagonal-into-wall still slides along the corridor (x=${mob.root.position.x.toFixed(0)})`);
  assert(propSlideStep(m, 300, 140, 0, 20, 150) === null, 'T9b propSlideStep ignores wall-only blockage');
  currentMaze = null;
}

// -------- T10: head-on symmetric approach resolves deterministically --------
{
  const m = makeMaze(3, 1, () => true);
  m.blocked.add('1,0');
  addPropCollider(m, 600, 0, 110);               // perfectly centered barrel, corridor axis
  currentMaze = m;
  const mob = mkMob(0, 0);
  const hero = { root: { position: { x: 1200, z: 0 } } };
  const dt = 1 / 60; let t = 0, ok = false;
  while (t < 8 && !ok) {
    mobPursue(mob, dt, hero); t += dt;
    if (Math.hypot(hero.root.position.x - mob.root.position.x, hero.root.position.z - mob.root.position.z) < 360) ok = true;
  }
  // NOTE: 1-cell corridor with walls both sides + centered barrel: lane is ±150 for a
  // 150R body, so physically IMPASSABLE. Props are only ever placed on room-interior
  // cells (4 floor neighbors), so this can't occur in a real level — assert instead
  // that the mob does NOT tunnel through.
  assert(mob.root.position.x < 600, 'T10a impassable corridor barrel: mob correctly cannot tunnel');
  currentMaze = null;
}

// ---- T11: same head-on barrel but with room around it (the real-level case) ----
{
  const m = makeMaze(3, 3, () => true);
  m.blocked.add('1,1');
  addPropCollider(m, 600, 600, 110);
  currentMaze = m;
  const mob = mkMob(0, 600);
  const hero = { root: { position: { x: 1200, z: 600 } } };
  const dt = 1 / 60; let t = 0, ok = false;
  while (t < 8 && !ok) {
    mobPursue(mob, dt, hero); t += dt;
    if (Math.hypot(hero.root.position.x - mob.root.position.x, hero.root.position.z - mob.root.position.z) < 360) ok = true;
  }
  assert(ok, `T11a perfectly-centered head-on barrel in a room: mob arrives (t=${t.toFixed(2)}s)`);
  currentMaze = null;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
