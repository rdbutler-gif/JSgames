// The Last Wayline — Phase I: cockpit flight through the Veyra Cluster.
import '@fontsource/orbitron/700.css';
import '@fontsource/orbitron/900.css';
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import './style.css';

import * as THREE from 'three';

import { settings, saveSettings } from './settings.js';
import { input, initInput, pollInput, endFrame, requestLock, releaseLock } from './input.js';
import { initAudio, applyVolume, updateEngine, sfx } from './audio.js';
import { createWorld } from './world.js';
import { createSquads } from './fighters.js';
import { createShip, updateShip, FLIGHT } from './ship.js';
import { createCockpit } from './cockpit.js';
import { createPost } from './post.js';
import { createHud } from './hud.js';
import { createMenu } from './ui.js';
import { COMMS_NAME } from './data.js';
import { createAssault } from './assault.js';
import { loadModels } from './models.js';
import { createSurface } from './surface.js';
import { SURFACES } from './terrain.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gl');
initInput(canvas);

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const PR = Math.min(window.devicePixelRatio || 1, 1.5);
let renderScale = 1;
renderer.setPixelRatio(PR);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.5, 250000);
const world = createWorld(scene);
world.setPixelRatio(PR);
const squads = createSquads(scene);
const ship = createShip();
const cockpit = createCockpit(renderer);
const hud = createHud($('hud'));
const hudCtx = $('hud').getContext('2d');
const assault = createAssault(scene, camera, { say: (t) => say(t), note: (t, c) => note(t, c) });
assault.setPixelRatio(PR);
loadModels();
const surface = createSurface({ say: (t) => say(t), event: (e) => surfaceEvent(e), relic: (id) => relicSecured(id) });

// WREN's memories unlock by how many relics we hold, whichever planet they came from.
const MEMORIES = [
  {
    title: 'PURPOSE',
    text: 'The relic speaks Warden, and WREN answers it before she knows she is doing it. A memory opens: a foundry hall, and Warden hands fitting a small bright mind into a navigator\'s frame. "She will carry the keys home," one says. "When the road wakes, she will know the way." WREN is quiet for a long moment. "I was not built to fly ships, Runner. I was built to bring these back."',
    after: 'One relic aboard. Scrap Crown will know what we carry now. Back to the Wayfarer.',
  },
  { title: 'TRUTH', text: '(Memory two is a later build step.)', after: 'Two relics aboard.' },
  { title: 'FATE', text: '(Memory three is a later build step.)', after: 'All three relics aboard.' },
];
const RELIC_NAMES = { kessa: 'THE EMBER CORE', vireo: 'THE VEIL LENS', thalor: 'THE RIME COMPASS' };
function relicSecured(id) {
  if (G.relics[id]) return;
  G.relics[id] = true;
  const n = Object.values(G.relics).filter(Boolean).length;
  const m = MEMORIES[n - 1];
  surfaceEvent({
    kicker: 'RELIC ' + n + ' OF 3 · ' + RELIC_NAMES[id] + ' · WREN MEMORY ' + n,
    title: m.title,
    text: m.text,
  }, () => say(m.after));
}

const post = createPost(renderer, scene, camera, cockpit);
const renderPass = post.worldPass;
const bloom = post.bloom;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(PR * renderScale);
  renderer.setSize(w, h, false);
  post.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  cockpit.resize(w / h);
  hud.resize(w, h);
}
addEventListener('resize', resize);
resize();

// ---------- graphics quality ----------
// 0 high (the full look), 1 medium, 2 low. "Auto" starts high (medium on an integrated GPU) and
// steps down, never up, when frames run long for a few seconds. ?hq pins high for headless captures.
const QUALITY = [
  { name: 'HIGH', scale: 1, samples: 4, ao: true, bloomK: 1, shadow: 2048 },
  { name: 'MEDIUM', scale: 0.85, samples: 2, ao: false, bloomK: 0.5, shadow: 1024 },
  { name: 'LOW', scale: 0.6, samples: 0, ao: false, bloomK: 0.35, shadow: 1024 },
];
const quality = (() => {
  let level = -1, slowAvg = 1 / 60, slowT = 0, grace = 4;
  const gpu = (() => { try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''; } catch (e) { return ''; } })();
  const integrated = /intel|uhd|iris|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics|mali|adreno|apple gpu|swiftshader|llvmpipe/i.test(gpu) && !/nvidia|geforce|rtx|gtx|radeon rx/i.test(gpu);
  function apply(l) {
    if (l === level) return;
    level = l; const q = QUALITY[l];
    renderScale = q.scale; resize();
    post.setQuality(q);
    const cs = cockpit.sun.shadow; if (cs.mapSize.x !== q.shadow) { cs.mapSize.set(q.shadow, q.shadow); if (cs.map) { cs.map.dispose(); cs.map = null; } }
    surface.setShadowSize(q.shadow);
    world.setPixelRatio(PR * renderScale); assault.setPixelRatio(PR * renderScale);
    slowT = 0; slowAvg = 1 / 60; grace = 4;
  }
  function fromSettings() {
    const pick = { high: 0, medium: 1, low: 2 }[settings.quality];
    apply(post.pinned ? 0 : pick !== undefined ? pick : Math.max(level < 0 ? 0 : level, integrated ? 1 : 0));
  }
  fromSettings();
  return {
    gpu, get level() { return level; }, fromSettings,
    label() { return settings.quality === 'auto' ? 'AUTO · ' + QUALITY[level].name : QUALITY[level].name; },
    cycle(d) {
      const order = ['auto', 'high', 'medium', 'low'];
      settings.quality = order[(order.indexOf(settings.quality) + (d < 0 ? 3 : 1)) % 4]; saveSettings();
      if (settings.quality === 'auto') level = -1, apply(integrated ? 1 : 0); else fromSettings();
    },
    watch(dt) {
      if (post.pinned || settings.quality !== 'auto' || level >= 2 || dt > 0.25) return;
      if (grace > 0) { grace -= dt; return; } // settle after a change or a load
      slowAvg += (dt - slowAvg) * 0.05;
      slowT = slowAvg > 1 / 52 ? slowT + dt : Math.max(0, slowT - dt * 0.5);
      if (slowT > 2) { apply(level + 1); console.warn('graphics: auto quality lowered to ' + QUALITY[level].name); }
    },
  };
})();

// ---------- game context ----------
const G = {
  state: 'title', time: 0,
  ship, planets: world.planets, squads: squads.list,
  targetIndex: 0,
  relics: { kessa: false, thalor: false, vireo: false },
  comms: [], notes: [], prompt: null,
  device: input.device, mouseStick: input.mouseStick, locked: false,
  shakeOffset: new THREE.Vector3(),
  greeted: new Set(), squadWarn: new Map(),
  entry: null,
  wayshards: 0, assaultsWon: 0, inSurface: false, surfacePlanet: null,
  upgrades: {}, logs: [], inAssault: false, resumeState: 'flight', assaultSquad: null,
};

function say(text) {
  G.comms.push({ from: COMMS_NAME, text, t: 0 });
  if (G.comms.length > 6) G.comms.shift();
  sfx.comms();
}
function note(text, rgb) { G.notes.push({ text, t: G.time, rgb }); if (G.notes.length > 4) G.notes.shift(); }

// ---------- overlays & menus ----------
const show = (id, on) => $(id).classList.toggle('show', on);
const onOff = (v) => (v ? 'ON' : 'OFF');
const pct = (v) => Math.round(v * 100) + '%';
let controlsReturn = 'title';

const titleMenu = createMenu($('title-menu'), () => [
  { label: 'LAUNCH', act: launch },
  { label: 'INVERT Y', value: () => onOff(settings.invertY), adjust: () => { settings.invertY = !settings.invertY; saveSettings(); } },
  { label: 'GRAPHICS', value: () => quality.label(), adjust: (d) => quality.cycle(d) },
  { label: 'CONTROLS', act: () => openControls('title') },
]);
const pauseMenu = createMenu($('pause-menu'), () => [
  { label: 'RESUME', act: resume },
  { label: 'INVERT Y', value: () => onOff(settings.invertY), adjust: () => { settings.invertY = !settings.invertY; saveSettings(); } },
  { label: 'MOUSE MODE', value: () => (settings.mouseMode === 'stick' ? 'VIRTUAL STICK' : 'DIRECT'), adjust: () => { settings.mouseMode = settings.mouseMode === 'stick' ? 'direct' : 'stick'; saveSettings(); } },
  { label: 'MOUSE SENSITIVITY', value: () => pct(settings.mouseSens), adjust: (d) => { settings.mouseSens = THREE.MathUtils.clamp(+(settings.mouseSens + d * 0.1).toFixed(2), 0.3, 2.5); saveSettings(); } },
  { label: 'STICK SENSITIVITY', value: () => pct(settings.stickSens), adjust: (d) => { settings.stickSens = THREE.MathUtils.clamp(+(settings.stickSens + d * 0.1).toFixed(2), 0.4, 2); saveSettings(); } },
  { label: 'VOLUME', value: () => (settings.muted ? 'MUTED' : pct(settings.volume)), adjust: (d) => { settings.muted = false; settings.volume = THREE.MathUtils.clamp(+(settings.volume + d * 0.1).toFixed(2), 0, 1); saveSettings(); applyVolume(); } },
  { label: 'GRAPHICS', value: () => quality.label(), adjust: (d) => quality.cycle(d) },
  { label: 'CONTROLS', act: () => openControls('pause') },
  { label: 'QUIT TO TITLE', act: toTitle },
]);
const controlsMenu = createMenu($('controls-menu'), () => [{ label: 'BACK', act: closeControls }]);
let eventDone = null;
const eventMenu = createMenu($('event-menu'), () => [{ label: 'CONTINUE', act: () => { const f = eventDone; eventDone = null; if (f) f(); } }]);

titleMenu.render();
pauseMenu.render();
controlsMenu.render();
eventMenu.render();

function updateTitleHint() {
  $('title-hint').textContent = input.padName
    ? 'Gamepad ready · mouse & keyboard also work'
    : 'Mouse & keyboard, or connect a gamepad and press any button';
}
updateTitleHint();

function wantsMouse() { return input.device !== 'gamepad'; }

function launch() {
  initAudio();
  show('title', false);
  G.state = 'flight';
  ship.throttle = 0.4;
  if (wantsMouse()) requestLock();
  if (!G.launched) {
    G.launched = true;
    setTimeout(() => say('Systems green, Runner. The chart marks three Warden vaults: Kessa, Vireo and Thalor. Three keys. One road home.'), 900);
    setTimeout(() => G.state === 'flight' && say(input.device === 'gamepad'
      ? 'Long hops? Press X for cruise drive. LB cycles your nav target.'
      : 'Long hops? Press C for cruise drive. Tab cycles your nav target.'), 7500);
  }
}
function pause() {
  if (G.state !== 'flight' && G.state !== 'assault' && G.state !== 'surface') return;
  G.resumeState = G.state;
  G.state = 'paused';
  releaseLock();
  pauseMenu.reset(); pauseMenu.render();
  show('pause', true);
}
function resume() {
  show('pause', false);
  G.state = G.resumeState || 'flight';
  initAudio();
  if (wantsMouse()) requestLock();
}
function toTitle() {
  show('pause', false);
  if (G.inSurface) { surface.exit(); G.inSurface = false; renderPass.scene = scene; }
  if (G.inAssault) { assault.stop(); G.inAssault = false; if (G.assaultSquad) G.assaultSquad.release(false); G.assaultSquad = null; }
  show('title', true);
  G.state = 'title';
  titleMenu.reset(); titleMenu.render();
  updateTitleHint();
}
function openControls(from) {
  controlsReturn = from;
  show(from === 'title' ? 'title' : 'pause', false);
  show('controls', true);
  G.state = 'controls';
}
function closeControls() {
  show('controls', false);
  if (controlsReturn === 'title') { show('title', true); G.state = 'title'; }
  else { show('pause', true); G.state = 'paused'; }
}
function showEvent(kicker, title, textBody, done) {
  $('event-kicker').textContent = kicker;
  $('event-title').textContent = title;
  $('event-text').textContent = textBody;
  eventDone = done;
  eventMenu.reset(); eventMenu.render();
  releaseLock();
  show('event', true);
  G.state = 'event';
}
function closeEvent() {
  show('event', false);
  G.state = 'flight';
  if (wantsMouse()) requestLock();
}

let wasLocked = false;
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (wasLocked && !locked && (G.state === 'flight' || G.state === 'assault' || G.state === 'surface')) pause();
  wasLocked = locked;
});
canvas.addEventListener('mousedown', () => {
  if ((G.state === 'flight' || G.state === 'assault' || G.state === 'surface') && !input.locked) requestLock();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// ---------- flight logic ----------
function cruiseBlock(margin) {
  for (const p of G.planets) {
    const d = p.center.distanceTo(ship.pos) - p.data.R;
    if (d < p.data.R * 1.6 + margin) return { reason: 'GRAVITY WELL · ' + p.data.name, planet: p };
  }
  for (const sq of G.squads) {
    if (sq.state === 'patrol' && sq.pos.distanceTo(ship.pos) < 2400 + margin) return { reason: 'HOSTILES IN RANGE', squad: sq };
  }
  return null;
}

function handleCruise(dt) {
  if (input.pressed.has('cruise')) {
    if (ship.cruise === 0) {
      const b = cruiseBlock(0);
      if (b) { note('CRUISE BLOCKED · ' + b.reason, '255,120,90'); sfx.alert(); }
      else { ship.cruise = 1; ship.spool = 0; note('CRUISE DRIVE SPOOLING'); sfx.spool(); }
    } else {
      ship.cruise = 0; note('CRUISE DISENGAGED'); sfx.drop();
    }
  }
  if (ship.cruise === 1) {
    ship.spool += dt;
    if (cruiseBlock(0)) { ship.cruise = 0; note('CRUISE ABORTED', '255,120,90'); }
    else if (ship.spool >= FLIGHT.spoolTime) { ship.cruise = 2; note('CRUISE ENGAGED', '255,179,90'); sfx.engage(); ship.shake = 1.2; }
  } else if (ship.cruise === 2) {
    const b = cruiseBlock(2600);
    if (b) {
      ship.cruise = 0; ship.shake = 1.4; sfx.drop();
      note('DROPPED FROM CRUISE · ' + b.reason, '255,179,90');
      if (b.squad) say('Scrap Crown ahead. I pulled us out of cruise. Engage them, or slip past.');
    }
  }
}

function handleCollisions() {
  for (const p of G.planets) {
    const min = p.data.R * 1.015;
    const n = new THREE.Vector3().subVectors(ship.pos, p.center);
    const d = n.length();
    if (d < min) {
      n.divideScalar(d || 1);
      ship.pos.copy(p.center).addScaledVector(n, min);
      const vn = ship.vel.dot(n);
      if (vn < 0) ship.vel.addScaledVector(n, -vn * 1.4);
      ship.speed *= 0.4;
      ship.shake = 1.5;
      if (ship.cruise) ship.cruise = 0;
      sfx.bump();
    }
  }
}

const titleCase = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
// WREN's contact call: who, how dangerous, and what that means for us right now.
function assessSquad(sq) {
  const who = 'Scrap Crown, ' + titleCase(sq.name) + '. Threat ' + ['', 'one', 'two', 'three', 'four', 'five'][sq.level] + '.';
  const hullPct = Math.round(ship.hull * 100);
  const weak = ship.hull < 0.5;
  if (sq.level >= 4) return who + ' Hunters. They know what we are carrying.' + (weak ? ' Hull at ' + hullPct + '%. Run.' : ' This one will hurt.');
  if (sq.level === 3) return who + ' They are escorting a Warbreaker. Hard fight, good haul.' + (weak ? ' Not at ' + hullPct + '% hull. I would slip past.' : '');
  if (sq.level === 2) return who + ' ' + sq.size + ' fighters, lancers likely.' + (weak ? ' Hull is at ' + hullPct + '%. Your call.' : ' Worth it if you want Wayshards.');
  return who + ' ' + sq.size + ' light fighters. Easy Wayshards.';
}

function updatePrompts() {
  G.prompt = null;
  if (ship.cruise !== 0) return;
  let best = null, bd = Infinity;
  for (const sq of G.squads) {
    if (sq.state !== 'patrol') continue;
    const d = sq.pos.distanceTo(ship.pos);
    if (d < 3200) {
      const last = G.squadWarn.get(sq.id) || -999;
      if (G.time - last > 40) { G.squadWarn.set(sq.id, G.time); say(assessSquad(sq)); sfx.alert(); }
    }
    if (d < 1700 && d < bd) { bd = d; best = sq; }
  }
  if (best) { G.prompt = { type: 'engage', squad: best, label: 'ENGAGE ' + best.name + ' · THREAT ' + best.level }; return; }
  for (const p of G.planets) {
    const surf = p.center.distanceTo(ship.pos) - p.data.R;
    if (surf < p.data.R * 2.2 && !G.greeted.has(p.data.id)) {
      G.greeted.add(p.data.id);
      say(titleCase(p.data.name) + ' ahead. The vault signal is strong: the ' + p.data.relic + '. Take us down when you are ready.');
    }
    if (surf < p.data.R * 0.9) { G.prompt = { type: 'land', planet: p, label: 'BEGIN LANDING · ' + p.data.name }; return; }
  }
}

function acceptPrompt() {
  const pr = G.prompt;
  if (!pr) return;
  if (pr.type === 'engage') {
    sfx.engage();
    const sq = pr.squad;
    startAssault(sq);
  } else if (pr.type === 'land') {
    startEntry(pr.planet);
  }
}

// ---------- Phase II ----------
function startAssault(sq) {
  G.state = 'assault-in';
  ship.cruise = 0;
  flash(() => {
    sq.engage();
    G.assaultSquad = sq;
    G.inAssault = true;
    // Fight where we met them, facing the way we were flying.
    assault.start({ origin: ship.pos, quat: ship.quat, level: sq.level, shield: ship.shield, hull: ship.hull, squadName: sq.name });
    G.state = 'assault';
    if (wantsMouse()) requestLock();
  });
}
function endAssault(r) {
  G.state = 'assault-out';
  flash(() => {
    assault.stop();
    G.inAssault = false;
    const sq = G.assaultSquad; G.assaultSquad = null;
    sq.release(r.win);
    ship.vel.set(0, 0, 0); ship.ang.set(0, 0, 0); ship.speed = 60; ship.throttle = 0.3;
    camera.fov = ship.fov; camera.updateProjectionMatrix();
    if (r.win) {
      G.assaultsWon++;
      G.wayshards += r.wayshards;
      ship.shield = 1; ship.hull = Math.min(1, Math.max(0.6, r.hull + 0.15));
      showEvent('PHASE II · VICTORY', sq.name + ' BROKEN',
        `Kills ${r.kills} · score ${r.score}${r.hitsTaken === 0 ? ' · flawless' : ''}. You recovered ${r.wayshards} Wayshards (${G.wayshards} in the hold). Field repairs patched the hull to ${Math.round(ship.hull * 100)}%. Wayshards buy upgrades at Lantern Station.`,
        () => { closeEvent(); note(sq.name + ' SCATTERED', '255,211,106'); say('Wayshards stowed. Good flying, Runner.'); });
    } else {
      G.wayshards += Math.round(r.wayshards / 2);
      ship.shield = 0.3; ship.hull = 0.25;
      showEvent('PHASE II · DEFEAT', 'EMERGENCY JUMP',
        `WREN pulled us out with the hull at 25%. You kept ${Math.round(r.wayshards / 2)} Wayshards. ${sq.name} will regroup. Shields recharge as you fly, and repair drones patch the hull back to 60%.`,
        () => { closeEvent(); note('HULL CRITICAL · AVOID CONTACT', '255,77,109'); });
    }
  });
}

function flash(after) {
  const f = $('fade');
  f.style.opacity = '1';
  setTimeout(() => { after(); f.style.opacity = '0'; }, 420);
}

// atmospheric entry (placeholder for the Phase III landing)
const qLook = new THREE.Quaternion();
const m4 = new THREE.Matrix4();
function startEntry(p) {
  G.state = 'entry';
  G.entry = { planet: p, t: 0 };
  ship.cruise = 0;
  sfx.entry();
  say('Entry corridor locked. Hold on, this gets bumpy.');
}
function updateEntry(dt) {
  const e = G.entry, p = e.planet;
  e.t += dt;
  m4.lookAt(ship.pos, p.center, new THREE.Vector3(0, 1, 0).applyQuaternion(ship.quat));
  qLook.setFromRotationMatrix(m4);
  ship.quat.slerp(qLook, Math.min(1, dt * 1.5));
  ship.speed = THREE.MathUtils.lerp(ship.speed, 260, dt * 2);
  ship.vel.copy(new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quat)).multiplyScalar(ship.speed);
  const surf = p.center.distanceTo(ship.pos) - p.data.R;
  if (surf > p.data.R * 0.05) ship.pos.addScaledVector(ship.vel, dt);
  ship.shake = Math.min(2.5, 0.4 + e.t * 0.7);
  ship.fov += (88 - ship.fov) * dt;
  const heat = Math.min(1, e.t / 2.6);
  $('heat').style.opacity = String(heat * (0.75 + 0.25 * Math.sin(G.time * 30)));
  bloom.strength = 0.5 + heat * 0.8;
  if (e.t > 3.4) {
    $('heat').style.opacity = '0';
    bloom.strength = 0.5;
    const out = new THREE.Vector3().subVectors(ship.pos, p.center).normalize();
    if (SURFACES[p.data.id]) { G.entry = null; enterSurface(p, out); return; }
    showEvent('PHASE III', 'SURFACE OF ' + p.data.name, `This is where the rover expedition on ${p.data.name.charAt(0) + p.data.name.slice(1).toLowerCase()} begins: mini-quests, upgrades and the ${p.data.relic}. It's the third build step. Returning you to orbit for now.`, () => {
      ship.pos.copy(p.center).addScaledVector(out, p.data.R * 2.3);
      m4.lookAt(ship.pos, ship.pos.clone().add(out), new THREE.Vector3(0, 1, 0));
      ship.quat.setFromRotationMatrix(m4);
      ship.speed = 120; ship.vel.set(0, 0, 0); ship.throttle = 0.5; ship.ang.set(0, 0, 0);
      G.entry = null;
      closeEvent();
    });
  }
}

// ---------- Phase III: the rover ----------
function enterSurface(p, out) {
  G.state = 'surface-in';
  flash(() => {
    G.surfacePlanet = { planet: p, out };
    surface.enter(p.data.id, G.upgrades, G.relics);
    renderPass.scene = surface.scene;
    G.inSurface = true;
    camera.fov = 68; camera.updateProjectionMatrix();
    G.state = 'surface';
    if (wantsMouse()) requestLock();
  });
}
// A card over the surface (pickups, the vault door) that returns to driving, not to orbit.
function surfaceEvent(e, done) {
  setTimeout(() => {
    if (G.state !== 'surface') return;
    showEvent(e.kicker, e.title, e.text, () => {
      show('event', false);
      G.state = 'surface';
      if (wantsMouse()) requestLock();
      if (done) done();
    });
  }, 900);
}
function leaveSurface() {
  G.state = 'surface-out';
  sfx.engage();
  flash(() => {
    surface.exit();
    renderPass.scene = scene;
    G.inSurface = false;
    const { planet: p, out } = G.surfacePlanet;
    ship.pos.copy(p.center).addScaledVector(out, p.data.R * 2.3);
    m4.lookAt(ship.pos, ship.pos.clone().add(out), new THREE.Vector3(0, 1, 0));
    ship.quat.setFromRotationMatrix(m4);
    ship.speed = 120; ship.vel.set(0, 0, 0); ship.throttle = 0.5; ship.ang.set(0, 0, 0); ship.fov = 75;
    camera.fov = 75; camera.updateProjectionMatrix();
    G.state = 'flight';
    say('Back in orbit. The rover is stowed.');
  });
}

// ---------- main loop ----------
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const qRoll = new THREE.Quaternion();
const headWorld = new THREE.Vector3();
const ZERO = new THREE.Vector3();

function step(dt) {
  G.time += dt;
  pollInput(dt);
  if (import.meta.env.DEV && window.__bot) window.__bot(input, G);
  G.device = input.device;
  G.locked = input.locked;
  for (const c of G.comms) c.t += dt;
  const P = input.pressed;

  switch (G.state) {
    case 'title':
      titleMenu.nav(P);
      if (P.size || input.device === 'gamepad') updateTitleHint();
      updateShip(ship, input, dt, { autopilot: true });
      ship.speed = 35; ship.throttle = 0.15;
      break;
    case 'paused':
      if (P.has('pause') || P.has('back')) resume();
      else pauseMenu.nav(P);
      break;
    case 'controls':
      if (P.has('back') || P.has('pause') || P.has('accept')) closeControls();
      break;
    case 'event':
      eventMenu.nav(P);
      break;
    case 'entry':
      updateEntry(dt);
      break;
    case 'surface': {
      if (P.has('pause')) { pause(); break; }
      const r = surface.update(dt, input, camera);
      if (r && r.type === 'orbit') leaveSurface();
      if (r && r.type === 'vault') {
        sfx.engage();
        showEvent('PHASE III · KESSA', 'THE VAULT OPENS', 'The door reads the Forgeplate and grinds aside. Heat rolls up out of the shaft, and something old and enormous climbs with it: the foundry guardian, still keeping the Ember Core after all these years.', () => {
          show('event', false); G.state = 'surface'; if (wantsMouse()) requestLock();
          surface.wakeGuardian();
        });
      }
      break;
    }
    case 'assault': {
      if (P.has('pause')) { pause(); break; }
      const r = assault.update(dt, input);
      if (r) endAssault(r);
      break;
    }
    case 'flight': {
      if (P.has('pause')) { pause(); break; }
      if (P.has('target')) {
        G.targetIndex = (G.targetIndex + 1) % G.planets.length;
        sfx.target(); note('NAV TARGET · ' + G.planets[G.targetIndex].data.name, '255,211,106');
      }
      if (P.has('zero')) ship.throttle = 0;
      handleCruise(dt);
      updateShip(ship, input, dt);
      handleCollisions();
      updatePrompts();
      if (P.has('accept')) acceptPrompt();
      break;
    }
  }

  // Threat rises once we hold a relic: Orrick knows what we carry.
  squads.setEscalation(Object.values(G.relics).some(Boolean) ? 1 : 0);
  squads.update(dt);
  if (G.inSurface) {
    const rv = surface.rover;
    updateEngine({ cruise: 0, spool: 0, boosting: false, throttle: Math.min(1, Math.abs(input.drive) * 0.5 + Math.abs(rv.speed) / 30), speed: Math.abs(rv.speed) * 8 }, G.state === 'surface');
  } else updateEngine(ship, G.state === 'flight' || G.state === 'entry' || G.inAssault);
  // shields recharge slowly in flight
  if (G.state === 'flight') {
    ship.shield = Math.min(1, ship.shield + dt * 0.02);
    if (ship.hull < 0.6) ship.hull = Math.min(0.6, ship.hull + dt * 0.003); // repair drones, up to 60%
  }

  if (G.inSurface) return;
  if (G.inAssault) { world.update(camera.position, ZERO, dt); return; }
  // camera = ship pose + head motion + shake
  const sh = ship.shake;
  G.shakeOffset.set((Math.random() - 0.5) * sh * 0.012, (Math.random() - 0.5) * sh * 0.012, 0);
  headWorld.copy(ship.head).add(G.shakeOffset).applyQuaternion(ship.quat);
  camera.position.copy(ship.pos).add(headWorld);
  qRoll.setFromAxisAngle(AXIS_Z, ship.headRoll);
  camera.quaternion.copy(ship.quat).multiply(qRoll);
  if (Math.abs(camera.fov - ship.fov) > 0.01) { camera.fov = ship.fov; camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld();

  world.update(camera.position, ship.vel, dt);
  cockpit.update(G, dt);
}

function draw() {
  post.setMode(G.inSurface ? 'surface' : G.inAssault ? 'assault' : 'flight');
  const inCockpit = !G.inSurface && !G.inAssault;
  post.render(G.time, inCockpit ? (ship.cruise === 2 ? 1 : ship.cruise === 1 ? 0.35 : ship.boosting ? 0.6 : 0) : 0, lastDt);
  renderer.setRenderTarget(null);
  hud.draw(G, camera);
  if (G.inAssault) assault.drawHud(hudCtx, window.innerWidth, window.innerHeight, input.device);
  if (G.inSurface) surface.drawHud(hudCtx, window.innerWidth, window.innerHeight, G, input.device);
}

let last = performance.now(), lastDt = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  lastDt = dt;
  try { step(dt); draw(); quality.watch(dt); } catch (err) { console.error(err); }
  endFrame();
}

// Draw a first frame right away, then redraw screens once fonts arrive.
step(0);
cockpit.redrawAll(G);
draw();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => cockpit.redrawAll(G));
document.fonts && document.fonts.load('600 20px "Chakra Petch"').then(() => cockpit.redrawAll(G)).catch(() => {});
requestAnimationFrame(frame);
if (import.meta.env.DEV) window.__relic = { G, ship, assault, startAssault, surface, enterSurface, step, draw, input, camera, cockpit, post };
