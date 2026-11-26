// The cockpit: a modelled interior with live instrument screens, rendered over the world.
// Lit with PBR materials, a sun that casts the canopy frame's shadow across the dash, and
// image-based reflections; the post chain in main.js adds AO, bloom and the lens grade.
import * as THREE from 'three';
import { bakeStatic } from './bake.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makePanelMaps, planarUV, makeGlassRoughness, makeLabel, makeHazard, makeGaugeFace } from './cockpit-art.js';
import { SUN_DIR } from './world.js';
import { FLIGHT } from './ship.js';
import { COMMS_NAME } from './data.js';

const FONT = '"Chakra Petch", sans-serif';
const SW = 512, SH = 304;
const RADAR_RANGE = 30000;

function makeScreen(parent, x, y) {
  const cv = document.createElement('canvas');
  cv.width = SW; cv.height = SH;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const w = 0.44, h = w * SH / SW;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(0.9, 0.9, 0.9) }));
  plane.position.set(x, y, 0.0115);
  parent.add(plane);
  return { cv, ctx: cv.getContext('2d'), tex };
}

function frame(x, title, accent = '#6ef2ff') {
  x.fillStyle = '#031119'; x.fillRect(0, 0, SW, SH);
  const g = x.createLinearGradient(0, 0, 0, SH);
  g.addColorStop(0, 'rgba(40,150,180,0.20)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, SW, SH);
  x.fillStyle = 'rgba(110,242,255,0.12)'; x.fillRect(0, 0, SW, 36);
  x.font = `600 21px ${FONT}`; x.fillStyle = accent; x.textBaseline = 'middle'; x.textAlign = 'left';
  x.fillText(title, 16, 19);
}
function finish(x) {
  x.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 0; y < SH; y += 3) x.fillRect(0, y, SW, 1);
  x.strokeStyle = 'rgba(110,242,255,0.5)'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, SW - 3, SH - 3);
}
function bar(x, px, py, w, h, frac, col, label) {
  x.fillStyle = 'rgba(110,242,255,0.10)'; x.fillRect(px, py, w, h);
  x.fillStyle = col; x.fillRect(px, py, w * Math.max(0, Math.min(1, frac)), h);
  x.strokeStyle = 'rgba(110,242,255,0.35)'; x.lineWidth = 1; x.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
  if (label) { x.font = `600 16px ${FONT}`; x.fillStyle = '#8fc9d6'; x.textAlign = 'left'; x.fillText(label, px, py - 11); }
}

export function fmtDist(u) {
  const m = u * 10;
  if (m < 1000) return Math.round(m) + ' M';
  const km = m / 1000;
  return (km >= 100 ? km.toFixed(0) : km.toFixed(1)) + ' KM';
}

function drawFlight(x, G) {
  const s = G.ship;
  frame(x, 'FLIGHT');
  x.textAlign = 'right'; x.font = `600 16px ${FONT}`; x.fillStyle = '#8fc9d6';
  x.fillText('M/S', 400, 19);
  x.font = `700 74px ${FONT}`; x.fillStyle = '#eafdff'; x.textAlign = 'left';
  x.fillText(Math.round(s.speed * 10).toLocaleString('en-US'), 16, 92);
  let mode = 'NORMAL', mc = '#6ef2ff';
  if (s.cruise === 1) { mode = 'CRUISE SPOOL ' + Math.round(s.spool / FLIGHT.spoolTime * 100) + '%'; mc = '#ffd36a'; }
  else if (s.cruise === 2) { mode = 'CRUISE DRIVE'; mc = '#ffb35a'; }
  else if (s.boosting) { mode = 'BOOST'; mc = '#ff8a5a'; }
  x.font = `700 26px ${FONT}`; x.fillStyle = mc; x.fillText(mode, 16, 148);
  bar(x, 16, 196, 360, 14, s.boostEnergy, s.boostEnergy < 0.25 ? '#ff6a4a' : '#ffb35a', 'BOOST');
  bar(x, 16, 240, 170, 12, s.shield, '#6ef2ff', 'SHIELD');
  bar(x, 206, 240, 170, 12, s.hull, '#9cff8a', 'HULL');
  // throttle column
  const tx = 420, ty = 52, th = 230;
  x.fillStyle = 'rgba(110,242,255,0.08)'; x.fillRect(tx, ty, 64, th);
  for (let i = 0; i <= 10; i++) { x.fillStyle = 'rgba(110,242,255,0.3)'; x.fillRect(tx, ty + th * i / 10, i % 5 ? 10 : 20, 2); }
  const fh = th * s.throttle;
  const g = x.createLinearGradient(0, ty + th, 0, ty);
  g.addColorStop(0, '#2a8fa6'); g.addColorStop(1, '#6ef2ff');
  x.fillStyle = g; x.fillRect(tx + 24, ty + th - fh, 34, fh);
  x.font = `600 16px ${FONT}`; x.fillStyle = '#8fc9d6'; x.textAlign = 'center';
  x.fillText('THR', tx + 32, ty + th + 12);
  finish(x);
}

const vLocal = new THREE.Vector3();
const qInv = new THREE.Quaternion();

function drawScanner(x, G) {
  frame(x, 'SCANNER');
  x.textAlign = 'right'; x.font = `600 16px ${FONT}`; x.fillStyle = '#8fc9d6';
  x.fillText('RANGE ' + fmtDist(RADAR_RANGE), SW - 16, 19);
  const cx = SW / 2, cy = 172, R = 118;
  x.strokeStyle = 'rgba(110,242,255,0.28)'; x.lineWidth = 1.5;
  for (const f of [1, 0.66, 0.33]) { x.beginPath(); x.arc(cx, cy, R * f, 0, Math.PI * 2); x.stroke(); }
  x.beginPath(); x.moveTo(cx - R, cy); x.lineTo(cx + R, cy); x.moveTo(cx, cy - R); x.lineTo(cx, cy + R); x.stroke();
  // field of view wedge
  x.fillStyle = 'rgba(110,242,255,0.07)';
  x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, R, -Math.PI / 2 - 0.65, -Math.PI / 2 + 0.65); x.closePath(); x.fill();
  // sweep
  const sw = (G.time * 1.6) % (Math.PI * 2);
  const sg = x.createConicGradient ? x.createConicGradient(sw - 0.6, cx, cy) : null;
  if (sg) {
    sg.addColorStop(0, 'rgba(110,242,255,0)'); sg.addColorStop(0.1, 'rgba(110,242,255,0.16)'); sg.addColorStop(0.1001, 'rgba(110,242,255,0)');
    x.fillStyle = sg; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
  }
  qInv.copy(G.ship.quat).invert();
  const blip = (pos, kind, label, isTarget) => {
    vLocal.subVectors(pos, G.ship.pos).applyQuaternion(qInv);
    const d = vLocal.length();
    const horiz = Math.hypot(vLocal.x, vLocal.z) || 1;
    const rr = Math.sqrt(Math.min(d, RADAR_RANGE) / RADAR_RANGE) * R;
    const bx = cx + (vLocal.x / horiz) * rr * (horiz / (d || 1)) ;
    const by = cy + (vLocal.z / horiz) * rr * (horiz / (d || 1));
    const el = Math.max(-1, Math.min(1, vLocal.y / (d || 1)));
    const ey = by - el * 22;
    const col = kind === 'enemy' ? '#ff4d6d' : isTarget ? '#ffd36a' : '#ffb35a';
    x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 2;
    x.beginPath(); x.moveTo(bx, by); x.lineTo(bx, ey); x.stroke();
    if (kind === 'enemy') {
      x.beginPath(); x.moveTo(bx, ey - 6); x.lineTo(bx + 6, ey + 5); x.lineTo(bx - 6, ey + 5); x.closePath();
      el >= 0 ? x.fill() : x.stroke();
      if (label) { x.font = `700 13px ${FONT}`; x.textAlign = 'left'; x.fillText(label, bx + 8, ey - 4); }
    } else {
      x.beginPath(); x.arc(bx, ey, isTarget ? 8 : 6, 0, Math.PI * 2);
      el >= 0 ? x.fill() : x.stroke();
      x.font = `600 14px ${FONT}`; x.textAlign = 'left'; x.fillText(label, bx + 10, ey - 8);
    }
  };
  G.planets.forEach((p, i) => blip(p.center, 'planet', p.data.name, i === G.targetIndex));
  if (G.bayMouth && (G.tutorialDone || G.tutHome)) blip(G.bayMouth(), 'planet', 'LANTERN', G.targetIndex === G.lanternNav);
  if (G.gate && G.gateOpen && G.gateOpen()) blip(G.gate.pos, 'planet', 'GATE', G.targetIndex === G.gateNav);
  G.squads.forEach((sq) => { if (sq.state === 'patrol') blip(sq.pos, 'enemy', String(sq.level)); });
  x.fillStyle = '#eafdff';
  x.beginPath(); x.moveTo(cx, cy - 8); x.lineTo(cx + 6, cy + 6); x.lineTo(cx - 6, cy + 6); x.closePath(); x.fill();
  finish(x);
}

function wrap(x, text, maxW) {
  const words = text.split(' '); const lines = []; let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (x.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawNav(x, G) {
  frame(x, 'NAV  ·  COMMS', '#ffb35a');
  x.textAlign = 'right'; x.font = `600 16px ${FONT}`; x.fillStyle = '#ffd36a';
  x.fillText('◆ ' + G.wayshards + ' WAYSHARDS', SW - 16, 19);
  // Lantern as a nav target: a stand-in with the fields the screen reads
  const p = G.planets[G.targetIndex] || (G.targetIndex === G.gateNav && G.gate
    ? { center: G.gate.pos, data: { R: 0, name: 'THE FINAL GATE', lantern: true, blurb: 'Where every line meets · the Heart lies past it' } }
    : { center: G.bayMouth(), data: { R: 0, name: 'LANTERN STATION', lantern: true, blurb: G.lanternDark ? 'Home port · on reserve air' : 'Home port · Workshop and repairs' } });
  const d = Math.max(0, p.center.distanceTo(G.ship.pos) - p.data.R);
  x.textAlign = 'left';
  x.font = `700 30px ${FONT}`; x.fillStyle = '#ffd36a';
  x.fillText(p.data.name, 16, 64);
  x.font = `600 18px ${FONT}`; x.fillStyle = '#cfeaf2';
  const eta = G.ship.speed > 5 ? d / G.ship.speed : Infinity;
  const etaS = !isFinite(eta) ? '--' : eta > 3600 ? '>1 H' : eta >= 60 ? Math.floor(eta / 60) + 'M ' + Math.floor(eta % 60) + 'S' : Math.floor(eta) + 'S';
  x.fillText(fmtDist(d) + '   ETA ' + etaS, 16, 94);
  x.fillStyle = '#8fc9d6'; x.font = `500 16px ${FONT}`;
  x.fillText(p.data.lantern ? p.data.blurb.toUpperCase() : p.data.blurb.toUpperCase() + ' · RELIC: ' + p.data.relic.toUpperCase(), 16, 120);
  // relic slots
  G.planets.forEach((pl, i) => {
    const bx = 16 + i * 162, by = 138;
    const got = G.relics[pl.data.id];
    x.strokeStyle = got ? '#ffd36a' : 'rgba(255,179,90,0.45)'; x.lineWidth = 2;
    x.strokeRect(bx, by, 150, 30);
    if (got) { x.fillStyle = 'rgba(255,211,106,0.25)'; x.fillRect(bx, by, 150, 30); }
    x.fillStyle = got ? '#ffd36a' : '#a58a63'; x.font = `600 15px ${FONT}`; x.textAlign = 'center';
    x.fillText((got ? '◆ ' : '◇ ') + pl.data.relic.toUpperCase(), bx + 75, by + 16);
  });
  // comms
  x.textAlign = 'left';
  x.fillStyle = 'rgba(110,242,255,0.1)'; x.fillRect(10, 182, SW - 20, 1);
  const msgs = G.comms.slice(-2);
  let y = 204;
  x.font = `500 17px ${FONT}`;
  msgs.forEach((m, i) => {
    const newest = i === msgs.length - 1;
    const shown = newest ? m.text.slice(0, Math.floor(m.t * 55)) : m.text;
    x.fillStyle = newest ? '#6ef2ff' : '#4f8c99';
    x.fillText((m.short || m.from) + ':', 16, y);
    x.fillStyle = newest ? '#e6fbff' : '#6f98a3';
    const lines = wrap(x, shown, SW - 100);
    lines.slice(0, newest ? 3 : 1).forEach((ln, k) => x.fillText(ln, 84, y + k * 21));
    y += newest ? 0 : 26;
  });
  finish(x);
}

export function createCockpit(renderer) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.02, 10);

  // ---------- light rig ----------
  // Image-based light for metal reflections, kept low: the cabin sits in deep space.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.26;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#41506e', '#1b120c', 0.32));
  const sun = new THREE.DirectionalLight('#fff0dc', 5.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -2.2, right: 2.2, top: 2.2, bottom: -2.2, near: 0.5, far: 12 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.012;
  sun.shadow.camera.updateProjectionMatrix();
  sun.target.position.set(0, -0.3, -0.7);
  scene.add(sun); scene.add(sun.target);
  // a warm strip under the glareshield lights the panel
  RectAreaLightUniformsLib.init();
  const hoodLight = new THREE.RectAreaLight('#ffc48a', 3.2, 1.45, 0.05);
  hoodLight.position.set(0, -0.31, -0.9); hoodLight.lookAt(0, -0.62, -0.8); scene.add(hoodLight);

  // ---------- materials ----------
  const P = makePanelMaps({ seed: 11, seams: 4 });
  const P2 = makePanelMaps({ seed: 29, seams: 3, wear: 1.6, rough: 0.5 });
  const std = (o, maps) => new THREE.MeshStandardMaterial({ ...(maps ? { map: maps.map, roughnessMap: maps.roughnessMap, normalMap: maps.normalMap, normalScale: new THREE.Vector2(0.6, 0.6) } : {}), ...o });
  const coat = std({ color: '#5d6676', metalness: 0.3, roughness: 1 }, P);        // painted panels (roughness from map)
  const hull = std({ color: '#6d7582', metalness: 0.6, roughness: 1 }, P2);       // structural metal
  const matte = std({ color: '#0d0f13', metalness: 0.0, roughness: 0.95, envMapIntensity: 0.3 });      // anti-glare glareshield
  matte.normalMap = P.normalMap; matte.normalScale = new THREE.Vector2(0.25, 0.25);
  const bezel = std({ color: '#191c22', metalness: 0.45, roughness: 0.42 });
  const rubber = std({ color: '#121418', metalness: 0, roughness: 0.78 });
  const amber = std({ color: '#b5561f', metalness: 0.35, roughness: 1 }, P2);     // the Wayfarer's trim colour, worn
  const bare = std({ color: '#a9b2bc', metalness: 1, roughness: 0.32 });          // knobs, screws, rivets
  const glowStrip = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.22, 0.75, 0.85) });
  const warmStrip = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.05, 0.62) });

  const solid = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
  const rbox = (w, h, d, mat, x = 0, y = 0, z = 0, r = 0.01, tiles = 1.6) => {
    const g = planarUV(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.01, h / 2.01, d / 2.01)), tiles, (x * 3.1 + y * 1.7) % 1);
    const m = solid(new THREE.Mesh(g, mat)); m.position.set(x, y, z); return m;
  };
  const cyl = (rt, rb, h, seg, mat, x = 0, y = 0, z = 0) => {
    const m = solid(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat)); m.position.set(x, y, z); return m;
  };
  // a rounded beam between two points, oriented so its local Y faces `up`
  const beam = (a, b, w, h, mat, up = new THREE.Vector3(0, 0, 1)) => {
    const len = a.distanceTo(b);
    const m = solid(new THREE.Mesh(planarUV(new RoundedBoxGeometry(w, h, len, 2, Math.min(w, h) * 0.3), 1.6), mat));
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.up.copy(up); m.lookAt(b);
    return m;
  };

  // ---------- floor and lower body ----------
  scene.add(rbox(4.2, 0.5, 1.8, coat, 0, -0.9, -0.4, 0.04));

  // ---------- main instrument panel ----------
  const panel = new THREE.Group();
  panel.position.set(0, -0.5, -0.86); panel.rotation.x = -0.67;
  scene.add(panel);
  panel.add(rbox(1.66, 0.56, 0.07, coat, 0, 0, -0.045, 0.02));
  const screens = [];
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.3, metalness: 0, specularIntensity: 0.5, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 0.6 });
  const keyTick = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.18, 0.6, 0.7) });
  for (const sx of [-0.49, 0, 0.49]) {
    const sw = 0.44, sh = sw * SH / SW, sy = 0.025;
    // bezel frame around a recessed screen, with a soft-key strip below
    panel.add(rbox(sw + 0.044, 0.03, 0.03, bezel, sx, sy + sh / 2 + 0.015, 0, 0.006));
    panel.add(rbox(sw + 0.044, 0.07, 0.03, bezel, sx, sy - sh / 2 - 0.035, 0, 0.006));
    for (const e of [-1, 1]) panel.add(rbox(0.022, sh + 0.02, 0.03, bezel, sx + e * (sw / 2 + 0.011), sy, 0, 0.006));
    for (const ex of [-1, 1]) for (const ey of [-1, 1]) {
      const sc = cyl(0.0055, 0.0055, 0.004, 8, bare, sx + ex * (sw / 2 + 0.011), sy + (ey > 0 ? sh / 2 + 0.015 : -sh / 2 - 0.058), 0.016);
      sc.rotation.x = Math.PI / 2; panel.add(sc);
    }
    for (let k = -2; k <= 2; k++) {
      panel.add(rbox(0.05, 0.024, 0.012, rubber, sx + k * 0.08, sy - sh / 2 - 0.035, 0.018, 0.004));
      const t = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.003), keyTick); t.position.set(sx + k * 0.08, sy - sh / 2 - 0.029, 0.0245); panel.add(t);
    }
    screens.push(makeScreen(panel, sx, sy));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), glassMat); glass.position.set(sx, sy, 0.013); panel.add(glass);
  }
  const drawers = [drawFlight, drawScanner, drawNav];

  // glareshield: an anti-glare hood over the screens, worn amber lip, warm light strip underneath
  const hood = new THREE.Group(); hood.position.set(0, -0.3, -0.955); hood.rotation.x = 0.04; scene.add(hood);
  hood.add(rbox(1.78, 0.034, 0.16, matte, 0, 0, 0, 0.012));
  hood.add(rbox(1.8, 0.04, 0.028, amber, 0, -0.004, 0.078, 0.012, 3));
  const lip = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.004, 0.01), warmStrip); lip.position.set(0, -0.021, 0.056); hood.add(lip);
  // HUD projector housing on the hood centre, with its lens window, and two defrost vents
  hood.add(rbox(0.26, 0.04, 0.11, bezel, 0, 0.03, -0.02, 0.012));
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.014), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.12, 0.45, 0.5) }));
  lens.position.set(0, 0.0505, -0.02); lens.rotation.x = -Math.PI / 2; hood.add(lens);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) hood.add(rbox(0.3, 0.004, 0.008, rubber, s * 0.5, 0.018, -0.05 + i * 0.022, 0.002));
  // the hood's end caps: angled cheek plates down to the side consoles
  for (const s of [-1, 1]) {
    const cheek = rbox(0.05, 0.14, 0.18, hull, s * 0.89, -0.06, -0.01, 0.012);
    cheek.rotation.z = s * 0.25; hood.add(cheek);
  }

  // ---------- side consoles ----------
  const buttons = [];
  const throttlePivot = new THREE.Group();
  const needles = [];
  const ledOff = new THREE.Color(0.02, 0.02, 0.022);
  for (const s of [-1, 1]) {
    const wing = new THREE.Group();
    wing.rotation.order = 'YXZ';
    wing.position.set(s * 0.98, -0.5, -0.72);
    wing.rotation.y = -s * 0.55; wing.rotation.x = -0.67;
    scene.add(wing);
    wing.add(rbox(0.62, 0.46, 0.06, coat, 0, 0, -0.035, 0.015));
    wing.add(rbox(0.65, 0.032, 0.09, amber, 0, 0.236, -0.02, 0.012, 3));
    // stencilled label strip and two rows of backlit keys with an LED bar each
    const lab = makeLabel(s < 0 ? ['PWR', 'NAV', 'COM', 'SHD', 'AUX', 'ECM'] : ['ENG', 'FCS', 'LTS', 'DMP', 'HYD', 'O2'], { w: 512, h: 32, color: '#8d9aa6', font: '600 17px "Chakra Petch", sans-serif' });
    const labMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.0275), new THREE.MeshBasicMaterial({ map: lab.tex, transparent: true, color: new THREE.Color(0.75, 0.75, 0.75) }));
    labMesh.position.set(-0.037, 0.192, 0.001); wing.add(labMesh);
    const palette = s < 0 ? ['#6ef2ff', '#9cff8a', '#ffb35a'] : ['#ffb35a', '#6ef2ff', '#ff6a4a'];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) {
      const bx = -0.22 + c * 0.0733, by = 0.155 - r * 0.07;
      wing.add(rbox(0.054, 0.04, 0.018, rubber, bx, by, 0.002, 0.005));
      const mat = new THREE.MeshBasicMaterial({ color: ledOff.clone() });
      const led = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.006), mat); led.position.set(bx, by + 0.009, 0.0115); wing.add(led);
      const col = new THREE.Color(palette[(r * 5 + c * 2) % 3]).multiplyScalar(1.6);
      buttons.push({ mat, col, on: Math.random() < 0.6, next: Math.random() * 3, steady: (r + c) % 3 === 0 });
    }
    // guarded toggle switches
    const tx0 = s < 0 ? -0.02 : -0.22, tn = s < 0 ? 4 : 6;
    for (let i = 0; i < tn; i++) {
      const tx = tx0 + i * 0.07, ty = 0.012;
      wing.add(rbox(0.04, 0.05, 0.008, bezel, tx, ty, 0, 0.003));
      const sw = cyl(0.004, 0.0055, 0.04, 8, bare, tx, ty + 0.008, 0.02); sw.rotation.x = 0.5 + (i % 3 === 1 ? -1 : 0); wing.add(sw);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.007, 10, 8), bare); tip.position.set(0, 0.02, 0); sw.add(tip);
      for (const e of [-1, 1]) wing.add(rbox(0.004, 0.05, 0.03, amber, tx + e * 0.022, ty, 0.012, 0.002, 4));
    }
    if (s < 0) {
      // throttle quadrant with a hazard-striped slot and a gripped lever
      wing.add(rbox(0.09, 0.2, 0.014, bezel, -0.17, -0.12, 0.0, 0.006));
      const hz = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.012), new THREE.MeshStandardMaterial({ map: makeHazard(), roughness: 0.6 }));
      hz.position.set(-0.225, -0.12, 0.001); hz.rotation.z = Math.PI / 2; wing.add(hz);
      wing.add(rbox(0.012, 0.17, 0.006, rubber, -0.17, -0.12, 0.008, 0.003));
      for (let i = 0; i <= 4; i++) wing.add(rbox(0.018, 0.003, 0.003, bare, -0.2, -0.2 + i * 0.04, 0.008, 0.001));
      throttlePivot.position.set(-0.17, -0.12, 0.012);
      wing.add(throttlePivot);
      const lever = cyl(0.009, 0.011, 0.12, 12, bare, 0, 0, 0.06); lever.rotation.x = Math.PI / 2; throttlePivot.add(lever);
      const grip = solid(new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.05, 6, 12), rubber));
      grip.position.z = 0.13; grip.rotation.z = Math.PI / 2; throttlePivot.add(grip);
      const cap = solid(new THREE.Mesh(new THREE.SphereGeometry(0.014, 14, 10), amber)); cap.position.set(0.04, 0, 0.13); throttlePivot.add(cap);
      // two rotary knobs
      for (const kx of [0.06, 0.2]) {
        wing.add(cyl(0.032, 0.032, 0.004, 24, bezel, kx, -0.12, 0.002).rotateX(Math.PI / 2));
        const k = cyl(0.02, 0.023, 0.022, 20, rubber, kx, -0.12, 0.014); k.rotation.x = Math.PI / 2; wing.add(k);
        const mark = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.016, 0.003), warmStrip); mark.position.set(0, 0.012, 0.009); mark.rotation.x = -Math.PI / 2; k.add(mark);
      }
    } else {
      // two analogue gauges with live needles, and a knob
      [['CELL', 0.8], ['DRIVE', 0.85]].forEach(([label, red], i) => {
        const gx = -0.17 + i * 0.165, gy = -0.12;
        wing.add(cyl(0.07, 0.072, 0.014, 32, bezel, gx, gy, 0.004).rotateX(Math.PI / 2));
        const face = new THREE.Mesh(new THREE.CircleGeometry(0.058, 40), new THREE.MeshBasicMaterial({ map: makeGaugeFace(label, 10, red), color: new THREE.Color(0.85, 0.85, 0.85) }));
        face.position.set(gx, gy, 0.0115); wing.add(face);
        const pivot = new THREE.Group(); pivot.position.set(gx, gy, 0.0135); wing.add(pivot);
        const nd = new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.05, 0.0015).translate(0, 0.022, 0), warmStrip); pivot.add(nd);
        pivot.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 12).rotateX(Math.PI / 2), bare));
        const gl = new THREE.Mesh(new THREE.CircleGeometry(0.06, 40), glassMat); gl.position.set(gx, gy, 0.017); wing.add(gl);
        needles.push(pivot);
      });
      const k = cyl(0.022, 0.025, 0.024, 20, rubber, 0.24, -0.12, 0.014); k.rotation.x = Math.PI / 2; wing.add(k);
    }

    // outer consoles: breaker grid / vent and stencil, a grab handle
    const outer = new THREE.Group();
    outer.rotation.order = 'YXZ';
    outer.position.set(s * 1.45, -0.49, -0.33);
    outer.rotation.y = -s * 1.0; outer.rotation.x = -0.6;
    scene.add(outer);
    outer.add(rbox(0.72, 0.5, 0.06, hull, 0, 0, -0.035, 0.015));
    outer.add(rbox(0.75, 0.032, 0.09, amber, 0, 0.25, -0.02, 0.012, 3));
    if (s < 0) {
      const brk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.009, 0.009, 0.016, 10).rotateX(Math.PI / 2), rubber, 24);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < 24; i++) { m4.makeTranslation(-0.26 + (i % 8) * 0.06, 0.15 - Math.floor(i / 8) * 0.06, 0.008 + (i === 5 || i === 17 ? 0.008 : 0)); brk.setMatrixAt(i, m4); }
      brk.castShadow = true; outer.add(brk);
      outer.add(rbox(0.52, 0.17, 0.004, bezel, -0.05, 0.09, -0.002, 0.004));
    } else {
      for (let i = 0; i < 9; i++) outer.add(rbox(0.36, 0.012, 0.02, bezel, -0.1, 0.17 - i * 0.026, 0.004, 0.004));
      const st = makeLabel('WAYFARER  ·  WR-7', { w: 512, h: 48, color: '#c4b59a', font: '700 34px "Chakra Petch", sans-serif' });
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.034), new THREE.MeshStandardMaterial({ map: st.tex, transparent: true, roughness: 0.7 }));
      sm.position.set(-0.1, -0.08, 0.0012); outer.add(sm);
    }
    const h0 = new THREE.Vector3(s < 0 ? 0.24 : 0.2, 0.12, 0.012), h1 = new THREE.Vector3(s < 0 ? 0.24 : 0.2, -0.16, 0.012);
    for (const hp of [h0, h1]) outer.add(cyl(0.012, 0.014, 0.05, 10, bare, hp.x, hp.y, 0.03).rotateX(Math.PI / 2));
    const bar = cyl(0.011, 0.011, 0.29, 12, rubber, h0.x, -0.02, 0.055); outer.add(bar);

    // ---------- canopy frame ----------
    const a = new THREE.Vector3(s * 1.18, -0.36, -0.95), b = new THREE.Vector3(s * 0.7, 0.98, -1.28);
    const inward = new THREE.Vector3(-s * 0.35, -0.2, 1).normalize();
    scene.add(beam(a, b, 0.11, 0.075, hull, inward));
    // inner cladding with a recessed light channel and rivets
    const off = inward.clone().multiplyScalar(0.035);
    scene.add(beam(a.clone().add(off), b.clone().add(off), 0.07, 0.02, coat, inward));
    const off2 = inward.clone().multiplyScalar(0.046);
    const chan = beam(a.clone().add(off2), b.clone().add(off2), 0.016, 0.006, rubber, inward); scene.add(chan);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.003, a.distanceTo(b) * 0.92), glowStrip);
    strip.position.copy(chan.position).addScaledVector(inward, 0.002); strip.quaternion.copy(chan.quaternion); scene.add(strip);
    const rivets = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0055, 8, 6), bare, 28);
    const side = new THREE.Vector3().subVectors(b, a).normalize().cross(inward).normalize();
    const m4 = new THREE.Matrix4(), tmp = new THREE.Vector3();
    for (let i = 0; i < 28; i++) {
      const t = 0.04 + (Math.floor(i / 2) / 13) * 0.92;
      tmp.lerpVectors(a, b, t).add(off).addScaledVector(inward, 0.009).addScaledVector(side, (i % 2 ? 1 : -1) * 0.026);
      m4.makeTranslation(tmp.x, tmp.y, tmp.z); rivets.setMatrixAt(i, m4);
    }
    rivets.castShadow = true; scene.add(rivets);
    // gusset where the frame meets the dash
    const gus = rbox(0.2, 0.16, 0.05, hull, s * 1.1, -0.29, -0.98, 0.015); gus.rotation.set(-0.3, -s * 0.5, s * 0.35); scene.add(gus);
    // rear sill strut along the side window
    const rear = new THREE.Vector3(s * 1.55, -0.28, 0.4);
    scene.add(beam(a, rear, 0.09, 0.08, hull, new THREE.Vector3(-s, 0.3, 0).normalize()));
    scene.add(beam(b, new THREE.Vector3(s * 1.0, 1.15, 0.4), 0.09, 0.07, hull, new THREE.Vector3(-s * 0.4, -1, 0).normalize()));
  }
  const top = new THREE.Vector3(0, -1, 0.2).normalize();
  scene.add(beam(new THREE.Vector3(-0.72, 0.98, -1.28), new THREE.Vector3(0.72, 0.98, -1.28), 0.12, 0.08, hull, top));
  scene.add(beam(new THREE.Vector3(-0.68, 0.955, -1.255), new THREE.Vector3(0.68, 0.955, -1.255), 0.08, 0.02, coat, top));
  // centre canopy bow running back overhead
  scene.add(beam(new THREE.Vector3(0, 0.99, -1.27), new THREE.Vector3(0, 1.25, 0.4), 0.07, 0.06, hull, new THREE.Vector3(0, -1, 0)));

  // ---------- canopy glass: invisible head-on, smudges and scratches catch the sun ----------
  const glassUniforms = { sunDir: { value: new THREE.Vector3(0, 0, -1) }, smudge: { value: makeGlassRoughness() }, sunCol: { value: new THREE.Color(1.0, 0.85, 0.65) } };
  const canopyMat = new THREE.ShaderMaterial({
    uniforms: glassUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vW; varying vec3 vN; varying vec2 vUv;
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 sunDir; uniform vec3 sunCol; uniform sampler2D smudge; varying vec3 vW; varying vec3 vN; varying vec2 vUv;
      void main(){
        vec3 V = normalize(vW - cameraPosition);
        float s = texture2D(smudge, vUv).r;
        float c = max(dot(V, sunDir), 0.0);
        float glare = pow(c, 60.0) * 0.9 + pow(c, 12.0) * 0.035;
        float fres = pow(1.0 - abs(dot(V, normalize(vN))), 4.0);
        vec3 col = sunCol * s * glare + vec3(0.25, 0.35, 0.45) * fres * 0.05 * (0.4 + s);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const quad = (p0, p1, p2, p3) => {
    const g = new THREE.BufferGeometry().setFromPoints([p0, p1, p2, p0, p2, p3]);
    g.computeVertexNormals(); planarUV(g, 0.9);
    const m = new THREE.Mesh(g, canopyMat); m.renderOrder = 5; scene.add(m);
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  quad(V(-1.22, -0.38, -1.0), V(1.22, -0.38, -1.0), V(0.72, 1.02, -1.33), V(-0.72, 1.02, -1.33));
  for (const s of [-1, 1]) quad(V(s * 1.22, -0.38, -1.0), V(s * 1.6, -0.3, 0.4), V(s * 1.04, 1.18, 0.4), V(s * 0.72, 1.02, -1.33));

  // merge everything that never moves (253 meshes -> one per material); the lever, needles and glass stay separate
  const baked = bakeStatic(scene, [throttlePivot, ...needles], (o) => o.material === glassMat || o.material === canopyMat);
  scene.userData.bake = baked.before + " -> " + baked.after;

  // see-through layers stay out of the AO pass (they would occlude the whole window)
  const glassMeshes = [];
  scene.traverse((o) => { if (o.isMesh && (o.material === glassMat || o.material === canopyMat)) { glassMeshes.push(o); o.castShadow = false; o.receiveShadow = false; } });

  let screenT = 0, nextScreen = 0;
  const sunLocal = new THREE.Vector3();
  const qInvShip = new THREE.Quaternion();
  const AXIS_Z = new THREE.Vector3(0, 0, 1);
  let cellShown = 1, driveShown = 0;

  return {
    scene, camera, sun,
    setGlass(on) { for (const m of glassMeshes) m.visible = on; },
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); },
    update(G, dt) {
      const s = G.ship;
      camera.position.copy(s.head).add(G.shakeOffset);
      camera.quaternion.setFromAxisAngle(AXIS_Z, s.headRoll);
      if (Math.abs(camera.fov - s.fov) > 0.01) { camera.fov = s.fov; camera.updateProjectionMatrix(); }
      qInvShip.copy(s.quat).invert();
      sunLocal.copy(SUN_DIR).applyQuaternion(qInvShip);
      if (this.debugSun) sunLocal.copy(this.debugSun).normalize(); // test hook
      sun.position.copy(sun.target.position).addScaledVector(sunLocal, 6);
      glassUniforms.sunDir.value.copy(sunLocal);
      throttlePivot.rotation.x = (s.throttle - 0.5) * 1.1;
      // gauge needles ease toward their values (270 degree sweep)
      cellShown += (s.boostEnergy - cellShown) * Math.min(1, dt * 4);
      const drv = s.cruise === 2 ? 1 : Math.min(1, s.speed / FLIGHT.boostSpeed);
      driveShown += (drv - driveShown) * Math.min(1, dt * 3);
      needles.forEach((n, i) => { n.rotation.z = Math.PI * 0.75 - (i ? driveShown : cellShown) * Math.PI * 1.5 + Math.sin(G.time * 23 + i) * 0.006; });
      for (const b of buttons) {
        if (!b.steady) { b.next -= dt; if (b.next <= 0) { b.on = Math.random() < 0.7; b.next = 0.6 + Math.random() * 5; } }
        b.mat.color.copy(b.on ? b.col : ledOff);
      }
      // instrument screens refresh in rotation, ~20 Hz each
      screenT += dt;
      if (screenT >= 1 / 60) {
        screenT = 0;
        const i = nextScreen; nextScreen = (nextScreen + 1) % 3;
        drawers[i](screens[i].ctx, G);
        screens[i].tex.needsUpdate = true;
      }
    },
    redrawAll(G) { screens.forEach((sc, i) => { drawers[i](sc.ctx, G); sc.tex.needsUpdate = true; }); },
  };
}

export { COMMS_NAME };
