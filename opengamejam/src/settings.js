// Per-player settings, kept in localStorage when it is available.
const KEY = 'relicrun.settings.v1';
const defaults = {
  invertY: false,
  mouseMode: 'stick', // 'stick' = virtual joystick, 'direct' = mouse look
  mouseSens: 1.0,
  stickSens: 1.0,
  volume: 0.8,
  muted: false,
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return { ...defaults, ...(raw ? JSON.parse(raw) : {}) };
  } catch (e) {
    return { ...defaults };
  }
}

export const settings = load();

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* storage unavailable */ }
}
