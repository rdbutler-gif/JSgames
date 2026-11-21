// Per-player settings, kept in localStorage when it is available.
const KEY = 'relicrun.settings.v1';
const defaults = {
  // Invert Y, one per style of play (owner, 2026-11-21: players differ per mode)
  invertFlight: false, // Phase I cockpit pitch
  invertFight: false,  // Phase II raider fights (whose base sense is already the opposite of flight's)
  invertRover: false,  // Phase III rover camera and turret aim
  mouseMode: 'stick', // 'stick' = virtual joystick, 'direct' = mouse look
  mouseSens: 1.0,
  stickSens: 1.0,
  volume: 0.8,
  muted: false,
  quality: 'auto', // 'auto' | 'high' | 'medium' | 'low'
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const s = { ...defaults, ...(raw ? JSON.parse(raw) : {}) };
    // the old single Invert Y carries over to all three, so nobody's controls change under them
    if (typeof s.invertY === 'boolean') { s.invertFlight = s.invertFight = s.invertRover = s.invertY; delete s.invertY; }
    return s;
  } catch (e) {
    return { ...defaults };
  }
}

export const settings = load();

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* storage unavailable */ }
}
