// Lantern Station and the Waylines.
// A Wayline is a Warden-built line of light between worlds that carries air, water and power.
// Lantern has no world of its own: everything it breathes comes down its line from the Heart.
// Station units match the ship (the Wayfarer is 20 u long). Local frame: spindle along +Y,
// the dock bay opens toward -Z, the lantern (where the Wayline attaches) is the spindle's top.
import * as THREE from 'three';
import { LANTERN, HEART } from './data.js';
import { VLight } from './lightpool.js';
import { bakeStatic } from './bake.js';

const BAY = { w: 96, h: 52, d: 170, z0: -46, wall: 6, y: -128 }; // the bay hangs below the habitat ring's plane so the way out is clear // interior size; z0 = the back wall's inner face
export const BAY_MOUTH_Z = BAY.z0 - BAY.d;               // -216: the open end
export const BAY_Y = BAY.y;
const SPINDLE = { r: 44, y0: -230, y1: 210 };
const RING = { R: 270, tube: 24 };
const LANTERN_Y = 268;

function hullMat(c, rough = 0.75) { return new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0.2 }); }

// window lights: a canvas of small lit panes, tiled round the ring and spindle
function windowTex(rows, cols, seed) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 64);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (rnd() < 0.42) continue;
    const warm = rnd() < 0.8;
    g.fillStyle = warm ? `rgba(255,${190 + rnd() * 40 | 0},${110 + rnd() * 50 | 0},1)` : 'rgba(150,230,255,1)';
    g.fillRect(c * (256 / cols) + 2, r * (64 / rows) + 3, 256 / cols - 4, 64 / rows - 7);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// The Wayline beam: a long open cylinder along +Y in its own frame. The vertex shader widens it
// with distance so it stays a visible thread across the whole cluster (a navigation line), and
// bright pulses ride it toward the station end (y = 0): cargo coming home.
function makeBeam(len, color, r0 = 7) {
  const geo = new THREE.CylinderGeometry(1, 1, len, 12, 1, true).translate(0, len / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, len: { value: len }, r0: { value: r0 }, col: { value: new THREE.Color(color) }, alive: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float r0; varying float vY; varying float vEdge; varying float vThin;
      void main() {
        vec3 axis = vec3(0.0, position.y, 0.0);
        vec3 radial = vec3(position.x, 0.0, position.z);
        vec4 wAxis = modelMatrix * vec4(axis, 1.0);
        float d = distance(wAxis.xyz, cameraPosition);
        float r = max(r0, d * 0.0016);
        vThin = r0 / r;
        vec4 w = modelMatrix * vec4(axis + radial * r, 1.0);
        vec3 n = normalize(mat3(modelMatrix) * radial);
        vEdge = abs(dot(n, normalize(cameraPosition - w.xyz)));
        vY = position.y;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float time, len, alive; uniform vec3 col; varying float vY; varying float vEdge; varying float vThin;
      void main() {
        float core = pow(vEdge, 2.5);
        float pulse = pow(fract(vY / 900.0 + time * 0.55), 14.0);
        float fade = smoothstep(0.0, 120.0, vY) * (1.0 - smoothstep(len * 0.8, len, vY));
        float a = core * (0.55 + pulse * 1.6) * fade * mix(0.5, 1.0, vThin);
        vec3 c = col * (1.3 + pulse * 2.2);
        gl_FragColor = vec4(c * a * alive, 1.0);
      }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  return m;
}

export function createStation(scene) {
  const root = new THREE.Group();
  root.position.fromArray(LANTERN.pos);
  root.rotation.y = 0;
  scene.add(root);

  const hull = hullMat('#8d8a86'), hullDark = hullMat('#4a4a4e'), trim = hullMat('#b9874a', 0.6);
  const glowWarm = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.0, 0.9) });
  const glowCyan = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.4, 3.0) });

  // spindle
  const spH = SPINDLE.y1 - SPINDLE.y0;
  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(SPINDLE.r, SPINDLE.r * 1.1, spH, 24), hull);
  spindle.position.y = (SPINDLE.y0 + SPINDLE.y1) / 2; root.add(spindle);
  const winT = windowTex(4, 24, 7); winT.repeat.set(3, 6);
  const spWin = new THREE.Mesh(new THREE.CylinderGeometry(SPINDLE.r + 0.6, SPINDLE.r * 1.1 + 0.6, spH * 0.8, 24, 1, true),
    new THREE.MeshBasicMaterial({ map: winT, color: new THREE.Color(1.6, 1.6, 1.6), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  spWin.position.y = spindle.position.y; root.add(spWin);
  for (const y of [SPINDLE.y0 + 40, -60, 90, SPINDLE.y1 - 20]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(SPINDLE.r * 1.18, SPINDLE.r * 1.18, 12, 24), trim);
    band.position.y = y; root.add(band);
  }
  // lower end: a thruster skirt and radiator fins
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(SPINDLE.r * 1.6, 60, 24, 1, true), hullDark);
  skirt.position.y = SPINDLE.y0 - 20; skirt.rotation.x = Math.PI; root.add(skirt);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(4, 130, 120), hullDark);
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    fin.position.set(Math.cos(a) * (SPINDLE.r + 60), SPINDLE.y0 + 70, Math.sin(a) * (SPINDLE.r + 60));
    fin.rotation.y = -a; root.add(fin);
  }

  // habitat ring and spokes
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RING.R, RING.tube, 16, 96), hull);
  ring.rotation.x = Math.PI / 2; root.add(ring);
  const rWinT = windowTex(3, 32, 19); rWinT.repeat.set(5, 1);
  const ringWin = new THREE.Mesh(new THREE.TorusGeometry(RING.R, RING.tube + 0.5, 16, 96),
    new THREE.MeshBasicMaterial({ map: rWinT, color: new THREE.Color(0.9, 0.9, 0.9), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  ringWin.rotation.x = Math.PI / 2; root.add(ringWin);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4; // spokes clear of the dock bay (-Z)
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, RING.R - SPINDLE.r, 10), hullDark);
    sp.rotation.z = Math.PI / 2; sp.rotation.y = -a;
    sp.position.set(Math.cos(a) * (RING.R + SPINDLE.r) / 2, 0, Math.sin(a) * (RING.R + SPINDLE.r) / 2);
    root.add(sp);
  }
  // running lights round the ring
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.SphereGeometry(2.2, 6, 4), i % 2 ? glowWarm : glowCyan);
    l.position.set(Math.cos(a) * RING.R, RING.tube + 1, Math.sin(a) * RING.R); root.add(l);
  }

  // the dock bay: a hollow box on the spindle's -Z side, open at the far end
  const bay = new THREE.Group(); bay.position.y = BAY.y; root.add(bay);
  const zc = BAY.z0 - BAY.d / 2, W = BAY.wall;
  const boxes = []; // solid slabs for collision, in station-local space (the bay group has no transform)
  const slab = (w, h, d, x, y, z, m = hull) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); bay.add(b); boxes.push({ c: b.position.clone().setY(y + BAY.y), h: new THREE.Vector3(w / 2, h / 2, d / 2) }); return b; };
  slab(BAY.w + W * 2, W, BAY.d, 0, -BAY.h / 2 - W / 2, zc, hullDark);  // floor
  slab(BAY.w + W * 2, W, BAY.d, 0, BAY.h / 2 + W / 2, zc);             // roof
  slab(W, BAY.h, BAY.d, -BAY.w / 2 - W / 2, 0, zc);                     // walls
  slab(W, BAY.h, BAY.d, BAY.w / 2 + W / 2, 0, zc);
  slab(BAY.w, BAY.h, W, 0, 0, BAY.z0 + W / 2, hullDark);                 // back wall
  // mouth frame and the hazard-striped lip
  const lip = new THREE.MeshStandardMaterial({ color: '#d9a23a', roughness: 0.6, metalness: 0.1 });
  slab(BAY.w + W * 4, 6, 8, 0, -BAY.h / 2 - 1, BAY_MOUTH_Z + 2, lip);
  slab(BAY.w + W * 4, 6, 8, 0, BAY.h / 2 + 1, BAY_MOUTH_Z + 2, lip);
  // bay lights: strips on the roof and a row of guide lights on the floor pointing out
  for (let i = 0; i < 6; i++) {
    const z = BAY.z0 - 14 - i * 28;
    const s = new THREE.Mesh(new THREE.BoxGeometry(BAY.w * 0.6, 0.6, 3), glowCyan); s.position.set(0, BAY.h / 2 - 0.4, z); bay.add(s);
    for (const x of [-BAY.w * 0.32, BAY.w * 0.32]) { const g = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 2.4), glowWarm); g.position.set(x, -BAY.h / 2 + 0.3, z); bay.add(g); }
  }
  // dressing (no collision): wall ribs and roof beams, cargo stacked along the walls, the pad's ring
  // and hazard stripes on the floor. Shapes stay near the walls and roof so the flight lane is clear.
  const ribMat = hullMat('#5d5b5a', 0.7);
  const dressing = new THREE.Group(); bay.add(dressing);
  const deco = (geo, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; dressing.add(o); return o; };
  const ribGeo = new THREE.BoxGeometry(3, BAY.h, 4), beamGeo = new THREE.BoxGeometry(BAY.w, 3, 4);
  for (let i = 0; i < 6; i++) {
    const z = BAY.z0 - 4 - i * 32;
    for (const sx of [-1, 1]) deco(ribGeo, ribMat, sx * (BAY.w / 2 - 1.5), 0, z);
    deco(beamGeo, ribMat, 0, BAY.h / 2 - 1.5, z);
    for (const sx of [-1, 1]) deco(new THREE.BoxGeometry(0.6, BAY.h * 0.7, 0.6), i % 2 ? glowWarm : glowCyan, sx * (BAY.w / 2 - 3.2), 0, z - 2.2);
  }
  const crateMats = [hullMat('#6b5a44', 0.85), hullMat('#4d5b63', 0.8), trim];
  const crateGeo = new THREE.BoxGeometry(7, 7, 7);
  let cs = 11;
  const crnd = () => ((cs = (cs * 16807) % 2147483647) / 2147483647);
  for (const [sx, z0, n] of [[-1, BAY.z0 - 16, 5], [1, BAY.z0 - 20, 4], [-1, BAY.z0 - 128, 3], [1, BAY.z0 - 120, 4]]) {
    for (let k = 0; k < n; k++) {
      const col = k % 2, row = Math.floor(k / 2);
      deco(crateGeo, crateMats[Math.floor(crnd() * 3)], sx * (BAY.w / 2 - 8 - col * 7.6), -BAY.h / 2 + 3.5 + row * 7, z0 - (k % 3) * 7.8, (crnd() - 0.5) * 0.3);
    }
  }
  const padRing = new THREE.Mesh(new THREE.RingGeometry(17, 18.2, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.3, 0.4) }));
  padRing.position.set(0, -BAY.h / 2 + 0.15, BAY.z0 - 70); dressing.add(padRing);
  const stripeMat = new THREE.MeshStandardMaterial({ color: '#c99632', roughness: 0.7 });
  for (let i = 0; i < 14; i++) for (const sx of [-1, 1]) {
    const s = deco(new THREE.BoxGeometry(5, 0.3, 1.6), stripeMat, sx * (BAY.w / 2 - 12), -BAY.h / 2 + 0.15, BAY.z0 - 6 - i * 12, sx * 0.6);
    s.castShadow = false;
  }

  bakeStatic(dressing); // one mesh per material

  // docking clamps either side of the ship; they swing open at launch
  const clamps = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(sx * (BAY.w / 2 - 4), -BAY.h / 2 + 4, BAY.z0 - 70); bay.add(pivot);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(26, 5, 10), trim); arm.position.x = -sx * 13; pivot.add(arm);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(4, 8, 14), hullDark); pad.position.set(-sx * 25, 3, 0); pivot.add(pad);
    clamps.push({ pivot, sx });
  }
  const bayLight = new VLight('#bfe8ff', 60, 160, 1.4); bayLight.position.set(0, 10, zc); bay.add(bayLight);
  const bayLight2 = new VLight('#ffcf8a', 40, 120, 1.4); bayLight2.position.set(0, -6, BAY.z0 - 40); bay.add(bayLight2);

  // the lantern: a Warden crystal in a cage at the top, where the Wayline arrives
  const lanternGlass = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 2.4, 1.1) });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(26, 0).scale(1, 1.6, 1), lanternGlass);
  crystal.position.y = LANTERN_Y; root.add(crystal);
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(36, 46, 92, 8, 3, true), new THREE.MeshStandardMaterial({ color: '#5a5048', roughness: 0.8, wireframe: true }));
  cage.position.y = LANTERN_Y; root.add(cage);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(52, SPINDLE.r, 24, 24), trim); collar.position.y = SPINDLE.y1 + 10; root.add(collar);
  const lanternLight = new VLight('#ffc070', 120, 700, 1.2); lanternLight.position.y = LANTERN_Y; root.add(lanternLight);

  // Lantern's Wayline, from the lantern to the Heart
  const start = new THREE.Vector3(0, LANTERN_Y + 30, 0).add(root.position);
  const end = new THREE.Vector3().fromArray(HEART.pos);
  const dir = new THREE.Vector3().subVectors(end, start);
  const beam = makeBeam(dir.length(), '#ffc46a');
  beam.position.copy(start);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  scene.add(beam);
  // Warden relays along the first stretch: rings the light threads through
  const relays = [];
  const relayMat = new THREE.MeshStandardMaterial({ color: '#6d6253', roughness: 0.7, metalness: 0.3, emissive: new THREE.Color('#ff9a3a'), emissiveIntensity: 0.5 });
  for (let i = 1; i <= 8; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(42, 5, 8, 24), relayMat);
    r.position.copy(start).addScaledVector(dir, (i * 3200) / dir.length());
    r.quaternion.copy(beam.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    scene.add(r); relays.push(r);
  }

  // ---------- collision (station-local; the ship is a sphere) ----------
  const inv = new THREE.Matrix4(), lp = new THREE.Vector3(), push = new THREE.Vector3();
  function collide(pos, rad) {
    root.updateMatrixWorld();
    inv.copy(root.matrixWorld).invert();
    lp.copy(pos).applyMatrix4(inv);
    let hit = false;
    // spindle (capped cylinder) and lantern cage
    if (lp.y > SPINDLE.y0 - 50 && lp.y < LANTERN_Y + 50) {
      const rr = (lp.y > SPINDLE.y1 ? 48 : SPINDLE.r * 1.15) + rad, d = Math.hypot(lp.x, lp.z);
      if (d < rr) { const k = (rr / (d || 1)); lp.x *= k; lp.z *= k; if (!d) lp.z = -rr; hit = true; }
    }
    // ring (torus)
    const dr = Math.hypot(lp.x, lp.z) - RING.R, dist = Math.hypot(dr, lp.y);
    if (dist < RING.tube + rad) {
      const k = (RING.tube + rad) / (dist || 1), rx = Math.hypot(lp.x, lp.z) || 1;
      const nr = RING.R + dr * k; lp.x *= nr / rx; lp.z *= nr / rx; lp.y *= k; hit = true;
    }
    // bay slabs (boxes)
    for (const b of boxes) {
      const dx = lp.x - b.c.x, dy = lp.y - b.c.y, dz = lp.z - b.c.z;
      const ox = b.h.x + rad - Math.abs(dx), oy = b.h.y + rad - Math.abs(dy), oz = b.h.z + rad - Math.abs(dz);
      if (ox > 0 && oy > 0 && oz > 0) {
        if (ox < oy && ox < oz) lp.x += Math.sign(dx) * ox; else if (oy < oz) lp.y += Math.sign(dy) * oy; else lp.z += Math.sign(dz) * oz;
        hit = true;
      }
    }
    if (!hit) return null;
    push.copy(lp).applyMatrix4(root.matrixWorld);
    const n = push.clone().sub(pos);
    pos.copy(push);
    return n.normalize();
  }

  let t = 0, clampOpen = 1, alive = 1, aliveTarget = 1;
  return {
    root, beam, relays,
    // where the ship sits at launch: on the bay floor, nose toward the mouth
    dockPose(pos, quat) {
      root.updateMatrixWorld();
      pos.set(0, BAY.y - BAY.h / 2 + 11, BAY.z0 - 70).applyMatrix4(root.matrixWorld);
      quat.copy(root.quaternion);
    },
    // local -Z depth of a world point (how far out of the bay it is: < BAY_MOUTH_Z is outside)
    localZ(p) { root.updateMatrixWorld(); inv.copy(root.matrixWorld).invert(); return lp.copy(p).applyMatrix4(inv).z; },
    local(p, out) { root.updateMatrixWorld(); inv.copy(root.matrixWorld).invert(); return out.copy(p).applyMatrix4(inv); },
    toWorld(p, out) { root.updateMatrixWorld(); return out.copy(p).applyMatrix4(root.matrixWorld); },
    beamStart: start, beamDir: dir.clone().normalize(),
    collide,
    setClamps(open) { clampOpen = open ? 1 : 0; },
    snapClamps(open) { clampOpen = open ? 1 : 0; for (const c of clamps) c.pivot.rotation.z = c.sx * (open ? 1.2 : 0); },
    // the line dies (after the first relic): fade the beam and the lantern
    setLineAlive(on, snap) { aliveTarget = on ? 1 : 0; if (snap) alive = aliveTarget; },
    get lineAlive() { return aliveTarget > 0; },
    update(dt) {
      t += dt;
      beam.material.uniforms.time.value = t;
      for (const c of clamps) c.pivot.rotation.z += (c.sx * clampOpen * 1.2 - c.pivot.rotation.z) * Math.min(1, dt * 1.5);
      ring.rotation.z += dt * 0.02; ringWin.rotation.z = ring.rotation.z;
      alive += (aliveTarget - alive) * Math.min(1, dt * 0.8);
      beam.material.uniforms.alive.value = alive;
      const flick = alive < 0.98 && aliveTarget === 0 ? 0.6 + 0.4 * Math.sin(t * 23) : 1;
      lanternGlass.color.setRGB(3.4, 2.4, 1.1).multiplyScalar(0.12 + 0.88 * alive * flick);
      lanternLight.intensity = 120 * (0.1 + 0.9 * alive);
      relayMat.emissiveIntensity = 0.5 * alive;
      // on reserve power the bay runs on its emergency lamps
      bayLight.color.setRGB(1 - 0.25 * alive, 0.35 + 0.56 * alive, 0.25 + 0.75 * alive);
      bayLight.intensity = 60 * (0.7 + 0.3 * alive);
      crystal.rotation.y += dt * 0.3;
    },
  };
}
