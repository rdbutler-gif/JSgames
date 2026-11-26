// Saved progress (one slot, localStorage). PLAY becomes CONTINUE once a save exists;
// NEW GAME erases it. Storage can be missing (private windows): every access is guarded.
// `where` says where CONTINUE puts us back: 'space' (the ship's pose), 'hub' (docked at Lantern)
// or 'surface' (the landing pad of G.surfaceId). Mid-tutorial saves keep the lesson (`tut`).
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
  const tut = G.tutorialDone ? null : (G.tutCheckpoint ?? null);
  const p = {
    v: 1,
    savedAt: Date.now(),
    tutorialDone: !!G.tutorialDone,
    tut,
    where: G.where || 'space',
    surfaceId: G.where === 'surface' ? G.surfaceId : null,
    surfaceOut: G.where === 'surface' ? G.surfaceOut : null,
    relics: G.relics,
    upgrades: G.upgrades,
    wayshards: G.wayshards,
    assaultsWon: G.assaultsWon,
    heard: [...G.heard],
    lanternDark: !!G.lanternDark,
    air: G.air,
    lanternLost: !!G.lanternLost,
    lastLightDown: !!G.lastLightDown,
    scrubbers: G.scrubbers || 0,
    kits: G.kits || 0,
    kitFund: !!G.kitFund,
    tutV: 2, // tutorial lesson numbering (2: the Lantern stop before Kessa)
    briefed: [...(G.briefed || [])],
    targetIndex: G.targetIndex,
    ship: (G.tutorialDone || tut !== null) && ship ? { pos: ship.pos.toArray(), quat: ship.quat.toArray(), hull: ship.hull } : null,
  };
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* storage unavailable */ }
}

export function clearProgress() {
  try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
}
