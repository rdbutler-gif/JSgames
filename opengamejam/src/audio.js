// Placeholder synth audio (engine, rush, UI). ElevenLabs sound replaces this later.
import { settings } from './settings.js';

let ac = null, master, engOsc = [], engFilter, engGain, rushGain, rushFilter, padGain;

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume().catch(() => {}); return; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; return; }
  master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
  applyVolume();

  engFilter = ac.createBiquadFilter(); engFilter.type = 'lowpass'; engFilter.frequency.value = 300; engFilter.Q.value = 3;
  engGain = ac.createGain(); engGain.gain.value = 0;
  engFilter.connect(engGain); engGain.connect(master);
  engOsc = [[48, 'sawtooth'], [48.4, 'sawtooth'], [96.3, 'triangle']].map(([f, type]) => {
    const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.connect(engFilter); o.start(); return o;
  });

  const len = ac.sampleRate * 2;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < len; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 5; }
  const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
  rushFilter = ac.createBiquadFilter(); rushFilter.type = 'bandpass'; rushFilter.frequency.value = 400; rushFilter.Q.value = 0.6;
  rushGain = ac.createGain(); rushGain.gain.value = 0;
  src.connect(rushFilter); rushFilter.connect(rushGain); rushGain.connect(master); src.start();

  padGain = ac.createGain(); padGain.gain.value = 0.045;
  const pf = ac.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 700;
  pf.connect(padGain); padGain.connect(master);
  [65.4, 98, 130.8, 196, 246.9].forEach((f, i) => {
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = ac.createGain(); g.gain.value = 0.18;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.04 + i * 0.027;
    const lg = ac.createGain(); lg.gain.value = 0.15;
    lfo.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(pf); o.start(); lfo.start();
  });
  // Generated sounds (ElevenLabs), decoded once; synth stand-ins play until they arrive.
  loadSample('laser', 'sfx/laser.mp3');
  loadSample('boom', 'sfx/boom.mp3');
  loadSample('boom-big', 'sfx/boom-big.mp3');
  loadSample('cannon', 'sfx/cannon.mp3');
  loadSample('titan-roar', 'sfx/titan-roar.mp3');
  // the rover's own sound (owner, 2026-11-21): a motor loop and a tyre/ground loop, seamless WAVs
  loadSample('rover-motor', 'sfx/rover-motor.wav');
  loadSample('rover-ground', 'sfx/rover-ground.wav');
}

// Rover sound: two endless loops, started on first use. The motor's pitch follows speed and throttle
// (and jumps with nitro); the ground loop follows speed, fades in the air and almost vanishes on ice.
// Returns false until both loops are loaded, so the caller can fall back to the synth engine.
const loops = {};
function loop(name) {
  if (loops[name]) return loops[name];
  const buf = samples.get(name);
  if (!buf) return null;
  const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
  const g = ac.createGain(); g.gain.value = 0;
  src.connect(g); g.connect(master); src.start();
  return (loops[name] = { src, g });
}
export function updateRover(r, active) {
  if (!ac) return false;
  const m = loop('rover-motor'), gr = loop('rover-ground');
  if (!m || !gr) return false;
  const t = ac.currentTime, duck = voiceDuck();
  const sp = Math.min(1.6, r.speed / 25), thr = Math.min(1, Math.abs(r.throttle));
  m.src.playbackRate.setTargetAtTime(0.72 + sp * 0.5 + thr * 0.12 + (r.nitro ? 0.22 : 0), t, 0.12);
  m.g.gain.setTargetAtTime(active ? (0.16 + thr * 0.22 + Math.min(1, sp) * 0.14 + (r.nitro ? 0.12 : 0)) * duck : 0, t, active ? 0.15 : 0.08);
  const ground = Math.min(1, r.speed / 14) * r.contact * (r.ice ? 0.22 : 1);
  gr.src.playbackRate.setTargetAtTime(0.85 + Math.min(1, sp) * 0.3, t, 0.2);
  gr.g.gain.setTargetAtTime(active ? ground * 0.32 * duck : 0, t, 0.1);
  return true;
}
export function stopRover() {
  if (!ac) return;
  for (const k of Object.keys(loops)) loops[k].g.gain.setTargetAtTime(0, ac.currentTime, 0.08);
}

export function applyVolume() {
  if (!ac) return;
  master.gain.setTargetAtTime(settings.muted ? 0 : settings.volume * 0.7, ac.currentTime, 0.05);
}

export function updateEngine(s, active) {
  if (!ac) return;
  const t = ac.currentTime;
  const cruise = s.cruise === 2 ? 1 : s.cruise === 1 ? s.spool / 1.6 * 0.5 : 0;
  const boost = s.boosting ? 1 : 0;
  const base = 42 + s.throttle * 30 + boost * 22 + cruise * 36;
  engOsc[0].frequency.setTargetAtTime(base, t, 0.12);
  engOsc[1].frequency.setTargetAtTime(base * 1.011, t, 0.12);
  engOsc[2].frequency.setTargetAtTime(base * 2.003, t, 0.12);
  engFilter.frequency.setTargetAtTime(180 + s.throttle * 600 + boost * 900 + cruise * 1400, t, 0.12);
  engGain.gain.setTargetAtTime(active ? (0.05 + s.throttle * 0.07 + boost * 0.05) * voiceDuck() : 0, t, 0.2);
  const sf = Math.min(1, s.speed / 600);
  rushGain.gain.setTargetAtTime(active ? (boost * 0.22 + cruise * 0.32 + sf * 0.03) * voiceDuck() : 0, t, 0.25);
  rushFilter.frequency.setTargetAtTime(260 + sf * 700 + cruise * 1600, t, 0.25);
}

export function blip(freq = 880, dur = 0.08, type = 'square', vol = 0.06, delay = 0, slide = 0) {
  if (!ac || settings.muted) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}

// Heat lance: a held, buzzing hum that rises with the beam's heat. on = firing, k = 0..1 heat.
let lance = null;
export function lanceHum(on, k = 0) {
  if (!ac) return;
  const t = ac.currentTime;
  if (!lance) {
    const g = ac.createGain(); g.gain.value = 0;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.value = 900;
    f.connect(g); g.connect(master);
    const o1 = ac.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 110;
    const o2 = ac.createOscillator(); o2.type = 'square'; o2.frequency.value = 221;
    const lfo = ac.createOscillator(); lfo.frequency.value = 31; const lg = ac.createGain(); lg.gain.value = 18;
    lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
    const len = ac.sampleRate; const buf = ac.createBuffer(1, len, ac.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const n = ac.createBufferSource(); n.buffer = buf; n.loop = true; const ng = ac.createGain(); ng.gain.value = 0.35;
    n.connect(ng); ng.connect(f); o1.connect(f); o2.connect(f);
    o1.start(); o2.start(); lfo.start(); n.start();
    lance = { g, f, o1, o2 };
  }
  clearTimeout(lance.off); if (on) lance.off = setTimeout(() => lanceHum(false), 150); // falls silent if the game stops calling (pause)
  const vol = on && !settings.muted ? 0.07 + 0.05 * k : 0;
  lance.g.gain.setTargetAtTime(vol, t, on ? 0.03 : 0.08);
  lance.f.frequency.setTargetAtTime(700 + 1500 * k, t, 0.1);
  lance.o1.frequency.setTargetAtTime(105 + 60 * k, t, 0.1);
  lance.o2.frequency.setTargetAtTime(211 + 120 * k, t, 0.1);
}

// Filtered noise burst (explosions, impacts). Starts on the call, no pre-delay.
let noiseBuf = null;
export function noise(dur = 0.4, vol = 0.2, freq = 900, endFreq = 120, q = 0.8) {
  if (!ac || settings.muted) return;
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ac.currentTime;
  const src = ac.createBufferSource(); src.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}

// Sample playback for generated sounds (ElevenLabs). Falls back to synth when a file is missing.
const samples = new Map();
export function loadSample(name, url) {
  if (!ac || samples.has(name)) return;
  samples.set(name, null);
  fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
    .then((b) => ac.decodeAudioData(b)).then((buf) => samples.set(name, buf)).catch(() => samples.delete(name));
}
export function playSample(name, vol = 1, rate = 1) {
  const buf = samples.get(name);
  if (!ac || !buf || settings.muted) return false;
  const src = ac.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
  const g = ac.createGain(); g.gain.value = vol;
  src.connect(g); g.connect(master); src.start();
  return true;
}

// Voice lines (public/vo/<id>.mp3). Radio speakers go through a narrow band and a little drive,
// with a hiss bed under them; WREN is the ship's own voice and plays clean. The engine ducks under speech.
const voices = new Map();
export function loadVoice(id) {
  if (!ac || voices.has(id)) return;
  voices.set(id, null);
  fetch('vo/' + id + '.mp3').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
    .then((b) => ac.decodeAudioData(b)).then((buf) => voices.set(id, buf)).catch(() => voices.set(id, false)); // no take: subtitles only
}
// 'none' (never requested), 'loading', 'ready' or 'missing'
export function voiceState(id) { if (!voices.has(id)) return 'none'; const v = voices.get(id); return v === null ? 'loading' : v === false ? 'missing' : 'ready'; }
let driveCurve = null;
export function playVoice(id, radio = false) {
  const buf = voices.get(id);
  if (!ac || !buf) return 0;
  if (settings.muted) return buf.duration;
  const t = ac.currentTime;
  const src = ac.createBufferSource(); src.buffer = buf;
  // takes are normalised to -18 LUFS; the radio chain's drive adds about 3.5 dB, so its gain takes it back
  // to WREN's level (measured offline: the old drive 2.2 x 1.25 ran radio ~8 dB hotter and clipped)
  const g = ac.createGain(); g.gain.value = radio ? 0.62 : 1.0;
  if (radio) {
    if (!driveCurve) { driveCurve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; driveCurve[i] = Math.tanh(x * 1.4) / Math.tanh(1.4); } }
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 420;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    const ws = ac.createWaveShaper(); ws.curve = driveCurve;
    src.connect(hp); hp.connect(ws); ws.connect(lp); lp.connect(g);
    if (!noiseBuf) noise(0.01, 0.0001);
    const h = ac.createBufferSource(); h.buffer = noiseBuf; h.loop = true;
    const hf = ac.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 2400; hf.Q.value = 0.7;
    const hg = ac.createGain(); hg.gain.setValueAtTime(0.0001, t); hg.gain.exponentialRampToValueAtTime(0.018, t + 0.05);
    hg.gain.setValueAtTime(0.018, t + buf.duration); hg.gain.exponentialRampToValueAtTime(0.0001, t + buf.duration + 0.25);
    h.connect(hf); hf.connect(hg); hg.connect(master); h.start(t); h.stop(t + buf.duration + 0.3);
  } else src.connect(g);
  g.connect(master);
  src.start(t);
  duck = Math.max(duck, t + buf.duration);
  return buf.duration;
}
let duck = 0;
export function voiceDuck() { return ac && ac.currentTime < duck ? 0.45 : 1; }

export const sfx = {
  radio() { noise(0.18, 0.08, 3800, 900, 1.2); blip(1800, 0.04, 'square', 0.025, 0.02); },
  shoot() { if (!playSample('laser', 0.35, 0.95 + Math.random() * 0.1)) { blip(1500, 0.09, 'square', 0.035, 0, 0.35); blip(220, 0.06, 'sawtooth', 0.04, 0, 0.5); } },
  enemyShot() { blip(420, 0.16, 'sawtooth', 0.025, 0, 0.6); },
  cannon() { if (!playSample('cannon', 0.3, 0.92 + Math.random() * 0.16) && !playSample('laser', 0.22, 0.55 + Math.random() * 0.08)) { blip(320, 0.08, 'square', 0.05, 0, 0.4); noise(0.08, 0.12, 2500, 400); } },
  roar() { if (!playSample('titan-roar', 0.9)) { noise(1.6, 0.45, 260, 50, 0.7); blip(48, 1.4, 'sawtooth', 0.14, 0, 0.6); } },
  hit() { blip(2400, 0.03, 'square', 0.04); noise(0.08, 0.12, 4000, 1500); },
  explode(big = false) { if (!playSample(big ? 'boom-big' : 'boom', big ? 0.8 : 0.5, 0.9 + Math.random() * 0.2)) { noise(big ? 1.4 : 0.55, big ? 0.6 : 0.35, big ? 1400 : 2200, 60); blip(big ? 55 : 90, big ? 0.9 : 0.35, 'sine', big ? 0.4 : 0.22, 0, 0.4); } },
  playerHit(hull) { noise(0.35, 0.4, 1600, 90); blip(hull ? 110 : 300, 0.25, 'square', 0.08, 0, 0.5); },
  shieldDown() { blip(700, 0.4, 'sawtooth', 0.07, 0, 0.25); },
  dodge() { noise(0.35, 0.12, 600, 3000, 2); },
  wave() { blip(440, 0.12, 'triangle', 0.06); blip(660, 0.12, 'triangle', 0.06, 0.12); blip(880, 0.22, 'triangle', 0.06, 0.24); },
  dive() { blip(1200, 0.5, 'sine', 0.025, 0, 0.4); },
  victory() { [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.3, 'triangle', 0.07, i * 0.13)); },
  pickup() { blip(990, 0.06, 'sine', 0.06); blip(1480, 0.1, 'sine', 0.06, 0.06); },
  ui() { blip(1200, 0.05, 'sine', 0.05); },
  uiMove() { blip(900, 0.03, 'sine', 0.03); },
  comms() { blip(1320, 0.05, 'sine', 0.06); blip(1760, 0.07, 'sine', 0.06, 0.07); },
  target() { blip(660, 0.05, 'triangle', 0.05); blip(990, 0.05, 'triangle', 0.05, 0.05); },
  alert() { blip(520, 0.14, 'square', 0.05); blip(520, 0.14, 'square', 0.05, 0.22); },
  spool() { blip(180, 1.6, 'sawtooth', 0.05, 0, 4); },
  engage() { blip(140, 0.6, 'sawtooth', 0.09, 0, 0.3); },
  drop() { blip(900, 0.5, 'sawtooth', 0.06, 0, 0.2); },
  overheat() { noise(0.9, 0.25, 5000, 300, 1.5); blip(300, 0.5, 'sawtooth', 0.05, 0, 0.4); },
  lanceReady() { blip(880, 0.06, 'triangle', 0.04); blip(1320, 0.08, 'triangle', 0.04, 0.07); },
  bump() { blip(70, 0.35, 'sine', 0.25, 0, 0.6); },
  entry() { blip(60, 3.0, 'sawtooth', 0.12, 0, 2.5); },
  clamp() { blip(55, 0.45, 'sine', 0.3, 0, 0.5); noise(0.3, 0.25, 900, 120, 0.9); blip(48, 0.4, 'square', 0.05, 0.28, 0.6); noise(0.25, 0.2, 700, 100, 0.9); }, // docking clamps close
  buy() { blip(520, 0.06, 'triangle', 0.06); blip(780, 0.08, 'triangle', 0.06, 0.07); noise(0.2, 0.12, 2400, 600, 1.4); blip(1040, 0.16, 'triangle', 0.05, 0.16); },
  nitro() { noise(0.9, 0.35, 500, 2600, 1.6); blip(90, 0.8, 'sawtooth', 0.1, 0, 2.2); },
  denied() { blip(220, 0.12, 'square', 0.05); blip(180, 0.16, 'square', 0.05, 0.12); },
  blink() { noise(0.28, 0.22, 3200, 400, 2); blip(1600, 0.22, 'sine', 0.06, 0, 0.15); blip(420, 0.3, 'triangle', 0.05, 0.05, 2.5); }, // Phase Blink: a snap and a falling shimmer
};
// test hook: current rover loop levels and pitch
export function roverDebug() {
  const o = {};
  for (const k of Object.keys(loops)) o[k] = { gain: +loops[k].g.gain.value.toFixed(3), rate: +loops[k].src.playbackRate.value.toFixed(3) };
  return { ctx: ac ? ac.state : 'none', loaded: ['rover-motor', 'rover-ground'].map((n) => !!samples.get(n)), ...o };
}
