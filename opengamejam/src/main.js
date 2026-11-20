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
import { initAudio, applyVolume, updateEngine, sfx, loadVoice, playVoice, voiceState } from './audio.js';
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
import { createStation, BAY_MOUTH_Z, BAY_Y } from './station.js';
import { createLightPool } from './lightpool.js';
import { createStory, createTutorial, LINES } from './story.js';
import { loadProgress, hasProgress, saveProgress, clearProgress } from './progress.js';
import { cloneModel, onModel } from './models.js';
import { createHub, airText } from './hub.js';
import { eff, tier, UPGRADE } from './workshop.js';

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
const camera = new THREE.PerspectiveCamera(75, 1, 1, 420000); // the worlds are ~110,000 u from Lantern and ~190,000 u apart
const world = createWorld(scene);
const station = createStation(scene);
world.setPixelRatio(PR);
const squads = createSquads(scene);
const ship = createShip();
const cockpit = createCockpit(renderer);
const hud = createHud($('hud'));
const hudCtx = $('hud').getContext('2d');
const assault = createAssault(scene, camera, { say: (t) => say(t), note: (t, c) => note(t, c) });
assault.setPixelRatio(PR);
loadModels();
const surface = createSurface({
  say: (t) => say(t),
  event: (e) => { surfaceEvent(e); autosave(true); }, // pickups (the Forgeplate)
  relic: (id) => relicSecured(id),
  shards: (n) => { G.wayshards += n; },
});

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
  autosave(true);
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
  heard: new Set(), tutorialDone: false, lanternDark: false, task: null, waypoint: null, lineTag: false,
  tripLore: false, tripT: 0, lastLoreT: -999, saveT: 0,
  where: 'space', surfaceId: null, surfaceOut: null, tutCheckpoint: null,
  air: 14, scrubbers: 0, briefed: new Set(), dockCount: 0, // Lantern's reserve air (days), Workshop scrubber crates, briefings heard
};
// nav targets: the three worlds, then Lantern (its dock bay mouth)
const LANTERN_NAV = world.planets.length;
const navCount = () => world.planets.length + 1;
const bayMouth = () => station.toWorld(new THREE.Vector3(0, BAY_Y, BAY_MOUTH_Z), new THREE.Vector3());
G.lanternNav = LANTERN_NAV;
G.bayMouth = bayMouth;
const AIR_DAY = 300; // seconds of play per day of Lantern's reserve air (14 days ≈ 70 minutes)

// Saves happen on events (loud: the corner shows PROGRESS SAVED) and every few seconds in play (quiet).
let savedT = null;
function autosave(loud) {
  G.tutCheckpoint = tutorial.checkpoint;
  saveProgress(G, ship);
  if (loud) { $('saved').classList.add('on'); clearTimeout(savedT); savedT = setTimeout(() => $('saved').classList.remove('on'), 1800); }
}
// Workshop upgrades that live on the ship itself (the fight and the rover read theirs when they start)
function applyUpgrades() {
  ship.boostSecs = eff(G.upgrades, 'cell', 'boostSecs');
  ship.boostRecharge = eff(G.upgrades, 'cell', 'recharge');
}
// three real lights shared by the station's lamps (and anything else in space that wants one)
G.station = station;
const spaceLights = createLightPool(scene, 3); spaceLights.collect();

const story = createStory({ G, sfx, playVoice, voiceState });
const tutorial = createTutorial({ G, ship, station, scene, story, sfx, input, planets: world.planets, save: () => autosave(true) });
const hub = createHub({ G, ship, station, scene, story, sfx, $, camera, show: (id, on) => show(id, on), applyUpgrades, autosave, launch: () => launchFromHub() });

// ---------- title scene: the Wayfarer, with the rover slung under it, off Lantern Station ----------
const titleRig = new THREE.Group(); scene.add(titleRig);
// the ship sits well off the station, the camera on its far side, so Lantern hangs behind it; the look point
// is pushed left so the ship fills the right half, clear of the menu
const TITLE = (() => {
  const at = new THREE.Vector3(-760, 150, -1350), d = at.clone().normalize();
  const side = new THREE.Vector3(-d.z, 0, d.x).normalize(); // swing round so Lantern sits off to one side behind the ship
  const cam = at.clone().addScaledVector(d, 30).addScaledVector(side, -9).add(new THREE.Vector3(0, -4, 0));
  const fwd = at.clone().sub(cam).normalize(), right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  return { at, cam, look: at.clone().addScaledVector(right, -10).add(new THREE.Vector3(0, -1, 0)) };
})();
titleRig.position.copy(TITLE.at);
const titleShip = new THREE.Group(); titleRig.add(titleShip);
onModel('player', () => { const m = cloneModel('player'); titleShip.add(m); });
onModel('rover', () => { const r = cloneModel('rover'); r.scale.setScalar(1.35); r.position.set(0, -4.6, 1.5); titleShip.add(r); });
const titleKey = new THREE.PointLight('#9fdcff', 900, 120, 1.6); titleKey.position.set(-20, 18, -30); titleRig.add(titleKey);
const titleRim = new THREE.PointLight('#ffb070', 700, 120, 1.6); titleRim.position.set(30, 6, 26); titleRig.add(titleRim);
function titleCamera(dt) {
  titleShip.rotation.y += dt * 0.12;
  titleShip.position.y = Math.sin(G.time * 0.6) * 0.6;
  camera.position.copy(TITLE.cam);
  camera.lookAt(TITLE.look);
  if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld();
}
const inTitle = () => G.state === 'title' || G.state === 'intro' || ((G.state === 'settings' || G.state === 'controls') && menuReturn === 'title');

function say(text) { story.say(text); }
function note(text, rgb) { G.notes.push({ text, t: G.time, rgb }); if (G.notes.length > 4) G.notes.shift(); }

// ---------- overlays & menus ----------
const show = (id, on) => $(id).classList.toggle('show', on);
const onOff = (v) => (v ? 'ON' : 'OFF');
const pct = (v) => Math.round(v * 100) + '%';
let menuReturn = 'title';
let confirmNew = false;
function cancelNew() { confirmNew = false; $('title-confirm').textContent = ''; titleMenu.reset(); titleMenu.render(); }

const titleMenu = createMenu($('title-menu'), () => {
  if (confirmNew) return [
    { label: 'CANCEL', act: cancelNew },
    { label: 'ERASE AND START OVER', act: () => { confirmNew = false; $('title-confirm').textContent = ''; newGame(); } },
  ];
  const saved = hasProgress();
  return [
    saved ? { label: 'CONTINUE', act: continueGame } : { label: 'PLAY', act: newGame },
    ...(saved ? [{ label: 'NEW GAME', act: () => { confirmNew = true; $('title-confirm').textContent = 'THIS ERASES YOUR SAVED PROGRESS'; titleMenu.reset(); titleMenu.render(); } }] : []),
    { label: 'SETTINGS', act: () => openSettings('title') },
    { label: 'CONTROLS', act: () => openControls('title') },
  ];
});
const pauseMenu = createMenu($('pause-menu'), () => [
  { label: 'RESUME', act: resume },
  { label: 'SETTINGS', act: () => openSettings('pause') },
  { label: 'CONTROLS', act: () => openControls('pause') },
  ...(tutorial.active ? [{ label: 'SKIP TUTORIAL', act: () => { tutorial.skip(); resume(); } }] : []),
  { label: 'QUIT TO TITLE', act: toTitle },
]);
const settingsMenu = createMenu($('settings-menu'), () => [
  { label: 'INVERT Y', value: () => onOff(settings.invertY), adjust: () => { settings.invertY = !settings.invertY; saveSettings(); } },
  { label: 'MOUSE MODE', value: () => (settings.mouseMode === 'stick' ? 'VIRTUAL STICK' : 'DIRECT'), adjust: () => { settings.mouseMode = settings.mouseMode === 'stick' ? 'direct' : 'stick'; saveSettings(); } },
  { label: 'MOUSE SENSITIVITY', value: () => pct(settings.mouseSens), adjust: (d) => { settings.mouseSens = THREE.MathUtils.clamp(+(settings.mouseSens + d * 0.1).toFixed(2), 0.3, 2.5); saveSettings(); } },
  { label: 'STICK SENSITIVITY', value: () => pct(settings.stickSens), adjust: (d) => { settings.stickSens = THREE.MathUtils.clamp(+(settings.stickSens + d * 0.1).toFixed(2), 0.4, 2); saveSettings(); } },
  { label: 'VOLUME', value: () => (settings.muted ? 'MUTED' : pct(settings.volume)), adjust: (d) => { settings.muted = false; settings.volume = THREE.MathUtils.clamp(+(settings.volume + d * 0.1).toFixed(2), 0, 1); saveSettings(); applyVolume(); } },
  { label: 'GRAPHICS', value: () => quality.label(), adjust: (d) => quality.cycle(d) },
  { label: 'BACK', act: closeSettings },
]);
const controlsMenu = createMenu($('controls-menu'), () => [{ label: 'BACK', act: closeControls }]);
let eventDone = null;
const eventMenu = createMenu($('event-menu'), () => [{ label: 'CONTINUE', act: () => { const f = eventDone; eventDone = null; if (f) f(); } }]);

titleMenu.render();
pauseMenu.render();
settingsMenu.render();
controlsMenu.render();
eventMenu.render();

function updateTitleHint() {
  $('title-hint').textContent = input.padName
    ? 'Gamepad ready · mouse & keyboard also work'
    : 'Mouse & keyboard, or connect a gamepad and press any button';
}
updateTitleHint();

function wantsMouse() { return input.device !== 'gamepad'; }

// ---------- starting play ----------
function startAudio() {
  initAudio();
  for (const id of Object.keys(LINES)) loadVoice(id);
}
function resetRun() {
  Object.assign(G, { relics: { kessa: false, thalor: false, vireo: false }, upgrades: {}, wayshards: 0, assaultsWon: 0, logs: [],
    heard: new Set(), tutorialDone: false, lanternDark: false, task: null, waypoint: null, lineTag: false, targetIndex: 0,
    greeted: new Set(), squadWarn: new Map(), comms: [], notes: [], prompt: null, tripLore: false, lastLoreT: -999,
    where: 'space', surfaceId: null, surfaceOut: null, tutCheckpoint: null, air: 14, scrubbers: 0, briefed: new Set(), dockCount: 0 });
  applyUpgrades();
  story.clear();
  station.setLineAlive(true, true);
  ship.hull = 1; ship.shield = 1; ship.boostEnergy = 1;
}
// in the dock bay, clamps shut, engines idle
function dockShip() {
  station.dockPose(ship.pos, ship.quat);
  station.snapClamps(false);
  ship.vel.set(0, 0, 0); ship.ang.set(0, 0, 0); ship.speed = 0; ship.throttle = 0; ship.cruise = 0; ship.fov = 75;
}
function newGame() {
  startAudio();
  clearProgress();
  resetRun();
  dockShip();
  show('title', false);
  playIntro(() => beginFlight(() => tutorial.start()));
}
function continueGame() {
  startAudio();
  const p = loadProgress();
  resetRun();
  if (p) {
    Object.assign(G, { relics: { ...G.relics, ...p.relics }, upgrades: p.upgrades || {}, wayshards: p.wayshards || 0, assaultsWon: p.assaultsWon || 0,
      heard: new Set(p.heard || []), tutorialDone: !!p.tutorialDone, lanternDark: !!p.lanternDark, targetIndex: (p.targetIndex || 0) % navCount(),
      air: Number.isFinite(p.air) ? p.air : 14, scrubbers: p.scrubbers || 0, briefed: new Set(p.briefed || []) });
    station.setLineAlive(!G.lanternDark, true);
    applyUpgrades();
  }
  show('title', false);
  const restorePose = () => {
    ship.pos.fromArray(p.ship.pos); ship.quat.fromArray(p.ship.quat); ship.hull = p.ship.hull || 1;
    ship.vel.set(0, 0, 0); ship.ang.set(0, 0, 0); ship.speed = 0; ship.throttle = 0; ship.cruise = 0; ship.fov = 75;
  };
  if (!G.tutorialDone) {
    // a save from the radio call on resumes that lesson where we were; earlier ones restart from the dock
    if (p && p.tut !== null && p.tut !== undefined && p.ship) { restorePose(); const k = p.tut; beginFlight(() => tutorial.resume(k)); }
    else { dockShip(); beginFlight(() => tutorial.start()); }
    return;
  }
  // back on the landing pad
  const sp = p && p.where === 'surface' && G.planets.find((pl) => pl.data.id === p.surfaceId);
  if (sp && SURFACES[sp.data.id]) {
    const out = new THREE.Vector3().fromArray(p.surfaceOut || [0, 1, 0]).normalize();
    ship.pos.copy(sp.center).addScaledVector(out, sp.data.R * 1.05);
    for (const pl of G.planets) if (pl.center.distanceTo(ship.pos) < pl.data.R * 4) G.greeted.add(pl.data.id);
    G.state = 'surface-in';
    enterSurface(sp, out);
    return;
  }
  // docked at Lantern
  if (p && p.where === 'hub') {
    dockShip(); station.snapClamps(false);
    G.state = 'hub-in';
    flash(() => openHub(true));
    return;
  }
  if (p && p.ship) restorePose();
  else { dockShip(); station.snapClamps(true); }
  for (const pl of G.planets) if (pl.center.distanceTo(ship.pos) < pl.data.R * 4) G.greeted.add(pl.data.id);
  beginFlight(() => story.line('welcome'));
}
function beginFlight(then) {
  flash(() => {
    G.state = 'flight';
    camera.fov = ship.fov; camera.updateProjectionMatrix();
    if (wantsMouse()) requestLock();
    setTimeout(then, 1200);
  });
}
// three short lines on black, then the cockpit
let introT = -1, introDone = null, introStart = 0;
function playIntro(done) {
  G.state = 'intro'; introT = 0; introDone = done; introStart = performance.now();
  for (let i = 0; i < 3; i++) $('intro-' + i).classList.remove('on');
  show('intro', true);
}
function updateIntro(dt, P) {
  introT = (performance.now() - introStart) / 1000; // wall clock: a slow frame never stretches the card
  for (let i = 0; i < 3; i++) if (introT > 0.4 + i * 1.9) $('intro-' + i).classList.add('on');
  if (introT > 7.6 || (introT > 0.5 && (P.has('accept') || P.has('back') || P.has('pause') || P.size > 0))) {
    show('intro', false); G.state = 'intro-out';
    const d = introDone; introDone = null; d();
  }
}
function pause() {
  if (G.state !== 'flight' && G.state !== 'assault' && G.state !== 'surface' && G.state !== 'hub') return;
  G.resumeState = G.state;
  if (G.state === 'hub') show('hub', false);
  G.state = 'paused';
  releaseLock();
  pauseMenu.reset(); pauseMenu.render();
  show('pause', true);
}
function resume() {
  show('pause', false);
  G.state = G.resumeState || 'flight';
  initAudio();
  if (G.state === 'hub') { hub.reshow(); return; } // the hub keeps the cursor
  if (wantsMouse()) requestLock();
}
function toTitle() {
  show('pause', false);
  if (G.state !== 'title') autosave(false);
  story.clear(); G.task = null; G.waypoint = null; G.lineTag = false;
  if (tutorial.active) tutorial.abort();
  if (hub.visible || G.where === 'hub') hub.close();
  if (G.inSurface) { surface.exit(); G.inSurface = false; renderPass.scene = scene; }
  if (G.inAssault) { assault.stop(); G.inAssault = false; if (G.assaultSquad) G.assaultSquad.release(false); G.assaultSquad = null; }
  show('title', true);
  G.state = 'title';
  titleMenu.reset(); titleMenu.render();
  updateTitleHint();
}
function openControls(from) {
  menuReturn = from;
  show(from === 'title' ? 'title' : 'pause', false);
  show('controls', true);
  G.state = 'controls';
}
function closeControls() {
  show('controls', false);
  backToMenu();
}
function openSettings(from) {
  menuReturn = from;
  show(from === 'title' ? 'title' : 'pause', false);
  settingsMenu.reset(); settingsMenu.render();
  show('settings', true);
  G.state = 'settings';
}
function closeSettings() {
  show('settings', false);
  backToMenu();
}
function backToMenu() {
  if (menuReturn === 'title') { show('title', true); G.state = 'title'; titleMenu.render(); }
  else { pauseMenu.render(); show('pause', true); G.state = 'paused'; }
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
  // Lantern's traffic zone: cruise drops us out short of the station, so we can dock (not during the tutorial's launch)
  if (G.tutorialDone && station.root.position.distanceTo(ship.pos) < 1800 + margin) return { reason: 'LANTERN TRAFFIC ZONE', lantern: true };
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
    else if (ship.spool >= FLIGHT.spoolTime) {
      ship.cruise = 2; note('CRUISE ENGAGED', '255,179,90'); sfx.engage(); ship.shake = 1.2;
      G.tripT = 0; if (G.time - G.lastLoreT > 50) G.tripLore = false;
    }
  } else if (ship.cruise === 2) {
    const b = cruiseBlock(2600);
    if (b) {
      ship.cruise = 0; ship.shake = 1.4; sfx.drop();
      note('DROPPED FROM CRUISE · ' + b.reason, '255,179,90');
      if (b.squad) { G.cruiseDrop = { squad: b.squad, t: G.time }; if (!tutorial.active || G.heard.has('t-raid-3')) say('Scrap Crown ahead. I pulled us out of cruise. Engage them, or slip past.'); }
      if (b.lantern) say('Lantern ahead. Cruise is off. Bring us to the bay mouth to dock.');
    }
  }
}

function handleCollisions() {
  const n = station.collide(ship.pos, 9);
  if (n) {
    const vn = ship.vel.dot(n);
    if (vn < 0) ship.vel.addScaledVector(n, -vn * 1.2);
    if (ship.speed > 40) { ship.shake = Math.min(1.5, ship.speed / 120); sfx.bump(); }
    ship.speed *= 0.5;
    if (ship.cruise) ship.cruise = 0;
  }
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
      if (G.time - last > 40) { G.squadWarn.set(sq.id, G.time); if (!tutorial.active || G.heard.has('t-raid-3')) say(assessSquad(sq)); sfx.alert(); } // WREN introduces the first scouts herself
    }
    if (d < 1700 && d < bd) { bd = d; best = sq; }
  }
  if (best) { G.prompt = { type: 'engage', squad: best, label: 'ENGAGE ' + best.name + ' · THREAT ' + best.level }; return; }
  for (const p of G.planets) {
    const surf = p.center.distanceTo(ship.pos) - p.data.R;
    if (surf < p.data.R * 2.2 && !G.greeted.has(p.data.id)) {
      G.greeted.add(p.data.id);
      if (stormBlocks(p)) story.lines(['thalor-storm-1', 'thalor-storm-2']);
      else if (!tutorial.active) say(titleCase(p.data.name) + ' ahead. The vault signal is strong: the ' + p.data.relic + '. Take us down when you are ready.');
    }
    if (surf < p.data.R * 0.9) {
      G.prompt = stormBlocks(p)
        ? { type: 'storm', planet: p, label: 'RING STORM · NEEDS RIME SHIELDING' }
        : { type: 'land', planet: p, label: 'BEGIN LANDING · ' + p.data.name };
      return;
    }
  }
  // Lantern's dock: in front of the bay mouth, close and slow enough
  if (G.tutorialDone && !tutorial.active) {
    const L = station.local(ship.pos, tmpV);
    const d = bayMouth().distanceTo(ship.pos);
    if (d < 4500 && !G.dockHinted) { G.dockHinted = true; story.line('dock-approach'); } // once; re-armed when Lantern is picked on the nav again
    if (d < 1500) {
      if (L.z < BAY_MOUTH_Z + 10) G.prompt = { type: 'dock', label: 'DOCK AT LANTERN' };
      else if (G.time - (G.dockHintT || -99) > 20) { G.dockHintT = G.time; say('The bay opens the other way. Swing round to the mouth.'); }
    }
  }
}
const tmpV = new THREE.Vector3();

function acceptPrompt() {
  const pr = G.prompt;
  if (!pr) return;
  if (pr.type === 'engage') {
    sfx.engage();
    const sq = pr.squad;
    startAssault(sq);
  } else if (pr.type === 'storm') {
    sfx.denied();
    say('Not without Rime Shielding. The Workshop at Lantern has it: ' + UPGRADE.rime.costs[0] + ' Wayshards. We have ' + G.wayshards + '.');
  } else if (pr.type === 'land') {
    startEntry(pr.planet);
  } else if (pr.type === 'dock') {
    startDocking();
  }
}

// ---------- Lantern: docking, the hub and launch ----------
// WREN flies us in: a curve from where we are to a point on the bay's axis outside the mouth, then
// straight down the bay to the clamps, nose first. The cradle turns the ship round while we are docked.
const dockPath = { p0: new THREE.Vector3(), p1: new THREE.Vector3(), p2: new THREE.Vector3(), p3: new THREE.Vector3(), q0: new THREE.Quaternion(), t: 0, T: 8 };
const bez = (a, b, c, d, t, out) => {
  const u = 1 - t;
  return out.set(0, 0, 0).addScaledVector(a, u * u * u).addScaledVector(b, 3 * u * u * t).addScaledVector(c, 3 * u * t * t).addScaledVector(d, t * t * t);
};
// Thalor's ring storm: no landing until the Wayfarer has Rime Shielding (the Workshop, 300 Wayshards)
function stormBlocks(p) { return p.data.id === 'thalor' && tier(G.upgrades, 'rime') < 1; }

function startDocking() {
  G.state = 'docking';
  ship.cruise = 0; ship.boosting = false;
  sfx.engage();
  say('Docking. I have the stick.');
  const D = dockPath;
  D.p0.copy(ship.pos);
  const L = station.local(ship.pos, new THREE.Vector3());
  const dist = bayMouth().distanceTo(ship.pos);
  D.p1.copy(ship.pos).addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quat), Math.min(dist * 0.3, 120 + ship.speed * 1.5));
  // on the bay's axis, between us and the mouth, so the curve never doubles back
  station.toWorld(new THREE.Vector3(0, BAY_Y - 6, Math.min(BAY_MOUTH_Z - 90, (L.z + BAY_MOUTH_Z) / 2)), D.p2);
  station.toWorld(new THREE.Vector3(0, BAY_Y - 15, -116), D.p3); // inside, over the clamps
  D.q0.copy(ship.quat);
  D.t = 0;
  D.T = THREE.MathUtils.clamp(D.p0.distanceTo(D.p3) / 220, 6, 10);
}
const dkA = new THREE.Vector3(), dkB = new THREE.Vector3(), dkQ = new THREE.Quaternion(), dkM = new THREE.Matrix4();
function updateDocking(dt) {
  const D = dockPath;
  D.t += dt;
  const k = Math.min(1, D.t / D.T);
  const e = k * k * (3 - 2 * k); // ease in and out
  bez(D.p0, D.p1, D.p2, D.p3, e, dkA);
  bez(D.p0, D.p1, D.p2, D.p3, Math.min(1, e + 0.02), dkB);
  const prev = ship.pos.clone();
  ship.pos.copy(dkA);
  if (dt > 0.002) { // skip zero-length frames, they would read as huge speeds
    ship.vel.subVectors(ship.pos, prev).divideScalar(dt);
    ship.speed += (ship.vel.length() - ship.speed) * Math.min(1, dt * 6);
  }
  ship.throttle = 0.2; ship.ang.set(0, 0, 0);
  // face along the path, level with the station; the last stretch faces straight into the bay
  if (dkB.distanceToSquared(dkA) > 1e-4) {
    dkM.lookAt(dkA, dkB, station.toWorld(new THREE.Vector3(0, 1e6, 0), new THREE.Vector3()).sub(station.root.position).normalize());
    dkQ.setFromRotationMatrix(dkM);
    ship.quat.slerp(dkQ, Math.min(1, dt * (k < 0.15 ? 2 : 4)));
  }
  ship.fov += (70 - ship.fov) * Math.min(1, dt * 2);
  if (k >= 1) {
    G.state = 'hub-in';
    sfx.clamp(); ship.shake = 1.2;
    setTimeout(() => flash(() => openHub(false)), 700);
  }
}
function openHub() {
  G.state = 'hub';
  G.where = 'hub';
  G.prompt = null; G.task = null; G.waypoint = null;
  dockShip(); station.snapClamps(false);
  releaseLock();
  hub.open();
  autosave(true);
}
function launchFromHub() {
  G.state = 'hub-out';
  sfx.ui();
  flash(() => {
    hub.close();
    dockShip(); station.snapClamps(false); station.setClamps(true);
    G.where = 'space';
    // aim the nav at the nearest world still holding its relic
    if (G.targetIndex === LANTERN_NAV) {
      let best = -1, bd = Infinity;
      G.planets.forEach((p, i) => { if (!G.relics[p.data.id]) { const d = p.center.distanceTo(ship.pos); if (d < bd) { bd = d; best = i; } } });
      if (best >= 0) G.targetIndex = best;
    }
    G.state = 'flight';
    camera.fov = ship.fov; camera.updateProjectionMatrix();
    if (wantsMouse()) requestLock();
    story.clear(); story.line('hub-launch');
    note('CLAMPS RELEASED · THROTTLE UP', '255,211,106');
    autosave(false);
  });
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
    assault.start({ origin: ship.pos, quat: ship.quat, level: sq.level, shield: ship.shield, hull: ship.hull, squadName: sq.name,
      mods: { dmgK: eff(G.upgrades, 'plating', 'dmgK'), regen: eff(G.upgrades, 'capacitor', 'regen'), delay: eff(G.upgrades, 'capacitor', 'delay'), fireCd: eff(G.upgrades, 'repeater', 'fireCd') } });
    G.state = 'assault';
    if (wantsMouse()) requestLock();
  });
}
function endAssault(r) {
  G.state = 'assault-out';
  flash(() => {
    assault.stop();
    G.inAssault = false; G.lastAssault = { win: r.win };
    const sq = G.assaultSquad; G.assaultSquad = null;
    sq.release(r.win);
    ship.vel.set(0, 0, 0); ship.ang.set(0, 0, 0); ship.speed = 60; ship.throttle = 0.3;
    camera.fov = ship.fov; camera.updateProjectionMatrix();
    if (r.win) {
      G.assaultsWon++;
      G.wayshards += r.wayshards;
      autosave(true);
      ship.shield = 1; ship.hull = Math.min(1, Math.max(0.6, r.hull + 0.15));
      showEvent('PHASE II · VICTORY', sq.name + ' BROKEN',
        `Kills ${r.kills} · score ${r.score}${r.hitsTaken === 0 ? ' · flawless' : ''}. You recovered ${r.wayshards} Wayshards (${G.wayshards} in the hold). Field repairs patched the hull to ${Math.round(ship.hull * 100)}%. Wayshards buy upgrades at Lantern Station.`,
        () => { closeEvent(); note(sq.name + ' SCATTERED', '255,211,106'); if (!tutorial.active) say('Wayshards stowed. Good flying, Runner.'); });
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
  if (tutorial.active) tutorial.complete(); // landing is the tutorial's last lesson
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
    G.where = 'surface'; G.surfaceId = p.data.id; G.surfaceOut = out.toArray();
    autosave(true);
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
    G.where = 'space';
    say('Back in orbit. The rover is stowed.');
    if (!G.lanternDark && Object.values(G.relics).some(Boolean)) {
      G.lanternDark = true;
      // the line dies; WREN sets course for home right away (not after the talk, which a quit could cut short)
      G.targetIndex = LANTERN_NAV;
      setTimeout(() => {
        station.setLineAlive(false);
        sfx.target(); note('NAV TARGET · LANTERN', '255,211,106');
        story.lines(['r1-dark-1', 'r1-dark-2', 'r1-dark-3', 'dock-home']);
      }, 2500);
    }
    autosave(true);
  });
}

// ---------- the standing objective (after the tutorial) ----------
// A line at the top of the canopy so the player always knows what's next. Going home after the line
// dies (until Ilsa's "dark" briefing at the dock) comes first; then the worlds still holding relics.
// If the nav isn't on the objective, the line says which key sets it.
G.homeward = false;
let remindT = 0;
function updateObjective(dt) {
  const navKey = input.device === 'gamepad' ? 'LB' : 'TAB';
  G.homeward = G.lanternDark && !G.briefed.has('dark');
  if (G.homeward) {
    if (G.targetIndex !== LANTERN_NAV) G.task = { label: 'SET NAV TO LANTERN · RETURN HOME', key: () => navKey };
    else G.task = { label: 'RETURN TO LANTERN · DOCK IN THE BAY', key: () => 'OBJECTIVE' };
    // a nudge now and then on the long way home
    remindT += dt;
    if (remindT > 120 && !story.busy && station.root.position.distanceTo(ship.pos) > 20000) {
      remindT = 0;
      say(G.targetIndex === LANTERN_NAV ? 'Lantern is on the nav. Follow the gold marker, and cruise when we are pointed at it.' : 'Lantern needs us. Set it on the nav, ' + navKey + ', and I will mark the way.');
    }
    return;
  }
  const left = G.planets.filter((p) => !G.relics[p.data.id]);
  if (!left.length) { G.task = null; return; }
  const onOne = left.some((p) => G.planets.indexOf(p) === G.targetIndex);
  const tgt = G.planets[G.targetIndex];
  if (onOne && stormBlocks(tgt)) {
    // the way to Thalor goes through raider fights: say what it costs and how far along we are
    const cost = UPGRADE.rime.costs[0];
    G.task = G.wayshards >= cost
      ? { label: 'BUY RIME SHIELDING AT LANTERN · THEN THALOR', key: () => 'OBJECTIVE' }
      : { label: 'RIME SHIELDING FOR THALOR · ◆ ' + G.wayshards + ' / ' + cost + ' · FIGHT RAIDERS FOR WAYSHARDS', key: () => 'OBJECTIVE' };
    return;
  }
  G.task = onOne
    ? { label: 'RECOVER THE ' + G.planets[G.targetIndex].data.relic.toUpperCase() + ' · ' + G.planets[G.targetIndex].data.name, key: () => 'OBJECTIVE' }
    : { label: 'NEXT RELIC · ' + left.map((p) => p.data.name).join(' OR ') + ' · SET NAV', key: () => navKey };
}

// ---------- Lantern's reserve air ----------
// Once the line is dark, the station breathes from reserves. The clock runs on play time (flight, fights,
// the surface), never in menus or while docked. At zero Lantern seals its outer ring; it is not a game over.
const AIR_STATES = new Set(['flight', 'assault', 'surface', 'entry', 'docking']);
let airShown = '';
function updateAir(dt) {
  const el = $('airclock');
  const on = G.lanternDark && (AIR_STATES.has(G.state) || G.state === 'event');
  if (G.lanternDark && AIR_STATES.has(G.state)) {
    const before = G.air;
    G.air = Math.max(0, G.air - dt / AIR_DAY);
    if (before > 3 && G.air <= 3 && !G.heard.has('air-low')) story.line('air-low');
    if (before > 0 && G.air <= 0 && !G.heard.has('air-out')) story.line('air-out');
  }
  const s = on ? (G.air <= 0 ? 'LANTERN AIR · OUTER RING SEALED' : 'LANTERN AIR · ' + airText(G.air)) : '';
  if (s !== airShown) { airShown = s; el.textContent = s; el.classList.toggle('on', !!s); el.classList.toggle('low', G.air <= 3); }
  el.classList.toggle('side', !!(G.inSurface || G.inAssault)); // the rover compass and the fight HUD own the top centre
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
  // dialogue runs on the wall clock (voices play in real time), and holds while a menu is open
  const nowMs = performance.now(), realDt = Math.min(0.25, (nowMs - (G.wallMs || nowMs)) / 1000); G.wallMs = nowMs;
  const talkOn = !['paused', 'settings', 'controls', 'event'].includes(G.state);
  if (talkOn) for (const c of G.comms) c.t += realDt;
  if (talkOn) story.update(realDt);
  const P = input.pressed;

  switch (G.state) {
    case 'title':
      if (confirmNew && (P.has('back') || P.has('pause'))) { cancelNew(); break; }
      titleMenu.nav(P);
      if (P.size || input.device === 'gamepad') updateTitleHint();
      break;
    case 'intro':
      updateIntro(dt, P);
      break;
    case 'settings':
      if (P.has('back') || P.has('pause')) closeSettings();
      else settingsMenu.nav(P);
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
    case 'docking':
      updateDocking(dt);
      break;
    case 'hub':
      if (P.has('pause')) { pause(); break; }
      hub.update(dt, P);
      break;
    case 'surface': {
      if (P.has('pause')) { pause(); break; }
      G.saveT += dt;
      if (G.saveT > 15) { G.saveT = 0; autosave(false); }
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
        // Lantern joins the list once the tutorial is done (its lessons count on three targets)
        G.targetIndex = (G.targetIndex + 1) % (G.tutorialDone ? navCount() : G.planets.length);
        if (G.targetIndex === LANTERN_NAV) G.dockHinted = false;
        sfx.target(); note('NAV TARGET · ' + (G.targetIndex === LANTERN_NAV ? 'LANTERN' : G.planets[G.targetIndex].data.name), '255,211,106');
      }
      if (P.has('zero')) ship.throttle = 0;
      handleCruise(dt);
      updateShip(ship, input, dt);
      handleCollisions();
      updatePrompts();
      if (P.has('accept')) acceptPrompt();
      tutorial.update(dt);
      if (!tutorial.active && G.tutorialDone) updateObjective(dt);
      // one lore beat per cruise trip, a few seconds in, never over other talk
      if (ship.cruise === 2 && G.tutorialDone) {
        G.tripT += dt;
        if (G.tripT > 7 && !G.tripLore && !story.busy) { G.tripLore = true; if (story.lore()) G.lastLoreT = G.time; }
      }
      G.saveT += dt;
      if (G.saveT > 10 && (G.tutorialDone || tutorial.checkpoint !== null)) { G.saveT = 0; autosave(false); }
      break;
    }
  }

  updateAir(dt);

  // Threat rises once we hold a relic: Orrick knows what we carry.
  squads.setEscalation(Object.values(G.relics).some(Boolean) ? 1 : 0);
  squads.update(dt);
  if (G.inSurface) {
    const rv = surface.rover;
    updateEngine({ cruise: 0, spool: 0, boosting: false, throttle: Math.min(1, Math.abs(input.drive) * 0.5 + Math.abs(rv.speed) / 30), speed: Math.abs(rv.speed) * 8 }, G.state === 'surface');
  } else updateEngine(ship, G.state === 'flight' || G.state === 'entry' || G.state === 'docking' || G.inAssault);
  // shields recharge slowly in flight
  if (G.state === 'flight') {
    ship.shield = Math.min(1, ship.shield + dt * 0.02);
    if (ship.hull < 0.6) ship.hull = Math.min(0.6, ship.hull + dt * 0.003); // repair drones, up to 60%
  }

  station.update(dt);
  if (G.inSurface) return;
  if (G.inAssault) { world.update(camera.position, ZERO, dt); return; }
  titleRig.visible = inTitle();
  if (inTitle()) { titleCamera(dt); world.update(camera.position, ZERO, dt); spaceLights.update(camera.position); return; }
  if (hub.visible) { hub.updateCamera(dt); world.update(camera.position, ZERO, dt); spaceLights.update(camera.position); return; }
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
  spaceLights.update(camera.position);
  cockpit.update(G, dt);
}

function draw() {
  post.setMode(G.inSurface ? 'surface' : G.inAssault ? 'assault' : (inTitle() || hub.visible) ? 'title' : 'flight');
  const inCockpit = !G.inSurface && !G.inAssault && !inTitle() && !hub.visible;
  post.render(G.time, inCockpit ? (ship.cruise === 2 ? 1 : ship.cruise === 1 ? 0.35 : ship.boosting ? 0.6 : 0) : 0, lastDt);
  renderer.setRenderTarget(null);
  if (!inTitle() && !hub.visible) hud.draw(G, camera); else hudCtx.clearRect(0, 0, hudCtx.canvas.width, hudCtx.canvas.height);
  const hudHidden = hub.visible; if (hudHidden !== G.hudHidden) { G.hudHidden = hudHidden; $('hud').style.visibility = hudHidden ? 'hidden' : ''; } // docked: the canopy HUD has nothing to show
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
if (import.meta.env.DEV) window.__relic = { leaveSurface, hub, startDocking, openHub, startEntry, toTitle, launchFromHub, autosave, G, ship, assault, startAssault, surface, enterSurface, step, draw, input, camera, cockpit, post, station, story, tutorial, newGame, continueGame };
