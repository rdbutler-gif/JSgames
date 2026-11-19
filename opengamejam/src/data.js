// World layout. 1 world unit = 10 m on the instruments.
export const UNIT_M = 10;

export const PLANETS = [
  {
    id: 'kessa', name: 'KESSA', relic: 'Ember Core', blurb: 'Lava seas and foundry ruins',
    R: 900, pos: [0, 300, -15000], seed: 3.1,
    colors: ['#6b230e', '#b8481a', '#e48a35', '#f7cf7a'],
    lava: '#ff5a1f', cap: null, atmo: '#ffad5c',
  },
  {
    id: 'thalor', name: 'THALOR', relic: 'Rime Compass', blurb: 'Ice shelves and shattered rings',
    R: 1250, pos: [17000, -2200, -4000], seed: 7.7,
    colors: ['#0b3150', '#14698f', '#4fb8cf', '#d9f6ff'],
    lava: null, cap: { lat: 0.68, color: '#f4fcff' }, atmo: '#7fe8ff', ring: true,
  },
  {
    id: 'vireo', name: 'VIREO', relic: 'Veil Lens', blurb: 'Dark fog and floating rock',
    R: 780, pos: [-13500, 3000, 8000], seed: 12.4,
    colors: ['#22093d', '#4e2079', '#2f9a62', '#b5ef68'],
    lava: null, cap: null, atmo: '#c58bff',
  },
];

// Scrap Crown patrols. Base threat: 1 near the start, 2 in the lanes, 3 on each planet approach.
// Every squadron rises one level once the player holds a relic (Orrick knows what we carry).
export const SQUAD_ANCHORS = [
  { pos: [3500, 400, -6500], level: 1, callsign: 'RUST' },
  { pos: [-6000, 1500, 1500], level: 1, callsign: 'GRIT' },
  { pos: [9500, -900, -9500], level: 2, callsign: 'CINDER' },
  { pos: [9000, 700, 2500], level: 2, callsign: 'HOOK' },
  { pos: [-11000, 2000, -3000], level: 2, callsign: 'SNARL' },
  { pos: [-3500, -1200, -11500], level: 3, callsign: 'BRAND' },   // Kessa approach
  { pos: [13500, -1500, -1500], level: 3, callsign: 'SLAG' },     // Thalor approach
  { pos: [-10500, 2500, 5000], level: 3, callsign: 'TALON' },     // Vireo approach
];

export const THREAT = {
  1: { role: 'SCOUTS', fighters: 3 },
  2: { role: 'WING', fighters: 4 },
  3: { role: 'STRIKE GROUP', fighters: 5, warbreaker: true },
  4: { role: 'HUNTERS', fighters: 5, warbreaker: true },
  5: { role: 'ACE WING', fighters: 5, warbreaker: true },
};

export const COMMS_NAME = 'WREN';
