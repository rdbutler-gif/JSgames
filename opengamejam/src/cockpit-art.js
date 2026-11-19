// Procedural surface maps and small helpers for the cockpit interior.
// Everything is generated on canvases at load: panel seams, rivets, wear and grime,
// turned into albedo, roughness and normal maps. Nothing here is downloaded.
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Panel maps covering 1 x 1 m of surface (textures repeat; UVs are set in metres by planarUV).
// opts: { seed, seams: split depth, rivets, wear, grime }
export function makePanelMaps(opts = {}) {
  const N = 512;
  const R = rng(opts.seed ?? 7);
  const H = new Float32Array(N * N).fill(0.5); // height
  const A = new Float32Array(N * N).fill(0.86); // albedo multiplier
  const Ro = new Float32Array(N * N).fill(opts.rough ?? 0.58); // roughness
  const at = (x, y) => ((y + N) % N) * N + ((x + N) % N);

  // Split the tile into panels (recursive cuts), each with its own albedo and roughness shift.
  const panels = [];
  const split = (x, y, w, h, d) => {
    if (d <= 0 || (d < 3 && R() < 0.3) || w < 70 || h < 70) { panels.push([x, y, w, h]); return; }
    if (w > h ? R() < 0.75 : R() < 0.25) { const c = Math.round(w * (0.3 + R() * 0.4)); split(x, y, c, h, d - 1); split(x + c, y, w - c, h, d - 1); }
    else { const c = Math.round(h * (0.3 + R() * 0.4)); split(x, y, w, c, d - 1); split(x, y + c, w, h - c, d - 1); }
  };
  split(0, 0, N, N, opts.seams ?? 4);
  for (const [x, y, w, h] of panels) {
    const da = (R() - 0.5) * 0.1, dr = (R() - 0.5) * 0.12, raised = R() < 0.25 ? 0.06 : 0;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      const k = at(i, j); A[k] += da; Ro[k] += dr; H[k] += raised;
    }
    // seam groove: dark, rough, low
    for (let i = x; i < x + w; i++) for (const j of [y, y + 1]) { const k = at(i, j); H[k] = 0.18; A[k] *= 0.45; Ro[k] = 0.85; }
    for (let j = y; j < y + h; j++) for (const i of [x, x + 1]) { const k = at(i, j); H[k] = 0.18; A[k] *= 0.45; Ro[k] = 0.85; }
    // rivets along the long edges
    if (opts.rivets !== false) {
      const along = w > h, len = along ? w : h, n = Math.max(2, Math.floor(len / 34));
      for (let r = 0; r < n; r++) for (const side of [0, 1]) {
        const t = (r + 0.5) / n;
        const cx = along ? x + t * w : x + (side ? w - 9 : 9), cy = along ? y + (side ? h - 9 : 9) : y + t * h;
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
          const dd = dx * dx + dy * dy; if (dd > 14) continue;
          const k = at(Math.round(cx) + dx, Math.round(cy) + dy);
          H[k] = 0.5 + raised + 0.32 * Math.cos(Math.sqrt(dd) / 4 * Math.PI / 2); A[k] = 1.02; Ro[k] = 0.4;
        }
      }
    }
  }
  // edge wear: short bright scuffs near seams; grime: soft vertical streaks
  const wear = opts.wear ?? 1, grime = opts.grime ?? 1;
  for (let n = 0; n < 900 * wear; n++) {
    const p = panels[Math.floor(R() * panels.length)];
    const onX = R() < 0.5;
    let x = onX ? p[0] + R() * p[2] : p[0] + (R() < 0.5 ? 3 : p[2] - 4);
    let y = onX ? p[1] + (R() < 0.5 ? 3 : p[3] - 4) : p[1] + R() * p[3];
    const ang = R() * Math.PI, l = 3 + R() * 10;
    for (let s = 0; s < l; s++) {
      const k = at(Math.round(x + Math.cos(ang) * s), Math.round(y + Math.sin(ang) * s));
      A[k] = Math.min(1.25, A[k] + 0.22); Ro[k] -= 0.2;
    }
  }
  for (let n = 0; n < 60 * grime; n++) {
    const x0 = Math.floor(R() * N), y0 = Math.floor(R() * N), w = 4 + R() * 26, l = 30 + R() * 160, g = 0.04 + R() * 0.1;
    for (let j = 0; j < l; j++) for (let i = 0; i < w; i++) {
      const f = (1 - j / l) * Math.sin(Math.PI * i / w);
      const k = at(x0 + i, y0 + j); A[k] -= g * f; Ro[k] += g * f * 0.8;
    }
  }
  // fine noise in albedo and roughness so no panel is a flat fill
  for (let k = 0; k < N * N; k++) { const r = R(); A[k] += (r - 0.5) * 0.05; Ro[k] += (R() - 0.5) * 0.06; H[k] += (r - 0.5) * 0.008; }

  // band-limit the height before deriving normals (keeps the mip chain from crawling)
  const blur = (src) => {
    const t = new Float32Array(N * N), o = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) t[at(x, y)] = (src[at(x - 1, y)] + 2 * src[at(x, y)] + src[at(x + 1, y)]) / 4;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) o[at(x, y)] = (t[at(x, y - 1)] + 2 * t[at(x, y)] + t[at(x, y + 1)]) / 4;
    return o;
  };
  const Hb = blur(blur(H));

  const mk = (fill) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = N;
    const cx = cv.getContext('2d'); const img = cx.createImageData(N, N);
    for (let k = 0; k < N * N; k++) fill(img.data, k * 4, k);
    cx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
    return tex;
  };
  const c8 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  const map = mk((d, i, k) => { const v = c8(Math.min(1, A[k])); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; });
  map.colorSpace = THREE.SRGBColorSpace;
  const roughnessMap = mk((d, i, k) => { const v = c8(Math.max(0.12, Math.min(0.95, Ro[k]))); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; });
  const strength = 5.5;
  const normalMap = mk((d, i, k) => {
    const x = k % N, y = (k / N) | 0;
    const dx = (Hb[at(x + 1, y)] - Hb[at(x - 1, y)]) * strength, dy = (Hb[at(x, y + 1)] - Hb[at(x, y - 1)]) * strength;
    const l = Math.hypot(dx, dy, 1);
    d[i] = c8(0.5 - dx / l * 0.5); d[i + 1] = c8(0.5 + dy / l * 0.5); d[i + 2] = c8(0.5 + 0.5 / l); d[i + 3] = 255;
  });
  return { map, roughnessMap, normalMap };
}

// Box-projected UVs in metres (local space), so every surface shares one texel density.
export function planarUV(geo, tiles = 1, offset = 0) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else if (ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * tiles + offset; uv[i * 2 + 1] = v * tiles + offset * 0.37;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// Canopy glass: mostly clean, with faint smudges and fine scratches in the roughness channel.
export function makeGlassRoughness() {
  const N = 512, R = rng(91);
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const x = cv.getContext('2d');
  x.fillStyle = 'rgb(30,30,30)'; x.fillRect(0, 0, N, N);
  for (let i = 0; i < 40; i++) { // smudges
    const gx = R() * N, gy = R() * N, r = 20 + R() * 70;
    const g = x.createRadialGradient(gx, gy, 0, gx, gy, r);
    g.addColorStop(0, `rgba(160,160,160,${0.15 + R() * 0.25})`); g.addColorStop(1, 'rgba(160,160,160,0)');
    x.fillStyle = g; x.fillRect(gx - r, gy - r, r * 2, r * 2);
  }
  x.lineWidth = 1;
  for (let i = 0; i < 110; i++) { // hairline scratches
    const sx = R() * N, sy = R() * N, a = R() * Math.PI, l = 8 + R() * 60;
    x.strokeStyle = `rgba(200,200,200,${0.12 + R() * 0.2})`;
    x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + Math.cos(a + 0.3) * l * 0.5, sy + Math.sin(a + 0.3) * l * 0.5, sx + Math.cos(a) * l, sy + Math.sin(a) * l); x.stroke();
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// A small canvas label texture (stencilled text on a transparent background).
export function makeLabel(text, { w = 256, h = 32, color = '#c9d3dc', font = '600 20px "Chakra Petch", sans-serif', align = 'center', bg = null } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
  x.fillStyle = color; x.font = font; x.textBaseline = 'middle'; x.textAlign = align;
  const parts = Array.isArray(text) ? text : [text];
  parts.forEach((t, i) => x.fillText(t, align === 'center' ? (w / parts.length) * (i + 0.5) : 4, h / 2));
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { tex, cv, redraw: () => { x.clearRect(0, 0, w, h); if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); } x.fillStyle = color; x.font = font; parts.forEach((t, i) => x.fillText(t, align === 'center' ? (w / parts.length) * (i + 0.5) : 4, h / 2)); tex.needsUpdate = true; } };
}

// Hazard stripes (yellow/black diagonal), for decals near the throttle and the canopy release.
export function makeHazard() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 32;
  const x = cv.getContext('2d');
  x.fillStyle = '#1a1714'; x.fillRect(0, 0, 128, 32);
  x.fillStyle = '#c9971f';
  for (let i = -2; i < 10; i++) { x.beginPath(); x.moveTo(i * 16, 32); x.lineTo(i * 16 + 8, 32); x.lineTo(i * 16 + 40, 0); x.lineTo(i * 16 + 32, 0); x.fill(); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

// Round analogue gauge face.
export function makeGaugeFace(label, ticks = 10, redFrom = 0.85) {
  const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const x = cv.getContext('2d'), c = N / 2;
  x.fillStyle = '#07090c'; x.beginPath(); x.arc(c, c, c, 0, Math.PI * 2); x.fill();
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  x.lineWidth = 10; x.strokeStyle = 'rgba(255,90,60,0.85)';
  x.beginPath(); x.arc(c, c, c - 26, a0 + (a1 - a0) * redFrom, a1); x.stroke();
  for (let i = 0; i <= ticks * 2; i++) {
    const a = a0 + (a1 - a0) * i / (ticks * 2), big = i % 2 === 0;
    x.strokeStyle = big ? '#dfe8ee' : '#7f8c96'; x.lineWidth = big ? 4 : 2;
    x.beginPath(); x.moveTo(c + Math.cos(a) * (c - 14), c + Math.sin(a) * (c - 14)); x.lineTo(c + Math.cos(a) * (c - (big ? 36 : 28)), c + Math.sin(a) * (c - (big ? 36 : 28))); x.stroke();
  }
  x.fillStyle = '#9fb3bf'; x.font = '600 26px "Chakra Petch", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(label, c, c + 52);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}
