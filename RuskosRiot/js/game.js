/* ===========================================================================
   RUSKO'S RIOT  --  game.js
   Level 1 vertical slice: Billy the Bully, bananas only.

   THE CORE IDEA
   -------------
   You are crouched behind your lunch tray and you are safe there. Drawing the
   slingshot means standing up, and standing up is the only way to get hit.
   So Billy's "ready to throw" pose is not a prompt to press a duck button --
   it is a one second warning to either take the shot you have or let go and
   get down. One input, no button, no gesture conflict, works the same on
   mouse, touch and keyboard.
   =========================================================================== */
(function () {
'use strict';

const CFG = RR.CFG;
const A   = RR.Assets;
const W = CFG.W, H = CFG.H, CX = CFG.CX;

/* --------------------------------------------------------------------------
   SCENE MATHS
   -------------------------------------------------------------------------- */
const scale  = fy => (fy - CFG.HORIZON) / CFG.SPAN;
const slotX  = s  => CX + s.wx * scale(s.floorY);
const clamp  = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp   = (a, b, t) => a + (b - a) * t;
const rnd    = (a, b) => a + Math.random() * (b - a);
const ease   = t => t * t * (3 - 2 * t);

/* --------------------------------------------------------------------------
   TINY SYNTHESISED SFX  (no audio files needed)
   -------------------------------------------------------------------------- */
const Snd = (function () {
  let ac = null;
  const on = () => { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } };
  function tone(f0, f1, dur, type, gain) {
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), ac.currentTime + dur);
    g.gain.setValueAtTime(gain || 0.16, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
  }
  function noise(dur, gain, lp) {
    if (!ac) return;
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp || 1400;
    const g = ac.createGain(); g.gain.value = gain || 0.3;
    src.connect(f); f.connect(g); g.connect(ac.destination); src.start();
  }
  return {
    on,
    draw:  () => tone(160, 420, 0.28, 'sawtooth', 0.05),
    throw_:() => tone(700, 180, 0.16, 'triangle', 0.10),
    splat: () => { noise(0.30, 0.42, 1000); tone(220, 60, 0.22, 'square', 0.09); },
    hit:   () => { noise(0.22, 0.34, 1800); tone(900, 300, 0.12, 'triangle', 0.10); },
    miss:  () => noise(0.16, 0.16, 700),
    slip:  () => { tone(300, 1200, 0.22, 'sine', 0.12); tone(1200, 200, 0.30, 'sine', 0.08); },
    warn:  () => tone(500, 500, 0.10, 'square', 0.07),
    lose:  () => tone(320, 70, 0.7, 'sawtooth', 0.14),
    win:   () => { tone(520, 780, 0.16, 'triangle', 0.13); setTimeout(() => tone(780, 1180, 0.26, 'triangle', 0.13), 150); }
  };
})();

/* --------------------------------------------------------------------------
   GAME STATE
   -------------------------------------------------------------------------- */
const G = {
  mode: 'load',            // load | title | play | clear | over | laundry
  levelIdx: 0,
  level: CFG.LEVELS[0],
  ammoLeft: {},            // per-level counts; banana is Infinity
  banner: null,            // transient "LEVEL 2 / COOKIES UNLOCKED" strip
  t: 0, dt: 0,
  clock: CFG.LEVEL_TIME,
  score: 0, combo: 0, comboMul: 1,
  shirts: CFG.SHIRTS,
  misses: 0, hits: 0, forcedDown: 0,
  ammo: 'banana',
  debug: false,
  shake: 0, shakeT: 0,
  flash: 0,
  msg: null, msgT: 0
};

/* The lunch tray IS the duck mechanic. raise = 1 means it is up in front of
   your face and you are safe behind it; raise = 0 means it is down on the
   table so you can draw the slingshot. Nothing else guards you, so the
   picture on screen and the rule in code are the same thing. */
const tray = { raise: 1, recoil: 0 };
const trayHits = [];        // splat decals left on the tray face

const player = {
  drawing: false, power: 0, vwx: 0,
  lastShot: -9, dead: false, deadT: 0,
  // exposed is derived straight from the tray, so it can never disagree
  // with what the player can see.
  get exposed() { return tray.raise < CFG.TRAY_SAFE; }
};

const enemy = {
  slot: 4, state: 'hidden', t: 0, dur: 0.8, pop: 0,
  hp: 6, maxHp: 6, poppedAt: 0, hitThisPop: false,
  dodgeAt: 0,                 // Coach Ken: when to bail on a shot in flight
  char: null, hscale: 1
};

/* Props a melon has destroyed, by slot index. Reset every level. */
let slotBroken = [];

/* One of Dan's helpers, mid-cameo. They cannot be killed, but hitting one
   cancels the throw they were winding up. Only ever one at a time. */
let cameo = null;
let cameoTimer = 0;

let ball = null;          // the player's food in flight
/* An array, not a single object: Mrs. Gabel throws cookies in PAIRS, so more
   than one can be in the air at once. Each carries its own delay and flight
   time and resolves independently. */
let inbounds = [];
const splats = [];        // world splats
const pops   = [];        // floating score text
const peels  = [];        // banana peels on the floor  { slot, fy, wx }
let fullSplat = null;     // the you-got-hit screen wipe

/* Which food ruined which shirt. Index 0..SHIRTS-1; null means still clean.
   Stored per shirt (not just a count) so the card can show the exact splat
   that did the damage -- bananas on one, cookies on the next, and so on. */
let shirtSplats = new Array(CFG.SHIRTS).fill(null);
let shirtCard = null;     // { t, dur, hold, justHit }

/* --------------------------------------------------------------------------
   HELPERS TIED TO THE ART
   -------------------------------------------------------------------------- */
/* Everything below takes an "occupant" -- an object with {slot, pop, state,
   char, hscale}. The boss and his cameo helpers are both occupants, so the
   same geometry, clipping and hit-testing serves both without duplication. */
const charKey = (st, char) => 'char.' + (char || G.level.char) + '.' + st;

/** Cover height for a slot, in design units. A slot whose prop has been
    blown apart by a melon leaves only rubble to hide behind. */
function coverH(slot) {
  return slotBroken[CFG.SLOTS.indexOf(slot)] ? CFG.BROKEN_COVER_H
                                             : A.dim('props.' + slot.prop).dh;
}

/** Standing height of an occupant. Principal Dan carries a charScale so he
    physically looms over the three who came before him. */
function occH(o) {
  return A.dim(charKey('idle', o.char)).dh * (o.hscale || 1);
}
const hideAmt = (slot, o) => occH(o) - coverH(slot) + 60;

/** How far this occupant's sprite is pushed down right now, in design units. */
function dropY(o) {
  o = o || enemy;
  return (1 - o.pop) * hideAmt(CFG.SLOTS[o.slot], o);
}

/** The vertical band you can actually hit, in design units measured up from
    the floor. Null when they are not exposed at all. */
function hitBand(o) {
  o = o || enemy;
  const s = CFG.SLOTS[o.slot];
  const lo = coverH(s);
  const hi = occH(o) - dropY(o);
  return (hi - lo) > 40 ? { lo, hi } : null;
}

const POSE = {
  hidden: 'idle', rising: 'idle', descend: 'idle', idle: 'idle',
  duck: 'duck', ready: 'ready', throw: 'throw',
  angry: 'angry', surprised: 'surprised'
};
const spriteFor = o => POSE[(o || enemy).state];

/* --------------------------------------------------------------------------
   AMMO
   -------------------------------------------------------------------------- */
const ammoCount = k => (G.ammoLeft[k] === undefined ? Infinity : G.ammoLeft[k]);
const ammoList  = () => G.level.unlocked || ['banana'];

function selectAmmo(k) {
  if (!ammoList().includes(k) || ammoCount(k) <= 0) return false;
  if (G.ammo !== k) { G.ammo = k; Snd.warn(); }
  return true;
}

/** Drop back to the banana when a limited food runs dry -- you should never
    be left holding an empty slingshot. */
function ensureAmmo() {
  if (ammoCount(G.ammo) <= 0) G.ammo = 'banana';
}

/* --------------------------------------------------------------------------
   SHIRTS
   Each ruined shirt is baked once into an offscreen canvas: draw the shirt,
   flip to 'source-atop', then draw the splat. The splat is therefore clipped
   to the shirt's own silhouette instead of floating over it as a sticker.
   -------------------------------------------------------------------------- */
const shirtCache = {};
function shirtCanvas(food) {
  if (!food) return A.get('props.shirt');
  if (shirtCache[food]) return shirtCache[food];

  const im = A.get('props.shirt');
  const w = im.naturalWidth || 392, h = im.naturalHeight || 392;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');

  x.drawImage(im, 0, 0, w, h);
  x.globalCompositeOperation = 'source-atop';   // <- clips the splat to the shirt
  const key = 'food.' + food + '_splat';
  const sp = A.get(key), sd = A.dim(key);
  if (sp && sd) {
    const sw = w * 1.15, sh = sw * (sd.dh / sd.dw);
    x.drawImage(sp, (w - sw) / 2, h * 0.46 - sh / 2, sw, sh);
  }
  shirtCache[food] = c;
  return c;
}

/* --------------------------------------------------------------------------
   BOSS PHASES
   A phase is just a block of behaviour keyed to remaining health. G.pc is the
   level config with the current phase merged over it, so updateEnemy reads
   one object and never has to know whether it is fighting a boss or not.
   -------------------------------------------------------------------------- */
function refreshPhase(silent) {
  const L = G.level;
  if (!L.phases) { G.pc = L; G.phaseIdx = -1; return; }
  const f = enemy.maxHp ? enemy.hp / enemy.maxHp : 1;
  let idx = 0;
  L.phases.forEach((ph, i) => { if (f <= ph.at) idx = i; });
  if (idx === G.phaseIdx) return;

  const first = G.phaseIdx < 0;
  G.phaseIdx = idx;
  G.pc = Object.assign({}, L, L.phases[idx]);

  if (!first && !silent) {
    const ph = L.phases[idx];
    G.banner = { t: 0, dur: 3.0, title: 'PHASE ' + (idx + 1) + '  -  ' + ph.name,
                 sub: ph.note, tip: null };
    G.flash = 1; G.shake = 26; G.shakeT = 0.45;
    inbounds.length = 0;
    cameo = null;
    cameoTimer = 1.2;
    // he withdraws for a beat, then comes back meaner
    setState('descend', CFG.POP_TIME);
    Snd.lose();
  }
}

/* --------------------------------------------------------------------------
   ENEMY STATE MACHINE
   -------------------------------------------------------------------------- */
function setState(st, dur) { enemy.state = st; enemy.t = 0; enemy.dur = dur; }

/** Timings tighten as Billy loses health -- he gets faster and angrier. */
function rage() {
  const f = enemy.hp / enemy.maxHp;
  return lerp(G.level.rageScale, 1, f);
}

function pickSlot() {
  const L = G.level;
  // Mrs. Gabel keeps drifting back to her steam table. It makes her readable
  // in a way Billy is not -- you can bait that slot -- without making her
  // predictable enough to camp.
  if (L.favouriteSlot != null && enemy.slot !== L.favouriteSlot &&
      Math.random() < (L.favouriteBias || 0)) {
    enemy.slot = L.favouriteSlot; return;
  }
  let i;
  do { i = Math.floor(Math.random() * CFG.SLOTS.length); } while (i === enemy.slot && CFG.SLOTS.length > 1);
  enemy.slot = i;
}

function updateEnemy(dt) {
  enemy.t += dt;
  const L = G.pc || G.level, done = enemy.t >= enemy.dur;

  switch (enemy.state) {
    case 'hidden':
      enemy.pop = 0;
      // FINAL BELL: he stops hiding. Plants himself at the near table and
      // never goes back down -- trivial to hit, and relentless.
      if (L.standing) { enemy.slot = 4; checkPeel(); setState('rising', CFG.POP_TIME); break; }
      if (done) { pickSlot(); checkPeel(); setState('rising', CFG.POP_TIME); }
      break;

    case 'rising':
      enemy.pop = ease(clamp(enemy.t / enemy.dur, 0, 1));
      if (done) {
        enemy.pop = 1; enemy.hitThisPop = false; enemy.poppedAt = G.t; enemy.dodgeAt = 0;
        setState('idle', rnd(L.idleTime[0], L.idleTime[1]) * rage());
      }
      break;

    case 'idle':
      enemy.pop = 1;
      // Coach Ken sees it coming and drops. Nobody before him reacts to the
      // player at all, which is exactly why the tomato unlocks here.
      if (!L.standing && enemy.dodgeAt && G.t >= enemy.dodgeAt) {
        enemy.dodgeAt = 0; setState('duck', 0.62); break;
      }
      // mid-idle bob: he drops behind cover for a moment, so you have to
      // read him rather than just holding the slingshot at full draw.
      if (!L.standing && !done && enemy.t > enemy.dur * 0.4 && Math.random() < L.dodgeChance * dt) {
        setState('duck', 0.55); break;
      }
      if (done) { Snd.warn(); setState('ready', L.readyTime * rage()); }
      break;

    case 'duck':
      enemy.pop = 0.34;
      if (done) setState('idle', rnd(0.5, 1.0) * rage());
      break;

    case 'ready':                    // <- the GET DOWN tell
      enemy.pop = 1;
      if (!L.standing && enemy.dodgeAt && G.t >= enemy.dodgeAt) {
        enemy.dodgeAt = 0; setState('duck', 0.62); break;
      }
      if (done) { throwAtPlayer(); setState('throw', 0.5); }
      break;

    case 'throw':
      enemy.pop = 1;
      if (done) setState(L.standing ? 'idle' : 'descend',
                         L.standing ? rnd(L.idleTime[0], L.idleTime[1]) : CFG.POP_TIME);
      break;

    case 'angry':
    case 'surprised':
      enemy.pop = 1;
      if (done) setState(L.standing ? 'idle' : 'descend',
                         L.standing ? rnd(L.idleTime[0], L.idleTime[1]) : CFG.POP_TIME);
      break;

    case 'descend':
      enemy.pop = 1 - ease(clamp(enemy.t / enemy.dur, 0, 1));
      if (done) setState('hidden', rnd(L.hideTime[0], L.hideTime[1]) * rage());
      break;
  }
}

/** Billy stepping on a peel you left at this slot. */
function checkPeel() {
  const idx = peels.findIndex(p => p.slot === enemy.slot);
  if (idx < 0) return;
  peels.splice(idx, 1);
  damage(1, 'PEEL SLIP!', CFG.SCORE.peelSlip, true);
  Snd.slip();
  setState('surprised', 0.9);
}

/* --------------------------------------------------------------------------
   SHOOTING
   -------------------------------------------------------------------------- */

/** Distance from the shot to the NEAREST exposed part of the enemy, in design
    units -- not to his centre. Measuring to the centre meant a tomato bursting
    on the table directly in front of him scored as ~560 units away and did
    nothing, which is the opposite of what a tomato should do. Zero means the
    shot is already inside his body box. */
function splashGap(s) {
  const lo  = coverH(s);
  const top = Math.max(occH(enemy) - dropY(), lo);
  const dy  = ball.h > top ? ball.h - top : (ball.h < lo ? lo - ball.h : 0);
  const dx  = Math.max(0, Math.abs(ball.wx - s.wx) - CFG.HIT_HALF_W);
  return Math.hypot(dx, dy);
}

/** Tomato logic: no direct hit required. If the shot reaches the enemy's depth
    anywhere within `splash` of their body -- including smacking into the cover
    in front of them -- it still connects, for a fraction of the damage. This
    is the counter to anybody who ducks. */
function trySplash(s) {
  const a = CFG.AMMO[ball.ammo];
  if (!a.splash || enemy.hitThisPop) return false;
  if (enemy.pop < 0.06) return false;               // genuinely gone, not just low
  if (splashGap(s) > a.splash) return false;
  resolveHit(false, s, { splash: true, ducked: enemy.pop < 0.92 });
  return true;
}
function fire(power, vwx) {
  ensureAmmo();
  const key = G.ammo;
  ball = {
    fy: CFG.LAUNCH_FY, h: CFG.H0, wx: 0,
    vfy: -power * CFG.VFY,
    vh:  power * CFG.VH,
    vwx: clamp(vwx, -CFG.LAT_MAX, CFG.LAT_MAX),
    rot: 0, ammo: key, dead: false, trail: [],
    bounces: 0, banked: false, skipped: false
  };
  if (G.ammoLeft[key] !== undefined) G.ammoLeft[key]--;

  // roll the reactive dodge the instant you commit to the shot
  const rd = (G.pc || G.level).reactDodge || 0;
  enemy.dodgeAt = (rd && Math.random() < rd && (enemy.state === 'idle' || enemy.state === 'ready'))
    ? G.t + rnd(0.30, 0.55) : 0;

  player.lastShot = G.t;
  ensureAmmo();
  Snd.throw_();
}

function updateBall(dt) {
  if (!ball) return;
  const prevFy = ball.fy;
  ball.fy  += ball.vfy * dt;
  ball.h   += ball.vh  * dt;
  ball.vh  -= CFG.G * dt;
  ball.wx  += ball.vwx * dt;
  ball.rot += dt * 11;

  ball.trail.push({ fy: ball.fy, h: ball.h, wx: ball.wx });
  if (ball.trail.length > 14) ball.trail.shift();

  const ammo0 = CFG.AMMO[ball.ammo];

  // a melon takes out any cover it runs into, at any slot, before anything else
  if (ammo0.breaksCover) {
    for (let i = 0; i < CFG.SLOTS.length; i++) {
      const sl = CFG.SLOTS[i];
      if (slotBroken[i]) continue;
      if (!(prevFy > sl.floorY && ball.fy <= sl.floorY)) continue;
      if (ball.h > coverH(sl)) continue;                    // sailed clean over
      if (Math.abs(ball.wx - sl.wx) > A.dim('props.' + sl.prop).dw * 0.5) continue;
      breakCover(i, sl);
      return;
    }
  }

  // swat one of Dan's helpers out of their wind-up
  if (cameo && cameo.pop > 0.5) {
    const cs = CFG.SLOTS[cameo.slot];
    if (prevFy > cs.floorY && ball.fy <= cs.floorY) {
      const cb = hitBand(cameo);
      if (cb && Math.abs(ball.wx - cs.wx) < CFG.HIT_HALF_W &&
          ball.h >= cb.lo && ball.h <= cb.hi) { hitCameo(cs); return; }
    }
  }

  // did it cross the plane the enemy is standing on?
  const s = CFG.SLOTS[enemy.slot];
  if (prevFy > s.floorY && ball.fy <= s.floorY) {
    const band = hitBand(enemy);
    const near = Math.abs(ball.wx - s.wx) < CFG.HIT_HALF_W;
    if (band && near && ball.h >= band.lo && ball.h <= band.hi && !enemy.hitThisPop) {
      const headLo = band.hi - (band.hi - band.lo) * CFG.HEAD_FRAC;
      resolveHit(ball.h >= headLo, s);
      return;
    }
    // no clean hit -- but a tomato does not need one
    if (trySplash(s)) return;
    // close but no cigar -- he notices
    if (Math.abs(ball.wx - s.wx) < CFG.HIT_HALF_W * 2.6 && enemy.pop > 0.6 &&
        (enemy.state === 'idle' || enemy.state === 'ready')) {
      setState('surprised', 0.7);
    }
  }

  const a = CFG.AMMO[ball.ammo];

  // Cookies bank off the side walls. Going the long way round is worth more
  // than a straight hit, and it is the only way to reach somebody tucked in
  // hard against a wall slot.
  if (a.ricochet && Math.abs(ball.wx) > CFG.WALL_X && Math.sign(ball.wx) === Math.sign(ball.vwx)) {
    ball.wx = Math.sign(ball.wx) * CFG.WALL_X;
    ball.vwx *= -0.86;
    ball.banked = true;
    addSplat(ball.fy, ball.wx, a.splat, 0.20, ball.h);
    Snd.hit();
  }

  // ...and skip off the floor, so a shot that falls short still has a life
  // left in it.
  if (a.ricochet && ball.h <= 0 && ball.bounces < a.maxBounces && ball.fy > CFG.FLOOR_TOP + 60) {
    ball.h = 1;
    ball.vh = Math.abs(ball.vh) * a.bounceKeep;
    ball.vfy *= 0.88;
    ball.bounces++;
    ball.skipped = true;
    addSplat(ball.fy, ball.wx, a.splat, 0.18, 0);
    Snd.miss();
    return;
  }

  if (ball.h <= 0 || ball.fy <= CFG.FLOOR_TOP) land();
}

function land() {
  const fy = clamp(ball.fy, CFG.FLOOR_TOP, CFG.FLOOR_BOT);
  const a = CFG.AMMO[ball.ammo];
  addSplat(fy, ball.wx, a.splat, 0.55);
  Snd.miss();

  if (a.leavesPeel) {
    // a miss is not wasted -- it becomes a trap
    const s = CFG.SLOTS.find(sl => Math.abs(sl.floorY - fy) < CFG.PEEL_SNAP &&
                                    Math.abs(sl.wx - ball.wx) < 520);
    if (s) {
      const i = CFG.SLOTS.indexOf(s);
      if (!peels.some(p => p.slot === i)) {
        peels.push({ slot: i, fy: s.floorY, wx: s.wx });
        addPop(slotX(s), s.floorY - 90, 'PEEL SET', '#ffd23f', 0.9);
      }
    }
  }
  breakCombo();
  ball = null;
}

function resolveHit(headshot, s, opt) {
  opt = opt || {};
  const a   = CFG.AMMO[ball.ammo];
  const own = G.level.ownMedicine && ball.ammo === G.level.signature;
  let dmg = a.dmg * (headshot ? 2 : 1) * (own ? 2 : 1);
  if (opt.splash) dmg = Math.max(1, Math.round(dmg * (a.splashDmg || 0.5)));

  // grab the trick-shot flags BEFORE the ball is discarded
  const skipped = ball.skipped, banked = ball.banked;
  addSplat(s.floorY, s.wx, a.splat, opt.splash ? 1.15 : 0.8, occH(enemy) * 0.55);
  enemy.hitThisPop = true;
  ball = null;

  let label = headshot ? 'FACEPLANT!' : 'SPLAT!';
  let bonus = 0;
  if (own)          { bonus += CFG.SCORE.ownMedicine;  label = 'OWN MEDICINE!'; }
  if (skipped)      { bonus += CFG.SCORE.skipShot;     label = 'SKIP SHOT!'; }
  if (banked)       { bonus += CFG.SCORE.bankShot;     label = 'BANK SHOT!'; }
  if (opt.splash)   { bonus += CFG.SCORE.splashHit;    label = 'SPLASH!'; }
  if (opt.ducked)   { bonus += CFG.SCORE.caughtDucking; label = 'CAUGHT DUCKING!'; }
  if (G.t - enemy.poppedAt < CFG.SCORE.quickWindow) { bonus += CFG.SCORE.quickDraw; }

  damage(dmg, label, bonus, false, headshot);
  Snd.hit();
  G.shake = CFG.SHAKE_HIT; G.shakeT = 0.22;
}

/** Single funnel for every source of damage so scoring stays consistent. */
function damage(dmg, label, bonus, isPeel, headshot) {
  const s = CFG.SLOTS[enemy.slot];
  enemy.hp = Math.max(0, enemy.hp - dmg);
  G.hits++;
  G.combo++;
  G.comboMul = Math.min(CFG.SCORE.comboMax, 1 + (G.combo - 1) * CFG.SCORE.comboStep);

  const depth = CFG.SCORE.depthMul[s.floorY] || 1;
  let pts = CFG.SCORE.hit * depth * (headshot ? CFG.SCORE.headshot : 1) + (bonus || 0);
  pts = Math.round(pts * G.comboMul);
  G.score += pts;

  addPop(slotX(s), s.floorY - occH(enemy) * scale(s.floorY) * 0.75, label, isPeel ? '#ffd23f' : '#fff', 1.1);
  addPop(slotX(s), s.floorY - occH(enemy) * scale(s.floorY) * 0.55, '+' + pts, '#8ef58a', 1.0);

  if (enemy.hp <= 0) { winLevel(); return; }
  if (!isPeel) setState('angry', 0.62);
  refreshPhase();                     // may hand the fight to the next phase
}

function breakCombo() { G.misses++; G.combo = 0; G.comboMul = 1; }

/* --------------------------------------------------------------------------
   MELONS: DEMOLITION
   A melon that runs into a piece of cover takes it out of the fight for good.
   The slot stays playable but only leaves rubble to hide behind, so whoever
   pops up there is almost fully exposed for the rest of the level.
   -------------------------------------------------------------------------- */
function breakCover(i, sl) {
  const wasH = coverH(sl);
  slotBroken[i] = true;
  addSplat(sl.floorY, sl.wx, 'watermelon_splat', 1.6, wasH * 0.6);
  const pts = Math.round(CFG.SCORE.rindBreaker * G.comboMul);
  G.score += pts;
  addPop(slotX(sl), sl.floorY - 240, 'RIND BREAKER!', '#ffd23f', 1.3);
  addPop(slotX(sl), sl.floorY - 170, '+' + pts, '#8ef58a', 1.1);
  G.shake = 30; G.shakeT = 0.42;
  Snd.splat();
  ball = null;
}

/* --------------------------------------------------------------------------
   CAMEOS
   From phase 2 Dan sends for the three you already beat. They cannot be
   killed and they are not worth health -- but they wind up in plain sight,
   and hitting one cancels the throw. Ignore them and you are eating food
   from two directions at once.
   -------------------------------------------------------------------------- */
function spawnCameo() {
  const L = G.pc || G.level;
  const chars = L.cameoChars || [];
  if (!chars.length) return;
  let slot;
  do { slot = Math.floor(Math.random() * CFG.SLOTS.length); } while (slot === enemy.slot);
  cameo = {
    char: chars[Math.floor(Math.random() * chars.length)],
    slot, pop: 0, state: 'rising', t: 0, hscale: 1
  };
  cameo.food = (L.cameoFood || {})[cameo.char] || 'banana';
}

function cameoThrow() {
  const s = CFG.SLOTS[cameo.slot];
  inbounds.push({
    t: 0, dur: (G.pc || G.level).throwFlight * 1.05,
    x0: slotX(s), y0: s.floorY - occH(cameo) * scale(s.floorY) * 0.72,
    s0: scale(s.floorY) * 0.55,
    sprite: 'food.' + cameo.food,
    splat: 'food.' + cameo.food + '_splat'
  });
  Snd.throw_();
}

function hitCameo(cs) {
  const a = CFG.AMMO[ball.ammo];
  const sc = scale(cs.floorY), h = occH(cameo);
  addSplat(cs.floorY, cs.wx, a.splat, 0.8, h * 0.55);
  const pts = Math.round(CFG.SCORE.cameoHit * G.comboMul);
  G.score += pts;
  addPop(slotX(cs), cs.floorY - h * sc * 0.78, 'SWATTED!', '#8ef58a', 1.2);
  addPop(slotX(cs), cs.floorY - h * sc * 0.55, '+' + pts, '#8ef58a', 1.0);
  cameo = null;
  G.shake = CFG.SHAKE_HIT; G.shakeT = 0.2;
  Snd.hit();
  ball = null;
}

function updateCameo(dt) {
  const L = G.pc || G.level;
  if (!L.cameo || player.dead) { cameo = null; return; }
  if (cameo) {
    cameo.t += dt;
    switch (cameo.state) {
      case 'rising':
        cameo.pop = ease(clamp(cameo.t / 0.30, 0, 1));
        if (cameo.t >= 0.30) { cameo.pop = 1; cameo.state = 'ready'; cameo.t = 0; Snd.warn(); }
        break;
      case 'ready':                      // the window in which you can swat them
        cameo.pop = 1;
        if (cameo.t >= 0.78) { cameoThrow(); cameo.state = 'throw'; cameo.t = 0; }
        break;
      case 'throw':
        cameo.pop = 1;
        if (cameo.t >= 0.40) { cameo.state = 'descend'; cameo.t = 0; }
        break;
      case 'descend':
        cameo.pop = 1 - ease(clamp(cameo.t / 0.30, 0, 1));
        if (cameo.t >= 0.30) { cameo = null; cameoTimer = rnd(...(L.cameoEvery || [3.5, 5.5])); }
        break;
    }
    return;
  }
  cameoTimer -= dt;
  if (cameoTimer <= 0) spawnCameo();
}

/* --------------------------------------------------------------------------
   BILLY THROWING BACK
   -------------------------------------------------------------------------- */
function throwAtPlayer() {
  const s = CFG.SLOTS[enemy.slot];
  const L = G.pc || G.level;
  const count = L.burst || 1;
  for (let i = 0; i < count; i++) {
    inbounds.push({
      t: -i * (L.burstGap || 0.3),          // negative t = still winding up
      dur: L.throwFlight,
      x0: slotX(s) + (i ? rnd(-70, 70) : 0),
      y0: s.floorY - occH(enemy) * scale(s.floorY) * 0.72,
      s0: scale(s.floorY) * 0.55,
      sprite: 'food.' + L.signature,
      splat: 'food.' + L.signature + '_splat'
    });
  }
  Snd.throw_();
}

function updateInbounds(dt) {
  for (let i = inbounds.length - 1; i >= 0; i--) {
    const inb = inbounds[i];
    const wasWinding = inb.t < 0;
    inb.t += dt;
    if (wasWinding && inb.t >= 0) Snd.throw_();   // second cookie leaves her hand
    if (inb.t < inb.dur) continue;
    inbounds.splice(i, 1);
    resolveInbound();
  }
}

function resolveInbound() {
  if (player.dead) return;              // already splatted by the first one
  const hit = player.exposed;
  if (hit) loseShirt();
  else {
    // it smacks into the raised tray: harmless, but you feel it and the tray
    // wears the evidence for a couple of seconds
    G.shake = 16; G.shakeT = 0.20;
    tray.recoil = 90;
    // Anchored in absolute coords at the moment of impact and drawn UNDER the
    // tray, so it reads as food hitting the back of the shield and spraying
    // out around the rim -- not as food landing on the tray face.
    const R = trayRect();
    // two offset bursts read as a wide spray rather than one pasted decal
    for (let i = 0; i < 2; i++) {
      trayHits.push({ t: i * 0.05, dur: 2.2, sprite: 'food.' + G.level.signature + '_splat',
                      x: CX + rnd(-260, 260), y: R.y + rnd(85, 150),
                      rot: rnd(-0.8, 0.8), sz: rnd(1.0, 1.35) });
    }
    Snd.splat();
    addPop(CX, 1930, 'BLOCKED!', '#8ef58a', 0.9);
  }
}

function loseShirt() {
  const food = G.level.signature;          // whatever he actually threw
  G.shirts--;
  G.forcedDown++;
  shirtSplats[CFG.SHIRTS - G.shirts - 1] = food;
  shirtCard = { t: 0, dur: CFG.SHIRT_SHOW, hold: G.shirts <= 0,
                justHit: CFG.SHIRTS - G.shirts - 1 };
  player.dead = true; player.deadT = 0;
  player.drawing = false;
  // getting hit cancels whatever shot was cocked -- without this the drag
  // object survives the three-shirt card, and the pointerup that follows
  // (a real player's hand is still mid-release when the hit lands) fires it
  // anyway, wasting ammo on a shot the player never meant to take.
  drag = null; kbCharge = 0;
  inbounds.length = 0;              // the rest of the burst is moot now
  fullSplat = { t: 0, dur: 1.5, sprite: 'food.' + G.level.signature + '_splat' };
  G.shake = CFG.SHAKE_SPLAT; G.shakeT = 0.5;
  G.flash = 1;
  breakCombo();
  Snd.splat(); Snd.lose();

  // Out of shirts: the card holds instead of fading and offers the laundry.
  if (G.shirts <= 0) { G.mode = 'laundry'; }
}

/* ==========================================================================
   THE LAUNDRY  --  rewarded-ad continue
   ==========================================================================
   AD MECHANICS ARE NOT WIRED UP YET. watchAdForLaundry() currently behaves as
   though an ad was shown and completed successfully, so the flow is playable
   end to end.

   To integrate for real, replace the marked block with the ad SDK call and
   branch on its result:

       adSDK.showRewarded({
         onReward:   grantLaundry,       // completed -> clean shirts
         onSkipped:  declineLaundry,     // bailed early -> no reward, game over
         onFailed:   declineLaundry      // no fill / offline -> do not punish,
       });                               //   consider granting it anyway

   Everything below the SDK boundary is already written, so wiring it up is a
   single function body. Keep grantLaundry() as the only path that hands out
   shirts, so a broken SDK can never silently award them.
   ========================================================================== */
function watchAdForLaundry() {
  /* ---- BEGIN AD SDK STUB ------------------------------------------------
     Real implementation: pause audio, call the rewarded placement, and only
     call grantLaundry() from its success callback. For now we assume the
     player watched it.                                                     */
  const adCompleted = true;
  /* ---- END AD SDK STUB ------------------------------------------------- */

  if (adCompleted) grantLaundry(); else declineLaundry();
}

function grantLaundry() {
  G.shirts = CFG.LAUNDRY_RESTORES;
  shirtSplats = new Array(CFG.SHIRTS).fill(null);
  shirtCard = null;
  fullSplat = null;
  player.dead = false; player.deadT = 0; player.drawing = false;
  tray.raise = 1;
  drag = null;
  setState('hidden', 1.2);
  G.mode = 'play';
  Snd.win();
}

function declineLaundry() {
  shirtCard = null;
  G.mode = 'over';
}

/** Button rects, shared by the renderer and the hit test so they cannot
    drift apart. */
function laundryButtons() {
  return {
    yes: { x: CX - 400, y: 1618, w: 800, h: 158 },
    no:  { x: CX - 400, y: 1812, w: 800, h: 118 }
  };
}
function inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }

/* --------------------------------------------------------------------------
   FX
   -------------------------------------------------------------------------- */
function addSplat(fy, wx, spriteKey, size, h) {
  splats.push({ fy, wx, h: h || 0, sprite: 'food.' + spriteKey, t: 0, dur: 1.5,
                size: size || 0.7, rot: rnd(-0.5, 0.5) });
}
function addPop(x, y, text, color, life) {
  pops.push({ x, y, text, color: color || '#fff', t: 0, dur: life || 1.0 });
}

/* --------------------------------------------------------------------------
   LEVEL FLOW
   -------------------------------------------------------------------------- */
function winLevel() {
  let bonus = 0;
  if (G.misses === 0)     bonus += CFG.SCORE.flawless;
  if (G.forcedDown === 0) bonus += CFG.SCORE.untouched;
  bonus += Math.max(0, Math.round(G.clock)) * CFG.SCORE.timeBonus;
  G.score += bonus;
  G.endBonus = bonus;
  // a clean shirt back for clearing -- keeps a bruising level from bleeding
  // straight into the next one with nothing left
  G.laundered = 0;
  for (let i = CFG.SHIRTS - 1; i >= 0 && G.laundered < CFG.CLEAR_SHIRT_BONUS; i--) {
    if (shirtSplats[i]) { shirtSplats[i] = null; G.shirts++; G.laundered++; }
  }
  G.mode = G.level.boss ? 'victory' : 'clear';
  ball = null; inbounds.length = 0; cameo = null;
  Snd.win();
}

const hasNextLevel = () => G.levelIdx + 1 < CFG.LEVELS.length;

/** idx = which level; fresh = start a brand new run rather than continuing. */
function startLevel(idx, fresh) {
  G.levelIdx = clamp(idx || 0, 0, CFG.LEVELS.length - 1);
  G.level = CFG.LEVELS[G.levelIdx];
  const L = G.level;

  G.mode = 'play';
  G.clock = L.time || CFG.LEVEL_TIME;
  G.combo = 0; G.comboMul = 1;
  G.misses = 0; G.hits = 0; G.forcedDown = 0;

  if (fresh) {
    G.score = 0;
    G.shirts = CFG.SHIRTS;
    shirtSplats = new Array(CFG.SHIRTS).fill(null);
  }

  // ammo is restocked per level; banana stays unlimited
  G.ammoLeft = {};
  for (const k of (L.unlocked || ['banana'])) {
    const c = (L.ammoCounts && L.ammoCounts[k] !== undefined) ? L.ammoCounts[k] : CFG.AMMO[k].count;
    if (c !== Infinity) G.ammoLeft[k] = c;
  }
  G.ammo = (L.unlocked && L.unlocked.length > 1) ? L.signature : 'banana';
  ensureAmmo();

  enemy.hp = enemy.maxHp = L.hp;
  enemy.slot = 4; setState('hidden', 1.0); enemy.pop = 0; enemy.dodgeAt = 0;
  enemy.char = L.char; enemy.hscale = L.charScale || 1;
  slotBroken = new Array(CFG.SLOTS.length).fill(false);
  cameo = null; cameoTimer = 3.0;
  G.phaseIdx = -1; G.pc = L; refreshPhase(true);
  ball = null; inbounds.length = 0; fullSplat = null; shirtCard = null;
  splats.length = 0; pops.length = 0; peels.length = 0;
  tray.raise = 1; drag = null;
  player.dead = false; player.drawing = false; player.lastShot = -9;

  G.banner = {
    t: 0, dur: 3.4,
    title: 'LEVEL ' + L.id + '  -  ' + L.name.toUpperCase(),
    sub: L.subtitle,
    // the key hint has to track how many foods you actually hold
    tip: L.unlocked.length > 1
      ? CFG.AMMO[L.signature].label.toUpperCase() + ' UNLOCKED  -  tap a tile or press ' +
        L.unlocked.map((_, i) => i + 1).join(' / ')
      : null
  };
}

/* --------------------------------------------------------------------------
   INPUT  --  pointer, touch and keyboard all funnel into the same two values
   -------------------------------------------------------------------------- */
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
let drag = null;
const keys = {};
let kbCharge = 0, kbAim = 0;

function toCanvas(e) {
  const r = cvs.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}

function pressAnywhere() {
  Snd.on();
  if (G.mode === 'title') { startLevel(0, true); return true; }
  if (G.mode === 'clear') {
    // score and shirts carry forward; only the title screen starts fresh
    if (hasNextLevel()) startLevel(G.levelIdx + 1, false);
    else G.mode = 'title';
    return true;
  }
  if (G.mode === 'over' || G.mode === 'victory') { G.mode = 'title'; return true; }
  return false;
}

/* --------------------------------------------------------------------------
   AMMO RAIL  --  one tile per unlocked food, tap to select
   Rects come from here for both the renderer and the hit test, so a tile can
   never be drawn somewhere you cannot press.
   -------------------------------------------------------------------------- */
function ammoTiles() {
  const list = ammoList(), size = 146, gap = 14;
  return list.map((k, i) => ({ key: k, r: { x: 32 + i * (size + gap), y: 2142, w: size, h: size } }));
}

cvs.addEventListener('pointerdown', e => {
  e.preventDefault();
  // the laundry offer is the one screen where a tap has to mean something
  // specific, so it gets first refusal on the event
  if (G.mode === 'laundry') {
    Snd.on();
    const p = toCanvas(e), B = laundryButtons();
    if (inRect(p, B.yes)) watchAdForLaundry();
    else if (inRect(p, B.no)) declineLaundry();
    return;
  }
  if (pressAnywhere()) return;
  if (G.mode !== 'play' || player.dead) return;
  const p = toCanvas(e);

  // an ammo tile gets the tap before the slingshot does
  for (const t of ammoTiles()) {
    if (inRect(p, t.r)) { selectAmmo(t.key); return; }
  }
  if (ball) return;

  drag = { sx: p.x, sy: p.y, x: p.x, y: p.y };
  player.drawing = true;
  try { cvs.setPointerCapture(e.pointerId); } catch (_) {}
  Snd.draw();
});
cvs.addEventListener('pointermove', e => {
  if (!drag) return;
  const p = toCanvas(e); drag.x = p.x; drag.y = p.y;
});
function endDrag() {
  if (!drag) return;
  const pullX = drag.sx - drag.x;
  const pullY = drag.y - drag.sy;
  const mag = Math.hypot(pullX, pullY);
  player.drawing = false;
  drag = null;
  // belt and suspenders: loseShirt() already clears drag the instant the hit
  // lands, but if a release event is somehow still in flight, dead must not
  // be able to fire.
  if (player.dead) return;
  if (mag >= CFG.MIN_DRAG) fire(clamp(mag / CFG.MAX_DRAG, 0, 1), pullX * CFG.LAT_K);
}
cvs.addEventListener('pointerup',     e => { e.preventDefault(); endDrag(); });
// safety net: a release that lands outside the canvas must still fire
addEventListener('pointerup', () => { if (drag) endDrag(); });
addEventListener('blur',      () => { drag = null; player.drawing = false; });
cvs.addEventListener('pointercancel', () => { drag = null; player.drawing = false; });
cvs.addEventListener('contextmenu',   e => e.preventDefault());

addEventListener('keydown', e => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (k === CFG.DEBUG_KEY) G.debug = !G.debug;
  if (G.mode === 'laundry') {
    Snd.on();
    if (k === 'y' || k === '1' || k === 'enter' || k === ' ') { e.preventDefault(); watchAdForLaundry(); }
    if (k === 'n' || k === '2' || k === 'escape')             { e.preventDefault(); declineLaundry(); }
    return;
  }
  if (k === ' ' || k === 'enter') {
    e.preventDefault();
    if (pressAnywhere()) return;
    if (G.mode === 'play' && !player.dead && !ball) { player.drawing = true; kbCharge = 0; Snd.draw(); }
  }
  // 1..4 pick a food
  if (G.mode === 'play' && k >= '1' && k <= '4') {
    const list = ammoList(), idx = +k - 1;
    if (list[idx]) selectAmmo(list[idx]);
  }
  // abort the draw and drop back behind the tray
  if ((k === 'escape' || k === 's' || k === 'arrowdown') && player.drawing) {
    player.drawing = false; kbCharge = 0;
  }
});
addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  keys[k] = false;
  if ((k === ' ' || k === 'enter') && player.drawing) {
    player.drawing = false;
    if (kbCharge > 0.08) fire(clamp(kbCharge, 0, 1), kbAim);
    kbCharge = 0;
  }
});

/** Current aim readout, whichever input produced it. */
function aimState() {
  if (drag) {
    const pullX = drag.sx - drag.x, pullY = drag.y - drag.sy;
    return {
      power: clamp(Math.hypot(pullX, pullY) / CFG.MAX_DRAG, 0, 1),
      vwx: clamp(pullX * CFG.LAT_K, -CFG.LAT_MAX, CFG.LAT_MAX),
      px: drag.x, py: drag.y
    };
  }
  if (player.drawing) return { power: kbCharge, vwx: kbAim, px: null, py: null };
  return null;
}

/* --------------------------------------------------------------------------
   UPDATE
   -------------------------------------------------------------------------- */
function update(dt) {
  G.t += dt;
  if (G.shakeT > 0) { G.shakeT -= dt; if (G.shakeT <= 0) G.shake = 0; }
  G.flash = Math.max(0, G.flash - dt * 2.2);

  // tray drops fast (you commit to the shot) and comes back up slowly --
  // that lag IS the risk window after firing.
  const wantRaise = (G.mode === 'play' && player.drawing && !player.dead) ? 0 : 1;
  const rate = wantRaise < tray.raise ? 1 / CFG.TRAY_DOWN : 1 / CFG.TRAY_UP;
  tray.raise = clamp(tray.raise + Math.sign(wantRaise - tray.raise) * rate * dt, 0, 1);
  tray.recoil = Math.max(0, tray.recoil - dt * 620);

  for (let i = trayHits.length - 1; i >= 0; i--) { trayHits[i].t += dt; if (trayHits[i].t > trayHits[i].dur) trayHits.splice(i, 1); }
  for (let i = splats.length - 1; i >= 0; i--) { splats[i].t += dt; if (splats[i].t > splats[i].dur) splats.splice(i, 1); }
  for (let i = pops.length   - 1; i >= 0; i--) { pops[i].t   += dt; if (pops[i].t   > pops[i].dur)   pops.splice(i, 1); }
  if (fullSplat) { fullSplat.t += dt; if (fullSplat.t > fullSplat.dur) fullSplat = null; }
  if (shirtCard) {
    shirtCard.t += dt;                       // always advance, so the pop-in
    if (!shirtCard.hold && shirtCard.t > shirtCard.dur) shirtCard = null;
  }

  if (G.mode !== 'play') return;

  // keyboard charge / steer
  if (player.drawing && !drag) {
    kbCharge = clamp(kbCharge + dt / 1.2, 0, 1);
    if (keys['arrowleft']  || keys['a']) kbAim = clamp(kbAim - dt * 1900, -CFG.LAT_MAX, CFG.LAT_MAX);
    if (keys['arrowright'] || keys['d']) kbAim = clamp(kbAim + dt * 1900, -CFG.LAT_MAX, CFG.LAT_MAX);
  } else if (!player.drawing) kbAim = lerp(kbAim, 0, dt * 3);

  if (player.dead) {
    player.deadT += dt;
    if (player.deadT > CFG.RESPAWN_DELAY) { player.dead = false; setState('hidden', 0.9); }
    return;
  }

  if (G.banner) { G.banner.t += dt; if (G.banner.t > G.banner.dur) G.banner = null; }

  G.clock -= dt;
  if (G.clock <= 0) { G.clock = 0; G.mode = 'over'; Snd.lose(); return; }

  updateEnemy(dt);
  updateCameo(dt);
  updateBall(dt);
  updateInbounds(dt);
}

/* --------------------------------------------------------------------------
   RENDER
   -------------------------------------------------------------------------- */
function drawImg(key, cx, baseY, s, opts) {
  const im = A.get(key), d = A.dim(key);
  if (!im || !d) return null;
  const w = d.dw * s, h = d.dh * s;
  const x = cx - w / 2, y = baseY - h + ((opts && opts.dy) || 0);
  ctx.drawImage(im, x, y, w, h);
  return { x, y, w, h };
}

function drawScene() {
  // drawn slightly oversized so screen shake never exposes the canvas edge
  const bg = A.get('bg.cafeteria');
  const OS = 46;
  if (bg) ctx.drawImage(bg, -OS, -OS, W + OS * 2, H + OS * 2);

  // z-order everything on the floor by depth, near things last
  const items = CFG.SLOTS.map((s, i) => ({ z: s.floorY, kind: 'slot', s, i }));
  if (ball)  items.push({ z: ball.fy, kind: 'ball' });
  splats.forEach(sp => items.push({ z: sp.fy, kind: 'splat', sp }));
  items.sort((a, b) => a.z - b.z);

  for (const it of items) {
    if (it.kind === 'slot')  drawSlot(it.s, it.i);
    if (it.kind === 'ball')  drawBall();
    if (it.kind === 'splat') drawWorldSplat(it.sp);
  }
}

/** Draw one occupant (the enemy, or one of Dan's helpers) at a slot. */
function drawOccupant(o, s, sc, x) {
  const key = charKey(spriteFor(o), o.char);
  const d = A.dim(key), hs = o.hscale || 1;
  const w = d.dw * hs * sc, h = d.dh * hs * sc;
  ctx.drawImage(A.get(key), x - w / 2, s.floorY - h + dropY(o) * sc, w, h);
}

function drawSlot(s, i) {
  const sc = scale(s.floorY), x = slotX(s);
  const ch = coverH(s) * sc;
  const coverTop = s.floorY - ch;

  // occupants, clipped so they genuinely read as being behind the furniture
  const here = [];
  if (i === enemy.slot && enemy.pop > 0.001) here.push(enemy);
  if (cameo && i === cameo.slot && cameo.pop > 0.001) here.push(cameo);
  if (here.length) {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, coverTop); ctx.clip();
    for (const o of here) drawOccupant(o, s, sc, x);
    ctx.restore();
  }

  if (slotBroken[i]) {
    // the prop is gone -- all that is left is a smear of rind
    const pw = A.dim('props.' + s.prop).dw * sc;
    const sd = A.dim('food.watermelon_splat');
    const rw = pw * 1.05, rh = rw * (sd.dh / sd.dw) * 0.42;
    ctx.save(); ctx.globalAlpha = 0.92;
    ctx.drawImage(A.get('food.watermelon_splat'), x - rw / 2, s.floorY - rh * 0.9, rw, rh);
    ctx.restore();
  } else {
    drawImg('props.' + s.prop, x, s.floorY, sc);
  }

  // a peel waiting to be stepped on
  const peel = peels.find(p => p.slot === i);
  if (peel) {
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.translate(x, s.floorY - 6 * sc);
    ctx.scale(1, 0.42);                       // squash flat onto the floor
    ctx.rotate(0.5);
    const d = A.dim('food.banana');
    const w = d.dw * sc * 0.7, h = d.dh * sc * 0.7;
    ctx.drawImage(A.get('food.banana'), -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  if (G.debug) {
    const band = i === enemy.slot ? hitBand(enemy) : null;
    ctx.strokeStyle = '#0ff'; ctx.lineWidth = 3;
    ctx.strokeRect(x - CFG.HIT_HALF_W * sc, coverTop, CFG.HIT_HALF_W * 2 * sc, ch);
    if (band) {
      ctx.strokeStyle = '#f0f';
      ctx.strokeRect(x - CFG.HIT_HALF_W * sc, s.floorY - band.hi * sc,
                     CFG.HIT_HALF_W * 2 * sc, (band.hi - band.lo) * sc);
    }
    ctx.fillStyle = '#0ff'; ctx.font = '30px monospace';
    ctx.fillText(s.id + ' s=' + sc.toFixed(2), x - 60, s.floorY + 36);
  }
}

function drawBall() {
  const key = 'food.' + CFG.AMMO[ball.ammo].sprite;
  // motion trail
  for (let i = 0; i < ball.trail.length; i++) {
    const t = ball.trail[i], s = scale(t.fy), a = (i / ball.trail.length) * 0.28;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(CX + t.wx * s, t.fy - t.h * s, 16 * s, 0, 7);
    ctx.fillStyle = '#fff8dc'; ctx.fill();
  }
  ctx.globalAlpha = 1;

  const s = scale(ball.fy), d = A.dim(key);
  const w = d.dw * s * 0.85, h = d.dh * s * 0.85;
  ctx.save();
  ctx.translate(CX + ball.wx * s, ball.fy - ball.h * s);
  ctx.rotate(ball.rot);
  ctx.drawImage(A.get(key), -w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawWorldSplat(sp) {
  const k = clamp(sp.t / sp.dur, 0, 1);
  const s = scale(sp.fy);
  const d = A.dim(sp.sprite); if (!d) return;
  const grow = 0.75 + 0.25 * ease(Math.min(1, k * 3));
  const w = d.dw * s * sp.size * grow, h = d.dh * s * sp.size * grow;
  ctx.save();
  ctx.globalAlpha = 1 - k * k;
  ctx.translate(CX + sp.wx * s, sp.fy - sp.h * s);
  ctx.rotate(sp.rot);
  ctx.drawImage(A.get(sp.sprite), -w / 2, -h / 2, w, h);
  ctx.restore();
}

/* ---- the tray, the slingshot and the aiming feedback -------------------- */
function trayRect() {
  const r = ease(tray.raise);
  const w   = lerp(W + 150, W + 430, r);          // it gets bigger as it comes
  const h   = lerp(300, 580, r);                  // closer to your face
  const top = lerp(2158, 1772, r) + tray.recoil;
  return { x: (W - w) / 2, y: top, w, h };
}

/** Food that broke against the shield. Drawn BEFORE the tray, so the tray
    covers the middle of it and only the spray clears the rim. */
function drawTrayHits() {
  for (const hit of trayHits) {
    const k = hit.t / hit.dur, d = A.dim(hit.sprite);
    const w = W * hit.sz * 0.62, h = w * (d.dh / d.dw);
    const burst = 0.72 + 0.28 * ease(Math.min(1, k * 4));   // quick pop outward
    ctx.save();
    ctx.globalAlpha = 1 - k * k;
    ctx.translate(hit.x, hit.y);
    ctx.rotate(hit.rot);
    ctx.scale(burst, burst);
    ctx.drawImage(A.get(hit.sprite), -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

function drawTray() {
  const R = trayRect();
  // shadow so the tray sits in the room rather than on top of it
  const g = ctx.createLinearGradient(0, R.y - 170, 0, R.y + 30);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + (0.22 + 0.20 * tray.raise) + ')');
  ctx.fillStyle = g; ctx.fillRect(0, R.y - 170, W, 200);

  ctx.drawImage(A.get('props.tray'), R.x, R.y, R.w, R.h);

  // a plain word beats an icon here -- players need to know the rule instantly
  if (G.mode === 'play' && !player.dead && tray.raise > 0.55) {
    ctx.globalAlpha = (tray.raise - 0.55) / 0.45 * 0.75;
    ctx.fillStyle = '#0d1520'; ctx.font = 'bold 46px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TRAY UP  -  SAFE', CX, R.y + 92);
    ctx.globalAlpha = 1;
  }
}

function drawSling() {
  const aim = aimState();
  const S = CFG.SLING;
  const d = A.dim('props.slingshot');
  const w = S.designW || d.dw, h = w * (d.dh / d.dw);

  const pw   = aim ? aim.power : 0;
  const lat  = aim ? aim.vwx / CFG.LAT_MAX : 0;
  const tilt = lat * S.tiltMax;

  // the sprite hangs from its prong line, so the anchors stay put as it tilts
  const topY = S.prongY - S.anchorL[1] * h;
  const left = CX - w / 2;

  ctx.save();
  ctx.translate(CX, S.prongY); ctx.rotate(tilt); ctx.translate(-CX, -S.prongY);

  ctx.drawImage(A.get('props.slingshot'), left, topY, w, h);

  const lx = left + S.anchorL[0] * w, ly = topY + S.anchorL[1] * h;
  const rx = left + S.anchorR[0] * w, ry = topY + S.anchorR[1] * h;

  // pouch position: pulled back and to the side, opposite the launch direction
  const px = CX - lat * S.pullSide;
  const py = S.prongY + 26 + pw * S.pullMax;

  // rubber, thinning as it stretches
  const band = (ax, ay) => { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(px, py); ctx.stroke(); };
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(40,18,6,0.55)'; ctx.lineWidth = lerp(20, 13, pw);
  band(lx, ly); band(rx, ry);
  ctx.strokeStyle = '#c1440e';            ctx.lineWidth = lerp(15, 8.5, pw);
  band(lx, ly); band(rx, ry);

  // leather pouch, turned to face the pull
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(Math.atan2(py - (ly + ry) / 2, px - (lx + rx) / 2) - Math.PI / 2);
  ctx.fillStyle = '#4a2c14';
  ctx.beginPath(); ctx.ellipse(0, 0, 40, 54, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 5; ctx.stroke();
  ctx.restore();

  // the loaded food
  if (!ball) {
    const key = 'food.' + CFG.AMMO[G.ammo].sprite, fd = A.dim(key);
    const fs = 118 / Math.max(fd.dw, fd.dh);
    const fw = fd.dw * fs, fh = fd.dh * fs;
    ctx.save(); ctx.translate(px, py); ctx.rotate(-0.45 + lat * 0.3);
    ctx.drawImage(A.get(key), -fw / 2, -fh / 2, fw, fh); ctx.restore();
  }

  // Aim arrow. Level 1 shows only the first stub of the arc; each level
  // reveals more of it (see level.aimArc), so your aim literally improves.
  ctx.restore();
  if (aim && aim.power > 0.02) drawArc(aim, px, py);

  if (aim) {
    // power meter, deliberately outside the tilt so it stays level
    const mx = W - 70, my0 = 2280, my1 = 1990;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(mx - 20, my1, 40, my0 - my1);
    const gy = my0 - (my0 - my1) * aim.power;
    ctx.fillStyle = aim.power > 0.92 ? '#ff4d4d' : aim.power > 0.6 ? '#ffd23f' : '#8ef58a';
    ctx.fillRect(mx - 20, gy, 40, my0 - gy);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(mx - 20, my1, 40, my0 - my1);
  }
}

/** Walk the real ballistic solution and return the screen-space path. This is
    the SAME integration the live projectile uses, so the arrow never lies. */
function trajectory(power, vwx) {
  const pts = [];
  let fy = CFG.LAUNCH_FY, h = CFG.H0, wx = 0;
  let vh = power * CFG.VH, vfy = -power * CFG.VFY;
  const dt = 1 / 120;
  while (h > 0 && fy > CFG.FLOOR_TOP && pts.length < 900) {
    fy += vfy * dt; h += vh * dt; vh -= CFG.G * dt; wx += vwx * dt;
    const s = scale(fy);
    pts.push({ x: CX + wx * s, y: fy - h * s, s });
  }
  return pts;
}

function drawArc(aim, ox, oy) {
  const pts = trajectory(aim.power, aim.vwx);
  if (pts.length < 6) return;
  // start the line at the pouch so the arrow reads as leaving the slingshot
  if (ox != null) pts.unshift({ x: ox, y: oy, s: 1 });

  // how much of the flight this level lets you preview
  const frac = clamp(G.level.aimArc != null ? G.level.aimArc : 0.28, 0.05, 1);
  const n = Math.max(4, Math.floor(pts.length * frac));
  const seg = pts.slice(0, n);
  const tip = seg[seg.length - 1];
  const prev = seg[Math.max(0, seg.length - 6)];
  const ang = Math.atan2(tip.y - prev.y, tip.x - prev.x);

  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // dark backing so the arrow stays readable over the busy cafeteria
  ctx.beginPath();
  ctx.moveTo(seg[0].x, seg[0].y);
  for (const p of seg) ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 26; ctx.stroke();
  ctx.strokeStyle = '#ffd23f';           ctx.lineWidth = 14; ctx.stroke();

  // arrowhead on the truncated end
  const hs = 46;
  ctx.translate(tip.x, tip.y); ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(hs, 0); ctx.lineTo(-hs * 0.55, hs * 0.62);
  ctx.lineTo(-hs * 0.2, 0); ctx.lineTo(-hs * 0.55, -hs * 0.62);
  ctx.closePath();
  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 8;
  ctx.stroke(); ctx.fill();
  ctx.restore();
}

/* ---- HUD ---------------------------------------------------------------- */
/** One shirt at (x,y) centre, h tall. Ruined shirts wear the splat that
    actually got them. */
function drawShirt(x, y, h, food, alpha) {
  const src = shirtCanvas(food);
  if (!src) return;
  const w = h;                                   // the sprite is square
  ctx.save();
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  if (!food) {                                   // clean shirts read brighter
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 14;
  }
  ctx.drawImage(src, x - w / 2, y - h / 2, w, h);
  ctx.restore();
}

function panel(x, y, w, h, r) {
  r = r || 22;
  ctx.fillStyle = 'rgba(12,16,26,0.62)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else {                                   // older iOS Safari has no roundRect
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
  }
  ctx.fill();
}

function drawHUD() {
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  panel(28, 28, 470, 118);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 74px system-ui, sans-serif';
  ctx.fillText(G.score.toLocaleString(), 52, 116);

  // shirts, newest damage on the left of the stack
  panel(W - 88 - (CFG.SHIRTS - 1) * 96 - 62, 26, (CFG.SHIRTS - 1) * 96 + 124, 124, 26);
  for (let i = 0; i < CFG.SHIRTS; i++) {
    drawShirt(W - 88 - i * 96, 88, 128, shirtSplats[i], shirtSplats[i] ? 0.85 : 1);
  }

  // clock
  panel(W / 2 - 130, 28, 260, 84);
  ctx.textAlign = 'center'; ctx.fillStyle = G.clock < 15 ? '#ff6b6b' : '#fff';
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.fillText(Math.ceil(G.clock) + 's', W / 2, 90);

  // health bar. On the boss it also shows where the phase gates sit, so you
  // can see the next escalation coming.
  const bw = 620, bx = (W - bw) / 2, by = 168;
  const boss = !!G.level.phases;
  panel(bx - 14, by - 12, bw + 28, boss ? 104 : 74, 20);
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(bx, by, bw, 30);
  ctx.fillStyle = boss ? '#c9342f' : '#e04b4b';
  ctx.fillRect(bx, by, bw * (enemy.hp / enemy.maxHp), 30);
  if (boss) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    for (const ph of G.level.phases) {
      if (ph.at >= 1) continue;
      ctx.fillRect(bx + bw * ph.at - 2, by - 4, 4, 38);
    }
  }
  ctx.fillStyle = '#fff'; ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.fillText(G.level.name.toUpperCase(), W / 2, by + 62);
  if (boss && G.pc && G.pc.name) {
    ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText('PHASE ' + (G.phaseIdx + 1) + '  -  ' + G.pc.name, W / 2, by + 94);
  }

  // combo
  if (G.combo > 1) {
    ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 50px system-ui, sans-serif';
    ctx.fillText('COMBO x' + G.comboMul.toFixed(1), W / 2, 300);
  }

  // ammo rail
  for (const t of ammoTiles()) {
    const sel = t.key === G.ammo, left = ammoCount(t.key), empty = left <= 0;
    const cx0 = t.r.x + t.r.w / 2, cy0 = t.r.y + t.r.h / 2;

    ctx.fillStyle = sel ? 'rgba(255,210,63,0.20)' : 'rgba(12,16,26,0.62)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(t.r.x, t.r.y, t.r.w, t.r.h, 26); else ctx.rect(t.r.x, t.r.y, t.r.w, t.r.h);
    ctx.fill();
    ctx.lineWidth = sel ? 6 : 3;
    ctx.strokeStyle = sel ? '#ffd23f' : 'rgba(255,255,255,0.22)';
    ctx.stroke();

    const ak = 'food.' + CFG.AMMO[t.key].sprite, ad = A.dim(ak);
    const asz = 96 / Math.max(ad.dw, ad.dh);
    ctx.globalAlpha = empty ? 0.28 : 1;
    ctx.drawImage(A.get(ak), cx0 - ad.dw * asz / 2, cy0 - ad.dh * asz / 2 - 8, ad.dw * asz, ad.dh * asz);
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.fillStyle = empty ? '#ff6b6b' : sel ? '#ffd23f' : '#c9d3e6';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText(left === Infinity ? '∞' : left, cx0, t.r.y + t.r.h - 16);
  }

  // exposure warning: this is the whole game in one indicator
  if (player.exposed) {
    ctx.strokeStyle = 'rgba(255,80,80,' + (0.45 + 0.35 * Math.sin(G.t * 14)) + ')';
    ctx.lineWidth = 22; ctx.strokeRect(11, 11, W - 22, H - 22);
    ctx.fillStyle = 'rgba(255,90,90,0.9)'; ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.fillText('EXPOSED', W / 2, 326);
  }
  if (enemy.state === 'ready') {
    ctx.fillStyle = 'rgba(255,60,60,' + (0.6 + 0.4 * Math.sin(G.t * 20)) + ')';
    ctx.font = 'bold 88px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('GET DOWN!', W / 2, 470);
  }

  // level banner
  if (G.banner) {
    const B = G.banner;
    const a = Math.min(1, Math.min(B.t / 0.3, (B.dur - B.t) / 0.5));
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
    ctx.fillStyle = 'rgba(10,14,24,0.72)';
    ctx.fillRect(0, 560, W, B.tip ? 250 : 190);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23f'; fitText(B.title, CX, 640, 62, W - 80);
    ctx.fillStyle = '#e8edf7'; fitText(B.sub, CX, 700, 40, W - 100);
    if (B.tip) { ctx.fillStyle = '#8ef58a'; fitText(B.tip, CX, 768, 36, W - 100); }
    ctx.restore();
  }

  // floating score text
  for (const p of pops) {
    const k = p.t / p.dur;
    ctx.globalAlpha = 1 - k * k;
    ctx.fillStyle = p.color; ctx.font = 'bold 58px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.text, p.x, p.y - k * 120);
  }
  ctx.globalAlpha = 1;

  if (G.debug) {
    const aim = aimState();
    ctx.textAlign = 'left'; ctx.fillStyle = '#0ff'; ctx.font = '30px monospace';
    const lines = [
      'state ' + enemy.state + '  pop ' + enemy.pop.toFixed(2) + '  slot ' + CFG.SLOTS[enemy.slot].id,
      'hp ' + enemy.hp + '/' + enemy.maxHp + '  peels ' + peels.length,
      'exposed ' + player.exposed + '  power ' + (aim ? aim.power.toFixed(2) : '-'),
      ball ? ('ball fy ' + ball.fy.toFixed(0) + ' h ' + ball.h.toFixed(0) + ' wx ' + ball.wx.toFixed(0)) : 'ball -'
    ];
    lines.forEach((l, i) => ctx.fillText(l, 30, 560 + i * 38));
  }
}

/** Draw centred text, shrinking the font until it fits maxW. Stops any
    heading from running off the edge on a narrow canvas. */
function fitText(text, x, y, size, maxW, weight) {
  let s = size;
  do {
    ctx.font = (weight || 'bold') + ' ' + s + 'px system-ui, sans-serif';
    if (ctx.measureText(text).width <= maxW || s <= 18) break;
    s -= 3;
  } while (true);
  ctx.fillText(text, x, y);
  return s;
}

/* ---- the three-shirt card ---------------------------------------------- */
function drawShirtCard() {
  if (!shirtCard) return;
  const C = shirtCard;
  const F = CFG.SHIRT_FADE;

  // fade in, hold, fade out -- unless this is the last shirt, in which case
  // it stays up and the laundry offer is drawn over it
  let a = clamp(C.t / F, 0, 1);
  if (!C.hold) a = Math.min(a, clamp((C.dur - C.t) / F, 0, 1));

  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = C.hold ? 'rgba(24,6,6,0.90)' : 'rgba(8,12,20,0.82)';
  ctx.fillRect(0, 0, W, H);

  const ruined = shirtSplats.filter(Boolean).length;
  const heading = C.hold ? 'NO CLEAN SHIRTS'
                : ruined === 1 ? 'SHIRT RUINED' : 'THAT IS TWO';
  ctx.textAlign = 'center';
  ctx.fillStyle = C.hold ? '#ff8080' : '#ffd23f';
  fitText(heading, CX, C.hold ? 640 : 820, 92, W - 90);

  const size = C.hold ? 280 : 300;
  const gap  = 40;
  const total = CFG.SHIRTS * size + (CFG.SHIRTS - 1) * gap;
  const y = C.hold ? 1080 : 1220;
  for (let i = 0; i < CFG.SHIRTS; i++) {
    const x = (W - total) / 2 + size / 2 + i * (size + gap);
    // the shirt that just took it pops in slightly oversized
    let s = size;
    if (i === C.justHit) {
      const k = clamp(C.t / 0.30, 0, 1);
      s = size * lerp(1.42, 1, ease(k));
      ctx.save();
      ctx.globalAlpha = a * (1 - k) * 0.7;
      ctx.beginPath(); ctx.arc(x, y, s * 0.72, 0, 7);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.restore();
    }
    drawShirt(x, y, s, shirtSplats[i], 1);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  const left = CFG.SHIRTS - ruined;
  fitText(left === 0 ? 'NONE LEFT' : left + (left === 1 ? ' CLEAN SHIRT LEFT' : ' CLEAN SHIRTS LEFT'),
          CX, y + size * 0.72 + 58, 40, W - 120);

  if (C.hold) drawLaundryOffer(a);
  ctx.restore();
}

function drawLaundryOffer(a) {
  const B = laundryButtons();
  ctx.textAlign = 'center';

  ctx.fillStyle = '#fff';
  fitText('Fancy a trip to the laundry?', CX, 1540, 52, W - 90);

  // yes
  ctx.fillStyle = '#2f7d32';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(B.yes.x, B.yes.y, B.yes.w, B.yes.h, 28); else ctx.rect(B.yes.x, B.yes.y, B.yes.w, B.yes.h);
  ctx.fill();
  ctx.strokeStyle = '#8ef58a'; ctx.lineWidth = 5; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.fillText('WATCH AN AD', CX, B.yes.y + 66);
  ctx.font = 'bold 34px system-ui, sans-serif'; ctx.fillStyle = '#cdf3cb';
  ctx.fillText('three clean shirts, keep your score', CX, B.yes.y + 118);

  // no
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(B.no.x, B.no.y, B.no.w, B.no.h, 24); else ctx.rect(B.no.x, B.no.y, B.no.w, B.no.h);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = '#e8edf7'; ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillText('GO HOME DIRTY', CX, B.no.y + 76);

  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '30px system-ui, sans-serif';
  ctx.fillText('tap, or press Y / N', CX, B.no.y + 168);
}

/* ---- full screen overlays ---------------------------------------------- */
function drawFullSplat() {
  if (!fullSplat) return;
  const k = clamp(fullSplat.t / fullSplat.dur, 0, 1);
  const im = A.get(fullSplat.sprite);
  ctx.save();
  ctx.globalAlpha = (1 - k) * 0.96;
  const s = 1.25 + k * 0.25, w = W * s * 1.5, h = w;
  ctx.drawImage(im, (W - w) / 2, (H - h) / 2 + 200, w, h);
  ctx.restore();
}

function centreText(lines) {
  ctx.textAlign = 'center';
  let y = H * 0.34;
  for (const l of lines) {
    ctx.fillStyle = l.c || '#fff';
    ctx.font = 'bold ' + (l.s || 60) + 'px system-ui, sans-serif';
    ctx.fillText(l.t, W / 2, y);
    y += (l.s || 60) * 1.35 + (l.gap || 0);
  }
}

function drawTitle() {
  ctx.fillStyle = 'rgba(6,10,20,0.72)'; ctx.fillRect(0, 0, W, H);
  centreText([
    { t: "RUSKO'S RIOT", s: 130, c: '#ffd23f' },
    { t: 'FOOD FIGHT', s: 78, c: '#fff', gap: 40 },
    { t: 'LEVEL 1  -  ' + G.level.name.toUpperCase(), s: 52, c: '#8ef58a', gap: 60 },
    { t: 'Your tray is your shield. Tray up, you are safe.', s: 42, c: '#8ef58a' },
    { t: 'Pull back to aim and the tray comes DOWN.', s: 42 },
    { t: 'That is the only time Billy can hit you.', s: 42, c: '#ff9b9b', gap: 50 },
    { t: 'Drag  /  Hold SPACE  -  arrows steer', s: 34, c: '#c9d3e6' },
    { t: 'ESC or S drops you back down', s: 34, c: '#c9d3e6', gap: 60 },
    { t: 'TAP OR PRESS SPACE TO START', s: 48, c: '#ffd23f' }
  ]);
}

function drawClear() {
  ctx.fillStyle = 'rgba(6,10,20,0.80)'; ctx.fillRect(0, 0, W, H);
  const next = hasNextLevel() ? CFG.LEVELS[G.levelIdx + 1] : null;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#8ef58a';
  fitText(G.level.name.toUpperCase() + ' IS DOWN', CX, 470, 100, W - 80);

  ctx.fillStyle = '#fff';  fitText('SCORE  ' + G.score.toLocaleString(), CX, 600, 74, W - 80);
  ctx.fillStyle = '#ffd23f'; fitText('End of level bonus  +' + (G.endBonus || 0).toLocaleString(), CX, 664, 42, W - 80);

  ctx.fillStyle = '#c9d3e6';
  fitText(G.misses === 0 ? 'FLAWLESS - not one wasted shot' : G.misses + ' misses', CX, 726, 40, W - 80);
  fitText(G.forcedDown === 0 ? 'UNTOUCHED - never took a hit' : 'Shirts ruined: ' + G.forcedDown, CX, 778, 40, W - 80);
  if (G.laundered) {
    ctx.fillStyle = '#8ef58a';
    fitText('+' + G.laundered + ' clean shirt for clearing the level', CX, 830, 38, W - 80);
  }

  if (next) {
    // the unlock is the point of this screen, so give it the real estate
    const newFood = (next.unlocked || []).filter(k => !(G.level.unlocked || []).includes(k));
    if (newFood.length) {
      const k = newFood[0], ak = 'food.' + CFG.AMMO[k].sprite, ad = A.dim(ak);
      const sz = 300 / Math.max(ad.dw, ad.dh);
      ctx.drawImage(A.get(ak), CX - ad.dw * sz / 2, 960, ad.dw * sz, ad.dh * sz);
      ctx.fillStyle = '#ffd23f';
      fitText(CFG.AMMO[k].label.toUpperCase() + ' UNLOCKED', CX, 1360, 74, W - 80);
      ctx.fillStyle = '#c9d3e6';
      fitText(CFG.AMMO[k].blurb, CX, 1424, 36, W - 110);
    }
    ctx.fillStyle = '#fff';
    fitText('NEXT: ' + next.name.toUpperCase(), CX, 1580, 56, W - 80);
    ctx.fillStyle = '#c9d3e6';
    fitText(next.subtitle, CX, 1636, 36, W - 100);
    ctx.fillStyle = '#ff9b9b';
    fitText(next.hp + ' HIT POINTS' + (next.tagline ? '  -  ' + next.tagline : ''),
            CX, 1700, 36, W - 100);
  } else {
    ctx.fillStyle = '#ffd23f';
    fitText('THAT IS EVERY LEVEL BUILT SO FAR', CX, 1200, 52, W - 90);
    ctx.fillStyle = '#8892a8';
    fitText('Coach Ken and Principal Dan are next', CX, 1264, 38, W - 90);
  }

  ctx.fillStyle = '#fff';
  fitText('TAP OR PRESS SPACE', CX, 1900, 52, W - 80);
}

function drawVictory() {
  ctx.fillStyle = 'rgba(5,14,9,0.94)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';

  ctx.fillStyle = '#8ef58a';
  fitText('THE PRINCIPAL IS DOWN', CX, 470, 104, W - 70);
  ctx.fillStyle = '#ffd23f';
  fitText('YOU WON THE FOOD FIGHT', CX, 560, 56, W - 90);

  // all four of them, wearing it
  const chars = ['billy', 'gabel', 'coach', 'dan'];
  const size = 244, gap = 12;
  const total = chars.length * size + (chars.length - 1) * gap;
  chars.forEach((c, i) => {
    const k = 'char.' + c + '.surprised', d = A.dim(k);
    if (!d) return;
    const w = size, h = w * (d.dh / d.dw);
    ctx.drawImage(A.get(k), (W - total) / 2 + i * (size + gap), 700, w, h);
  });

  ctx.fillStyle = '#fff';
  fitText('FINAL SCORE  ' + G.score.toLocaleString(), CX, 1360, 84, W - 70);
  ctx.fillStyle = '#ffd23f';
  fitText('Last level bonus  +' + (G.endBonus || 0).toLocaleString(), CX, 1428, 42, W - 90);

  ctx.fillStyle = '#c9d3e6';
  fitText(G.misses === 0 ? 'FLAWLESS - not one wasted shot' : G.misses + ' shots wasted', CX, 1500, 40, W - 90);
  fitText(G.forcedDown === 0 ? 'UNTOUCHED - he never landed one'
                             : 'Shirts ruined in the final: ' + G.forcedDown, CX, 1552, 40, W - 90);
  const broken = slotBroken.filter(Boolean).length;
  fitText(broken ? broken + ' pieces of school furniture destroyed' : 'You left the furniture standing',
          CX, 1604, 38, W - 90);

  ctx.fillStyle = '#8ef58a';
  fitText('Rusko\u2019s Riot  -  thanks for playing', CX, 1740, 44, W - 90);
  ctx.fillStyle = '#fff';
  fitText('TAP OR PRESS SPACE', CX, 1880, 52, W - 80);
}

function drawOver() {
  ctx.fillStyle = 'rgba(30,6,6,0.80)'; ctx.fillRect(0, 0, W, H);
  centreText([
    { t: G.clock <= 0 ? 'LUNCH IS OVER' : 'OUT OF CLEAN SHIRTS', s: 96, c: '#ff6b6b', gap: 30 },
    { t: 'SCORE  ' + G.score.toLocaleString(), s: 72, gap: 40 },
    { t: 'Billy had ' + enemy.hp + ' hits left in him.', s: 42, c: '#c9d3e6', gap: 60 },
    { t: 'TAP OR PRESS SPACE', s: 48 }
  ]);
}

/* --------------------------------------------------------------------------
   FRAME
   -------------------------------------------------------------------------- */
function render() {
  ctx.save();
  if (G.shake > 0) ctx.translate(rnd(-G.shake, G.shake), rnd(-G.shake, G.shake));

  drawScene();

  // Billy's food and the mess it makes are drawn UNDER the tray. A raised tray
  // therefore physically occludes them -- the banana disappears behind the rim
  // and the splat sprays out around it, which is what "blocked" looks like.
  for (const inb of inbounds) {
    if (inb.t < 0) continue;                    // still in her hand
    const k = clamp(inb.t / inb.dur, 0, 1);
    const x = lerp(inb.x0, CX + (inb.x0 - CX) * 0.12, ease(k));
    const y = lerp(inb.y0, 2120, k * k);
    const s = lerp(inb.s0, 1.5, k * k);
    const d = A.dim(inb.sprite);
    ctx.save(); ctx.translate(x, y); ctx.rotate(G.t * 9);
    ctx.drawImage(A.get(inb.sprite), -d.dw * s / 2, -d.dh * s / 2, d.dw * s, d.dh * s);
    ctx.restore();
  }
  drawTrayHits();
  drawTray();

  if (G.mode === 'play' && !player.dead && tray.raise < 0.92) {
    ctx.save();
    ctx.globalAlpha = clamp(1 - tray.raise / 0.92, 0, 1);
    drawSling();
    ctx.restore();
  }
  ctx.restore();

  drawFullSplat();
  if (G.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + G.flash * 0.5 + ')'; ctx.fillRect(0, 0, W, H); }
  if (G.mode === 'play') drawHUD();
  drawShirtCard();
  if (G.mode === 'title') drawTitle();
  if (G.mode === 'clear') drawClear();
  if (G.mode === 'victory') drawVictory();
  if (G.mode === 'over')  drawOver();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // One bad frame should never brick the game: log it and keep the loop alive.
  try { update(dt); render(); }
  catch (err) { console.error('[frame]', err); }
  requestAnimationFrame(frame);
}

/* --------------------------------------------------------------------------
   FIT THE CANVAS TO THE SCREEN (portrait, letterboxed, no stretching)
   -------------------------------------------------------------------------- */
function fit() {
  const vw = innerWidth, vh = innerHeight;
  const s = Math.min(vw / W, vh / H);
  cvs.style.width  = (W * s) + 'px';
  cvs.style.height = (H * s) + 'px';
}
addEventListener('resize', fit);
addEventListener('orientationchange', fit);

/* --------------------------------------------------------------------------
   BOOT
   -------------------------------------------------------------------------- */
cvs.width = W; cvs.height = H;
fit();

const bar = document.getElementById('bar');
const loadEl = document.getElementById('loading');
A.load((done, total) => { if (bar) bar.style.width = Math.round(done / total * 100) + '%'; })
 .then(() => {
   if (loadEl) loadEl.style.display = 'none';
   G.mode = 'title';
   requestAnimationFrame(frame);
 })
 .catch(err => {
   if (loadEl) loadEl.innerHTML = '<p style="color:#f88">Could not load assets.<br>' + err + '</p>';
 });

window.RRDebug = {
  G, enemy, player, tray, trayHits, CFG,
  get ball()        { return ball; },
  get shirtSplats() { return shirtSplats; },   // getters: these are reassigned
  get shirtCard()   { return shirtCard; },     // so a plain ref would go stale
  get inbounds()    { return inbounds; },
  get cameo()       { return cameo; },
  get slotBroken()  { return slotBroken; },
  spawnCameo, refreshPhase,
  cameoTimerSet: v => { cameoTimer = v; },
  watchAdForLaundry, grantLaundry, declineLaundry, laundryButtons,
  __force: (power, vwx) => fire(power, vwx),     // test hook: fire directly
  startLevel, ammoTiles, selectAmmo
};
})();
