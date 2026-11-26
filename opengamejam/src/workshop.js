// Lantern Workshop: what Wayshards buy. Every upgrade has tiers; G.upgrades[id] holds the tier bought (0 = none).
// The effect tables are read where the system lives (assault, ship, surface), through tier() / eff().
// Rover gate modules (Forgeplate and the rest) are not sold here: they are found on the planets.

export const UPGRADES = [
  // ---- the Wayfarer (Phase I and II) ----
  { id: 'plating', group: 'WAYFARER', name: 'ABLATIVE PLATING', costs: [90, 220],
    tiers: ['Raider fire does 20% less damage', 'Raider fire does 35% less damage'], dmgK: [1, 0.8, 0.65] },
  { id: 'capacitor', group: 'WAYFARER', name: 'SHIELD CAPACITOR', costs: [80, 190],
    tiers: ['Shields come back sooner and faster in a fight', 'Shields recover twice as fast'], regen: [9, 13, 18], delay: [4, 3, 2.2] },
  { id: 'repeater', group: 'WAYFARER', name: 'TWIN FEED REPEATER', costs: [110, 260],
    tiers: ['Guns fire 20% faster', 'Guns fire 40% faster'], fireCd: [0.13, 0.108, 0.093] },
  { id: 'cell', group: 'WAYFARER', name: 'BOOST CELL', costs: [60, 150],
    tiers: ['Boost lasts 6.5 s and recharges faster', 'Boost lasts 9 s'], boostSecs: [4.5, 6.5, 9], recharge: [9, 7, 6] },
  // the way down to Thalor: its rings shed ice into a storm no plain hull survives. Priced so it takes raider fights.
  { id: 'rime', group: 'WAYFARER', name: 'RIME SHIELDING', costs: [300],
    tiers: ['Ice-rated hull plates: the Wayfarer can fly down through Thalor\'s ring storm'] },
  // the way down to Vireo: its veil fog swallows every radar return, so there is no ground to land on
  { id: 'sounder', group: 'WAYFARER', name: 'VEIL SOUNDER', costs: [300],
    tiers: ['A deep-fog sounding array: the Wayfarer can find the ground through Vireo\'s veil'] },
  // ---- the rover (Phase III) ----
  { id: 'armour', group: 'ROVER', name: 'ROVER ARMOUR', costs: [70, 180],
    tiers: ['The rover takes 20% less damage', 'The rover takes 35% less damage'], dmgK: [1, 0.8, 0.65] },
  { id: 'bore', group: 'ROVER', name: 'AUTOCANNON BORE', costs: [90, 220],
    tiers: ['Turret shells hit 35% harder', 'Turret shells hit 70% harder'], dmg: [1, 1.35, 1.7] },
  { id: 'sink', group: 'ROVER', name: 'LANCE HEAT SINK', costs: [70, 170],
    tiers: ['The heat lance runs 40% longer', 'The heat lance runs twice as long'], heatK: [1, 0.72, 0.5] },
];
export const UPGRADE = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

// Scrubber parts for Lantern's reserve air: only sold once the line is dark. Repeatable, and dearer each time.
export const SCRUBBER = { days: 2, cost: (n) => 50 + n * 25 };

// Rover Repair Kits: the only revive in a guardian fight. A kit puts the rover back up at the arena edge with a
// full hull and the guardian keeps its wounds; with none, WREN hauls the rover out and the guardian mends.
export const KIT = { cost: 30, max: 5 };

export const tier = (upgrades, id) => (upgrades && Number.isFinite(upgrades[id]) ? upgrades[id] : 0);
// the value of an effect table at the tier owned, e.g. eff(G.upgrades, 'plating', 'dmgK')
export const eff = (upgrades, id, key) => UPGRADE[id][key][tier(upgrades, id)];
export const nextCost = (upgrades, id) => UPGRADE[id].costs[tier(upgrades, id)]; // undefined at max tier
