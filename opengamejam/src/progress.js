// Saved progress (one slot, localStorage). PLAY becomes CONTINUE once a save exists;
// NEW GAME erases it. Storage can be missing (private windows): every access is guarded.
const KEY = 'wayline-progress-v1';

export function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p && p.v === 1 ? p : null;
  } catch (e) { return null; }
}

export function hasProgress() { return !!loadProgress(); }

export function saveProgress(G, ship) {
  const p = {
    v: 1,
    savedAt: Date.now(),
    tutorialDone: !!G.tutorialDone,
    relics: G.relics,
    upgrades: G.upgrades,
    wayshards: G.wayshards,
    assaultsWon: G.assaultsWon,
    heard: [...G.heard],
    lanternDark: !!G.lanternDark,
    targetIndex: G.targetIndex,
    ship: G.tutorialDone && ship ? { pos: ship.pos.toArray(), quat: ship.quat.toArray(), hull: ship.hull } : null,
  };
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* storage unavailable */ }
}

export function clearProgress() {
  try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
}
