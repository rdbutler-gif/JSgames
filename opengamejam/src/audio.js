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
  engGain.gain.setTargetAtTime(active ? 0.05 + s.throttle * 0.07 + boost * 0.05 : 0, t, 0.2);
  const sf = Math.min(1, s.speed / 600);
  rushGain.gain.setTargetAtTime(active ? boost * 0.22 + cruise * 0.32 + sf * 0.03 : 0, t, 0.25);
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

export const sfx = {
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
  bump() { blip(70, 0.35, 'sine', 0.25, 0, 0.6); },
  entry() { blip(60, 3.0, 'sawtooth', 0.12, 0, 2.5); },
};
