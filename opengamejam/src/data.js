// World layout. 1 world unit = 10 m on the instruments.
export const UNIT_M = 10;

export const PLANETS = [
  {
    id: 'kessa', name: 'KESSA', relic: 'Ember Core', blurb: 'Lava seas and foundry ruins',
    R: 900, pos: [0, 2500, -110000], seed: 3.1,
    colors: ['#6b230e', '#b8481a', '#e48a35', '#f7cf7a'],
    lava: '#ff5a1f', cap: null, atmo: '#ffad5c',
  },
  {
    id: 'thalor', name: 'THALOR', relic: 'Rime Compass', blurb: 'Ice shelves and shattered rings',
    R: 1250, pos: [95000, -12000, 55000], seed: 7.7,
    colors: ['#0b3150', '#14698f', '#4fb8cf', '#d9f6ff'],
    lava: null, cap: { lat: 0.68, color: '#f4fcff' }, atmo: '#7fe8ff', ring: true,
  },
  {
    id: 'vireo', name: 'VIREO', relic: 'Veil Lens', blurb: 'Dark fog and floating rock',
    R: 780, pos: [-95000, 14000, 55000], seed: 12.4,
    colors: ['#22093d', '#4e2079', '#2f9a62', '#b5ef68'],
    lava: null, cap: null, atmo: '#c58bff',
  },
];

// Lantern Station sits between the three worlds, about 110,000 u (1.1 million km on the instruments)
// from each, so trips are cruise-drive trips: ~35 s from Lantern, ~55 s world to world.
export const LANTERN = { pos: [0, 0, 0] };
// The Heart: where every Wayline in the cluster runs to. Unreachable for now; Lantern's line points at it.
export const HEART = { pos: [-160000, -60000, -170000] };
// The Final Gate: a Warden ring on Lantern's line, short of the Heart, where every road narrows to one.
// The Quiet lives round the Heart: it is felt from QUIET.far in, and at full strength by QUIET.near.
// The void (a patch of sky with no stars) is VOID_R across, centred on the Heart.
export const GATE_FROM_HEART = 12000;
export const FINAL_GATE = (() => {
  const h = HEART.pos, d = Math.hypot(...h);
  return { pos: h.map((v) => v - (v / d) * GATE_FROM_HEART), R: 900 };
})();
export const QUIET = { far: 190000, near: 14000, VOID_R: 26000 };

// Scrap Crown patrols, placed along the routes. Base threat: 1 on the routes out of Lantern,
// 2 on the routes between worlds, 3 on each planet approach.
// Every squadron rises one level once the player holds a relic (Orrick knows what we carry).
const P = Object.fromEntries(PLANETS.map((p) => [p.id, p.pos]));
const along = (a, b, t, off = [0, 0, 0]) => a.map((v, i) => v + (b[i] - v) * t + off[i]);
const L0 = LANTERN.pos;
export const SQUAD_ANCHORS = [
  { pos: along(L0, P.kessa, 0.8, [2500, 800, 0]), level: 1, callsign: 'RUST' },      // first trip: the tutorial meets these after Orrick's broadcast
  { pos: along(L0, P.vireo, 0.5, [0, -1500, 2500]), level: 1, callsign: 'GRIT' },
  { pos: along(L0, P.thalor, 0.5, [0, 1500, -2500]), level: 2, callsign: 'CINDER' },
  { pos: along(P.kessa, P.thalor, 0.5, [0, 2000, 0]), level: 2, callsign: 'HOOK' },
  { pos: along(P.kessa, P.vireo, 0.5, [0, -2000, 0]), level: 2, callsign: 'SNARL' },
  { pos: along(P.thalor, P.vireo, 0.5), level: 2, callsign: 'MAW' },
  { pos: along(P.kessa, L0, 0.07, [1500, 0, 0]), level: 3, callsign: 'BRAND' },     // Kessa approach
  { pos: along(P.thalor, L0, 0.09, [0, 0, 1500]), level: 3, callsign: 'SLAG' },     // Thalor approach
  { pos: along(P.vireo, L0, 0.07, [0, 1500, 0]), level: 3, callsign: 'TALON' },     // Vireo approach
];

export const THREAT = {
  1: { role: 'SCOUTS', fighters: 3 },
  2: { role: 'WING', fighters: 4 },
  3: { role: 'STRIKE GROUP', fighters: 5, warbreaker: true },
  4: { role: 'HUNTERS', fighters: 5, warbreaker: true },
  5: { role: 'ACE WING', fighters: 5, warbreaker: true },
};

export const COMMS_NAME = 'WREN';
