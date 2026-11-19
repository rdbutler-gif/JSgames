// The cockpit: a 3D console with live instrument screens, rendered over the world.
import * as THREE from 'three';
import { toon } from './fighters.js';
import { SUN_DIR } from './world.js';
import { FLIGHT } from './ship.js';
import { COMMS_NAME } from './data.js';

const FONT = '"Chakra Petch", sans-serif';
const SW = 512, SH = 304;
const RADAR_RANGE = 30000;

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function strut(a, b, t, mat) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(t, t * 1.4, len), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.lookAt(b);
  return m;
}

function makeScreen(parent, x, y) {
  const cv = document.createElement('canvas');
  cv.width = SW; cv.height = SH;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const w = 0.44, h = w * SH / SW;
  const bezel = box(w + 0.024, h + 0.024, 0.02, toon('#0d1017'), x, y, 0.0);
  parent.add(bezel);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
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
  const p = G.planets[G.targetIndex];
  const d = Math.max(0, p.center.distanceTo(G.ship.pos) - p.data.R);
  x.textAlign = 'left';
  x.font = `700 30px ${FONT}`; x.fillStyle = '#ffd36a';
  x.fillText(p.data.name, 16, 64);
  x.font = `600 18px ${FONT}`; x.fillStyle = '#cfeaf2';
  const eta = G.ship.speed > 5 ? d / G.ship.speed : Infinity;
  const etaS = !isFinite(eta) ? '--' : eta > 3600 ? '>1 H' : eta >= 60 ? Math.floor(eta / 60) + 'M ' + Math.floor(eta % 60) + 'S' : Math.floor(eta) + 'S';
  x.fillText(fmtDist(d) + '   ETA ' + etaS, 16, 94);
  x.fillStyle = '#8fc9d6'; x.font = `500 16px ${FONT}`;
  x.fillText(p.data.blurb.toUpperCase() + ' · RELIC: ' + p.data.relic.toUpperCase(), 16, 120);
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
    x.fillText(m.from + ':', 16, y);
    x.fillStyle = newest ? '#e6fbff' : '#6f98a3';
    const lines = wrap(x, shown, SW - 100);
    lines.slice(0, newest ? 3 : 1).forEach((ln, k) => x.fillText(ln, 84, y + k * 21));
    y += newest ? 0 : 26;
  });
  finish(x);
}

export function createCockpit() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.02, 10);
  scene.add(new THREE.AmbientLight('#7f8db0', 1.0));
  const sun = new THREE.DirectionalLight('#fff0dc', 2.2);
  scene.add(sun); scene.add(sun.target);
  const fill = new THREE.PointLight('#6ef2ff', 0.8, 1.6, 2);
  fill.position.set(0, -0.2, -0.55); scene.add(fill);

  const metal = toon('#2c3344'), dark = toon('#141821'), trim = toon('#c8622a'), mid = toon('#3d4558');
  const strip = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.4, 1.6) });

  // lower body that fills the bottom of the view
  scene.add(box(4.2, 0.5, 1.8, dark, 0, -0.9, -0.4));

  // center console
  const panel = new THREE.Group();
  panel.position.set(0, -0.5, -0.86); panel.rotation.x = -0.67;
  scene.add(panel);
  panel.add(box(1.52, 0.46, 0.06, metal, 0, 0, -0.035));
  panel.add(box(1.56, 0.03, 0.09, trim, 0, 0.235, -0.02));
  const screens = [makeScreen(panel, -0.49, 0.025), makeScreen(panel, 0, 0.025), makeScreen(panel, 0.49, 0.025)];
  const drawers = [drawFlight, drawScanner, drawNav];

  // side consoles with button banks
  const buttons = [];
  const throttlePivot = new THREE.Group();
  for (const s of [-1, 1]) {
    const wing = new THREE.Group();
    wing.rotation.order = 'YXZ';
    wing.position.set(s * 0.98, -0.5, -0.72);
    wing.rotation.y = -s * 0.55; wing.rotation.x = -0.67;
    scene.add(wing);
    wing.add(box(0.62, 0.46, 0.06, mid, 0, 0, -0.035));
    wing.add(box(0.64, 0.03, 0.09, trim, 0, 0.235, -0.02));
    for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) {
      const mat = new THREE.MeshBasicMaterial({ color: '#333' });
      if (s < 0 && c < 3 && r > 1) continue;
      const b = box(0.036, 0.02, 0.012, mat, -0.21 + c * 0.065, 0.15 - r * 0.05, 0.006);
      wing.add(b);
      const palette = ['#6ef2ff', '#ffb35a', '#ff4d6d', '#9cff8a'];
      buttons.push({ mat, col: new THREE.Color(palette[(r * 7 + c * 3 + (s > 0 ? 2 : 0)) % 4]), on: Math.random() < 0.6, next: Math.random() * 3 });
    }
    if (s < 0) {
      throttlePivot.position.set(-0.15, -0.13, 0.02);
      wing.add(throttlePivot);
      wing.add(box(0.07, 0.16, 0.02, dark, -0.15, -0.13, 0.0));
      const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 10), metal);
      lever.rotation.x = Math.PI / 2; lever.position.z = 0.05;
      throttlePivot.add(lever);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.017, 16, 12), toon('#ff8a3a', '#7a2a00'));
      knob.position.z = 0.1; throttlePivot.add(knob);
    }
    const outer = new THREE.Group();
    outer.rotation.order = 'YXZ';
    outer.position.set(s * 1.45, -0.49, -0.33);
    outer.rotation.y = -s * 1.0; outer.rotation.x = -0.6;
    scene.add(outer);
    outer.add(box(0.72, 0.5, 0.06, metal, 0, 0, -0.035));
    outer.add(box(0.74, 0.03, 0.09, trim, 0, 0.25, -0.02));
    // canopy frame
    const a = new THREE.Vector3(s * 1.18, -0.36, -0.95), b = new THREE.Vector3(s * 0.7, 0.98, -1.28);
    scene.add(strut(a, b, 0.07, metal));
    const a2 = a.clone().add(new THREE.Vector3(-s * 0.03, 0, 0.03)), b2 = b.clone().add(new THREE.Vector3(-s * 0.03, 0, 0.03));
    scene.add(strut(a2, b2, 0.012, strip));
    scene.add(strut(a, new THREE.Vector3(s * 1.55, -0.28, 0.4), 0.08, metal));
  }
  scene.add(strut(new THREE.Vector3(-0.7, 0.98, -1.28), new THREE.Vector3(0.7, 0.98, -1.28), 0.08, metal));

  let screenT = 0, nextScreen = 0;
  const sunLocal = new THREE.Vector3();
  const qInvShip = new THREE.Quaternion();
  const AXIS_Z = new THREE.Vector3(0, 0, 1);

  return {
    scene, camera,
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); },
    update(G, dt) {
      const s = G.ship;
      camera.position.copy(s.head).add(G.shakeOffset);
      camera.quaternion.setFromAxisAngle(AXIS_Z, s.headRoll);
      if (Math.abs(camera.fov - s.fov) > 0.01) { camera.fov = s.fov; camera.updateProjectionMatrix(); }
      qInvShip.copy(s.quat).invert();
      sunLocal.copy(SUN_DIR).applyQuaternion(qInvShip);
      sun.position.copy(sunLocal).multiplyScalar(5);
      throttlePivot.rotation.x = (s.throttle - 0.5) * 1.1;
      for (const b of buttons) {
        b.next -= dt;
        if (b.next <= 0) { b.on = Math.random() < 0.65; b.next = 0.4 + Math.random() * 4; }
        b.mat.color.copy(b.col).multiplyScalar(b.on ? 1.0 : 0.18);
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
