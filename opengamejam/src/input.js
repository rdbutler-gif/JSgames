// Unified input: mouse (pointer lock), keyboard and standard-mapping gamepads.
import { settings } from './settings.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const input = {
  pitch: 0, yaw: 0, roll: 0, throttleRate: 0,
  boost: false, fire: false,
  // Phase II (assault): screen-space move, raw mouse motion, dodge.
  moveX: 0, moveY: 0, mouseDX: 0, mouseDY: 0, dodge: false,
  // Phase III (rover): right-stick look, handbrake, raw drive axis.
  lookX: 0, lookY: 0, handbrake: false, drive: 0,
  gun: false, // rover turret: left mouse, E, or RB (RT drives, so it cannot fire)
  special: false, // rover special weapon (the heat lance for now): right mouse, Q, or LB
  pressed: new Set(), // one-frame actions: accept, pause, cruise, target, zero, recenter, back, up, down, left, right
  device: 'mouse',
  mouseStick: { x: 0, y: 0 },
  locked: false,
  padName: '',
};

const keys = new Set();
let mdx = 0, mdy = 0, mouseFire = false, mouseSpecial = false;
const padPrev = [];
let canvasEl = null;

const KEY_ACTIONS = {
  Escape: 'pause', KeyP: 'pause', KeyF: 'accept', Enter: 'accept', KeyC: 'cruise', Tab: 'target',
  KeyX: 'zero', KeyR: 'recenter', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Backspace: 'back',
};
// gamepad button index -> action
const PAD_ACTIONS = { 0: 'accept', 1: 'back', 2: 'cruise', 3: 'zero', 4: 'target', 9: 'pause', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };

export function initInput(canvas) {
  canvasEl = canvas;
  addEventListener('keydown', (e) => {
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (!e.repeat && KEY_ACTIONS[e.code]) input.pressed.add(KEY_ACTIONS[e.code]);
    keys.add(e.code);
    input.device = 'keyboard';
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); mouseFire = false; mouseSpecial = false; });
  addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) {
      mdx += e.movementX; mdy += e.movementY;
      input.device = 'mouse';
    }
  });
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) mouseFire = true; if (e.button === 2) mouseSpecial = true; });
  addEventListener('mouseup', (e) => { if (e.button === 0) mouseFire = false; if (e.button === 2) mouseSpecial = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (!input.locked) { mouseFire = false; mouseSpecial = false; }
  });
  addEventListener('gamepadconnected', (e) => { input.padName = e.gamepad.id; input.device = 'gamepad'; });
}

export function requestLock() {
  if (!canvasEl || document.pointerLockElement === canvasEl) return;
  try {
    const p = canvasEl.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch (e) { /* not allowed right now */ }
}

export function releaseLock() {
  if (document.pointerLockElement) document.exitPointerLock();
}

function radial(x, y, dz) {
  const l = Math.hypot(x, y);
  if (l < dz) return [0, 0];
  const k = Math.min(1, (l - dz) / (1 - dz)) / l;
  return [x * k, y * k];
}
const expo = (v) => Math.sign(v) * (0.35 * Math.abs(v) + 0.65 * v * v);

export function pollInput(dt) {
  let pitchUp = 0, yaw = 0, roll = 0, thr = 0;

  // keyboard
  if (keys.has('ArrowUp')) pitchUp += 1;
  if (keys.has('ArrowDown')) pitchUp -= 1;
  if (keys.has('ArrowLeft') || keys.has('KeyQ')) yaw += 1;
  if (keys.has('ArrowRight') || keys.has('KeyE')) yaw -= 1;
  if (keys.has('KeyA')) roll += 1;
  if (keys.has('KeyD')) roll -= 1;
  if (keys.has('KeyW')) thr += 1;
  if (keys.has('KeyS')) thr -= 1;
  let boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
  let fire = keys.has('Space') || mouseFire;
  let mvx = 0, mvy = 0, padMvy = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mvx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mvx += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) mvy += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) mvy -= 1;
  let dodge = keys.has('ShiftLeft') || keys.has('ShiftRight');
  let lookX = 0, lookY = 0, handbrake = keys.has('Space');
  let gun = mouseFire || keys.has('KeyE');
  let special = mouseSpecial || keys.has('KeyQ');
  let drive = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const lockedNow = document.pointerLockElement === canvasEl;
  input.mouseDX = lockedNow ? mdx * settings.mouseSens : 0;
  input.mouseDY = lockedNow ? mdy * settings.mouseSens : 0;

  // mouse
  const ms = input.mouseStick;
  if (input.pressed.has('recenter')) { ms.x = 0; ms.y = 0; }
  if (settings.mouseMode === 'stick') {
    ms.x = clamp(ms.x + mdx * 0.0035 * settings.mouseSens, -1, 1);
    ms.y = clamp(ms.y + mdy * 0.0035 * settings.mouseSens, -1, 1);
    const l = Math.hypot(ms.x, ms.y);
    if (l > 1) { ms.x /= l; ms.y /= l; }
    const dz = 0.05, ml = Math.hypot(ms.x, ms.y);
    if (ml > dz) {
      const k = (ml - dz) / (1 - dz) / ml;
      yaw += -ms.x * k;
      pitchUp += -ms.y * k;
    }
  } else {
    ms.x = 0; ms.y = 0;
    const norm = dt > 0 ? (1 / 60) / dt : 1;
    yaw += clamp(-mdx * 0.05 * settings.mouseSens * norm, -2, 2);
    pitchUp += clamp(-mdy * 0.05 * settings.mouseSens * norm, -2, 2);
  }
  mdx = 0; mdy = 0;

  // gamepad
  let pads = [];
  try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { pads = []; }
  let gp = null;
  for (const p of pads) if (p && p.connected) { gp = p; break; }
  if (gp) {
    const ax = (i) => gp.axes[i] || 0;
    const bv = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
    const bp = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const [lx, ly] = radial(ax(0), ax(1), 0.14);
    const [rx, ry] = radial(ax(2), ax(3), 0.18);
    lookX += rx; lookY += ry;
    if (bp(2)) handbrake = true;
    drive += bv(7) - bv(6);
    let any = lx || ly || rx;
    yaw += -expo(lx) * settings.stickSens;
    pitchUp += -expo(ly) * settings.stickSens;
    roll += -expo(rx);
    thr += bv(7) - bv(6);
    if (bp(1) || bp(10)) boost = true;
    if (bp(5) || bv(7) > 0.4) fire = true;
    if (bp(5)) gun = true;
    if (bp(4)) special = true;
    if (bp(1) || bp(4) || bv(6) > 0.4) dodge = true;
    mvx += expo(lx) * settings.stickSens;
    padMvy += expo(ly) * settings.stickSens; // Phase II stick: opposite sense to Phase I pitch (owner's call, 2026-11-18)
    for (let i = 0; i < gp.buttons.length; i++) {
      const down = bp(i);
      if (down) any = true;
      if (down && !padPrev[i] && PAD_ACTIONS[i]) input.pressed.add(PAD_ACTIONS[i]);
      padPrev[i] = down;
    }
    if (any) input.device = 'gamepad';
    input.padName = gp.id;
  }

  const inv = settings.invertY ? -1 : 1;
  input.pitch = clamp(pitchUp * inv, -1.5, 1.5);
  input.yaw = clamp(yaw, -1.5, 1.5);
  input.roll = clamp(roll, -1, 1);
  input.throttleRate = clamp(thr, -1, 1);
  input.boost = boost;
  input.fire = fire;
  input.dodge = dodge;
  input.lookX = clamp(lookX, -1, 1);
  input.lookY = clamp(lookY, -1, 1);
  input.handbrake = handbrake;
  input.gun = gun;
  input.special = special;
  input.drive = clamp(drive, -1, 1);
  input.moveX = clamp(mvx, -1, 1);
  input.moveY = clamp((mvy + padMvy) * inv, -1, 1);
}

export function endFrame() { input.pressed.clear(); }
