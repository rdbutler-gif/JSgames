// The story, told a line at a time: WREN in the cockpit, and radio from Lantern and the Scrap Crown.
// - LINES is the whole voiced script. Each line has an id; public/vo/<id>.mp3 is its voice take
//   (missing takes fall back to subtitle timing, so the game plays before the voices exist).
// - The tutorial teaches one ship function at a time and waits until the player has done it.
// - Lore beats play during cruise trips, at most one per trip, so there is never much to read.
import * as THREE from 'three';
import { PLANETS } from './data.js';
import { BAY_MOUTH_Z, BAY_Y } from './station.js';

export const SPEAKERS = {
  wren: { name: 'WREN', rgb: '110,242,255', radio: false },
  ilsa: { name: 'ILSA BRANDT · LANTERN DOCK', short: 'ILSA', rgb: '255,196,106', radio: true },
  orrick: { name: 'DAGAN ORRICK · SCRAP CROWN', short: 'ORRICK', rgb: '255,110,110', radio: true },
};

export const LINES = {
  // ---- tutorial: the dock ----
  't-dock': ['ilsa', "Wayfarer, this is Lantern Dock. Clamps are open. You're cleared to fly."],
  't-hello': ['wren', "Hello, Runner. I'm WREN, your navigator. Let's take her out."],
  't-throttle': ['wren', 'Push the throttle up, gently. Ease us out of the bay.'],
  't-steer': ['wren', "We're clear. Now steer us through that ring."],
  't-roll': ['wren', 'Good. Now roll us all the way over, once.'],
  't-line-1': ['wren', "See that golden thread? That's Lantern's Wayline."],
  't-line-2': ['wren', 'It carries our air, water and power. Every colony out here lives on one.'],
  't-boost': ['wren', 'Boost gives a short burst of speed. Hold it, and catch the next ring.'],
  't-boost-again': ['wren', 'Close. Try that one with boost.'],
  't-radio-1': ['ilsa', 'Runner, Ilsa. The line just dimmed again. Third time today.'],
  't-radio-2': ['ilsa', "The Quiet's spreading. Two stations went dark this month."],
  't-radio-3': ['wren', 'Dockmaster, the Warden charts mark three vaults. Kessa, Thalor and Vireo.'],
  't-radio-4': ['ilsa', "Then that's your run. Bring back whatever the Wardens left. Kessa's closest."],
  't-target': ['wren', 'Set Kessa as our nav target.'],
  't-face': ['wren', 'Now turn us toward the marker.'],
  't-cruise': ['wren', 'Kessa is over a million kilometres out. Engage cruise drive.'],
  't-cruise-tip': ['wren', 'Cruise drops us out by itself near worlds and raiders. Just keep us pointed.'],
  't-orrick-1': ['orrick', "Lantern Runner. Dagan Orrick, Scrap Crown. I hear you're vault hunting."],
  't-orrick-2': ['orrick', 'Those vaults are mine. Go home and keep breathing, while you still can.'],
  't-orrick-3': ['wren', 'Orrick. His raiders strip dying stations. Expect company.'],
  // ---- tutorial: the first raider encounter ----
  't-raid-1': ['wren', 'Raiders on the route. Cruise drops us out when anything hostile gets close.'],
  't-raid-2': ['wren', 'Their tag shows the threat level. Threat one is a few light fighters. The higher the number, the harder the fight.'],
  't-raid-3': ['wren', "Fly in close and engage, and we fight them for Wayshards. Or steer wide, and cruise on once we're clear."],
  't-raid-won': ['wren', 'Good flying. Wayshards buy upgrades back at Lantern.'],
  't-raid-skip': ['wren', "We slipped past them. Not every fight is worth taking."],
  't-recruise': ['wren', 'Clear. Point us at Kessa and engage cruise again.'],
  't-wardens': ['wren', 'The Wardens built the Waylines, then vanished. Two hundred years, and no one has made a new one.'],
  't-kessa': ['wren', "That's Kessa. The vault is down there. Take us in when you're ready."],
  // ---- after the first relic: Lantern's line dies ----
  'r1-dark-1': ['ilsa', "Runner... Lantern's line just went dark. All of it."],
  'r1-dark-2': ['ilsa', "We're on reserve air now. Bring those relics home. Fast."],
  'r1-dark-3': ['wren', "The line died the moment the Core left its vault. Runner, I don't think that was chance."],
  // ---- cruise lore, one per trip ----
  'lore-relays': ['wren', 'Those rings on the line are Warden relays. They keep the light steady across the dark.'],
  'lore-runners': ['wren', "Before the Quiet, a hundred Runners worked the Waylines. Now there's us."],
  'lore-heart': ['wren', 'Every line in the cluster runs to one place. The charts just call it the Heart.'],
  'lore-sky': ['ilsa', "Kids here have never seen a real sky. The line was the only light they knew."],
  'lore-orrick': ['orrick', 'Still flying, Runner? Every relic you carry makes you worth more to me.'],
  'lore-hum': ['wren', 'The Core is humming. I can hear it from here. I think it knows me.'],
  'welcome': ['wren', 'Welcome back, Runner. Systems are green.'],
  // ---- Lantern: docking and the hub (step 5) ----
  'dock-approach': ['wren', "Lantern's bay is open. Bring us in slow toward the mouth, and I'll dock us."],
  'dock-home': ['wren', "Lantern's on the nav. Ilsa will want to see what we found."],
  'hub-first-1': ['ilsa', 'Welcome home, Runner. Clamps are on, and the crews are patching your hull.'],
  'hub-first-2': ['ilsa', 'Spend your Wayshards at the Workshop. Plating, guns, rover parts. Buy what keeps you alive.'],
  'hub-first-3': ['ilsa', "Kessa's vault is still waiting. Bring home what the Wardens left, and we'll see what it does."],
  'hub-dark-1': ['ilsa', 'You came back. Good. The whole ring watched the line go out.'],
  'hub-dark-2': ['ilsa', "We started on fourteen days of reserve air. I've put the count on your screen."],
  'hub-dark-3': ['wren', 'The relics are keys, Dockmaster. Two more, and I think the Heart will open for us.'],
  'hub-dark-4': ['ilsa', 'Then fly. And if you can spare Wayshards, the Workshop can send scrubber parts up to us.'],
  'hub-r2-1': ['ilsa', 'Two relics. The kids are counting days in chalk on the ring walls.'],
  'hub-r2-2': ['ilsa', "Orrick's wings are thicker on every route now. Buy armour before you go."],
  'hub-r2-3': ['wren', 'One key left. I can feel the Heart pulling at my charts.'],
  'hub-r3-1': ['ilsa', "That's all three. Half the station watched you come in."],
  'hub-r3-2': ['ilsa', 'The charts put the Heart past the Final Gate. Orrick will be waiting. So will Vex.'],
  'hub-r3-3': ['wren', "When you're ready, Runner. I'll know the way."],
  'hub-back-1': ['ilsa', 'Clamps on. Welcome back, Runner.'],
  'hub-back-2': ['ilsa', 'Good to see you in one piece. Mostly one piece.'],
  'hub-buy-1': ['ilsa', 'Fitting it now.'],
  'hub-buy-2': ['ilsa', "Done. She'll fly better for it."],
  'hub-air': ['ilsa', "Scrubber parts on the lift. That's two more days for us. Thank you, Runner."],
  'hub-launch': ['ilsa', 'Clamps off. Fly safe, Runner.'],
  'air-low': ['ilsa', "Runner, the air's getting thin up here. Three days left. Please hurry."],
  'air-out': ['ilsa', "We've sealed the outer ring. Everyone's crowded into the spindle now. Please, Runner."],
};

// Ilsa's briefings at the dock, by how far the run has come. Each plays once, in order, when it applies.
export const BRIEFINGS = [
  { id: 'first', lines: ['hub-first-1', 'hub-first-2', 'hub-first-3'], when: (G) => relicCount(G) === 0 },
  { id: 'dark', lines: ['hub-dark-1', 'hub-dark-2', 'hub-dark-3', 'hub-dark-4'], when: (G) => G.lanternDark },
  { id: 'r2', lines: ['hub-r2-1', 'hub-r2-2', 'hub-r2-3'], when: (G) => relicCount(G) >= 2 },
  { id: 'r3', lines: ['hub-r3-1', 'hub-r3-2', 'hub-r3-3'], when: (G) => relicCount(G) >= 3 },
];

// one lore beat per cruise trip, in this order, when its condition holds
const LORE = [
  { id: 't-wardens', when: () => true }, // if the first trip was too short for it
  { id: 'lore-relays', when: () => true },
  { id: 'lore-orrick', when: (G) => relicCount(G) >= 1 },
  { id: 'lore-sky', when: (G) => G.lanternDark },
  { id: 'lore-runners', when: () => true },
  { id: 'lore-hum', when: (G) => relicCount(G) >= 1 },
  { id: 'lore-heart', when: () => true },
];
const relicCount = (G) => Object.values(G.relics).filter(Boolean).length;

const KESSA = PLANETS.findIndex((p) => p.id === 'kessa');

// ---------- the line player ----------
// ctx: { G, sfx, playVoice(id, radio) -> seconds or 0 }
export function createStory(ctx) {
  const { G } = ctx;
  const queue = [];
  let cur = null, gap = 0;

  function push(entry) { queue.push(entry); }
  // a scripted, voiced line
  function line(id, opts = {}) {
    const L = LINES[id];
    if (!L) return;
    push({ id, who: L[0], text: L[1], voiced: true, stale: opts.stale, waited: 0, then: opts.then });
  }
  // an unscripted WREN line (contact calls and status): text only, dropped if it waits too long
  function say(text, who = 'wren') { push({ who, text, voiced: false, stale: 8, waited: 0 }); }

  function start(e) {
    const sp = SPEAKERS[e.who];
    const vo = e.voiced ? ctx.playVoice(e.id, sp.radio) : 0;
    const dur = vo > 0 ? vo + 0.5 : 1.4 + e.text.length * 0.055;
    cur = { ...e, t: 0, dur };
    G.comms.push({ from: sp.name, short: sp.short || sp.name, rgb: sp.rgb, radio: sp.radio, text: e.text, t: 0, dur });
    if (G.comms.length > 6) G.comms.shift();
    if (sp.radio) ctx.sfx.radio(); else ctx.sfx.comms();
    if (e.id) G.heard.add(e.id);
  }

  function update(dt) {
    for (const e of queue) e.waited += dt;
    while (queue.length && queue[0].stale && queue[0].waited > queue[0].stale && !cur) queue.shift();
    if (cur) {
      cur.t += dt;
      if (cur.t >= cur.dur) { const f = cur.then; cur = null; gap = 0.35; if (f) f(); }
      return;
    }
    if (gap > 0) { gap -= dt; return; }
    // a voiced line waits (up to 2 s) for its take to finish loading, so it is heard, not just read
    if (queue.length && queue[0].voiced && ctx.voiceState && ctx.voiceState(queue[0].id) === 'loading' && queue[0].waited < 2) return;
    if (queue.length) start(queue.shift());
  }

  return {
    line, say, update,
    // lines in order; `done` fires after the last one finishes
    lines(ids, done) { ids.forEach((id, i) => line(id, i === ids.length - 1 && done ? { then: done } : {})); if (!ids.length && done) done(); },
    get busy() { return !!cur || queue.length > 0; },
    clear() { queue.length = 0; cur = null; },
    flush() { queue.length = 0; }, // drop what is waiting; the line being spoken finishes
    // a lore beat for this cruise trip, if one is due
    lore() {
      const b = LORE.find((x) => !G.heard.has(x.id) && x.when(G));
      if (b) line(b.id);
      return !!b;
    },
  };
}

// ---------- the tutorial ----------
// ctx: { G, ship, station, scene, story, sfx, input, planets, save() }
export function createTutorial(ctx) {
  const { G, ship, station, story } = ctx;
  const v = new THREE.Vector3(), v2 = new THREE.Vector3(), fwd = new THREE.Vector3();

  // fly-through rings
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.2, 2.8), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  function makeRing() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.TorusGeometry(34, 1.6, 8, 48), ringMat));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const tick = new THREE.Mesh(new THREE.BoxGeometry(2.2, 7, 2.2), ringMat); tick.position.set(Math.cos(a) * 34, Math.sin(a) * 34, 0); tick.rotation.z = a + Math.PI / 2; g.add(tick); }
    g.visible = false; ctx.scene.add(g);
    return { g, side: 0, passed: false };
  }
  const rings = [makeRing(), makeRing()];
  function placeRing(r, localPos, faceLocal) {
    station.toWorld(localPos, r.g.position);
    station.toWorld(faceLocal, v);
    r.g.lookAt(v);
    r.g.visible = true; r.passed = false; r.side = 0;
  }
  // true on the frame the ship crosses the ring's plane inside its hoop
  function through(r) {
    if (!r.g.visible || r.passed) return false;
    const n = v.set(0, 0, 1).applyQuaternion(r.g.quaternion);
    const rel = v2.copy(ship.pos).sub(r.g.position);
    const s = Math.sign(rel.dot(n));
    const crossed = r.side !== 0 && s !== r.side;
    r.side = s;
    if (crossed && rel.length() < 40) { r.passed = true; r.g.visible = false; ctx.sfx.target(); return true; }
    return false;
  }

  const dev = () => (ctx.input.device === 'gamepad' ? 'pad' : 'key');
  const KEYS = {
    throttle: { key: 'W', pad: 'RT', label: 'THROTTLE UP' },
    steer: { key: 'MOUSE', pad: 'LEFT STICK', label: 'STEER THROUGH THE RING' },
    roll: { key: 'A / D', pad: 'RIGHT STICK', label: 'ROLL A FULL TURN' },
    boost: { key: 'SHIFT', pad: 'B', label: 'HOLD BOOST · CATCH THE RING' },
    target: { key: 'TAB', pad: 'LB', label: 'NAV TARGET · KESSA' },
    face: { key: 'MOUSE', pad: 'LEFT STICK', label: 'TURN TOWARD KESSA' },
    cruise: { key: 'C', pad: 'X', label: 'ENGAGE CRUISE DRIVE' },
    engage: { key: 'F', pad: 'A', label: 'ENGAGE THEM, OR STEER WIDE' },
    land: { key: 'F', pad: 'A', label: 'BEGIN LANDING' },
  };
  function task(k) { const t = KEYS[k]; G.task = t ? { label: t.label, key: () => t[dev()] } : null; }

  let step = -1, stepT = 0, latched = false, rollAcc = 0, boostT = 0, cruiseT = 0, beats = 0, talking = false, armed = false, sawScouts = false;
  const kessa = () => ctx.planets[KESSA];

  // Each step: say its lines, show its task, and advance when its check passes (after the lines end).
  const STEPS = [
    { lines: ['t-dock', 't-hello', 't-throttle'], task: 'throttle', enter() { station.setClamps(true); }, check: () => station.localZ(ship.pos) < BAY_MOUTH_Z - 25 },
    { lines: ['t-steer'], task: 'steer', enter() { placeRing(rings[0], v.set(110, BAY_Y + 70, BAY_MOUTH_Z - 650), v2.set(110, BAY_Y + 70, BAY_MOUTH_Z - 2000)); G.waypoint = { obj: rings[0].g, label: 'RING' }; }, check: () => through(rings[0]) },
    { lines: ['t-roll'], task: 'roll', enter() { rollAcc = 0; G.waypoint = null; }, check: () => rollAcc > Math.PI * 1.7 },
    { lines: ['t-line-1', 't-line-2'], task: null, enter() { G.lineTag = true; }, check: () => true },
    { lines: ['t-boost'], task: 'boost', enter() {
      G.lineTag = false; boostT = 0;
      fwd.set(0, 0, -1).applyQuaternion(ship.quat);
      rings[1].g.position.copy(ship.pos).addScaledVector(fwd, 1400); rings[1].g.lookAt(v.copy(ship.pos).addScaledVector(fwd, 3000));
      rings[1].g.visible = true; rings[1].passed = false; rings[1].side = 0;
      G.waypoint = { obj: rings[1].g, label: 'RING' };
    }, check() {
      if (!through(rings[1])) return false;
      if (boostT > 0.4) return true;
      // passed without boosting: move it on and ask again
      fwd.set(0, 0, -1).applyQuaternion(ship.quat);
      rings[1].g.position.copy(ship.pos).addScaledVector(fwd, 1500); rings[1].g.lookAt(v.copy(ship.pos).addScaledVector(fwd, 3000));
      rings[1].g.visible = true; rings[1].passed = false; rings[1].side = 0;
      story.line('t-boost-again');
      return false;
    } },
    { lines: ['t-radio-1', 't-radio-2', 't-radio-3', 't-radio-4'], task: null, enter() { G.waypoint = null; G.targetIndex = (KESSA + 2) % ctx.planets.length; }, check: () => true },
    { lines: ['t-target'], task: 'target', check: () => G.targetIndex === KESSA },
    { lines: ['t-face'], task: 'face', check() {
      fwd.set(0, 0, -1).applyQuaternion(ship.quat);
      return fwd.angleTo(v.copy(kessa().center).sub(ship.pos)) < 0.16;
    } },
    { lines: ['t-cruise'], task: 'cruise', check: () => ship.cruise === 2 },
    // the trip: a tip, Orrick's broadcast, then (usually) his scouts on the route
    { lines: [], task: null, enter() { cruiseT = 0; beats = 0; G.cruiseDrop = null; }, check(dt) {
      if (ship.cruise === 2) cruiseT += dt;
      if (beats === 0 && cruiseT > 1.5) { beats = 1; story.line('t-cruise-tip'); }
      if (beats === 1 && cruiseT > 3 && !story.busy) { beats = 2; story.lines(['t-orrick-1', 't-orrick-2', 't-orrick-3']); }
      if (!sawScouts && ((G.cruiseDrop && G.cruiseDrop.squad) || (G.prompt && G.prompt.type === 'engage'))) { sawScouts = true; return 'scouts'; }
      if (G.prompt && G.prompt.type === 'land') return 'land';
      return false;
    } },
  ];
  // the first raiders: why cruise dropped, what the threat tag means, fight or slip past.
  // Ends when they are beaten, we lost, or we are clear of them (cruise is free again).
  let raidEnd = null;
  // past them: cruising again, or well clear of every patrol (cruise drops us inside 5 km, and can't hold until we are past that)
  const raidClear = () => !G.squads.some((sq) => sq.state === 'patrol' && sq.pos.distanceTo(ship.pos) < 5200);
  const SCOUTS = { lines: ['t-raid-1', 't-raid-2', 't-raid-3'], task: 'engage', enter() { story.flush(); raidEnd = null; G.cruiseDrop = null; G.lastAssault = null; }, check() {
    if (G.state !== 'flight' || G.inAssault) return false; // in the fight, or its result card is up
    if (G.lastAssault) { raidEnd = G.lastAssault.win ? 'won' : 'lost'; return true; }
    if (ship.cruise === 2 || raidClear()) { raidEnd = 'skip'; return true; }
    return false;
  } };
  const RECRUISE = { lines: ['t-recruise'], task: 'cruise', enter() {
    cruiseT = 0;
    this.lines = raidEnd === 'won' ? ['t-raid-won', 't-recruise'] : raidEnd === 'skip' ? ['t-raid-skip', 't-recruise'] : ['t-recruise'];
    if (raidEnd === 'skip' && ship.cruise > 0) this.lines = ['t-raid-skip'];
  }, check(dt) {
    if (ship.cruise === 2) cruiseT += dt;
    if (cruiseT > 1.5 && !G.heard.has('t-wardens') && !story.busy) story.line('t-wardens');
    if (G.prompt && G.prompt.type === 'land') return 'land';
    return false;
  } };
  const LAND = { lines: ['t-kessa'], task: 'land', check: () => G.state === 'entry' || G.inSurface };

  let cur = null;
  function go(s) {
    cur = s; stepT = 0; armed = false; latched = false;
    if (s.enter) s.enter();
    task(null);
    talking = true;
    story.lines(s.lines, () => { talking = false; task(s.task); });
  }
  function finish() {
    cur = null; task(null); G.waypoint = null; G.lineTag = false;
    for (const r of rings) r.g.visible = false;
    G.tutorialDone = true; G.tutorial = null;
    ctx.save();
  }

  return {
    get active() { return !!cur; },
    start() { step = 0; sawScouts = false; go(STEPS[0]); },
    jump(k) { step = k; go(STEPS[k]); }, // test hook: start at lesson k
    // Save checkpoint: from the radio call on (lesson 5), a save resumes the lesson instead of the dock.
    // Earlier lessons place their rings relative to the bay, so they restart from it.
    get checkpoint() { return cur && step >= 5 ? Math.min(step, STEPS.length - 1) : null; },
    resume(k) {
      sawScouts = G.heard.has('t-raid-1');
      if (k >= STEPS.length - 1 && sawScouts) { step = STEPS.length - 1; raidEnd = null; go(RECRUISE); return; }
      step = k; go(STEPS[k]);
      if (k === STEPS.length - 1) beats = G.heard.has('t-orrick-1') ? 2 : G.heard.has('t-cruise-tip') ? 1 : 0;
    },
    // landing on a world finishes the tutorial (the entry takes us out of flight before LAND's check runs)
    complete() { if (cur) finish(); },
    abort() { story.clear(); for (const r of rings) r.g.visible = false; cur = null; task(null); G.waypoint = null; G.lineTag = false; },
    skip() {
      story.clear();
      for (const r of rings) r.g.visible = false;
      cur = null; task(null); G.waypoint = null; G.lineTag = false;
      G.targetIndex = KESSA;
      station.setClamps(true);
      G.tutorialDone = true; G.tutorial = null;
      story.lines(['t-radio-4']);
      ctx.save();
    },
    update(dt) {
      if (!cur) return;
      stepT += dt;
      rollAcc += Math.abs(ship.ang.z) * dt;
      if (ship.boosting) boostT += dt;
      // the check is latched: doing the thing while WREN is still talking still counts
      if (!latched) latched = cur.check(dt);
      if (!latched || talking) return; // let WREN finish before the next lesson
      const r = latched;
      if (r === 'scouts') { go(SCOUTS); return; }
      if (r === 'land') { go(LAND); return; }
      if (cur === LAND) { finish(); return; }
      if (cur === SCOUTS) { go(RECRUISE); return; }
      step++;
      if (step < STEPS.length) go(STEPS[step]); else finish();
    },
  };
}
