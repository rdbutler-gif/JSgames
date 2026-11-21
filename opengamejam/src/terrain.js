// Planet surface heightfields (CPU), shared by the rendered mesh and the rover physics so the
// wheels touch exactly what is drawn. 1 unit = 1 metre on the surface.
import * as THREE from 'three';

// ---------- 2D value noise ----------
function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, seed, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, seed + i * 17); f *= 2.03; a *= 0.5; }
  return s;
}
function ridged(x, y, seed, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(vnoise(x * f, y * f, seed + i * 31) * 2 - 1); s += a * n * n; f *= 2.1; a *= 0.5; }
  return s;
}
// periodic noise for seamless tiles: lattice wraps every P cells
function tileNoise(u, v, P, seed) {
  const x = u * P, y = v * P, xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const w = (k) => ((k % P) + P) % P;
  const s = (a, b) => hash2(w(a), w(b), seed);
  const uu = xf * xf * (3 - 2 * xf), vv = yf * yf * (3 - 2 * yf);
  const a = s(xi, yi), b = s(xi + 1, yi), c = s(xi, yi + 1), d = s(xi + 1, yi + 1);
  return a + (b - a) * uu + (c - a) * vv + (a - b - c + d) * uu * vv;
}
function tileFbm(u, v) { let s = 0, a = 0.5; for (let i = 0, P = 8; i < 4; i++, P *= 2) { s += a * tileNoise(u, v, P, 5 + i); a *= 0.5; } return s; }
// Distance from (x, z) to a polyline, and how far along it (metres) the nearest point is.
export function pathInfo(pts, x, z) {
  let best = Infinity, along = 0, acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L * L)));
    const d = Math.hypot(x - (ax + dx * u), z - (az + dz * u));
    if (d < best) { best = d; along = acc + u * L; }
    acc += L;
  }
  return { d: best, t: along, length: acc };
}
// The point a given distance along a polyline, with its direction.
export function pathPoint(pts, t) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (t <= acc + L || i === pts.length - 2) {
      const u = Math.max(0, Math.min(1, (t - acc) / L));
      return { x: ax + (bx - ax) * u, z: az + (bz - az) * u, dx: (bx - ax) / L, dz: (bz - az) / L };
    }
    acc += L;
  }
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- planet profiles ----------
export const SURFACES = {
  kessa: {
    seed: 31, size: 1600, cells: 400, lava: 3.5,
    pad: { x: 0, z: 0, r: 26 },
    vault: { x: 470, z: -520 },
    // Basalt causeways: raised roads that only lift ground lying below the lava, so the vault
    // island is reachable from the pad without changing dry land.
    causeways: [{ pts: [[30, -35], [200, -200], [330, -380], [455, -505]], half: 7, h: 6 }],
    // Magma Canyon: a basalt ridge between lava trenches, ending at the Forge Gate (the armory).
    canyon: {
      pts: [[-38, -24], [-70, -50], [-130, -120], [-215, -160], [-300, -215], [-350, -300], [-385, -385], [-440, -440]],
      half: 6, trench: 24, wall: 36, ridge: 9.5, // ridge = height above lava
      forge: { x: -462, z: -462, r: 26 },
    },
    height(x, z) {
      const s = this.seed;
      let h = (fbm(x * 0.0035, z * 0.0035, s) - 0.42) * 70;          // broad uplands and basins
      h += ridged(x * 0.011, z * 0.011, s + 5) * 22;                   // basalt ridges
      h += (fbm(x * 0.06, z * 0.06, s + 9, 3) - 0.5) * 2.2;            // the bumps the rover feels
      // lava channels: a meandering band pulled down below the lava line
      const ch = Math.abs(fbm(x * 0.0022 + 3, z * 0.0022, s + 41, 3) - 0.5);
      h -= (1 - smooth(0.02, 0.07, ch)) * 16;
      return h;
    },
    colors: { low: '#4a160a', mid: '#2a211d', high: '#6b5a4c', ash: '#5a3a2a', cliff: '#14100e' },
    sky: { top: '#1a0b0a', horizon: '#a8441c', fog: '#5a2614', fogDensity: 0.0019, sun: '#ffb070', sunDir: [0.55, 0.32, -0.45] },
    hazard: 'lava', // the low plane is molten: it burns and drags (surface.js)
    hemi: ['#ffb48a', '#3a120a'], rock: '#2e2622', accent: [3.5, 1.4, 0.3], weather: 'embers',
    vents: true, titan: true, fauna: 'kessa', // the vault's vent field, the Foundry Titan, hounds and skitters
  },
  // Thalor: snow shelves stepping down to a frozen sea. The "lava" level is the sea ice: solid, flat,
  // and slick (the rover slides on it). The rings hang in the sky.
  thalor: {
    seed: 57, size: 1600, cells: 400, lava: 0,
    pad: { x: 0, z: 0, r: 26 },
    vault: { x: -430, z: 470 },
    hazard: 'ice',
    height(x, z) {
      const s = this.seed;
      const base = (fbm(x * 0.0028, z * 0.0028, s) - 0.47) * 95;      // broad shelves and the sea basins
      // terraces: flat shelves joined by steep (but climbable) risers
      const t = 8, f = base / t, k = Math.floor(f), fr = f - k;
      const terr = (k + smooth(0.5, 1, fr)) * t;
      let h = base + (terr - base) * 0.8;
      h += ridged(x * 0.009, z * 0.009, s + 5) * 7;                    // wind-carved ridges
      h += (fbm(x * 0.05, z * 0.05, s + 9, 3) - 0.5) * 1.6;            // sastrugi: the bumps the rover feels
      return h;
    },
    colors: { low: '#7f9fb3', mid: '#d3dde4', high: '#f4f8fb', ash: '#aab9c4', cliff: '#3c4b58' },
    sky: { top: '#0a1a33', horizon: '#a9cde2', fog: '#b4cfdf', fogDensity: 0.0015, sun: '#f2f7ff', sunDir: [-0.5, 0.22, 0.6], rings: true },
    hemi: ['#cfe6ff', '#5a6f80'], rock: '#56687a', accent: [0.9, 2.6, 3.4], weather: 'snow',
    fauna: 'thalor', // rime crawlers and shardbacks
    sentinel: true, arenaR: 36, // Sentinel Prime fights inside the maze's inner ring (r 40)
    // the Rime Spire: a Warden armory on the far side of the sea, holding the Compass Trim
    spire: { x: 420, z: 380, r: 22 },
    // the ice maze round the vault: three ring walls, one gap each, and a radial wall in each corridor
    // so there is one way through. Angles in radians, measured like Math.atan2(z, x).
    maze: { rings: [72, 56, 40], gaps: [2.4, 2.4 + Math.PI, 2.4], blocks: [2.4 + Math.PI / 2, 2.4 + Math.PI * 1.5], gapW: 9 },
    plateau: 86,
  },
  // Vireo: flat-topped mesas standing out of a sea of violet fog (the veil). The "lava" level is the top
  // of the veil: below it there is no floor the Wayfarer can see, and a rover that drops in is hauled
  // back (surface.js). Land bridges (causeways) join the pad's mesa to the vault's. Gravity is light.
  vireo: {
    seed: 83, size: 1600, cells: 400, lava: 2,
    pad: { x: 0, z: 0, r: 26 },
    vault: { x: -470, z: -440 },
    hazard: 'veil', gravity: 8, gripK: 1.45, // floaty: long hangs off every crest; the grip is padded back up a little
    causeways: [
      { pts: [[-24, -22], [-120, -70], [-215, -170], [-300, -230], [-385, -335], [-448, -418]], half: 6.5, h: 9 },
      { pts: [[28, 24], [150, 120], [260, 250], [340, 380]], half: 6.5, h: 9 }, // out to the far mesas (7b's armory)
    ],
    height(x, z) {
      const s = this.seed;
      // mesa mask: high where the rock stands, low where the chasms run; the pad and the vault sit on rock
      let m = fbm(x * 0.0042, z * 0.0042, s) + (fbm(x * 0.011, z * 0.011, s + 3, 3) - 0.5) * 0.18;
      const near = (px, pz, r) => 1 - smooth(r * 0.6, r, Math.hypot(x - px, z - pz));
      m += near(this.pad.x, this.pad.z, 150) * 0.3 + near(this.vault.x, this.vault.z, 160) * 0.3;
      const rock = smooth(0.47, 0.515, m);                               // sheer cliffs at the mesa edges
      const top = 20 + ridged(x * 0.006, z * 0.006, s + 5) * 14            // mesa tops at different heights
        + (fbm(x * 0.05, z * 0.05, s + 9, 3) - 0.5) * 1.8;                 // the bumps the rover feels
      const floor = -38 + fbm(x * 0.01, z * 0.01, s + 21, 3) * 10;         // the chasm floors, deep under the veil
      return floor + (top - floor) * rock;
    },
    colors: { low: '#1d1430', mid: '#5a5468', high: '#b9aecb', ash: '#6c4e8c', cliff: '#1a1424' },
    sky: { top: '#0d0820', horizon: '#6d4a9a', fog: '#3e2860', fogDensity: 0.0024, sun: '#ead8ff', sunDir: [0.4, 0.28, 0.55] },
    hemi: ['#c8b0ff', '#24163a'], rock: '#3a3148', accent: [2.2, 1.0, 3.8], weather: 'motes',
    islands: true, // floating rock overhead
  },
};

// Ridge road, lava trenches either side, then walls. Fades in over the first 40 m so the
// entrance meets the natural ground; the forge sits on a flat apron at the far end.
function carveCanyon(def, x, z, h) {
  const C = def.canyon;
  const ridgeH = def.lava + C.ridge;
  const fd = Math.hypot(x - C.forge.x, z - C.forge.z);
  const info = pathInfo(C.pts, x, z);
  const fadeIn = smooth(40, 90, info.t);
  let target;
  if (info.d < C.half) target = ridgeH;
  else if (info.d < C.half + 4) target = ridgeH + (def.lava - 6 - ridgeH) * smooth(C.half, C.half + 4, info.d);
  else if (info.d < C.trench) target = def.lava - 6;
  else target = Math.max(h, ridgeH + 24) * smooth(C.trench, C.wall, info.d) + (def.lava - 6) * (1 - smooth(C.trench, C.wall, info.d));
  let out = info.d < C.wall + 6 ? h + (target - h) * fadeIn * (1 - smooth(C.wall, C.wall + 6, info.d)) : h;
  // the entrance ramp: ease the road from natural ground up/down to the ridge height
  if (info.d < C.half + 2 && info.t < 90) out = h + (ridgeH - h) * smooth(0, 85, info.t);
  // forge apron
  out += (ridgeH - out) * (1 - smooth(C.forge.r, C.forge.r + 10, fd));
  return out;
}

export function createTerrain(def) {
  const { size, cells } = def;
  const n = cells + 1;
  const step = size / cells;
  const half = size / 2;
  const H = new Float32Array(n * n);
  // flatten a landing pad, and keep it above the lava
  const padH = Math.max(def.height(def.pad.x, def.pad.z), def.lava + 7);
  const vaultH = Math.max(def.height(def.vault.x, def.vault.z), def.lava + 7);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -half + i * step, z = -half + j * step;
      let h = def.height(x, z);
      const dp = Math.hypot(x - def.pad.x, z - def.pad.z);
      h += (padH - h) * (1 - smooth(def.pad.r, def.pad.r * 3.2, dp));
      const dv = Math.hypot(x - def.vault.x, z - def.vault.z);
      const P = def.plateau || 62;
      h += (vaultH - h) * (1 - smooth(P, P + 34, dv)); // flat ground round the vault: the guardian arena (and Thalor's maze)
      if (def.canyon) h = carveCanyon(def, x, z, h);

      // raise the rim so the world ends in cliffs, not a drop
      const edge = Math.max(Math.abs(x), Math.abs(z)) / half;
      h += smooth(0.86, 1.0, edge) * 70;
      H[j * n + i] = h;
    }
  }

  // Graded roads: sample the ground along each causeway, smooth the profile (no steep pitches),
  // keep it above the lava, then blend the road and its banks onto that profile.
  const gridH = (x, z) => {
    const gi = Math.min(cells, Math.max(0, Math.round((x + half) / step))), gj = Math.min(cells, Math.max(0, Math.round((z + half) / step)));
    return H[gj * n + gi];
  };
  for (const c of def.causeways || []) {
    const L = pathInfo(c.pts, 0, 0).length;
    const N = Math.ceil(L / 4);
    const raw = [];
    for (let k = 0; k <= N; k++) { const q = pathPoint(c.pts, (L * k) / N); raw.push(Math.max(gridH(q.x, q.z), def.lava + c.h)); }
    const prof = raw.map((_, k) => {
      let s = 0, w = 0;
      for (let o = -12; o <= 12; o++) { const i = Math.min(N, Math.max(0, k + o)); const wt = 1 - Math.abs(o) / 13; s += raw[i] * wt; w += wt; }
      return Math.max(s / w, def.lava + c.h);
    });
    // keep the ends exact so the road meets the pad and the vault plateau
    prof[N] = raw[N]; // the start blends into the pad apron through the smoothing
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -half + i * step, z = -half + j * step;
      const ci = pathInfo(c.pts, x, z);
      if (ci.d > c.half + 12) continue;
      const k = Math.min(N, Math.max(0, (ci.t / L) * N));
      const k0 = Math.floor(k), k1 = Math.min(N, k0 + 1);
      const rh = prof[k0] + (prof[k1] - prof[k0]) * (k - k0);
      const w = 1 - smooth(c.half, c.half + 12, ci.d);
      const idx = j * n + i;
      // banks: never cut below the lava-proof line, never raise dry ground more than the road needs
      H[idx] = H[idx] + (rh - H[idx]) * w;
    }
  }

  // Height and normal by the same triangle split the mesh uses, so physics matches the picture.
  function heightAt(x, z) {
    const gx = (x + half) / step, gz = (z + half) / step;
    const i = Math.min(cells - 1, Math.max(0, Math.floor(gx))), j = Math.min(cells - 1, Math.max(0, Math.floor(gz)));
    const fx = Math.min(1, Math.max(0, gx - i)), fz = Math.min(1, Math.max(0, gz - j));
    const h00 = H[j * n + i], h10 = H[j * n + i + 1], h01 = H[(j + 1) * n + i], h11 = H[(j + 1) * n + i + 1];
    // PlaneGeometry splits each quad along the a-d diagonal: triangles (00,01,10) and (01,11,10)
    if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }
  const nTmp = new THREE.Vector3();
  function normalAt(x, z, out = nTmp) {
    const e = step * 0.5;
    out.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e));
    return out.normalize();
  }

  // ---------- mesh ----------
  const geo = new THREE.PlaneGeometry(size, size, cells, cells);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const C = def.colors;
  const cLow = new THREE.Color(C.low), cMid = new THREE.Color(C.mid), cHigh = new THREE.Color(C.high), cAsh = new THREE.Color(C.ash), cCliff = new THREE.Color(C.cliff);
  const tmpC = new THREE.Color();
  // PlaneGeometry rows run from +z... after rotateX(-90deg) vertex k sits at (x, z) with z increasing by row
  for (let k = 0; k < pos.count; k++) {
    const i = k % n, j = Math.floor(k / n);
    const x = pos.getX(k), z = pos.getZ(k);
    const gi = Math.round((x + half) / step), gj = Math.round((z + half) / step);
    const h = H[gj * n + gi];
    pos.setY(k, h);
    const nrm = normalAt(x, z);
    const slope = 1 - nrm.y;
    tmpC.copy(cMid);
    tmpC.lerp(cAsh, smooth(0.42, 0.68, fbm(x * 0.009, z * 0.009, 77, 4)) * 0.85);   // rusty ash fields
    tmpC.lerp(cHigh, smooth(12, 45, h) * 0.6);                                    // pale high ground
    tmpC.multiplyScalar(0.85 + 0.3 * fbm(x * 0.08, z * 0.08, 91, 2));             // mottling
    tmpC.lerp(cCliff, smooth(0.12, 0.35, slope));                                 // black basalt on steep faces
    tmpC.lerp(cLow, 1 - smooth(def.lava, def.lava + 8, h));                       // scorched banks by the lava
    col[k * 3] = tmpC.r; col[k * 3 + 1] = tmpC.g; col[k * 3 + 2] = tmpC.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();

  // a tiling grain texture gives the ground scale up close
  const tc = document.createElement('canvas'); tc.width = tc.height = 256;
  const tx = tc.getContext('2d');
  const img = tx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const v = 0.72 + 0.28 * (tileFbm(x / 256, y / 256) * 0.8 + hash2(x, y, 9) * 0.2);
    const o = (y * 256 + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(v * 255); img.data[o + 3] = 255;
  }
  tx.putImageData(img, 0, 0);
  const grain = new THREE.CanvasTexture(tc);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(size / 12, size / 12);
  grain.colorSpace = THREE.SRGBColorSpace;
  grain.anisotropy = 4;

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, roughness: 0.92, metalness: 0 });
  const mesh = new THREE.Group();
  const K = 8, per = cells / K, srcIdx = geo.index.array;
  for (let cj = 0; cj < K; cj++) for (let ci = 0; ci < K; ci++) {
    const tris = [];
    for (let j = cj * per; j < (cj + 1) * per; j++) for (let i = ci * per; i < (ci + 1) * per; i++) {
      const q = (j * cells + i) * 6; // PlaneGeometry writes 6 indices per quad, row by row
      for (let t = 0; t < 6; t++) tris.push(srcIdx[q + t]);
    }
    const g = new THREE.BufferGeometry();
    for (const k of Object.keys(geo.attributes)) g.setAttribute(k, geo.attributes[k]);
    g.setIndex(tris);
    const box = new THREE.Box3();
    for (const v of tris) box.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, v));
    g.boundingBox = box; g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    mesh.add(m);
  }

  return { mesh, heightAt, normalAt, size, half, padH, vaultH, def };
}
