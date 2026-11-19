// Ember Keeper — your light is your life. Gather embers, flare the shades away.
(() => {
'use strict';

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const dark = document.createElement('canvas');
const dctx = dark.getContext('2d');
const floor = document.createElement('canvas');
const fctx = floor.getContext('2d');

let W = 0, H = 0, DPR = 1, S = 1;
const TAU = Math.PI * 2;
const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.max(1, window.innerWidth);
  H = Math.max(1, window.innerHeight);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  dark.width = cv.width; dark.height = cv.height;
  S = Math.max(0.6, Math.min(1.4, Math.min(W, H) / 760));
  buildFloor();
  if (P) { P.x = clamp(P.x, 0, W); P.y = clamp(P.y, 0, H); }
}

function buildFloor() {
  floor.width = cv.width; floor.height = cv.height;
  fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  fctx.fillStyle = '#1b161b';
  fctx.fillRect(0, 0, W, H);
  // soft blotches
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * W, y = Math.random() * H, r = (40 + Math.random() * 140) * S;
    const g = fctx.createRadialGradient(x, y, 0, x, y, r);
    const c = Math.random() < 0.5 ? '58,42,46' : '30,32,40';
    g.addColorStop(0, `rgba(${c},0.55)`); g.addColorStop(1, `rgba(${c},0)`);
    fctx.fillStyle = g; fctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // cracks
  fctx.strokeStyle = 'rgba(0,0,0,0.45)'; fctx.lineWidth = 1.2;
  for (let i = 0; i < 26; i++) {
    let x = Math.random() * W, y = Math.random() * H, a = Math.random() * TAU;
    fctx.beginPath(); fctx.moveTo(x, y);
    for (let j = 0; j < 7; j++) { a += (Math.random() - 0.5) * 1.2; x += Math.cos(a) * 18 * S; y += Math.sin(a) * 18 * S; fctx.lineTo(x, y); }
    fctx.stroke();
  }
  // ash specks
  for (let i = 0; i < 900; i++) {
    const v = 45 + Math.random() * 50;
    fctx.fillStyle = `rgba(${v + 20},${v + 8},${v},${0.25 + Math.random() * 0.4})`;
    fctx.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 1.6, 1 + Math.random() * 1.6);
  }
}

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);

// ---------- storage (per-viewer convenience only) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
};
let best = Number(store.get('emberkeeper.best', 0)) || 0;
let muted = !!store.get('emberkeeper.muted', false);

// ---------- audio ----------
let ac = null, master = null, droneGain = null, noiseBuf = null;
function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume().catch(() => {}); return; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; return; }
  master = ac.createGain(); master.gain.value = muted ? 0 : 0.6; master.connect(ac.destination);
  droneGain = ac.createGain(); droneGain.gain.value = 0; droneGain.connect(master);
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; f.connect(droneGain);
  [55, 82.41, 110.6].forEach((fr, i) => {
    const o = ac.createOscillator(); o.type = i === 1 ? 'triangle' : 'sine'; o.frequency.value = fr;
    const g = ac.createGain(); g.gain.value = i === 0 ? 0.5 : 0.22; o.connect(g); g.connect(f); o.start();
  });
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
function setMuted(m) {
  muted = m; store.set('emberkeeper.muted', m);
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.6, ac.currentTime, 0.02);
  floatText(m ? 'Sound off' : 'Sound on', W / 2, H - 40 * S, '#cbbfae', 14);
}
function tone(freq, dur, type = 'sine', vol = 0.2, slide = 0, delay = 0) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol = 0.3, f0 = 2000, f1 = 200, q = 1) {
  if (!ac || muted) return;
  const t = ac.currentTime;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
}
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const sfx = {
  pickup(c) { const st = SCALE[Math.min(c - 1, SCALE.length - 1)]; tone(523.25 * Math.pow(2, st / 12), 0.2, 'triangle', 0.14); },
  sun() { [0, 4, 7, 12].forEach((s, i) => tone(392 * Math.pow(2, s / 12), 0.45, 'triangle', 0.12, 0, i * 0.06)); },
  flare() { noise(0.5, 0.32, 3200, 260, 0.7); tone(180, 0.4, 'sine', 0.22, 2.4); },
  kill(n) { tone(150 * (1 + n * 0.12), 0.24, 'sine', 0.3, 0.4); noise(0.14, 0.14, 1400, 400, 2); },
  hurt() { tone(95, 0.22, 'sawtooth', 0.14, 0.6); noise(0.18, 0.12, 600, 150, 1); },
  wave() { [0, 4, 7, 11].forEach((s, i) => tone(349.2 * Math.pow(2, s / 12), 0.6, 'sine', 0.11, 0, i * 0.09)); },
  dash() { tone(700, 0.28, 'square', 0.04, 0.3); },
  aim() { tone(880, 0.12, 'square', 0.025); },
  eat() { tone(260, 0.18, 'sawtooth', 0.05, 0.5); },
  beat() { tone(58, 0.18, 'sine', 0.3, 0.8); tone(52, 0.18, 'sine', 0.22, 0.8, 0.16); },
  empty() { tone(120, 0.1, 'square', 0.05); },
  over() { tone(220, 1.4, 'triangle', 0.2, 0.25); noise(1.2, 0.2, 800, 60, 0.6); }
};

// ---------- game state ----------
const ST = { TITLE: 0, PLAY: 1, PAUSE: 2, OVER: 3 };
let state = ST.TITLE;
const MAXL = 120;
const WAVE_LEN = 22;
let P = null, motes, shades, parts, rings, floaters;
let time = 0, score = 0, wave = 1, waveT = 0, combo = 0, comboT = 0, flareCd = 0, shake = 0, hurtT = 0;
let spawnT = 0, moteT = 0, sunT = 0, beatT = 0, newBest = false, overT = 0, kills = 0, hintT = 0, waveBanner = 0;
let globalT = 0;

function reset() {
  P = { x: W / 2, y: H / 2, vx: 0, vy: 0, light: 72, inv: 0 };
  motes = []; shades = []; parts = []; rings = []; floaters = [];
  time = 0; score = 0; wave = 1; waveT = 0; combo = 0; comboT = 0; flareCd = 0; shake = 0; hurtT = 0;
  spawnT = 2.2; moteT = 0; sunT = 18; beatT = 0; newBest = false; overT = 0; kills = 0; hintT = 9; waveBanner = 2.2;
  for (let i = 0; i < 6; i++) spawnMote(false);
}

function lightRadius() { return (48 + P.light * 2.0) * S * (1 + 0.025 * Math.sin(globalT * 11) + 0.015 * Math.sin(globalT * 23)); }

function spawnMote(big) {
  const pad = 36 * S, top = 64 * S;
  let x, y, tries = 0;
  do {
    x = pad + Math.random() * (W - 2 * pad);
    y = top + Math.random() * (H - top - pad);
    tries++;
  } while (tries < 25 && P && Math.hypot(x - P.x, y - P.y) < 130 * S);
  motes.push({ x, y, big: !!big, ph: Math.random() * TAU, age: 0 });
}

function makeShade(type, x, y) {
  const sp = 1 + (wave - 1) * 0.06;
  const s = { type, x, y, vx: 0, vy: 0, ph: Math.random() * TAU, imm: 0, age: 0, dead: false, mode: 'seek', mt: 0, dx: 0, dy: 0 };
  if (type === 'drifter') Object.assign(s, { r: 14 * S, spd: 62 * S * sp, pts: 40 });
  else if (type === 'mini') Object.assign(s, { r: 9 * S, spd: 98 * S * sp, pts: 20, imm: 0.35 });
  else if (type === 'darter') Object.assign(s, { r: 11 * S, spd: 72 * S * sp, pts: 60 });
  else if (type === 'splitter') Object.assign(s, { r: 21 * S, spd: 44 * S * sp, pts: 60 });
  else if (type === 'leech') Object.assign(s, { r: 12 * S, spd: 84 * S * sp, pts: 80 });
  return s;
}

function spawnShade() {
  const w = { drifter: 5, darter: wave >= 2 ? 2.2 : 0, splitter: wave >= 3 ? 1.6 : 0, leech: wave >= 4 ? 1.3 : 0 };
  let tot = 0; for (const k in w) tot += w[k];
  let r = Math.random() * tot, type = 'drifter';
  for (const k in w) { r -= w[k]; if (r <= 0) { type = k; break; } }
  const m = 40 * S, side = Math.floor(Math.random() * 4);
  let x, y;
  if (side === 0) { x = -m; y = Math.random() * H; }
  else if (side === 1) { x = W + m; y = Math.random() * H; }
  else if (side === 2) { x = Math.random() * W; y = -m; }
  else { x = Math.random() * W; y = H + m; }
  shades.push(makeShade(type, x, y));
}

function burst(x, y, col, n, spd = 160, life = 0.7, size = 2.4, add = true) {
  for (let i = 0; i < n; i++) {
    if (parts.length > 700) parts.shift();
    const a = Math.random() * TAU, v = rand(0.25, 1) * spd * S;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.5, 1) * life, max: life, col, size: size * S * rand(0.6, 1.3), add });
  }
}

function floatText(str, x, y, col, size = 16) {
  if (!floaters) floaters = [];
  floaters.push({ str, x, y, col, size, t: 0 });
}

function start() {
  reset();
  state = ST.PLAY;
  sfx.wave();
}

function flare() {
  if (flareCd > 0) return;
  if (P.light <= 10) { sfx.empty(); floatText('Too dim to flare', P.x, P.y - 30 * S, '#ff8a6a', 13); flareCd = 0.3; return; }
  P.light -= 10;
  const lr = lightRadius();
  rings.push({ x: P.x, y: P.y, r: 0, prev: 0, max: lr * 1.45 + 60 * S, spd: 1100 * S, chain: 0 });
  flareCd = 0.5;
  shake = Math.max(shake, 5);
  burst(P.x, P.y, '#ffd27a', 26, 340, 0.5, 2.2);
  sfx.flare();
  hintT = Math.min(hintT, 0);
}

function killShade(s, rg) {
  s.dead = true; kills++;
  rg.chain++;
  const pts = s.pts * rg.chain;
  score += pts;
  P.light = Math.min(MAXL, P.light + 3);
  floatText('+' + pts + (rg.chain > 1 ? '  x' + rg.chain : ''), s.x, s.y - 14 * S, rg.chain > 1 ? '#ffe08a' : '#f4e6d0', 14 + Math.min(rg.chain, 6) * 2);
  burst(s.x, s.y, '#120a1c', 18, 120, 0.9, 5, false);
  burst(s.x, s.y, '#ff9d4a', 12, 220, 0.6, 2);
  sfx.kill(rg.chain);
  shake = Math.max(shake, 3 + rg.chain);
  if (s.type === 'splitter') {
    for (let i = 0; i < 2; i++) {
      const m = makeShade('mini', s.x + (i ? 8 : -8) * S, s.y);
      const a = Math.random() * TAU; m.vx = Math.cos(a) * 160 * S; m.vy = Math.sin(a) * 160 * S;
      shades.push(m);
    }
  }
}

function hurt(s, dmg) {
  P.light -= dmg; P.inv = 0.7; hurtT = 0.45;
  const dx = P.x - s.x, dy = P.y - s.y, d = Math.hypot(dx, dy) || 1;
  P.vx += dx / d * 420 * S; P.vy += dy / d * 420 * S;
  s.vx -= dx / d * 260 * S; s.vy -= dy / d * 260 * S;
  if (s.type === 'darter') { s.mode = 'rest'; s.mt = 1.0; }
  combo = 0; comboT = 0;
  shake = Math.max(shake, 9);
  burst(P.x, P.y, '#ff6a3a', 16, 200, 0.5, 2.2);
  sfx.hurt();
  floatText('-' + dmg, P.x, P.y - 24 * S, '#ff7a5a', 16);
}

function gameOver() {
  state = ST.OVER; overT = 0;
  score = Math.floor(score);
  if (score > best) { best = score; newBest = true; store.set('emberkeeper.best', best); }
  burst(P.x, P.y, '#ffb35a', 60, 260, 1.4, 3);
  sfx.over();
}

// ---------- input ----------
const keys = new Set();
const pointer = { x: 0, y: 0, mouse: false, touchId: null, ax: 0, ay: 0, px: 0, py: 0, tx: 0, ty: 0 };
let usingTouch = false;
const pad = { x: 0, y: 0, prev: {} };

function flareBtn() { const r = 46 * S; return { x: W - r - 22 * S, y: H - r - 22 * S, r }; }
function pauseBtn() { const r = 20 * S; return { x: W - r - 14 * S, y: 34 * S + 30 * S, r }; }

function onAction() {
  initAudio();
  if (state === ST.TITLE) start();
  else if (state === ST.OVER) { if (overT > 0.8) start(); }
  else if (state === ST.PAUSE) state = ST.PLAY;
  else if (state === ST.PLAY) flare();
}
function togglePause() {
  if (state === ST.PLAY) state = ST.PAUSE;
  else if (state === ST.PAUSE) { initAudio(); state = ST.PLAY; }
}

const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
addEventListener('keydown', e => {
  const k = e.code;
  if (k === 'Space' || k.startsWith('Arrow')) e.preventDefault();
  keys.add(k);
  if (MOVE_KEYS.includes(k)) pointer.mouse = false;
  if (e.repeat) return;
  if (k === 'KeyM') { initAudio(); setMuted(!muted); }
  else if (k === 'KeyP' || k === 'Escape') togglePause();
  else if (k === 'Space' || k === 'Enter' || k === 'KeyJ' || k === 'KeyK') onAction();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); pointer.touchId = null; if (state === ST.PLAY) state = ST.PAUSE; });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === ST.PLAY) state = ST.PAUSE; });

const inCircle = (x, y, c) => Math.hypot(x - c.x, y - c.y) < c.r * 1.25;

cv.addEventListener('pointerdown', e => {
  cv.focus();
  if (e.pointerType === 'mouse') {
    if (e.button !== 0) return;
    usingTouch = false;
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.mouse = true;
    onAction();
    return;
  }
  usingTouch = true;
  e.preventDefault();
  if (state !== ST.PLAY) { onAction(); return; }
  if (inCircle(e.clientX, e.clientY, flareBtn())) { flare(); return; }
  if (inCircle(e.clientX, e.clientY, pauseBtn())) { togglePause(); return; }
  if (pointer.touchId === null) {
    pointer.touchId = e.pointerId;
    pointer.ax = e.clientX; pointer.ay = e.clientY;
    pointer.px = P.x; pointer.py = P.y;
    pointer.tx = P.x; pointer.ty = P.y;
  } else {
    flare(); // a second finger flares
  }
}, { passive: false });
cv.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') { pointer.x = e.clientX; pointer.y = e.clientY; pointer.mouse = true; return; }
  if (e.pointerId === pointer.touchId) {
    pointer.tx = clamp(pointer.px + (e.clientX - pointer.ax) * 1.4, 0, W);
    pointer.ty = clamp(pointer.py + (e.clientY - pointer.ay) * 1.4, 0, H);
  }
});
const endTouch = e => { if (e.pointerId === pointer.touchId) pointer.touchId = null; };
cv.addEventListener('pointerup', endTouch);
cv.addEventListener('pointercancel', endTouch);
cv.addEventListener('contextmenu', e => e.preventDefault());

function pollPad() {
  pad.x = 0; pad.y = 0;
  let pads = [];
  try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { pads = []; }
  for (const gp of pads) {
    if (!gp) continue;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    if (Math.hypot(ax, ay) > 0.2) { pad.x = ax; pad.y = ay; }
    const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
    if (b(14)) pad.x = -1; if (b(15)) pad.x = 1; if (b(12)) pad.y = -1; if (b(13)) pad.y = 1;
    const act = b(0) || b(7) || b(5), pse = b(9);
    if (act && !pad.prev.act) onAction();
    if (pse && !pad.prev.pse) togglePause();
    pad.prev.act = act; pad.prev.pse = pse;
    if (pad.x || pad.y) pointer.mouse = false;
    break;
  }
}

// ---------- update ----------
function update(dt) {
  globalT += dt;
  if (state === ST.PLAY) updatePlay(dt);
  if (state === ST.OVER) overT += dt;
  if (state !== ST.PAUSE) hurtT = Math.max(0, hurtT - dt);
  if (state !== ST.PAUSE) updateFx(dt);
  if (droneGain) {
    const target = state === ST.PLAY ? 0.06 + clamp(1 - P.light / 90, 0, 1) * 0.22 : state === ST.PAUSE ? 0.0 : 0.07;
    droneGain.gain.setTargetAtTime(target, ac.currentTime, 0.3);
  }
}

function updateFx(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 2.5 * dt; p.vy *= 1 - 2.5 * dt;
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i]; f.t += dt; f.y -= 30 * S * dt;
    if (f.t > 1.1) floaters.splice(i, 1);
  }
  shake = Math.max(0, shake - 30 * dt);
}

function updatePlay(dt) {
  time += dt; waveT += dt;
  if (waveT >= WAVE_LEN) {
    waveT -= WAVE_LEN; wave++;
    waveBanner = 2.2;
    P.light = Math.min(MAXL, P.light + 8);
    sfx.wave();
  }
  waveBanner = Math.max(0, waveBanner - dt);
  hintT -= dt;
  score += dt * 5 * wave;

  // movement
  let ix = 0, iy = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iy -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) iy += 1;
  ix += pad.x; iy += pad.y;
  const mag = Math.hypot(ix, iy), maxS = 320 * S;
  let dvx = 0, dvy = 0;
  if (mag > 0.05) {
    const m = Math.min(1, mag); dvx = ix / mag * m * maxS; dvy = iy / mag * m * maxS;
  } else {
    let tx = null, ty = null;
    if (pointer.touchId !== null) { tx = pointer.tx; ty = pointer.ty; }
    else if (pointer.mouse) { tx = pointer.x; ty = pointer.y; }
    if (tx !== null) {
      const dx = tx - P.x, dy = ty - P.y, d = Math.hypot(dx, dy);
      if (d > 1) { const sp = Math.min(maxS, d * 7); dvx = dx / d * sp; dvy = dy / d * sp; }
    }
  }
  const k = Math.min(1, 12 * dt);
  P.vx += (dvx - P.vx) * k; P.vy += (dvy - P.vy) * k;
  P.x = clamp(P.x + P.vx * dt, 10 * S, W - 10 * S);
  P.y = clamp(P.y + P.vy * dt, 10 * S, H - 10 * S);
  if (P.inv > 0) P.inv -= dt;
  flareCd = Math.max(0, flareCd - dt);

  // light decay
  P.light -= Math.min(5.2, 2.0 + (wave - 1) * 0.3) * dt;
  if (P.light < 25) {
    beatT -= dt;
    if (beatT <= 0) { sfx.beat(); beatT = 0.55 + P.light / 40; }
  }

  // combo timer
  if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }

  // motes
  moteT -= dt;
  const want = 5 + Math.floor(wave / 2);
  if (moteT <= 0 && motes.filter(m => !m.big).length < want) { spawnMote(false); moteT = 0.9; }
  sunT -= dt;
  if (sunT <= 0) { spawnMote(true); sunT = rand(22, 30); }
  for (let i = motes.length - 1; i >= 0; i--) {
    const m = motes[i]; m.age += dt;
    const d = Math.hypot(m.x - P.x, m.y - P.y);
    // gentle magnet when close
    if (d < 60 * S && d > 1) { m.x += (P.x - m.x) / d * 140 * S * dt; m.y += (P.y - m.y) / d * 140 * S * dt; }
    if (d < (m.big ? 22 : 16) * S) {
      motes.splice(i, 1);
      combo = Math.min(10, combo + 1); comboT = 2.6;
      const gain = m.big ? 28 : 7;
      P.light = Math.min(MAXL, P.light + gain);
      const pts = (m.big ? 150 : 10) * combo;
      score += pts;
      floatText('+' + pts, m.x, m.y - 12 * S, m.big ? '#ffe9a0' : '#ffd08a', m.big ? 20 : 13);
      burst(m.x, m.y, m.big ? '#fff0b0' : '#ffbe5c', m.big ? 30 : 10, m.big ? 260 : 140, 0.6, 2);
      if (m.big) sfx.sun(); else sfx.pickup(combo);
    }
  }

  // spawning shades
  spawnT -= dt;
  const cap = Math.min(42, 4 + wave * 3);
  if (spawnT <= 0) {
    if (shades.length < cap) spawnShade();
    spawnT = Math.max(0.45, 2.3 - wave * 0.19) * rand(0.7, 1.3);
  }

  const lr = lightRadius();
  for (const s of shades) {
    s.age += dt; if (s.imm > 0) s.imm -= dt;
    let tx = P.x, ty = P.y;
    if (s.type === 'leech' && motes.length) {
      let bd = Infinity;
      for (const m of motes) { const d = (m.x - s.x) ** 2 + (m.y - s.y) ** 2; if (d < bd) { bd = d; tx = m.x; ty = m.y; } }
    }
    const dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy) || 1;
    const pd = Math.hypot(P.x - s.x, P.y - s.y);
    let spd = s.spd * (pd < lr ? 0.68 : 1);
    if (s.type === 'darter') {
      s.mt -= dt;
      if (s.mode === 'seek') { if (pd < 250 * S && s.age > 1.2) { s.mode = 'aim'; s.mt = 0.8; sfx.aim(); } }
      else if (s.mode === 'aim') { spd = 0; s.dx = (P.x - s.x) / (pd || 1); s.dy = (P.y - s.y) / (pd || 1); if (s.mt <= 0) { s.mode = 'dash'; s.mt = 0.42; sfx.dash(); } }
      else if (s.mode === 'dash') { s.vx = s.dx * 560 * S; s.vy = s.dy * 560 * S; if (s.mt <= 0) { s.mode = 'rest'; s.mt = 0.9; } }
      else if (s.mode === 'rest') { spd *= 0.3; if (s.mt <= 0) s.mode = 'seek'; }
    }
    if (!(s.type === 'darter' && s.mode === 'dash')) {
      const wob = Math.sin(time * 2 + s.ph) * 0.35;
      const ux = dx / d, uy = dy / d, c = Math.cos(wob), sn = Math.sin(wob);
      const desx = (ux * c - uy * sn) * spd, desy = (ux * sn + uy * c) * spd;
      const kk = Math.min(1, 3 * dt); s.vx += (desx - s.vx) * kk; s.vy += (desy - s.vy) * kk;
    }
    s.x += s.vx * dt; s.y += s.vy * dt;

    if (s.type === 'leech') {
      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i];
        if (Math.hypot(m.x - s.x, m.y - s.y) < s.r + 6 * S) {
          motes.splice(i, 1);
          s.r = Math.min(26 * S, s.r + 3 * S); s.spd *= 1.06; s.pts += 40;
          burst(m.x, m.y, '#9a6cff', 10, 120, 0.5, 2);
          sfx.eat();
        }
      }
    }
    if (pd < s.r + 8 * S && P.inv <= 0) hurt(s, s.type === 'darter' && s.mode === 'dash' ? 16 : 10);
  }
  // separation
  for (let i = 0; i < shades.length; i++) {
    const a = shades[i];
    for (let j = i + 1; j < shades.length; j++) {
      const b = shades[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
      if (d < m && d > 0.01) { const push = (m - d) * 0.5; a.x -= dx / d * push; a.y -= dy / d * push; b.x += dx / d * push; b.y += dy / d * push; }
    }
  }

  // flare rings
  for (let i = rings.length - 1; i >= 0; i--) {
    const rg = rings[i];
    rg.prev = rg.r; rg.r += rg.spd * dt;
    for (const s of shades) {
      if (s.dead || s.imm > 0) continue;
      const d = Math.hypot(s.x - rg.x, s.y - rg.y);
      if (d - s.r < rg.r && d + s.r > rg.prev - 4 * S) killShade(s, rg);
    }
    if (rg.r >= rg.max) {
      if (rg.chain >= 3) { const bonus = 100 * rg.chain; score += bonus; floatText('CHAIN x' + rg.chain + '  +' + bonus, rg.x, rg.y - 50 * S, '#ffe9a0', 22); }
      rings.splice(i, 1);
    }
  }
  shades = shades.filter(s => !s.dead);

  if (P.light <= 0) { P.light = 0; gameOver(); }
}

// ---------- drawing ----------
function hole(x, y, r, a = 1) {
  if (r <= 0) return;
  const g = dctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(0,0,0,${a})`);
  g.addColorStop(0.55, `rgba(0,0,0,${a * 0.85})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  dctx.fillStyle = g;
  dctx.beginPath(); dctx.arc(x, y, r, 0, TAU); dctx.fill();
}

const SHADE_RIM = { drifter: '#6b4aa0', mini: '#6b4aa0', darter: '#a83a48', splitter: '#3d78a8', leech: '#5f9a3a' };

function shadeBody(s) {
  const r = s.r, t = globalT * 3 + s.ph;
  ctx.save(); ctx.translate(s.x, s.y);
  const ang = Math.atan2(s.vy, s.vx);
  ctx.beginPath();
  if (s.type === 'darter') {
    ctx.rotate(ang);
    const st = s.mode === 'aim' ? 1 + 0.15 * Math.sin(globalT * 40) : 1;
    ctx.moveTo(r * 1.9 * st, 0);
    ctx.quadraticCurveTo(0, r * 1.1, -r * 1.3, r * 0.5 * Math.sin(t * 2) + r * 0.3);
    ctx.lineTo(-r * 0.9, 0);
    ctx.lineTo(-r * 1.3, -r * 0.5 * Math.sin(t * 2) - r * 0.3);
    ctx.quadraticCurveTo(0, -r * 1.1, r * 1.9 * st, 0);
  } else {
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const a = i / n * TAU;
      let rr = r * (1 + 0.13 * Math.sin(a * 3 + t));
      if (s.type === 'splitter') rr *= 1 + 0.16 * Math.cos(a * 2);
      if (s.type === 'leech') rr *= 1 + 0.22 * Math.max(0, Math.sin(a * 5 - t * 2));
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fillStyle = '#050307';
  ctx.fill();
  ctx.lineWidth = 2 * S;
  ctx.strokeStyle = SHADE_RIM[s.type];
  ctx.stroke();
  if (s.type === 'splitter') {
    ctx.beginPath(); ctx.moveTo(0, -r * 0.9); ctx.quadraticCurveTo(r * 0.2, 0, 0, r * 0.9);
    ctx.strokeStyle = 'rgba(61,120,168,0.7)'; ctx.lineWidth = 1.5 * S; ctx.stroke();
  }
  ctx.restore();
}

function shadeEyes(s, lit) {
  const r = s.r;
  let ex = s.vx, ey = s.vy; const l = Math.hypot(ex, ey) || 1; ex /= l; ey /= l;
  const px = -ey, py = ex;
  const aim = s.type === 'darter' && (s.mode === 'aim' || s.mode === 'dash');
  const col = aim ? '#ff4a4a' : s.type === 'leech' ? '#c9ff9a' : '#e2dbff';
  const blink = Math.sin(globalT * 0.9 + s.ph * 5) > 0.97 ? 0.2 : 1;
  ctx.globalAlpha = (lit ? 1 : 0.5) * (s.imm > 0 ? 0.5 : 1);
  ctx.fillStyle = col;
  const off = r * 0.38, fw = r * 0.35, er = Math.max(1.6 * S, r * (aim ? 0.2 : 0.15));
  for (const sg of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s.x + ex * fw + px * off * sg, s.y + ey * fw + py * off * sg, er, er * blink, Math.atan2(ey, ex), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (s.type === 'darter' && s.mode === 'aim') {
    ctx.save();
    ctx.strokeStyle = `rgba(255,70,70,${0.25 + 0.35 * (1 - s.mt / 0.8)})`;
    ctx.lineWidth = 2 * S; ctx.setLineDash([8 * S, 8 * S]);
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + s.dx * 240 * S, s.y + s.dy * 240 * S); ctx.stroke();
    ctx.restore();
  }
}

function text(str, x, y, size, col, align = 'center', alpha = 1, weight = 600) {
  ctx.globalAlpha = alpha; ctx.fillStyle = col;
  ctx.font = `${weight} ${Math.round(size)}px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
  ctx.globalAlpha = 1;
}

function drawEmber(x, y, lr, inv) {
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, lr);
  g.addColorStop(0, 'rgba(255,150,60,0.20)'); g.addColorStop(0.5, 'rgba(255,110,40,0.06)'); g.addColorStop(1, 'rgba(255,90,30,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, lr, 0, TAU); ctx.fill();
  const h = ctx.createRadialGradient(x, y, 0, x, y, 34 * S);
  h.addColorStop(0, 'rgba(255,220,150,0.9)'); h.addColorStop(0.3, 'rgba(255,150,60,0.45)'); h.addColorStop(1, 'rgba(255,100,30,0)');
  ctx.fillStyle = h; ctx.beginPath(); ctx.arc(x, y, 34 * S, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  if (inv > 0 && Math.floor(globalT * 20) % 2 === 0) return;
  ctx.fillStyle = '#fff4dc';
  ctx.beginPath(); ctx.arc(x, y, 6.5 * S * (1 + 0.08 * Math.sin(globalT * 17)), 0, TAU); ctx.fill();
}

function drawMoteGlow(m) {
  const bob = Math.sin(globalT * 3 + m.ph) * 3 * S;
  const r = (m.big ? 30 : 14) * S, x = m.x, y = m.y + bob;
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  if (m.big) { g.addColorStop(0, 'rgba(255,245,200,1)'); g.addColorStop(0.3, 'rgba(255,210,110,0.6)'); g.addColorStop(1, 'rgba(255,170,60,0)'); }
  else { g.addColorStop(0, 'rgba(255,230,170,1)'); g.addColorStop(0.3, 'rgba(255,170,70,0.55)'); g.addColorStop(1, 'rgba(255,120,40,0)'); }
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  if (m.big) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(globalT);
    ctx.strokeStyle = 'rgba(255,230,150,0.8)'; ctx.lineWidth = 1.5 * S;
    for (let i = 0; i < 4; i++) { ctx.rotate(TAU / 8); ctx.beginPath(); ctx.moveTo(-13 * S, 0); ctx.lineTo(13 * S, 0); ctx.stroke(); }
    ctx.restore();
  }
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  const playing = state !== ST.TITLE;
  const sk = reduceMotion ? 0 : shake;
  ctx.save();
  if (sk > 0) ctx.translate(rand(-sk, sk), rand(-sk, sk));

  ctx.drawImage(floor, 0, 0, W, H);

  // title attract: fake ember
  let ex = W / 2, ey = H / 2 + 40 * S, lr = 170 * S;
  if (playing) { ex = P.x; ey = P.y; lr = state === ST.OVER ? Math.max(0, lightRadius() * (1 - overT * 0.6)) : lightRadius(); }
  else { lr *= 1 + 0.03 * Math.sin(globalT * 11); ex += Math.sin(globalT * 0.7) * 60 * S; ey += Math.sin(globalT * 1.1) * 25 * S; }

  // dark smoke (hidden by darkness outside light)
  for (const p of parts) if (!p.add) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1) * 0.8; ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (2 - p.life / p.max), 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
  if (playing) for (const s of shades) shadeBody(s);

  // darkness
  dctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  dctx.globalCompositeOperation = 'source-over';
  dctx.clearRect(0, 0, W, H);
  dctx.fillStyle = 'rgba(2,2,6,0.975)';
  dctx.fillRect(0, 0, W, H);
  dctx.globalCompositeOperation = 'destination-out';
  hole(ex, ey, lr, 1);
  if (playing) {
    for (const m of motes) hole(m.x, m.y, (m.big ? 90 : 38) * S, m.big ? 0.8 : 0.55);
    for (const rg of rings) {
      const a = 1 - rg.r / rg.max;
      const g = dctx.createRadialGradient(rg.x, rg.y, Math.max(0, rg.r - 50 * S), rg.x, rg.y, rg.r + 12 * S);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.75, `rgba(0,0,0,${0.9 * a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.fillStyle = g; dctx.beginPath(); dctx.arc(rg.x, rg.y, rg.r + 12 * S, 0, TAU); dctx.fill();
    }
  } else {
    for (let i = 0; i < 5; i++) {
      const a = globalT * 0.3 + i * TAU / 5;
      hole(W / 2 + Math.cos(a) * Math.min(W, H) * 0.38, H / 2 + 40 * S + Math.sin(a) * Math.min(W, H) * 0.28, 38 * S, 0.55);
    }
  }
  ctx.drawImage(dark, 0, 0, W, H);

  // lights on top
  if (playing) {
    for (const m of motes) drawMoteGlow(m);
    for (const s of shades) shadeEyes(s, Math.hypot(s.x - ex, s.y - ey) < lr * 0.9);
    for (const rg of rings) {
      const a = 1 - rg.r / rg.max;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,200,110,${0.85 * a})`; ctx.lineWidth = 5 * S * a + 1;
      ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r, 0, TAU); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (state !== ST.OVER || overT < 1.5) drawEmber(ex, ey, lr, P.inv);
  } else {
    for (let i = 0; i < 5; i++) {
      const a = globalT * 0.3 + i * TAU / 5;
      drawMoteGlow({ x: W / 2 + Math.cos(a) * Math.min(W, H) * 0.38, y: H / 2 + 40 * S + Math.sin(a) * Math.min(W, H) * 0.28, big: false, ph: i });
    }
    drawEmber(ex, ey, lr, 0);
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const p of parts) if (p.add) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.col;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  for (const f of floaters) text(f.str, f.x, f.y, f.size * S, f.col, 'center', clamp(1.2 - f.t, 0, 1), 700);
  ctx.restore();

  // hurt / low light vignette
  if (state === ST.PLAY && (hurtT > 0 || P.light < 25)) {
    const a = Math.max(hurtT * 1.1, state === ST.PLAY && P.light < 25 ? (0.18 + 0.12 * Math.sin(globalT * 8)) * (1 - P.light / 25) : 0);
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(160,20,10,0)'); g.addColorStop(1, `rgba(160,20,10,${clamp(a, 0, 0.6)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  if (state === ST.TITLE) drawTitle();
  else { drawHud(); if (state === ST.PAUSE) drawPause(); if (state === ST.OVER) drawOver(); }
}

function drawHud() {
  const pad = 16 * S, ts = 18 * S;
  text(String(Math.floor(score)), pad, pad + 8 * S, 26 * S, '#f6e8d2', 'left', 1, 800);
  // light bar
  const bw = Math.min(200 * S, W * 0.38), bh = 7 * S, by = pad + 30 * S;
  ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(pad, by, bw, bh);
  const frac = clamp(P.light / MAXL, 0, 1);
  ctx.fillStyle = P.light < 25 ? (Math.sin(globalT * 10) > 0 ? '#ff5a3a' : '#ff8a4a') : '#ffb35a';
  ctx.fillRect(pad, by, bw * frac, bh);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(pad + bw * (10 / MAXL), by - 2 * S, 1.5, bh + 4 * S);
  text('LIGHT', pad + bw + 8 * S, by + bh / 2, 11 * S, '#a99a86', 'left', 1, 700);

  text('WAVE ' + wave, W / 2, pad + 8 * S, ts, '#d9cbb6', 'center', 1, 700);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(W / 2 - 40 * S, pad + 22 * S, 80 * S, 3 * S);
  ctx.fillStyle = '#d9cbb6'; ctx.fillRect(W / 2 - 40 * S, pad + 22 * S, 80 * S * (waveT / WAVE_LEN), 3 * S);

  text('BEST ' + Math.max(best, Math.floor(score)), W - pad, pad + 8 * S, 14 * S, '#a99a86', 'right', 1, 700);
  if (combo > 1 && state === ST.PLAY) text('x' + combo, P.x, P.y + 30 * S, (13 + combo) * S, '#ffd08a', 'center', clamp(comboT, 0, 1), 800);

  if (waveBanner > 0 && state === ST.PLAY) {
    const a = clamp(waveBanner, 0, 1) * clamp((2.2 - waveBanner) * 3, 0, 1);
    text('WAVE ' + wave, W / 2, H * 0.3, 44 * S, '#f6e8d2', 'center', a, 800);
    const tip = ['Gather embers to keep your light alive', 'Red eyes aim, then dash. Step aside', 'Blue shades split in two', 'Green leeches eat your embers'][wave - 1];
    if (tip) text(tip, W / 2, H * 0.3 + 38 * S, 16 * S, '#cbbfae', 'center', a, 500);
  }
  if (hintT > 0 && state === ST.PLAY && wave === 1 && waveBanner <= 0) {
    text(usingTouch ? 'Drag to move · tap FLARE to burn away shades' : 'Move: mouse or WASD · Flare: click or Space', W / 2, H - 30 * S, 14 * S, '#cbbfae', 'center', clamp(hintT, 0, 1) * 0.9, 500);
  }

  if (usingTouch && state === ST.PLAY) {
    const b = flareBtn(), ready = flareCd <= 0 && P.light > 10;
    ctx.fillStyle = ready ? 'rgba(255,170,80,0.22)' : 'rgba(255,255,255,0.07)';
    ctx.strokeStyle = ready ? 'rgba(255,190,110,0.85)' : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2 * S;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.stroke();
    text('FLARE', b.x, b.y, 13 * S, ready ? '#ffe2b8' : '#8c8478', 'center', 1, 800);
    const pb = pauseBtn();
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.arc(pb.x, pb.y, pb.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#cbbfae'; ctx.fillRect(pb.x - 6 * S, pb.y - 7 * S, 4 * S, 14 * S); ctx.fillRect(pb.x + 2 * S, pb.y - 7 * S, 4 * S, 14 * S);
  }
}

function veil(a) { ctx.fillStyle = `rgba(4,3,8,${a})`; ctx.fillRect(0, 0, W, H); }

function drawTitle() {
  const big = Math.min(64 * S, W / 8.5);
  text('EMBER KEEPER', W / 2, H * 0.2, big, '#ffdcaa', 'center', 1, 800);
  text('Your light is your life. The dark is hungry.', W / 2, H * 0.2 + big * 0.85, Math.min(18 * S, W / 26), '#cbbfae', 'center', 1, 500);
  const by = H * 0.74, ls = Math.min(16 * S, W / 30), lh = ls * 1.7;
  const lines = usingTouch
    ? ['Drag anywhere to move your ember', 'Tap FLARE (or a second finger) to burn away shades', 'Flares cost light, so gather embers to refuel']
    : ['Move: mouse, WASD or arrows, or a gamepad', 'Flare: click, Space or (A). It burns away shades but costs light', 'Gather embers to refuel. P pauses, M mutes'];
  lines.forEach((l, i) => text(l, W / 2, by + i * lh, ls, '#a99a86', 'center', 1, 500));
  const pulse = 0.6 + 0.4 * Math.sin(globalT * 3);
  text(usingTouch ? 'Tap to begin' : 'Click or press Space to begin', W / 2, by - lh * 1.6, Math.min(22 * S, W / 20), '#f6e8d2', 'center', pulse, 700);
  if (best > 0) text('Best ' + best, W / 2, H - 22 * S, 13 * S, '#7d7264', 'center', 1, 600);
}

function drawPause() {
  veil(0.6);
  text('PAUSED', W / 2, H / 2 - 20 * S, 44 * S, '#f6e8d2', 'center', 1, 800);
  text(usingTouch ? 'Tap to resume' : 'Press P, Space or click to resume', W / 2, H / 2 + 24 * S, 16 * S, '#cbbfae', 'center', 1, 500);
  text(muted ? 'Sound off (M)' : 'Sound on (M)', W / 2, H / 2 + 52 * S, 13 * S, '#8c8478', 'center', 1, 500);
}

function drawOver() {
  const a = clamp(overT * 1.5, 0, 1);
  veil(0.55 * a);
  const big = Math.min(46 * S, W / 11);
  text('THE DARK TOOK YOU', W / 2, H * 0.34, big, '#ffb08a', 'center', a, 800);
  text(String(score), W / 2, H * 0.34 + big * 1.4, big * 1.1, '#f6e8d2', 'center', a, 800);
  text(newBest ? 'New best!' : 'Best ' + best, W / 2, H * 0.34 + big * 2.3, 18 * S, newBest ? '#ffe08a' : '#a99a86', 'center', a, 700);
  text('Wave ' + wave + ' · ' + kills + ' shades burned · ' + Math.floor(time) + 's', W / 2, H * 0.34 + big * 2.95, 15 * S, '#a99a86', 'center', a, 500);
  if (overT > 0.8) text(usingTouch ? 'Tap to try again' : 'Click or press Space to try again', W / 2, H * 0.72, 20 * S, '#f6e8d2', 'center', 0.6 + 0.4 * Math.sin(globalT * 3), 700);
}

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  pollPad();
  try { update(dt); render(); }
  catch (err) { console.error(err); }
  requestAnimationFrame(frame);
}

floaters = []; parts = [];
resize();
addEventListener('resize', resize);
reset();
state = ST.TITLE;
render();
requestAnimationFrame(frame);
})();
