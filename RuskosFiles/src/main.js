/* ===========================================================
   THE RUSKO FILES — main.js
   A noir murder-mystery investigation game.
   Built with Vite; ships on RUN.world via @series-inc/rundot-game-sdk.
   =========================================================== */

import './style.css';
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';

// vite.config.js sets publicDir: 'images', so the game's images/ folder
// (unchanged from before this SDK integration) is served at the site
// root. Using import.meta.env.BASE_URL instead of a hardcoded '/' keeps
// this correct under RUN.world's subdirectory hosting (base: './' in
// vite.config.js) as well as local dev.
const IMG = import.meta.env.BASE_URL;

/* ---------- RUN.world SDK: safety net, analytics, lifecycle, save ----------
   See rundot/docs (via `npx rundot-sdk-setup -y`) for the full reference.
   Summary of the rules followed here:
   - The SDK auto-initializes on import; read device/profile/safe-area info
     only after your first `await`, never at module top level.
   - Every RundotGameAPI call can reject; an unhandled rejection is fatal
     on the host, so awaited calls (storage) get try/catch. Analytics calls
     are the documented exception -- the SDK swallows their RPC failures
     internally, so no .catch() is required there.
   - Persist on lifecycles.onSleep / onPause; never rely on onQuit firing,
     and never start a *fresh* SDK call from onSleep/onQuit -- a hard close
     can tear down the runtime before the RPC lands.
   - Never trust the device clock for anything time-gated (not applicable
     to this game -- no time-gated content).
------------------------------------------------------------------------- */

// Global safety net: a single missed rejection anywhere in the game would
// otherwise crash the player back to the RUN catalog. Individual awaited
// SDK calls still get their own try/catch below -- this is the backstop,
// not a substitute for it.
window.addEventListener('unhandledrejection', (event) => {
  console.warn('[RUN] unhandled rejection:', event.reason);
  try {
    RundotGameAPI.analytics.recordCustomEvent('unhandled_rejection', {
      reason: String((event.reason && event.reason.message) || event.reason || ''),
    });
  } catch (_) { /* analytics itself must never be able to crash the game */ }
  event.preventDefault();
});

window.addEventListener('error', (event) => {
  try {
    RundotGameAPI.analytics.recordCustomEvent('client_error', {
      message: String(event.message || ''),
      source: String(event.filename || ''),
      lineno: event.lineno || 0,
    });
  } catch (_) { /* ignore */ }
});

// Thin wrappers so every call site doesn't repeat the same defensive
// shape. Per ANALYTICS.md these calls are fire-and-forget and the SDK
// already swallows their own RPC failures -- the try/catch here only
// guards against a synchronous throw (e.g. calling before the module
// finished loading), not against rejection.
function recordEvent(name, params) {
  try { RundotGameAPI.analytics.recordCustomEvent(name, params); } catch (_) { /* ignore */ }
}
function trackFunnel(step, name, funnel, funnelOrder) {
  try { RundotGameAPI.analytics.trackFunnelStep(step, name, funnel, funnelOrder); } catch (_) { /* ignore */ }
}

// FTUE / progression funnel -- 5 steps, each fired exactly once, covering
// the whole arc from "opened the game" to "closed the case". funnelOrder:2
// so it sorts after the boot funnel (order:1) in dashboards that compare
// funnels side by side.
const ftue = { caseStarted: false, firstClue: false, allVisited: false, firstConnection: false, caseClosed: false };
function ftueStep(flag, step, name) {
  if (ftue[flag]) return;
  ftue[flag] = true;
  trackFunnel(step, name, 'investigation', 2);
}

/* ---------- Save / restore via RundotGameAPI.appStorage ----------
   The game iframe has no localStorage/sessionStorage/IndexedDB on
   RUN.world (see Runtime Environment docs) -- appStorage is the
   supported replacement. Storage calls DO need try/catch (unlike
   analytics): they can reject with QUOTA_EXCEEDED, RATE_LIMITED, etc.
------------------------------------------------------------------- */

const SAVE_KEY = 'rusko_save_v1';

function serializeProgress() {
  return JSON.stringify({
    foundClues: state.foundClues,
    unlockedLocations: Array.from(state.unlockedLocations),
    visitedSuspects: Array.from(state.visitedSuspects),
    connections: state.connections,
    hardballed: Object.fromEntries(Object.values(SUSPECTS).map(s => [s.id, s.hardballed])),
  });
}

async function persistProgress() {
  try {
    await RundotGameAPI.appStorage.setItem(SAVE_KEY, serializeProgress());
  } catch (err) {
    console.warn('[RUN] save failed (non-fatal, progress stays in memory):', err);
  }
}

async function restoreProgress() {
  try {
    const raw = await RundotGameAPI.appStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    state.foundClues = Array.isArray(data.foundClues) ? data.foundClues : [];
    state.unlockedLocations = new Set(data.unlockedLocations || ['study', 'anchor']);
    state.visitedSuspects = new Set(data.visitedSuspects || []);
    state.connections = Array.isArray(data.connections) ? data.connections : [];
    if (data.hardballed) {
      Object.entries(data.hardballed).forEach(([id, val]) => {
        if (SUSPECTS[id]) SUSPECTS[id].hardballed = !!val;
      });
    }
    return state.foundClues.length > 0 || state.visitedSuspects.size > 0;
  } catch (err) {
    console.warn('[RUN] restore failed (starting fresh):', err);
    return false;
  }
}

function registerLifecycleHandlers() {
  try {
    // onSleep is the documented place to persist -- long suspends (tab
    // switch, backgrounding) fire this reliably. onPause backs it up for
    // shorter interruptions. onQuit is deliberately NOT used to persist:
    // a hard close can tear the runtime down before that RPC lands.
    RundotGameAPI.lifecycles.onSleep(() => { persistProgress(); });
    RundotGameAPI.lifecycles.onPause(() => { persistProgress(); });
  } catch (err) {
    console.warn('[RUN] lifecycle registration failed:', err);
  }
}

/* ---------- DATA ---------- */

const SUSPECTS = {
  cole: {
    id: 'cole',
    name: 'Marcus Cole',
    image: 'Marcus Cole Headshot.jpg',
    guilty: false,
    hardballed: false,
    dialogue: {
      hardball: "\"You want to accuse me of something, detective, say it plain.\" His jaw tightens. \"Fine — I was at the office. Alone. Believe it or don't, I've got nothing else to give you.\" (He's colder now. He won't open up to sympathy after this.)",
      sympathy: "He loosens his tie, sits down heavy. \"Julius was going to ruin me, you understand? Not kill me — ruin me. The board finds out about the numbers, I'm finished either way. I didn't want him dead. I wanted more time.\"",
      bluff: "\"I know you weren't at the office that night, Marcus.\" He goes pale — just for a second — then recovers. \"...Prove it,\" he says, but his hands aren't steady anymore."
    }
  },
  eleanor: {
    id: 'eleanor',
    name: 'Eleanor Pratt',
    image: 'Eleanor Pratt Mugshot.jpg',
    guilty: true,
    hardballed: false,
    dialogue: {
      hardball: "\"I've said everything I'm going to say.\" She folds her arms and looks at the window, not at me. Pushing harder isn't going to get anything else out of her tonight.",
      sympathy: "Her composure cracks, just slightly. \"He said it was over. Just like that — after everything. And he was going to put it all in writing, tell the board, tell his daughter, tell everyone. I couldn't let him.\" She catches herself. \"I meant — I couldn't let him embarrass me.\"",
      bluff: "\"The gun's registered to your late husband, Eleanor. I know that much already.\" Her hand goes still on the armrest. \"...That pistol's been missing for months,\" she says, too quickly, like she rehearsed it and never expected to need it."
    }
  },
  delia: {
    id: 'delia',
    name: 'Delia Voss',
    image: 'Delia Voss Mugshot.jpg',
    guilty: false,
    hardballed: false,
    dialogue: {
      hardball: "\"Careful, detective. I'm the one paying your bill.\" She's not wrong. She doesn't budge, but she doesn't ask me to leave either.",
      sympathy: "She looks smaller for a moment. \"He cut me off two years ago and never once tried to explain why. I hated him for it. That's not the same as wanting him dead.\"",
      bluff: "\"Your father was about to put you back in the will, Delia. Did you know that?\" Her face does something complicated — hope, then anger at herself for feeling it. \"No,\" she says quietly. \"I didn't know that.\""
    }
  }
};

/*
  category: 'motive' | 'means' | 'opportunity' | null (null = red herring / never scores)
  points:   suspect id this evidence actually supports, or null (never scores toward anyone)
*/
const CLUES = {
  appointment_book: {
    id: 'appointment_book', name: 'Appointment Book',
    text: "The desk calendar is open to tonight. Last entry, in Voss's own hand: \"M.C. — 11:00.\" Marcus Cole never mentioned coming by.",
    foundAt: 'study', unlocks: 'cole_office', category: 'opportunity', points: 'cole'
  },
  torn_photo: {
    id: 'torn_photo', name: 'Torn Photograph', image: 'tornphoto.png',
    text: "A photograph, torn clean in half. Voss and a woman — the other half is missing. On the back, in a hand that isn't his: \"...tonight, same as always.\"",
    foundAt: 'study', unlocks: 'eleanor_flat', category: 'motive', points: 'eleanor'
  },
  lawyers_letter: {
    id: 'lawyers_letter', name: "Lawyer's Letter",
    text: "A drafted, unsent letter — reinstating someone in the will, \"pending one final conversation.\" No name filled in yet, but the estate details point at his daughter.",
    foundAt: 'study', unlocks: 'delia_apartment', category: 'motive', points: 'delia'
  },
  gun: {
    id: 'gun', name: 'The Weapon', image: 'gun.png',
    text: "A revolver, one round fired, wiped clean of prints. No serial number filed with the local registry — whoever owns this didn't buy it new.",
    foundAt: 'study', unlocks: null, category: 'means', points: 'eleanor'
  },

  ledger: {
    id: 'ledger', name: "Cole's Ledger",
    text: "Company books, the real ones. The shipping firm's been bleeding money for a year, and Cole's been the one holding the bucket. Voss was two signatures from exposing it to the board.",
    foundAt: 'cole_office', unlocks: null, category: 'motive', points: 'cole'
  },
  coat_check: {
    id: 'coat_check', name: 'Coat-Check Ticket',
    text: "A ticket from the Regal Room, timestamped 10:40 that night — a club clear across town from Voss's house. If it's real, Cole wasn't where the appointment book says he was.",
    foundAt: 'cole_office', unlocks: null, category: 'opportunity', points: null
  },

  photo_other_half: {
    id: 'photo_other_half', name: 'The Missing Half',
    text: "The other half of the torn photograph, tucked in a drawer. It's Eleanor, younger, arm around Voss like they had nowhere else to be.",
    foundAt: 'eleanor_flat', unlocks: null, category: 'motive', points: 'eleanor'
  },
  blackmail_letters: {
    id: 'blackmail_letters', name: 'Letters',
    text: "A bundle of letters, increasingly desperate. Not love letters exactly — more like someone renegotiating terms they never agreed to in the first place.",
    foundAt: 'eleanor_flat', unlocks: null, category: 'motive', points: 'eleanor'
  },
  pawn_ticket: {
    id: 'pawn_ticket', name: 'Pawn Ticket',
    text: "A ticket for a pawned brooch, dated last month. Doesn't square with a woman on a secretary's salary who's supposedly been \"taken care of.\"",
    foundAt: 'eleanor_flat', unlocks: null, category: 'motive', points: 'eleanor'
  },
  pistol_receipt: {
    id: 'pistol_receipt', name: "Husband's Pistol — Registry Slip",
    text: "A registration slip for a revolver, licensed years ago to Eleanor's late husband. The slip's still here. The gun clearly isn't.",
    foundAt: 'eleanor_flat', unlocks: null, category: 'means', points: 'eleanor'
  },

  matchbook: {
    id: 'matchbook', name: 'Jazz Club Matchbook',
    text: "A matchbook from the Blue Room, half-used. The bartender there would remember a face like hers — worth confirming, but it's not nothing.",
    foundAt: 'delia_apartment', unlocks: null, category: 'opportunity', points: null
  },
  burned_letter: {
    id: 'burned_letter', name: 'Half-Burned Letter',
    text: "A letter to her father, burned before it finished. What's left reads angrier than \"estranged\" really covers. She never sent it — or never got the chance to.",
    foundAt: 'delia_apartment', unlocks: null, category: 'motive', points: 'delia'
  },

  sal_witness: {
    id: 'sal_witness', name: "Sal's Word",
    text: "Sal knows a fella who parks cabs near the Voss place. Says he saw a car matching Eleanor's sitting outside, engine running, a good hour after she claims she left for the night.",
    foundAt: 'anchor', unlocks: null, category: 'opportunity', points: 'eleanor',
    requiresVisited: 'eleanor'
  }
};

const LOCATIONS = {
  study: {
    id: 'study', name: "Voss's Study", image: 'Julius_Voss_Office.png',
    desc: "Where it happened. Blood's dry now, but the room still feels like it's holding its breath. Somebody was comfortable enough in here to get close.",
    examine: ['appointment_book', 'torn_photo', 'lawyers_letter', 'gun'],
    alwaysUnlocked: true
  },
  anchor: {
    id: 'anchor', name: 'The Anchor', image: 'The Anchor.png',
    desc: "Dockside bar, three stools always open for regulars who don't like company. Sal's behind the bar like he's never once left it.",
    alwaysUnlocked: true, sal: true
  },
  cole_office: {
    id: 'cole_office', name: "Cole's Office", image: 'ColesOffice.png', suspect: 'cole',
    desc: "Mahogany desk, a view of the harbor, and a man who looks like he hasn't slept since Tuesday.",
    examine: ['ledger', 'coat_check']
  },
  eleanor_flat: {
    id: 'eleanor_flat', name: "Eleanor's Flat", image: 'EleanorsFlat.png', suspect: 'eleanor',
    desc: "Small, tidy, careful — the apartment of someone used to keeping things in order, including herself.",
    examine: ['photo_other_half', 'blackmail_letters', 'pawn_ticket', 'pistol_receipt']
  },
  delia_apartment: {
    id: 'delia_apartment', name: "Delia's Apartment", image: 'DeliasApartment.png', suspect: 'delia',
    desc: "Expensive furniture arranged like a stage set nobody's supposed to sit on. She's waiting for me by the window.",
    examine: ['matchbook', 'burned_letter']
  }
};

const SAL_FLAVOR = {
  cole: "\"Cole? Drinks here sometimes. Tips bad, talks worse — the kind of guy who orders top-shelf and pays like he's still got money.\"",
  eleanor: "\"The Pratt woman. Quiet type. Comes in once, orders a sherry she doesn't finish, leaves before anyone can ask her name. That's not nothing, Rusko.\"",
  delia: "\"Voss's kid? Sharp as a tack, that one. Comes off cold 'cause she learned it works. Don't mean she's cold underneath.\""
};

/* ---------- STATE ---------- */

const state = {
  screen: 'intro',
  currentLocation: null,
  unlockedLocations: new Set(['study', 'anchor']),
  foundClues: [],          // ordered array of clue ids
  visitedSuspects: new Set(),
  connections: [],         // {evidenceId, suspectId}
  selectedEvidence: null,
  suspectTalked: {}        // suspectId -> {hardball:bool, sympathy:bool, bluff:bool}
};

/* ---------- HELPERS ---------- */

function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }
function img(name) { return IMG + name; }

function showScreen(name) {
  state.screen = name;
  $all('.screen').forEach(s => s.classList.add('hidden'));
  $('#screen-' + name).classList.remove('hidden');
  $('#confront-btn').disabled = !allSuspectsVisited();
  if (name === 'map') renderMap();
  if (name === 'board') renderBoard();
  if (name === 'confront') renderConfront();
}

function allSuspectsVisited() {
  return ['cole', 'eleanor', 'delia'].every(id => state.visitedSuspects.has(id));
}

/* ---------- MAP ---------- */

function renderMap() {
  const grid = $('#location-grid');
  grid.innerHTML = '';
  Object.values(LOCATIONS).forEach(loc => {
    const unlocked = state.unlockedLocations.has(loc.id);
    const card = document.createElement('div');
    card.className = 'location-card' + (unlocked ? '' : ' locked');
    const photo = document.createElement('div');
    photo.className = 'card-photo';
    if (unlocked) photo.style.backgroundImage = `url("${img(loc.image)}")`;
    card.appendChild(photo);
    const info = document.createElement('div');
    info.innerHTML = `<h3>${unlocked ? loc.name : '???'}</h3>
      <div class="sub">${unlocked ? (loc.suspect ? 'Suspect location' : 'Explore') : 'Not yet known'}</div>`;
    card.appendChild(info);
    if (unlocked) card.addEventListener('click', () => openLocation(loc.id));
    grid.appendChild(card);
  });
}

/* ---------- LOCATION ---------- */

function openLocation(id) {
  state.currentLocation = id;
  const loc = LOCATIONS[id];

  recordEvent('location_opened', { locationId: id });

  $('#location-name').textContent = loc.name;
  $('#location-desc').textContent = loc.desc;

  const imgEl = $('#location-image');
  imgEl.src = loc.image ? img(loc.image) : '';
  imgEl.alt = loc.name;

  $('#clue-toast').classList.add('hidden');
  renderExamine(loc);
  renderTalk(loc);
  renderSal(loc);

  showScreen('location');
}

function renderExamine(loc) {
  const list = $('#examine-list');
  list.innerHTML = '';
  if (!loc.examine) { $('#examine-section').classList.add('hidden'); return; }
  $('#examine-section').classList.remove('hidden');
  loc.examine.forEach(clueId => {
    const clue = CLUES[clueId];
    const found = state.foundClues.includes(clueId);
    const btn = document.createElement('button');
    // Text stays identical whether found or not -- only the color changes
    // (via .found) -- so the button never resizes/reflows on click.
    btn.textContent = `Examine: ${clue.name}`;
    if (found) btn.classList.add('found');
    btn.addEventListener('click', () => examineClue(clueId));
    list.appendChild(btn);
  });
}

function examineClue(clueId) {
  const clue = CLUES[clueId];
  const toast = $('#clue-toast');
  const firstTime = !state.foundClues.includes(clueId);

  if (firstTime) {
    state.foundClues.push(clueId);
    toast.textContent = clue.text + (clue.unlocks ? ` New lead: ${LOCATIONS[clue.unlocks].name} is now open.` : '');
    if (clue.unlocks) state.unlockedLocations.add(clue.unlocks);
  } else {
    toast.textContent = clue.text;
  }
  toast.classList.remove('hidden');
  renderExamine(LOCATIONS[state.currentLocation]);

  if (firstTime) {
    recordEvent('clue_examined', { clueId, locationId: state.currentLocation, category: clue.category || null });
    ftueStep('firstClue', 2, 'first_clue_found');
  }
}

function renderTalk(loc) {
  const section = $('#talk-section');
  if (!loc.suspect) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  const suspect = SUSPECTS[loc.suspect];
  $('#talk-heading').textContent = `Talk to ${suspect.name}`;

  const wrap = $('#talk-approaches');
  wrap.innerHTML = '';
  ['hardball', 'sympathy', 'bluff'].forEach(approach => {
    const btn = document.createElement('button');
    btn.textContent = approach[0].toUpperCase() + approach.slice(1);
    if (approach === 'sympathy' && suspect.hardballed) {
      btn.disabled = true;
      btn.title = "They won't open up after that.";
    }
    btn.addEventListener('click', () => talkTo(suspect, approach));
    wrap.appendChild(btn);
  });

  $('#dialogue-output').classList.add('hidden');
}

function talkTo(suspect, approach) {
  state.visitedSuspects.add(suspect.id);
  if (approach === 'hardball') suspect.hardballed = true;

  renderTalk(LOCATIONS[state.currentLocation]); // refresh approach-lock state

  const out = $('#dialogue-output');
  out.textContent = suspect.dialogue[approach];
  out.classList.remove('hidden');

  $('#confront-btn').disabled = !allSuspectsVisited();

  recordEvent('suspect_talked', { suspectId: suspect.id, approach });
  if (allSuspectsVisited()) ftueStep('allVisited', 3, 'all_suspects_visited');
}

function renderSal(loc) {
  const section = $('#sal-section');
  if (!loc.sal) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  const list = $('#sal-list');
  list.innerHTML = '';

  ['cole', 'eleanor', 'delia'].forEach(sid => {
    if (!state.unlockedLocations.has(sid + '_office') &&
        !state.unlockedLocations.has(sid + '_flat') &&
        !state.unlockedLocations.has(sid + '_apartment')) return;
    const btn = document.createElement('button');
    btn.textContent = `Ask about ${SUSPECTS[sid].name}`;
    btn.addEventListener('click', () => {
      const toast = $('#clue-toast');
      toast.textContent = SAL_FLAVOR[sid];
      toast.classList.remove('hidden');
      recordEvent('sal_asked', { suspectId: sid });
    });
    list.appendChild(btn);
  });

  // special witness clue, only after Eleanor's flat visited.
  // Same text either way (only color/disabled state changes) so this
  // button never resizes on click either.
  if (state.visitedSuspects.has('eleanor')) {
    const found = state.foundClues.includes('sal_witness');
    const btn = document.createElement('button');
    btn.textContent = "Ask Sal about Eleanor's whereabouts";
    if (found) {
      btn.classList.add('found');
      btn.disabled = true;
    } else {
      btn.addEventListener('click', () => examineClue('sal_witness'));
    }
    list.appendChild(btn);
  }
}

/* ---------- CASE BOARD ---------- */

// All positions below are percentages of the FRAME (#board-frame), which
// is sized to exactly match Corkboard.png. But the image itself isn't
// pinnable edge-to-edge: it's a wall with a wood-framed bulletin board on
// it (lamp on the left), so the actual corkboard surface is a smaller
// rectangle inset from the image edges. Measured directly off the pixels
// in Corkboard.png (1280x720): the cork surface runs from roughly
// x=180..1098, y=48..655 -- i.e. left 14%, right 86%, top 6.7%, bottom
// 91% of the frame. Every photo below is confined inside that box so
// nothing gets pinned onto the wood frame or the wall/lamp margin.
//
// Evidence cards are smaller than suspect portraits (see #board-evidence
// .board-photo in style.css: 7% wide vs 10%). That matters here because
// .board-photo is a square (aspect-ratio 1/1) sized off WIDTH, but `top`
// is a percentage of the frame's HEIGHT -- and the frame is 16:9. A card
// that's 7% of frame width renders at 7% * (16/9) =~ 12.4% of frame
// height. rowHeight below has to clear that (plus room for the caption
// label hanging under each card) or rows start overlapping each other --
// exactly what happened with the old 4-col/13%-wide layout once all 13
// clues were on the board at once.
const SLOT_POSITIONS = [];
(function buildSlots() {
  const cols = 5, colWidth = 14, startLeft = 17, startTop = 40, rowHeight = 16;
  for (let i = 0; i < 15; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    SLOT_POSITIONS.push({ left: startLeft + col * colWidth, top: startTop + row * rowHeight });
  }
})();

const SUSPECT_POSITIONS = {
  cole: { left: 21, top: 18 },
  eleanor: { left: 45, top: 18 },
  delia: { left: 69, top: 18 }
};

// The corkboard frame is sized in JS (not pure CSS) so it always matches
// the *actual rendered* image exactly -- width and height both -- even
// when the window is short-and-wide or tall-and-narrow. That's what keeps
// the percentage-positioned suspect/evidence photos pinned to the real
// picture instead of drifting into empty letterboxed space around it.
function sizeBoardFrame() {
  const wrap = $('#board-wrap');
  const frame = $('#board-frame');
  const bg = $('#board-bg');
  if (!bg.naturalWidth) return;
  const availW = wrap.clientWidth;
  const availH = wrap.clientHeight;
  const ratio = bg.naturalWidth / bg.naturalHeight;
  let w = Math.min(900, availW);
  let h = w / ratio;
  if (h > availH) { h = availH; w = h * ratio; }
  frame.style.width = w + 'px';
  frame.style.height = h + 'px';
}

function renderBoard() {
  sizeBoardFrame();
  const bg = $('#board-bg');
  if (!bg.getAttribute('src')) bg.src = img('Corkboard.png');
  if (!bg.complete) {
    bg.addEventListener('load', () => { sizeBoardFrame(); drawConnections(); }, { once: true });
  }

  // suspects
  const susWrap = $('#board-suspects');
  susWrap.innerHTML = '';
  Object.values(SUSPECTS).forEach(s => {
    const pos = SUSPECT_POSITIONS[s.id];
    const el = document.createElement('div');
    el.className = 'board-photo';
    el.style.left = pos.left + '%';
    el.style.top = pos.top + '%';
    el.style.backgroundImage = `url("${img(s.image)}")`;
    el.dataset.suspect = s.id;
    el.innerHTML = `<div class="label">${s.name}</div>`;
    el.addEventListener('click', () => onSuspectClick(s.id));
    susWrap.appendChild(el);
  });

  // evidence
  const evWrap = $('#board-evidence');
  evWrap.innerHTML = '';
  state.foundClues.forEach((clueId, i) => {
    const clue = CLUES[clueId];
    const pos = SLOT_POSITIONS[i] || SLOT_POSITIONS[SLOT_POSITIONS.length - 1];
    const el = document.createElement('div');
    el.className = 'board-photo';
    el.style.left = pos.left + '%';
    el.style.top = pos.top + '%';
    el.dataset.evidence = clueId;
    if (clue.image) {
      el.classList.add('evidence-card-photo');
      el.style.backgroundImage = `url("${img(clue.image)}")`;
    } else {
      el.classList.add('evidence-card-text');
      el.textContent = clue.name;
    }
    el.innerHTML += `<div class="label">${clue.name}</div>`;
    if (state.selectedEvidence === clueId) el.classList.add('selected');
    el.addEventListener('click', () => onEvidenceClick(clueId));
    evWrap.appendChild(el);
  });

  drawConnections();
}

function onEvidenceClick(clueId) {
  state.selectedEvidence = (state.selectedEvidence === clueId) ? null : clueId;
  renderBoard();
}

function onSuspectClick(suspectId) {
  if (!state.selectedEvidence) return;
  const idx = state.connections.findIndex(c => c.evidenceId === state.selectedEvidence && c.suspectId === suspectId);
  if (idx >= 0) {
    state.connections.splice(idx, 1);
    recordEvent('evidence_disconnected', { evidenceId: state.selectedEvidence, suspectId });
  } else {
    state.connections.push({ evidenceId: state.selectedEvidence, suspectId });
    recordEvent('evidence_connected', { evidenceId: state.selectedEvidence, suspectId });
    ftueStep('firstConnection', 4, 'board_connection_made');
  }
  state.selectedEvidence = null;
  renderBoard();
}

// The pushpin graphic (.board-photo::after in style.css) sits centered
// horizontally but ABOVE the card, not on it: `top: -6px`, 10px tall, so
// its own center lands 1px above the card's top edge (-6 + 10/2 = -1).
// The yarn needs to hook onto that dot, not the middle of the photo --
// using the card's vertical center (the old math) made every line touch
// down inside the picture instead of at the pin, which is why it looked
// like the yarn endpoints were floating too low.
const PIN_OFFSET_Y = -1;

function drawConnections() {
  const svg = $('#board-svg');
  // #board-svg is a child of #board-frame (position:absolute, top:0,
  // left:0 relative to it) -- NOT #board-wrap. #board-wrap is the outer
  // centering slot, which is usually bigger than the frame (sizeBoardFrame
  // caps the frame at 900px wide, so on any window wider than that plus
  // margins there's a real gap between wrap and frame). Using wrap's
  // bounding rect here instead of frame's meant every line was offset by
  // that whole gap -- invisible only on the one test viewport where wrap
  // and frame happened to be the same size, which is why it looked fixed
  // in testing but not in the actual game window.
  const frame = $('#board-frame');
  if (!svg || !frame) return;
  const frameRect = frame.getBoundingClientRect();
  svg.innerHTML = '';
  state.connections.forEach(conn => {
    const evEl = document.querySelector(`[data-evidence="${conn.evidenceId}"]`);
    const suEl = document.querySelector(`[data-suspect="${conn.suspectId}"]`);
    if (!evEl || !suEl) return;
    const r1 = evEl.getBoundingClientRect();
    const r2 = suEl.getBoundingClientRect();
    const x1 = r1.left + r1.width / 2 - frameRect.left;
    const y1 = r1.top + PIN_OFFSET_Y - frameRect.top;
    const x2 = r2.left + r2.width / 2 - frameRect.left;
    const y2 = r2.top + PIN_OFFSET_Y - frameRect.top;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    svg.appendChild(line);
  });
}

/* ---------- CONFRONT ---------- */

function matchedCategories(suspectId) {
  const cats = new Set();
  state.connections.forEach(conn => {
    if (conn.suspectId !== suspectId) return;
    const clue = CLUES[conn.evidenceId];
    if (clue.points === suspectId && clue.category) cats.add(clue.category);
  });
  return cats;
}

function renderConfront() {
  const wrap = $('#confront-suspects');
  wrap.innerHTML = '';
  $('#confront-result').classList.add('hidden');
  Object.values(SUSPECTS).forEach(s => {
    const card = document.createElement('div');
    card.className = 'location-card suspect-card';
    const photo = document.createElement('div');
    photo.className = 'card-photo';
    photo.style.backgroundImage = `url("${img(s.image)}")`;
    card.appendChild(photo);
    const info = document.createElement('div');
    info.innerHTML = `<h3>${s.name}</h3><div class="sub">Accuse</div>`;
    card.appendChild(info);
    card.addEventListener('click', () => attemptConfront(s.id));
    wrap.appendChild(card);
  });
}

function attemptConfront(suspectId) {
  const cats = matchedCategories(suspectId);
  const result = $('#confront-result');
  result.classList.remove('hidden');

  const success = suspectId === 'eleanor' && cats.size >= 1;
  recordEvent('confront_attempted', { suspectId, categories: Array.from(cats), success });

  if (suspectId === 'eleanor' && cats.size >= 3) {
    endGame('clean');
    return;
  }
  if (suspectId === 'eleanor' && cats.size >= 1) {
    endGame('messy');
    return;
  }

  // Failed accusation — send back to investigate, no hard game over.
  const failText = {
    cole: "Cole's lawyer is in the room before you finish the sentence. \"Motive isn't a murder weapon, detective.\" He's right, and you both know it. You've got nothing that puts him in that study.",
    eleanor: "\"That's it?\" Eleanor says, almost pitying. Whatever you're holding, it isn't enough to make it stick — not yet.",
    delia: "Delia doesn't even raise her voice. \"You're guessing, Rusko. And you're guessing wrong.\" She's not scared. That tells you something."
  };
  result.textContent = failText[suspectId] + " Better go dig up something that actually holds together.";
}

/* ---------- ENDINGS ---------- */

const ENDINGS = {
  clean: {
    title: 'Case Closed — Clean',
    text: "It all lines up: the affair, the desperation, the gun that was never really missing. Eleanor doesn't even try to argue once you lay it out. The DA calls it an easy conviction. Delia pays what she owes you and doesn't say thank you — noir clients never do. You did the job right this time. That's not nothing."
  },
  messy: {
    title: 'Case Closed — Messy',
    text: "You've got the right name, but the case is thinner than you'd like. Eleanor's lawyer picks at every gap you didn't fill. She goes away for it — eventually, on a lesser charge, after a plea that leaves everyone a little unsatisfied. You got there. You just didn't get there clean."
  }
};

function endGame(key) {
  const ending = ENDINGS[key];
  $('#ending-title').textContent = ending.title;
  $('#ending-text').textContent = ending.text;
  showScreen('ending');

  recordEvent('ending_reached', { key });
  ftueStep('caseClosed', 5, 'case_closed');
  // The case is over -- clear the save so a restart (or a fresh visit)
  // doesn't silently resurrect a finished game via appStorage.
  RundotGameAPI.appStorage.removeItem(SAVE_KEY).catch(() => {});
}

/* ---------- NAV / INIT ---------- */

document.addEventListener('click', e => {
  const nav = e.target.closest('[data-nav]');
  if (nav) showScreen(nav.dataset.nav);
});

$('#start-btn').addEventListener('click', () => {
  ftueStep('caseStarted', 1, 'case_started');
  showScreen('map');
});

$('#restart-btn').addEventListener('click', () => {
  state.unlockedLocations = new Set(['study', 'anchor']);
  state.foundClues = [];
  state.visitedSuspects = new Set();
  state.connections = [];
  state.selectedEvidence = null;
  Object.values(SUSPECTS).forEach(s => { s.hardballed = false; });
  RundotGameAPI.appStorage.removeItem(SAVE_KEY).catch(() => {});
  showScreen('intro');
});

window.addEventListener('resize', () => {
  if (state.screen === 'board') { sizeBoardFrame(); drawConnections(); }
});

/* ---------- BOOT ----------
   The boot triad (load_started -> load_finished -> first_tap) is the
   baseline funnel every RUN game should fire at the very front, per the
   analytics stage in rundot-game-coach. funnelOrder:1 so it sorts before
   the investigation funnel (order:2) on dashboards that show both.
------------------------------------------------------------------------- */

async function boot() {
  // The SDK auto-initializes on import (initializeAsync() is deprecated
  // and no longer needed), but device/profile/safe-area reads still need
  // to happen after the first await, not at module top level -- this
  // await is that checkpoint.
  await Promise.resolve();

  trackFunnel(1, 'load_started', 'boot', 1);
  recordEvent('load_started');

  registerLifecycleHandlers();

  let hasProgress = false;
  try {
    hasProgress = await restoreProgress();
  } catch (err) {
    console.warn('[RUN] boot restore threw, starting fresh:', err);
  }

  showScreen(hasProgress ? 'map' : 'intro');

  trackFunnel(2, 'load_finished', 'boot', 1);
  recordEvent('load_finished');

  document.addEventListener('pointerdown', () => {
    trackFunnel(3, 'first_tap', 'boot', 1);
    recordEvent('first_tap');
  }, { once: true });
}

boot().catch(err => {
  // If boot itself throws before showScreen ever runs, fall back to the
  // intro screen directly rather than leaving a blank page.
  console.error('[RUN] boot failed:', err);
  try { showScreen('intro'); } catch (_) { /* DOM not ready; nothing more we can do */ }
});
