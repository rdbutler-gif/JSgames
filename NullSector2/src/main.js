// ====================================================================
// RUN.world SDK
// ====================================================================
// The SDK initializes automatically on import (no initializeAsync() call
// needed -- see initializing-your-game.md / SYSTEM.md). Every RundotGameAPI
// call can reject; a single unhandled rejection is treated as a fatal error
// and crashes the game back to the RUN.world catalog, so this global handler
// is a last-resort safety net on top of the try/catch blocks below.
// See: error-handling.md
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';

// ====================================================================
// ANALYTICS -- funnel/event names defined here, once, per best practice
// ("define your funnel steps upfront and keep step numbers consistent").
// recordCustomEvent/trackFunnelStep are fire-and-forget: the SDK catches
// transport failures internally and never rejects, so no try/catch needed
// around these calls. See: api/ANALYTICS.md
// ====================================================================
const FUNNEL_BOOT = 'boot';            // order 1: load_started -> load_finished -> first_tap
const FUNNEL_CORE_LOOP = 'core_loop';  // order 2: run_started -> first_enemy_kill -> hive_node_destroyed -> apex_boss_defeated
const FUNNEL_LEADERBOARD = 'leaderboard'; // order 3: leaderboard_opened -> leaderboard_scrolled -> score_submitted

function trackBoot(step, name){ RundotGameAPI.analytics.trackFunnelStep(step, name, FUNNEL_BOOT, 1); }
function trackCoreLoop(step, name){ RundotGameAPI.analytics.trackFunnelStep(step, name, FUNNEL_CORE_LOOP, 2); }
function trackLeaderboardFunnel(step, name){ RundotGameAPI.analytics.trackFunnelStep(step, name, FUNNEL_LEADERBOARD, 3); }
function recordEvent(name, payload){ RundotGameAPI.analytics.recordCustomEvent(name, payload); }

// Boot triad, step 1 -- fire this as early in the module as possible.
trackBoot(1, 'load_started');

// Crash/error capture -- both required for a green "Stage 1: telemetry"
// (per rundot-game-coach's inspection checklist): window `error` +
// `unhandledrejection`, both forwarded to the analytics pipeline so a spike
// in errors shows up on the dashboard, not just in a player's own console.
window.addEventListener('unhandledrejection', (event)=>{
  console.warn('[SDK] unhandled rejection:', event.reason);
  recordEvent('game_error', {kind:'unhandled_rejection', message:String(event.reason).slice(0,300)});
  event.preventDefault();
});
window.addEventListener('error', (event)=>{
  console.warn('[SDK] uncaught error:', event.error||event.message);
  recordEvent('game_error', {
    kind:'uncaught_exception',
    message:String(event.message||(event.error&&event.error.message)||'').slice(0,300),
    source:event.filename||'', line:event.lineno||0, col:event.colno||0
  });
});

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const WORLD = 3840;                            // 6x6 screens (640*6)

// ====================================================================
// RESPONSIVE VIEWPORT -- VW/VH are the canvas's *drawing coordinate
// space*, no longer a fixed 640x640. They're recomputed to fit whatever
// screen the game is running on: wide/short on a landscape phone or
// desktop window, narrow/tall on a portrait phone. Every world-space
// draw call, the camera clamp, the touch dual-stick split point, and the
// HUD/minimap placement all read the VW/VH bindings live each frame (or
// at event time), so they follow automatically -- nothing else needs to
// change when these resize. Backing-store resolution is scaled by
// devicePixelRatio (capped at 2x) via ctx.setTransform so art stays
// crisp on retina/mobile screens without inflating the logical
// coordinate space those calls use.
// ====================================================================
let VW, VH;                        // logical (CSS-pixel) viewport -- mutable
const MIN_VIEW=320, MAX_VIEW=960;  // sane bounds: a huge monitor shouldn't
                                    // reveal an absurd chunk of the 3840
                                    // world, and an old/small phone should
                                    // still get a playable view
function computeAvailableBox(){
  const cs=getComputedStyle(document.body);
  const padX=(parseFloat(cs.paddingLeft)||0)+(parseFloat(cs.paddingRight)||0);
  const padY=(parseFloat(cs.paddingTop)||0)+(parseFloat(cs.paddingBottom)||0);
  return {
    w: Math.max(240, document.body.clientWidth - padX - 6),
    h: Math.max(240, document.body.clientHeight - padY - 6)
  };
}
function resizeCanvas(){
  const box=computeAvailableBox();
  VW=Math.round(Math.max(MIN_VIEW,Math.min(MAX_VIEW,box.w)));
  VH=Math.round(Math.max(MIN_VIEW,Math.min(MAX_VIEW,box.h)));
  const dpr=Math.min(window.devicePixelRatio||1,2);
  cv.width=Math.round(VW*dpr); cv.height=Math.round(VH*dpr);
  cv.style.width=VW+'px'; cv.style.height=VH+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  // Note: deliberately NOT touching `cam` here. update() already re-clamps
  // it to [0,WORLD-VW]/[0,WORLD-VH] every single frame during play, so a
  // mid-game resize self-corrects on the very next frame; reaching for
  // `cam` from here would also risk a temporal-dead-zone error since it's
  // declared (via `let`) further down the module, after this first call.
}
resizeCanvas(); // must run before anything below reads VW/VH
let resizeDebounce=null;
function scheduleResize(){ clearTimeout(resizeDebounce); resizeDebounce=setTimeout(resizeCanvas,120); }
addEventListener('resize',scheduleResize);
addEventListener('orientationchange',scheduleResize);
if(window.visualViewport) window.visualViewport.addEventListener('resize',scheduleResize);

// RUN.world host safe-area (device notches + host chrome/toolbar) --
// getSafeArea() throws pre-init on a real device (no ready-callback, same
// constraint as getProfile()), so retry a few times rather than assuming
// it's ready. The CSS `env(safe-area-inset-*)` padding on <body> (see
// index.html) is the baseline that works everywhere immediately, incl.
// plain-browser local dev; once the SDK value resolves it's authoritative
// (it already folds in the device safe area, so it replaces rather than
// adds to the CSS baseline) and we reflow the canvas around it.
// See: api/SAFE_AREA.md
function applyHostSafeArea(attempt){
  attempt=attempt||0;
  try{
    const sa=RundotGameAPI.system.getSafeArea();
    document.body.style.padding=`${sa.top}px ${sa.right}px ${sa.bottom}px ${sa.left}px`;
    resizeCanvas();
  }catch(e){
    if(attempt<8) setTimeout(()=>applyHostSafeArea(attempt+1),250);
    else console.warn('[SDK] host safe area still unavailable after retries, using CSS env() fallback:',e);
  }
}
applyHostSafeArea();

// ====================================================================
// HIGH SCORES (carried over from RUSKO'S RUN)
// ====================================================================
// Key used to store high scores in RUN.world's per-game app storage
const HS_KEY = 'ruskosdescent_highscores_v1';

// Default empty high scores table for new players to fill
const DEFAULT_SCORES = [
  {ini:'AAA', sc:0},{ini:'AAA', sc:0},{ini:'AAA', sc:0},
  {ini:'AAA', sc:0},{ini:'AAA', sc:0},{ini:'AAA', sc:0},
  {ini:'AAA', sc:0},{ini:'AAA', sc:0},{ini:'AAA', sc:0},{ini:'AAA', sc:0},
];

// Start with defaults; the real saved scores are fetched async (see boot
// sequence at the bottom of this file) and swapped in once loadScores() resolves.
let highScores = normalize(DEFAULT_SCORES.slice());

// Load saved high scores from RUN.world's cloud-synced app storage.
// (localStorage/sessionStorage/IndexedDB are not available inside the RUN.world
// game iframe -- appStorage is the platform's replacement. See STORAGE.md.)
async function loadScores(){
  try{
    const raw=await RundotGameAPI.appStorage.getItem(HS_KEY);
    if(raw){
      const a=JSON.parse(raw);
      if(Array.isArray(a)&&a.length) highScores=normalize(a);
    }
  }catch(e){ console.warn('[SDK] loadScores failed, keeping defaults:',e); }
  return highScores;
}

// Standardize high scores: uppercase initials (max 3 chars), valid score, sorted high→low, top 10 only
function normalize(arr){
  return arr
    .map(r=>({
      ini:String(r.ini||'AAA').toUpperCase().slice(0,3).padEnd(3,'A'),
      sc:Math.max(0,parseInt(r.sc)||0)
    }))
    .sort((a,b)=>b.sc-a.sc)  // Sort: highest score first
    .slice(0,10);              // Keep only top 10
}

// Save current high scores to RUN.world's cloud-synced app storage.
// Called fire-and-forget in a few places; errors are swallowed here on purpose
// (per SDK guidance every RundotGameAPI call can reject, and a save failure
// here shouldn't be able to crash the game or block the UI).
async function saveScores(){
  try{ await RundotGameAPI.appStorage.setItem(HS_KEY,JSON.stringify(highScores)); }
  catch(e){ console.warn('[SDK] saveScores failed:',e); }
}

// Check if a score qualifies for the high scores table
function qualifies(s){ 
  return highScores.length<10 || s>highScores[highScores.length-1].sc; 
}

// Add a new score to high scores table and save
// Returns the index of the newly added score (used to highlight it)
function insertScore(ini,s){
  highScores.push({
    ini:ini.toUpperCase().slice(0,3).padEnd(3,'A'),
    sc:s
  });
  highScores=normalize(highScores);
  saveScores();
  return highScores.findIndex(r=>r.ini===ini.toUpperCase().slice(0,3).padEnd(3,'A')&&r.sc===s);
}

// Export high scores to a downloadable text file (.dat)
function exportDat(){
  const lines=highScores.map(r=>`${r.ini},${r.sc}`).join('\n');
  const blob=new Blob([
    "# RUSKO'S PLANET high scores — format: INITIALS,SCORE\n"+
    "# Edit freely. Max 10 entries, sorted high to low.\n"+
    lines+"\n"
  ],{type:'text/plain'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='ruskos_descent_scores.dat';
  a.click();
  URL.revokeObjectURL(url);
}

// Import high scores from a user-selected file (.dat, .txt, or .json)
function importDat(file){
  const r=new FileReader();
  r.onload=()=>{
    const txt=r.result;
    let parsed=[];
    
    // Try parsing as JSON first, fall back to comma-separated format
    try{
      const j=JSON.parse(txt);
      if(Array.isArray(j)) parsed=j.map(o=>({ini:o.ini,sc:o.sc}));
    }catch(e){
      // Parse as comma-separated: INITIALS,SCORE
      // Skip comment lines (starting with #) and empty lines
      txt.split(/\r?\n/).forEach(line=>{
        line=line.trim();
        if(!line||line.startsWith('#')) return;
        const m=line.split(',');
        if(m.length>=2) parsed.push({ini:m[0].trim(),sc:parseInt(m[1])});
      });
    }
    
    if(parsed.length){
      highScores=normalize(parsed);
      saveScores();
      refreshTitleTop();
      renderHSTable();
      alert('High scores imported.');
    }else{
      alert('No valid entries found in that file.');
    }
  };
  r.readAsText(file);
}

// Update the "TOP SCORE" display on the title screen
function refreshTitleTop(){
  const t=highScores[0]||{ini:'AAA',sc:0};
  document.getElementById('titleTop').innerHTML=
    `TOP &nbsp;<span class="ini">${t.ini}</span>&nbsp; <span class="v">${String(t.sc).padStart(6,'0')}</span>`;
}

// Render the high scores table to HTML
// highlightIdx: if set, highlights that row (used when player just scored)
// id: which element to update ('hsTable' or 'hsTableWin')
function renderHSTable(highlightIdx=-1,id='hsTable'){
  document.getElementById(id).innerHTML=highScores.map((r,i)=>{
    const me=i===highlightIdx?' me':'';  // Add 'me' class if this is the player's new score
    return `<div class="row"><span class="rank${me}">${String(i+1).padStart(2,'0')}</span>`+
      `<span class="ini${me}">${r.ini}</span>`+
      `<span class="sc${me}">${String(r.sc).padStart(6,'0')}</span></div>`;
  }).join('');
}

// ====================================================================
// RUN.world PROFILE + GLOBAL LEADERBOARD
// ====================================================================
// The local high-score table above (appStorage) is a per-player personal
// record, kept as-is. This section adds the real cross-player leaderboard
// (RundotGameAPI.leaderboard) plus showing the signed-in player's own
// RUN.world profile (username + avatar) in the game. See:
// api/PROFILE.md, api/LEADERBOARD.md

let cachedProfile = null; // set once getProfile() succeeds; used to highlight "me" in the list

// Small deterministic color from a string, for the avatar-fallback circle
// when a player has no avatarUrl (or it fails to load).
function colorFromString(str){
  let hash=0;
  for(let i=0;i<str.length;i++) hash=(hash*31+str.charCodeAt(i))|0;
  const hue=Math.abs(hash)%360;
  return `hsl(${hue},55%,32%)`;
}

// Returns the inner HTML for one avatar circle: shows the real avatarUrl
// image if present, with a same-color initials fallback underneath in case
// the URL is null/missing OR the image fails to load (onerror removes it).
function avatarInnerHTML(avatarUrl, username){
  const initial=(username||'?').trim().charAt(0).toUpperCase()||'?';
  const img=avatarUrl ? `<img src="${avatarUrl}" alt="" onerror="this.remove()">` : '';
  return `${initial}${img}`;
}

// Update every profile badge on the page (title screen + leaderboard panel)
// to show the signed-in player's username/avatar.
function renderProfileBadge(profile){
  const badges=document.querySelectorAll('.profile-badge');
  if(!profile){ badges.forEach(b=>b.classList.add('hidden')); return; }
  const name=profile.isAnonymous ? `${profile.username} <span class="pb-guest">(guest)</span>` : profile.username;
  const bg=colorFromString(profile.username||profile.id||'?');
  badges.forEach(b=>{
    b.innerHTML=`<span class="pb-avatar" style="background:${bg}">${avatarInnerHTML(profile.avatarUrl,profile.username)}</span>`+
      `<span class="pb-name">${name}</span>`;
    b.classList.remove('hidden');
  });
}

// getProfile() throws until the SDK's host handshake (INIT_SDK) completes --
// there's no ready-callback for it, so retry a few times with a short delay
// rather than assuming it's ready. See api/PROFILE.md / api/SYSTEM.md.
function tryShowProfileBadge(attempt){
  attempt=attempt||0;
  try{
    const profile=RundotGameAPI.getProfile();
    cachedProfile=profile;
    renderProfileBadge(profile);
  }catch(e){
    if(attempt<8) setTimeout(()=>tryShowProfileBadge(attempt+1),250);
    else console.warn('[SDK] profile still unavailable after retries:',e);
  }
}

// ---- Global leaderboard panel ----
let lbReturnState='title';   // which panel to go back to on BACK
let lbScrollTracked=false;   // fire 'leaderboard_scrolled' at most once per open

function openLeaderboard(returnState){
  lbReturnState=returnState;
  lbScrollTracked=false;
  ['title','over','win','entry','paused'].forEach(id=>document.getElementById(id).classList.add('hidden'));
  document.getElementById('leaderboard').classList.remove('hidden');
  state='leaderboard';
  trackLeaderboardFunnel(1,'leaderboard_opened');
  loadLeaderboard();
}
function closeLeaderboard(){
  document.getElementById('leaderboard').classList.add('hidden');
  document.getElementById(lbReturnState).classList.remove('hidden');
  state=lbReturnState;
}

async function loadLeaderboard(){
  const listEl=document.getElementById('lbList');
  listEl.innerHTML='<div class="lb-status" id="lbStatus">LOADING...</div>';
  try{
    const page=await RundotGameAPI.leaderboard.getPagedScores({limit:100});
    if(!page.entries || page.entries.length===0){
      listEl.innerHTML='<div class="lb-status">NO SCORES YET -- BE THE FIRST TO DEPLOY.</div>';
      return;
    }
    renderLeaderboardRows(listEl, page.entries);
    listEl.addEventListener('scroll',()=>{
      if(!lbScrollTracked){ lbScrollTracked=true; trackLeaderboardFunnel(2,'leaderboard_scrolled'); }
    }, {passive:true});
  }catch(e){
    console.warn('[SDK] leaderboard fetch failed:',e);
    listEl.innerHTML='<div class="lb-status error">COULD NOT REACH THE GLOBAL LEADERBOARD.<br>CHECK YOUR CONNECTION AND TRY AGAIN.</div>';
  }
}

function renderLeaderboardRows(listEl, entries){
  const myId=cachedProfile&&cachedProfile.id;
  listEl.innerHTML=entries.map(e=>{
    const me=(myId && e.profileId===myId) ? ' me' : '';
    const bg=colorFromString(e.username||e.profileId||'?');
    return `<div class="lb-row${me}">`+
      `<span class="lb-rank">${e.rank!=null?('#'+e.rank):'-'}</span>`+
      `<span class="lb-avatar" style="background:${bg}">${avatarInnerHTML(e.avatarUrl,e.username)}</span>`+
      `<span class="lb-name">${e.username}</span>`+
      `<span class="lb-score">${String(e.score).padStart(6,'0')}</span>`+
    `</div>`;
  }).join('');
}

// Submit this run's score to the real cross-player leaderboard. This is
// additive to the existing local top-10 table, not a replacement for it --
// it can fail independently (network hiccup, RUN.world unreachable) without
// affecting the local high-score flow, and vice versa.
async function submitRunScore(finalScore, durationSec){
  setGlobalRankText('SUBMITTING SCORE...','pending');
  try{
    const result=await RundotGameAPI.leaderboard.submitScore({score:finalScore, duration:durationSec});
    if(result.accepted){
      trackLeaderboardFunnel(3,'score_submitted');
      setGlobalRankText(`GLOBAL RANK #${result.rank}`,'');
    } else {
      setGlobalRankText(result.reason ? `NOT RECORDED: ${result.reason}` : 'SCORE NOT RECORDED','error');
    }
  }catch(e){
    console.warn('[SDK] score submission failed:',e);
    setGlobalRankText('COULD NOT REACH THE GLOBAL LEADERBOARD','error');
  }
}
function setGlobalRankText(text, cls){
  ['globalRankOver','globalRankWin'].forEach(id=>{
    const el=document.getElementById(id);
    el.textContent=text;
    el.className='global-rank'+(cls?(' '+cls):'');
  });
}

// ====================================================================
// AUDIO  (Web Audio API — no files, all sounds synthesized)
// ====================================================================
// All sound effects are created using the Web Audio API, which generates
// waveforms (sine, square, sawtooth) in real-time. No audio files to load!

let audioCtx=null;

// Initialize the audio context (required for Web Audio API)
// Browsers require a user gesture (click, key, touch) to start audio
function ensureAudio(){
  if(!audioCtx){
    try{ 
      audioCtx=new(window.AudioContext||window.webkitAudioContext)(); 
    }catch(e){}
  }
  // Resume audio if browser suspended it (some browsers pause audio until user interaction)
  if(audioCtx&&audioCtx.state==='suspended') audioCtx.resume();
}

// PLAYER FIRING: Classic laser pew sound
// High-pitched square wave that sweeps down from 820→200 Hz over 400ms
function pewSound(){
  if(!audioCtx) return;
  try{
    const t=audioCtx.currentTime;
    const osc=audioCtx.createOscillator();
    const gain=audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type='square';
    osc.frequency.setValueAtTime(820,t);
    osc.frequency.exponentialRampToValueAtTime(120,t+0.40);
    gain.gain.setValueAtTime(0.18,t);
    gain.gain.exponentialRampToValueAtTime(0.001,t+0.40);
    osc.start(t); osc.stop(t+0.40);
  }catch(e){}
}

// Enemy hit thwack: sawtooth pitch-drop thok + tight noise crack
function enemyHitSound(){
  if(!audioCtx) return;
  try{
    const t=audioCtx.currentTime;
    // pitched thok: sawtooth 300→80 Hz in 55ms
    const osc=audioCtx.createOscillator();
    const oscGain=audioCtx.createGain();
    osc.connect(oscGain); oscGain.connect(audioCtx.destination);
    osc.type='sawtooth';
    osc.frequency.setValueAtTime(300,t);
    osc.frequency.exponentialRampToValueAtTime(80,t+0.055);
    oscGain.gain.setValueAtTime(0.28,t);
    oscGain.gain.exponentialRampToValueAtTime(0.001,t+0.07);
    osc.start(t); osc.stop(t+0.07);
    // tight noise crack filtered at 2kHz
    const bufLen=Math.floor(audioCtx.sampleRate*0.06);
    const buf=audioCtx.createBuffer(1,bufLen,audioCtx.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<bufLen;i++) d[i]=(Math.random()*2-1);
    const noise=audioCtx.createBufferSource();
    noise.buffer=buf;
    const filter=audioCtx.createBiquadFilter();
    filter.type='bandpass'; filter.frequency.value=2000; filter.Q.value=0.8;
    const ng=audioCtx.createGain();
    noise.connect(filter); filter.connect(ng); ng.connect(audioCtx.destination);
    ng.gain.setValueAtTime(0.30,t);
    ng.gain.exponentialRampToValueAtTime(0.001,t+0.06);
    noise.start(t); noise.stop(t+0.07);
  }catch(e){}
}

// Player damage: low square wave thud + filtered noise rumble
function damageSound(){
  if(!audioCtx) return;
  try{
    const t=audioCtx.currentTime;
    const osc=audioCtx.createOscillator();
    const oscGain=audioCtx.createGain();
    osc.connect(oscGain); oscGain.connect(audioCtx.destination);
    osc.type='square';
    osc.frequency.setValueAtTime(120,t);
    osc.frequency.exponentialRampToValueAtTime(40,t+0.28);
    oscGain.gain.setValueAtTime(0.35,t);
    oscGain.gain.exponentialRampToValueAtTime(0.001,t+0.30);
    osc.start(t); osc.stop(t+0.30);
    const bufLen=audioCtx.sampleRate*0.25;
    const buf=audioCtx.createBuffer(1,bufLen,audioCtx.sampleRate);
    const data=buf.getChannelData(0);
    for(let i=0;i<bufLen;i++) data[i]=(Math.random()*2-1);
    const noise=audioCtx.createBufferSource();
    noise.buffer=buf;
    const filter=audioCtx.createBiquadFilter();
    filter.type='lowpass'; filter.frequency.value=160;
    const noiseGain=audioCtx.createGain();
    noise.connect(filter); filter.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noiseGain.gain.setValueAtTime(0.22,t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001,t+0.28);
    noise.start(t); noise.stop(t+0.30);
  }catch(e){}
}

// Player death explosion: three-layer blast lasting ~2.5s
function deathExplosionSound(){
  if(!audioCtx) return;
  try{
    const t=audioCtx.currentTime;
    // layer 1 — deep sine boom, 80→25 Hz, 2s decay
    const boom=audioCtx.createOscillator();
    const boomGain=audioCtx.createGain();
    boom.connect(boomGain); boomGain.connect(audioCtx.destination);
    boom.type='sine';
    boom.frequency.setValueAtTime(80,t);
    boom.frequency.exponentialRampToValueAtTime(25,t+0.4);
    boomGain.gain.setValueAtTime(0.7,t);
    boomGain.gain.setValueAtTime(0.7,t+0.05); // brief sustain
    boomGain.gain.exponentialRampToValueAtTime(0.001,t+2.0);
    boom.start(t); boom.stop(t+2.0);
    // layer 2 — mid noise rumble through sweeping low-pass, 2.2s
    const bufLen2=Math.floor(audioCtx.sampleRate*2.3);
    const buf2=audioCtx.createBuffer(1,bufLen2,audioCtx.sampleRate);
    const d2=buf2.getChannelData(0);
    for(let i=0;i<bufLen2;i++) d2[i]=(Math.random()*2-1);
    const rumbleNoise=audioCtx.createBufferSource();
    rumbleNoise.buffer=buf2;
    const rumbleFilt=audioCtx.createBiquadFilter();
    rumbleFilt.type='lowpass';
    rumbleFilt.frequency.setValueAtTime(800,t);
    rumbleFilt.frequency.exponentialRampToValueAtTime(80,t+2.2);
    const rumbleGain=audioCtx.createGain();
    rumbleNoise.connect(rumbleFilt); rumbleFilt.connect(rumbleGain);
    rumbleGain.connect(audioCtx.destination);
    rumbleGain.gain.setValueAtTime(0.5,t);
    rumbleGain.gain.setValueAtTime(0.5,t+0.1);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001,t+2.2);
    rumbleNoise.start(t); rumbleNoise.stop(t+2.3);
    // layer 3 — high crackle, band-pass noise 3kHz, fades by 1.2s
    const bufLen3=Math.floor(audioCtx.sampleRate*1.3);
    const buf3=audioCtx.createBuffer(1,bufLen3,audioCtx.sampleRate);
    const d3=buf3.getChannelData(0);
    for(let i=0;i<bufLen3;i++) d3[i]=(Math.random()*2-1);
    const crackle=audioCtx.createBufferSource();
    crackle.buffer=buf3;
    const crackleFilt=audioCtx.createBiquadFilter();
    crackleFilt.type='bandpass'; crackleFilt.frequency.value=3000; crackleFilt.Q.value=0.5;
    const crackleGain=audioCtx.createGain();
    crackle.connect(crackleFilt); crackleFilt.connect(crackleGain);
    crackleGain.connect(audioCtx.destination);
    crackleGain.gain.setValueAtTime(0.25,t);
    crackleGain.gain.exponentialRampToValueAtTime(0.001,t+1.2);
    crackle.start(t); crackle.stop(t+1.3);
  }catch(e){}
}

// Gem pickup: bright ascending sparkle with twin harmonics
function gemPickupSound(){
  if(!audioCtx) return;
  try{
    const t=audioCtx.currentTime;
    // primary rising bell tone: 2000→3200 Hz, extended decay to 500ms
    const osc=audioCtx.createOscillator();
    const gain=audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type='sine';
    osc.frequency.setValueAtTime(2000,t);
    osc.frequency.exponentialRampToValueAtTime(3200,t+0.08);
    osc.frequency.exponentialRampToValueAtTime(1800,t+0.25);
    gain.gain.setValueAtTime(0.25,t);
    gain.gain.exponentialRampToValueAtTime(0.001,t+0.50);
    osc.start(t); osc.stop(t+0.50);
    // secondary harmonic shimmer: higher frequencies, extended decay
    const osc2=audioCtx.createOscillator();
    const gain2=audioCtx.createGain();
    osc2.connect(gain2); gain2.connect(audioCtx.destination);
    osc2.type='sine';
    osc2.frequency.setValueAtTime(4100,t);
    osc2.frequency.exponentialRampToValueAtTime(5200,t+0.08);
    gain2.gain.setValueAtTime(0.12,t);
    gain2.gain.exponentialRampToValueAtTime(0.001,t+0.45);
    osc2.start(t); osc2.stop(t+0.45);
  }catch(e){}
}

// MiniBoss ring fire (14-bullet pattern): deep sawtooth boom, harsh attack
function miniBossRingFireSound(){
  if(!audioCtx) return;
  try{
    const t=audioCtx.currentTime;
    const osc=audioCtx.createOscillator();
    const gain=audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type='sawtooth'; // harsh biting tone
    osc.frequency.setValueAtTime(180,t);
    osc.frequency.exponentialRampToValueAtTime(80,t+0.25);
    gain.gain.setValueAtTime(0.45,t);
    gain.gain.exponentialRampToValueAtTime(0.001,t+0.50);
    osc.start(t); osc.stop(t+0.50);
  }catch(e){}
}

// MiniBoss 3-shot fire: different pitch square wave boom, distinct from ring
function miniBoss3ShotFireSound(){
  if(!audioCtx) return;
  try{
    const t=audioCtx.currentTime;
    const osc=audioCtx.createOscillator();
    const gain=audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type='square'; // different waveform than ring for distinction
    osc.frequency.setValueAtTime(240,t);
    osc.frequency.exponentialRampToValueAtTime(100,t+0.28);
    gain.gain.setValueAtTime(0.40,t);
    gain.gain.exponentialRampToValueAtTime(0.001,t+0.50);
    osc.start(t); osc.stop(t+0.50);
  }catch(e){}
}

// MiniBoss death: scaled-down three-layer explosion (less impressive than apex)
function miniBossDeathSound(){
  if(!audioCtx) return;
  try{
    const t=audioCtx.currentTime;
    // layer 1 — reduced boom: 80→20 Hz over extended 1.5s (vs apex 2s)
    const boom=audioCtx.createOscillator();
    const boomGain=audioCtx.createGain();
    boom.connect(boomGain); boomGain.connect(audioCtx.destination);
    boom.type='sine';
    boom.frequency.setValueAtTime(80,t);
    boom.frequency.exponentialRampToValueAtTime(20,t+0.35);
    boomGain.gain.setValueAtTime(0.45,t);
    boomGain.gain.setValueAtTime(0.45,t+0.04);
    boomGain.gain.exponentialRampToValueAtTime(0.001,t+1.5);
    boom.start(t); boom.stop(t+1.5);
    // layer 2 — mid rumble noise, extended duration to 1.5s
    const bufLen2=Math.floor(audioCtx.sampleRate*1.6);
    const buf2=audioCtx.createBuffer(1,bufLen2,audioCtx.sampleRate);
    const d2=buf2.getChannelData(0);
    for(let i=0;i<bufLen2;i++) d2[i]=(Math.random()*2-1);
    const rumbleNoise=audioCtx.createBufferSource();
    rumbleNoise.buffer=buf2;
    const rumbleFilt=audioCtx.createBiquadFilter();
    rumbleFilt.type='lowpass';
    rumbleFilt.frequency.setValueAtTime(600,t);
    rumbleFilt.frequency.exponentialRampToValueAtTime(60,t+1.4);
    const rumbleGain=audioCtx.createGain();
    rumbleNoise.connect(rumbleFilt); rumbleFilt.connect(rumbleGain);
    rumbleGain.connect(audioCtx.destination);
    rumbleGain.gain.setValueAtTime(0.35,t);
    rumbleGain.gain.setValueAtTime(0.35,t+0.08);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001,t+1.4);
    rumbleNoise.start(t); rumbleNoise.stop(t+1.6);
    // layer 3 — crackle, extended to ~1s
    const bufLen3=Math.floor(audioCtx.sampleRate*1.1);
    const buf3=audioCtx.createBuffer(1,bufLen3,audioCtx.sampleRate);
    const d3=buf3.getChannelData(0);
    for(let i=0;i<bufLen3;i++) d3[i]=(Math.random()*2-1);
    const crackle=audioCtx.createBufferSource();
    crackle.buffer=buf3;
    const crackleFilt=audioCtx.createBiquadFilter();
    crackleFilt.type='bandpass'; crackleFilt.frequency.value=2400; crackleFilt.Q.value=0.6;
    const crackleGain=audioCtx.createGain();
    crackle.connect(crackleFilt); crackleFilt.connect(crackleGain);
    crackleGain.connect(audioCtx.destination);
    crackleGain.gain.setValueAtTime(0.16,t);
    crackleGain.gain.exponentialRampToValueAtTime(0.001,t+1.0);
    crackle.start(t); crackle.stop(t+1.1);
  }catch(e){}
}

// ===== POWERUP SOUNDS (unique for each type) =====
// Fire Rate powerup: quick bright ascending
function powerupWRSound(){
  if(!audioCtx) return;
  try{
    const t=audioCtx.currentTime;
    const osc=audioCtx.createOscillator();
    const gain=audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type='sine';
    osc.frequency.setValueAtTime(1200,t);
    osc.frequency.exponentialRampToValueAtTime(2400,t+0.12);
    gain.gain.setValueAtTime(0.3,t);
    gain.gain.exponentialRampToValueAtTime(0.001,t+0.35);
    osc.start(t); osc.stop(t+0.35);
  }catch(e){}
}

// Spread powerup: expanding multi-tone
function powerupWSSound(){
  if(!audioCtx) return;
  try{
    const t=audioCtx.currentTime;
    for(let i=0;i<3;i++){
      const osc=audioCtx.createOscillator();
      const gain=audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.type='sine';
      const baseFreq=1600+(i*200);
      osc.frequency.setValueAtTime(baseFreq,t);
      osc.frequency.exponentialRampToValueAtTime(baseFreq*1.4,t+0.15);
      gain.gain.setValueAtTime(0.15,t);
      gain.gain.exponentialRampToValueAtTime(0.001,t+0.38);
      osc.start(t); osc.stop(t+0.38);
    }
  }catch(e){}
}

// Health powerup: warm recovery tone
function powerupHPSound(){
  if(!audioCtx) return;
  try{
    const t=audioCtx.currentTime;
    const osc=audioCtx.createOscillator();
    const gain=audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type='sine';
    osc.frequency.setValueAtTime(800,t);
    osc.frequency.exponentialRampToValueAtTime(1400,t+0.1);
    osc.frequency.exponentialRampToValueAtTime(900,t+0.3);
    gain.gain.setValueAtTime(0.25,t);
    gain.gain.exponentialRampToValueAtTime(0.001,t+0.40);
    osc.start(t); osc.stop(t+0.40);
  }catch(e){}
}

// Speed powerup: rushing acceleration tone
function powerupSPSound(){
  if(!audioCtx) return;
  try{
    const t=audioCtx.currentTime;
    const osc=audioCtx.createOscillator();
    const gain=audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type='square';
    osc.frequency.setValueAtTime(500,t);
    osc.frequency.linearRampToValueAtTime(1800,t+0.25);
    gain.gain.setValueAtTime(0.22,t);
    gain.gain.exponentialRampToValueAtTime(0.001,t+0.35);
    osc.start(t); osc.stop(t+0.35);
  }catch(e){}
}

// Medkit powerup: gentle healing chime
function powerupMEDSound(){
  if(!audioCtx) return;
  try{
    const t=audioCtx.currentTime;
    const osc=audioCtx.createOscillator();
    const gain=audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type='sine';
    osc.frequency.setValueAtTime(1000,t);
    osc.frequency.exponentialRampToValueAtTime(600,t+0.25);
    gain.gain.setValueAtTime(0.2,t);
    gain.gain.exponentialRampToValueAtTime(0.001,t+0.45);
    osc.start(t); osc.stop(t+0.45);
  }catch(e){}
}

// Shield powerup: epic shimmering protection sound
function powerupShieldSound(){
  if(!audioCtx) return;
  try{
    const t=audioCtx.currentTime;
    // primary rising tone
    const osc1=audioCtx.createOscillator();
    const gain1=audioCtx.createGain();
    osc1.connect(gain1); gain1.connect(audioCtx.destination);
    osc1.type='sine';
    osc1.frequency.setValueAtTime(1500,t);
    osc1.frequency.exponentialRampToValueAtTime(3000,t+0.15);
    gain1.gain.setValueAtTime(0.3,t);
    gain1.gain.exponentialRampToValueAtTime(0.001,t+0.50);
    osc1.start(t); osc1.stop(t+0.50);
    // secondary harmonic shimmer
    const osc2=audioCtx.createOscillator();
    const gain2=audioCtx.createGain();
    osc2.connect(gain2); gain2.connect(audioCtx.destination);
    osc2.type='sine';
    osc2.frequency.setValueAtTime(2400,t);
    osc2.frequency.exponentialRampToValueAtTime(4800,t+0.15);
    gain2.gain.setValueAtTime(0.25,t);
    gain2.gain.exponentialRampToValueAtTime(0.001,t+0.48);
    osc2.start(t); osc2.stop(t+0.48);
  }catch(e){}
}

// ===== ENEMY DEATH SOUNDS =====
// Small enemy death: quick pop with decay
function enemyDeathSound(){
  if(!audioCtx) return;
  try{
    const t=audioCtx.currentTime;
    // pitched pop: sawtooth 280→80 Hz
    const osc=audioCtx.createOscillator();
    const oscGain=audioCtx.createGain();
    osc.connect(oscGain); oscGain.connect(audioCtx.destination);
    osc.type='sawtooth';
    osc.frequency.setValueAtTime(280,t);
    osc.frequency.exponentialRampToValueAtTime(80,t+0.1);
    oscGain.gain.setValueAtTime(0.25,t);
    oscGain.gain.exponentialRampToValueAtTime(0.001,t+0.75);
    osc.start(t); osc.stop(t+0.75);
    // noise crackle layer
    const bufLen=Math.floor(audioCtx.sampleRate*0.5);
    const buf=audioCtx.createBuffer(1,bufLen,audioCtx.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<bufLen;i++) d[i]=(Math.random()*2-1);
    const noise=audioCtx.createBufferSource();
    noise.buffer=buf;
    const filter=audioCtx.createBiquadFilter();
    filter.type='highpass'; filter.frequency.value=1500;
    const ng=audioCtx.createGain();
    noise.connect(filter); filter.connect(ng); ng.connect(audioCtx.destination);
    ng.gain.setValueAtTime(0.15,t);
    ng.gain.exponentialRampToValueAtTime(0.001,t+0.5);
    noise.start(t); noise.stop(t+0.5);
  }catch(e){}
}

// Gamepad haptic rumble
function rumble(duration,weak,strong){
  duration=duration||200; weak=weak||0.4; strong=strong||0.7;
  if(padIndex===null||!navigator.getGamepads) return;
  try{
    const gp=navigator.getGamepads()[padIndex];
    if(gp&&gp.vibrationActuator){
      gp.vibrationActuator.playEffect('dual-rumble',{
        startDelay:0, duration:duration,
        weakMagnitude:weak, strongMagnitude:strong
      });
    }
  }catch(e){}
}

// Rock bullet impact: metallic tink — high pitched square wave with sharp attack
function rockTinkSound(){
  if(!audioCtx) return;
  try{
    const t=audioCtx.currentTime;
    // metallic tink: square wave 1200→800 Hz, very fast envelope (tight percussive hit)
    const osc=audioCtx.createOscillator();
    const gain=audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type='square';
    osc.frequency.setValueAtTime(1200,t);
    osc.frequency.exponentialRampToValueAtTime(800,t+0.06);
    gain.gain.setValueAtTime(0.32,t);
    gain.gain.exponentialRampToValueAtTime(0.001,t+0.15); // quick decay
    osc.start(t); osc.stop(t+0.15);
  }catch(e){}
}

// Rock destruction: series of tinks with descending pitch (like shattering)
function rockDestroyedSound(){
  if(!audioCtx) return;
  try{
    const t=audioCtx.currentTime;
    // three metallic tinks in quick succession, descending pitch
    const frequencies=[1400,1100,850];
    const delays=[0,0.08,0.14];
    
    for(let i=0;i<3;i++){
      const osc=audioCtx.createOscillator();
      const gain=audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.type='square';
      const startTime=t+delays[i];
      osc.frequency.setValueAtTime(frequencies[i],startTime);
      osc.frequency.exponentialRampToValueAtTime(frequencies[i]*0.6,startTime+0.08);
      gain.gain.setValueAtTime(0.35,startTime);
      gain.gain.exponentialRampToValueAtTime(0.001,startTime+0.18);
      osc.start(startTime); osc.stop(startTime+0.18);
    }
  }catch(e){}
}

// Wire ensureAudio to first user gesture so AudioContext can start
document.addEventListener('click', ensureAudio, {once:false});
document.addEventListener('keydown', ensureAudio, {once:false});

// ====================================================================
// INPUT
// ====================================================================
const keys={};
addEventListener('keydown',e=>{
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
  if(state==='entry'){ handleEntryKey(e); return; }
  keys[e.code]=true;
  if(e.code==='KeyP') togglePause();
  if(e.code==='Enter') menuAdvance();
});
addEventListener('keyup',e=>{ keys[e.code]=false; });

// Mouse aim + fire
const mouse={x:VW/2,y:VH/2,down:false};
cv.addEventListener('mousemove',e=>{
  const rect=cv.getBoundingClientRect();
  mouse.x=(e.clientX-rect.left)*(VW/rect.width);
  mouse.y=(e.clientY-rect.top)*(VH/rect.height);
});
cv.addEventListener('mousedown',e=>{ if(e.button===0){ mouse.down=true; ensureAudio(); } });
cv.addEventListener('mouseup',  e=>{ if(e.button===0) mouse.down=false; });
cv.addEventListener('contextmenu',e=>e.preventDefault()); // suppress right-click menu

// ====================================================================
// TOUCH INPUT (dual-stick: left=movement, right=aiming)
// ====================================================================
let touches={moveTouch:null,aimTouch:null};
const TOUCH_DEADZONE=10, TOUCH_MAXDIST=90;

function getTouchStickVector(touch,isAim){
  if(!touch) return {x:0,y:0};
  const rect=cv.getBoundingClientRect();
  const tx=(touch.clientX-rect.left)*(VW/rect.width);
  const ty=(touch.clientY-rect.top)*(VH/rect.height);
  const dx=tx-touch.startX, dy=ty-touch.startY;
  const d=Math.hypot(dx,dy);
  if(d<TOUCH_DEADZONE) return {x:0,y:0};
  const norm=Math.min(1,d/TOUCH_MAXDIST);
  return {x:(dx/d)*norm, y:(dy/d)*norm};
}

cv.addEventListener('touchstart',e=>{
  e.preventDefault();
  const rect=cv.getBoundingClientRect();
  for(let i=0;i<e.touches.length;i++){
    const t=e.touches[i];
    const tx=(t.clientX-rect.left)*(VW/rect.width);
    if(tx<VW/2 && !touches.moveTouch){
      touches.moveTouch={clientX:t.clientX,clientY:t.clientY,startX:tx,startY:(t.clientY-rect.top)*(VH/rect.height),id:t.identifier};
    } else if(tx>=VW/2 && !touches.aimTouch){
      touches.aimTouch={clientX:t.clientX,clientY:t.clientY,startX:tx,startY:(t.clientY-rect.top)*(VH/rect.height),id:t.identifier};
    }
  }
  ensureAudio();
},false);

cv.addEventListener('touchmove',e=>{
  e.preventDefault();
  for(let i=0;i<e.touches.length;i++){
    const t=e.touches[i];
    if(touches.moveTouch&&touches.moveTouch.id===t.identifier){
      touches.moveTouch.clientX=t.clientX; touches.moveTouch.clientY=t.clientY;
    }
    if(touches.aimTouch&&touches.aimTouch.id===t.identifier){
      touches.aimTouch.clientX=t.clientX; touches.aimTouch.clientY=t.clientY;
    }
  }
},false);

cv.addEventListener('touchend',e=>{
  e.preventDefault();
  for(let i=0;i<e.changedTouches.length;i++){
    const t=e.changedTouches[i];
    if(touches.moveTouch&&touches.moveTouch.id===t.identifier) touches.moveTouch=null;
    if(touches.aimTouch&&touches.aimTouch.id===t.identifier) touches.aimTouch=null;
  }
},false);

cv.addEventListener('touchcancel',e=>{
  touches.moveTouch=null; touches.aimTouch=null;
},false);

// ====================================================================
// GAMEPAD -- prefers RundotGameAPI.gamepad (normalized model that works
// identically across desktop web, Steam Deck, and mobile hardware
// controllers like Backbone -- some of those surfaces can't reliably use
// the raw browser Gamepad API at all, which is the whole reason this
// layer exists). Falls back to the original raw navigator.getGamepads()
// path when the SDK layer isn't supported/available (e.g. an older host
// build, or a plain-browser local-dev mock that doesn't implement it),
// so behavior on a desktop browser is unchanged either way.
// See: api/GAMEPAD.md
// ====================================================================
let gamepadMode='none'; // 'sdk' | 'legacy' | 'none', decided once at boot
let padIndex=null;      // legacy mode: raw navigator gamepad index.
                         // sdk mode: opportunistically mirrored from the
                         // active snapshot's index so rumble() (which has
                         // no SDK equivalent yet) still works when the
                         // underlying source is a real web gamepad.
let sdkPadIndex=null;    // sdk mode: which snapshot .index we track as P1
let prevStart=false,prevX=false,padBlocked=false;
let prevUp=false,prevDown=false,prevLeft=false,prevRight=false;

function emptyPadOut(){
  return {mx:0,my:0,ax:0,ay:0,fire:false,start:false,xStart:false,
          up:false,down:false,left:false,right:false};
}

function setPadStatusText(text,color){
  const ps=document.getElementById('padStatus');
  if(ps){ ps.textContent=text; if(color) ps.style.color=color; }
}

function initLegacyGamepadEvents(){
  addEventListener('gamepadconnected',e=>{
    padIndex=e.gamepad.index;
    setPadStatusText('controller: '+e.gamepad.id.slice(0,28),'var(--neon)');
    const hint=document.getElementById('padHint'); if(hint) hint.style.display='block';
  });
  addEventListener('gamepaddisconnected',()=>{
    padIndex=null;
    setPadStatusText('controller: not detected');
  });
}

function initGamepadSystem(){
  try{
    if(RundotGameAPI.gamepad && RundotGameAPI.gamepad.isSupported()){
      gamepadMode='sdk';
      RundotGameAPI.gamepad.onConnected(ev=>{
        if(sdkPadIndex===null) sdkPadIndex=ev.index;
        setPadStatusText('controller: '+(ev.id||'connected').slice(0,28),'var(--neon)');
        const hint=document.getElementById('padHint'); if(hint) hint.style.display='block';
      });
      RundotGameAPI.gamepad.onDisconnected(ev=>{
        if(sdkPadIndex===ev.index){
          sdkPadIndex=null; padIndex=null;
          try{
            const remaining=RundotGameAPI.gamepad.getGamepads();
            if(remaining.length) sdkPadIndex=remaining[0].index;
          }catch(e){}
        }
        if(sdkPadIndex===null) setPadStatusText('controller: not detected');
      });
      return;
    }
  }catch(e){ /* SDK gamepad layer unavailable -- fall through to legacy */ }
  gamepadMode='legacy';
  initLegacyGamepadEvents();
}
initGamepadSystem();

function readPadSDK(){
  const out=emptyPadOut();
  let pads; try{ pads=RundotGameAPI.gamepad.getGamepads(); }catch(e){ return out; }
  if(!pads||!pads.length) return out;
  let gp=(sdkPadIndex!==null)?pads.find(p=>p.index===sdkPadIndex):null;
  if(!gp) gp=pads[0];
  if(!gp) return out;
  padIndex=gp.index; // best-effort: lets rumble() work when source is a real web gamepad
  const dz=0.22;
  const lx=gp.axes.leftX||0, ly=gp.axes.leftY||0, rx=gp.axes.rightX||0, ry=gp.axes.rightY||0;
  if(Math.hypot(lx,ly)>dz){ out.mx=lx; out.my=ly; }
  if(Math.hypot(rx,ry)>dz){ out.ax=rx; out.ay=ry; out.fire=true; }
  // dpad as movement fallback
  if(gp.buttons.dpadLeft&&gp.buttons.dpadLeft.pressed) out.mx=-1;
  if(gp.buttons.dpadRight&&gp.buttons.dpadRight.pressed) out.mx=1;
  if(gp.buttons.dpadUp&&gp.buttons.dpadUp.pressed) out.my=-1;
  if(gp.buttons.dpadDown&&gp.buttons.dpadDown.pressed) out.my=1;
  // right trigger also fires (aim by right stick or last move dir)
  if(gp.buttons.rightTrigger&&gp.buttons.rightTrigger.value>0.3) out.fire=true;
  // menu edges
  const dU=(gp.buttons.dpadUp&&gp.buttons.dpadUp.pressed)||ly<-0.5;
  const dD=(gp.buttons.dpadDown&&gp.buttons.dpadDown.pressed)||ly>0.5;
  const dL=(gp.buttons.dpadLeft&&gp.buttons.dpadLeft.pressed)||lx<-0.5;
  const dR=(gp.buttons.dpadRight&&gp.buttons.dpadRight.pressed)||lx>0.5;
  out.up=dU&&!prevUp; out.down=dD&&!prevDown; out.left=dL&&!prevLeft; out.right=dR&&!prevRight;
  prevUp=dU;prevDown=dD;prevLeft=dL;prevRight=dR;
  const sN=gp.buttons.start&&gp.buttons.start.pressed; if(sN&&!prevStart) out.start=true; prevStart=sN;
  const xN=gp.buttons.x&&gp.buttons.x.pressed; if(xN&&!prevX) out.xStart=true; prevX=xN;
  return out;
}

function readPadLegacy(){
  const out=emptyPadOut();
  if(padIndex===null||padBlocked||!navigator.getGamepads) return out;
  let pads; try{pads=navigator.getGamepads();}
  catch(err){padBlocked=true;
    setPadStatusText('controller: blocked by preview — open file directly','var(--amber)');
    return out;}
  const gp=pads[padIndex]; if(!gp) return out;
  const dz=0.22;
  let lx=gp.axes[0]||0, ly=gp.axes[1]||0, rx=gp.axes[2]||0, ry=gp.axes[3]||0;
  if(Math.hypot(lx,ly)>dz){ out.mx=lx; out.my=ly; }
  if(Math.hypot(rx,ry)>dz){ out.ax=rx; out.ay=ry; out.fire=true; }
  // dpad as movement fallback
  if(gp.buttons[14]&&gp.buttons[14].pressed) out.mx=-1;
  if(gp.buttons[15]&&gp.buttons[15].pressed) out.mx=1;
  if(gp.buttons[12]&&gp.buttons[12].pressed) out.my=-1;
  if(gp.buttons[13]&&gp.buttons[13].pressed) out.my=1;
  // RT also fires (aim by right stick or last move dir)
  if(gp.buttons[7]&&gp.buttons[7].value>0.3) out.fire=true;
  // menu edges
  const dU=(gp.buttons[12]&&gp.buttons[12].pressed)||ly<-0.5;
  const dD=(gp.buttons[13]&&gp.buttons[13].pressed)||ly>0.5;
  const dL=(gp.buttons[14]&&gp.buttons[14].pressed)||lx<-0.5;
  const dR=(gp.buttons[15]&&gp.buttons[15].pressed)||lx>0.5;
  out.up=dU&&!prevUp; out.down=dD&&!prevDown; out.left=dL&&!prevLeft; out.right=dR&&!prevRight;
  prevUp=dU;prevDown=dD;prevLeft=dL;prevRight=dR;
  const sN=gp.buttons[9]&&gp.buttons[9].pressed; if(sN&&!prevStart) out.start=true; prevStart=sN;
  const xN=gp.buttons[2]&&gp.buttons[2].pressed; if(xN&&!prevX) out.xStart=true; prevX=xN;
  return out;
}

function readPad(){
  if(gamepadMode==='sdk') return readPadSDK();
  if(gamepadMode==='legacy') return readPadLegacy();
  return emptyPadOut();
}

// ====================================================================
// GAME STATE
// ====================================================================
// Current screen: 'title', 'play', 'dying', 'over', 'win', 'entry', 'paused'
let state='title';

// All game objects (declared here, initialized in reset())
let player,bullets,enemies,eBullets,particles,rocks,solidObstacles,gems,powerups,miniBosses,apexBoss,bgDots,patches,craters;

// Game variables
let score,frame,screenShake,cam,deathTimer,banner;
let lastAim;
let finalWaveTriggered;
let gemsCollected,totalGems,startTime,rayBeams;
let funnelFirstKillFired,funnelFirstNodeFired; // core_loop analytics funnel, reset per run in reset()
let continueUsedThisRun,handlingDefeat; // rewarded-ad "continue", reset per run in reset() -- see REVIVE section

// Helper: generate a random position in the world with margin from edges
function rngWorldPos(margin){
  return {
    x:margin+Math.random()*(WORLD-2*margin), 
    y:margin+Math.random()*(WORLD-2*margin)
  };
}

// Initialize/reset the game to starting state
function reset(){
  // Player object: position, speed, health, weapons
  player={
    x:WORLD/2,y:WORLD/2,              // Start at world center
    r:14,                              // Collision radius
    speed:3.4,baseSpeed:3.4,           // Current and base movement speed (baseSpeed is permanent upgrade level)
    hp:5,maxhp:5,                      // Health: current/maximum
    inv:0,                             // Invincibility frames (counts down each frame)
    alive:true,
    fireRate:9,                        // Frames between shots (lower = faster)
    dmg:1,                             // Bullet damage
    spread:1,                          // Number of bullets fired per shot (1, 2, or 3)
    walkPhase:0,                       // Animation: leg position in walk cycle
    moving:false,
    facing:1,
    shieldTime:0,                      // Shield countdown (0 = no shield)
    shieldMax:300                      // Shield max duration in frames
  };
  
  // Clear all game object arrays
  bullets=[];enemies=[];eBullets=[];particles=[];rocks=[];solidObstacles=[];gems=[];powerups=[];
  miniBosses=[];apexBoss=null;
  finalWaveTriggered=false;
  
  // Reset game variables
  score=0;frame=0;screenShake=0;deathTimer=0;gemsCollected=0;
  startTime=Date.now();
  rayBeams=[];
  // core_loop funnel progress, tracked per run (see analytics section above)
  funnelFirstKillFired=false;
  funnelFirstNodeFired=false;
  // rewarded-ad "continue" -- one offer per run, see REVIVE section below
  continueUsedThisRun=false;
  handlingDefeat=false;
  cam={x:player.x-VW/2,y:player.y-VH/2};
  lastAim={x:0,y:-1};
  banner={text:'SECTOR XR-7',t:120};
  shotCooldown=0;

  // ===== planet terrain =====
  patches=[];
  const patchCols=['rgba(70,45,25,0.5)','rgba(45,55,30,0.45)','rgba(80,35,40,0.4)','rgba(35,50,55,0.4)'];
  for(let i=0;i<46;i++) patches.push({x:Math.random()*WORLD,y:Math.random()*WORLD,
    r:120+Math.random()*240,c:patchCols[(Math.random()*patchCols.length)|0]});
  craters=[];
  for(let i=0;i<28;i++) craters.push({x:Math.random()*WORLD,y:Math.random()*WORLD,r:30+Math.random()*70});
  bgDots=[];
  for(let i=0;i<900;i++){
    const r=Math.random();
    if(r<0.12) bgDots.push({t:'flora',x:Math.random()*WORLD,y:Math.random()*WORLD,s:2+Math.random()*2});
    else if(r<0.30){const a=Math.random()*6.28,len=8+Math.random()*22;
      bgDots.push({t:'crack',x:Math.random()*WORLD,y:Math.random()*WORLD,
        dx:Math.cos(a)*len,dy:Math.sin(a)*len,c:'rgba(15,10,7,0.6)'});}
    else bgDots.push({t:'dust',x:Math.random()*WORLD,y:Math.random()*WORLD,
      s:Math.random()*2.4+0.8,c:Math.random()<0.5?'rgba(130,90,55,0.55)':'rgba(90,70,45,0.5)'});
  }

  // ===== SOLID (indestructible) alien formations =====
  // Mix of large spire clusters and smaller pillars
  const SPAWN_CLEAR=320; // no solid obstacles near spawn
  for(let i=0;i<42;i++){
    const p=rngWorldPos(150);
    if(Math.hypot(p.x-player.x,p.y-player.y)<SPAWN_CLEAR){i--;continue;}
    const big=Math.random()<0.35;
    const w=big ? 60+Math.random()*80 : 28+Math.random()*36;
    const kind=Math.random()<0.5?'spire':'crystal'; // two visual styles
    solidObstacles.push({x:p.x,y:p.y,w:w,h:w*(0.8+Math.random()*0.6),
      kind,rot:Math.random()*6.28,
      // crystal clusters have a secondary smaller shard
      shards: kind==='crystal' ? Math.floor(2+Math.random()*3) : 0});
  }

  // ===== DESTRUCTIBLE rocks (fewer, lower powerup rate) =====
  for(let i=0;i<55;i++){
    const p=rngWorldPos(120);
    if(Math.hypot(p.x-player.x,p.y-player.y)<200){i--;continue;}
    const w=34+Math.random()*46;
    rocks.push({x:p.x,y:p.y,w:w,h:w*(0.7+Math.random()*0.5),hp:4,
      hides:Math.random()<0.50?randPow():null,rot:Math.random()*6.28}); // 50% chance (doubled)
  }

  // ===== ALIEN GEMS — 18 spread evenly via 3x3 zone grid, 2 per zone =====
  totalGems=18;
  const GZ=3, gzw=WORLD/GZ, gzh=WORLD/GZ;
  const gemCols=['#28e0ff','#b06bff','#ffb000','#9dff3c','#ff2d6f'];
  for(let gx=0;gx<GZ;gx++){
    for(let gy=0;gy<GZ;gy++){
      for(let k=0;k<2;k++){
        let attempts=0;
        while(attempts++<30){
          const gex=gx*gzw+120+Math.random()*(gzw-240);
          const gey=gy*gzh+120+Math.random()*(gzh-240);
          if(Math.hypot(gex-player.x,gey-player.y)<350) continue;
          gems.push({x:gex,y:gey,r:10,spin:Math.random()*6.28,spinRate:0.04+Math.random()*0.03,
            col:gemCols[(Math.random()*gemCols.length)|0], pulse:Math.random()*6.28});
          break;
        }
      }
    }
  }

  // ===== nudge gems out of solid obstacles =====
  // Run several passes so gems pushed into another obstacle get another chance
  for(let pass=0;pass<4;pass++){
    gems.forEach(g=>{
      solidObstacles.forEach(o=>{
        // check if gem center is inside obstacle AABB (expanded by gem radius)
        const ox1=o.x-o.w/2-g.r, ox2=o.x+o.w/2+g.r;
        const oy1=o.y-o.h/2-g.r, oy2=o.y+o.h/2+g.r;
        if(g.x>ox1&&g.x<ox2&&g.y>oy1&&g.y<oy2){
          // push toward nearest edge
          const dl=g.x-ox1, dr=ox2-g.x, du=g.y-oy1, dd=oy2-g.y;
          const minD=Math.min(dl,dr,du,dd);
          if(minD===dl) g.x=ox1-1;
          else if(minD===dr) g.x=ox2+1;
          else if(minD===du) g.y=oy1-1;
          else g.y=oy2+1;
        }
      });
    });
  }

  // ===== 80 enemies in 4x4 zone grid, all dormant, buffed stats =====
  for(let zx=0;zx<4;zx++){
    for(let zy=0;zy<4;zy++){
      const zw=WORLD/4,zh=WORLD/4,zx0=zx*zw,zy0=zy*zh;
      const count=4+Math.floor(Math.random()*3);
      for(let k=0;k<count;k++){
        const ex=zx0+100+Math.random()*(zw-200);
        const ey=zy0+100+Math.random()*(zh-200);
        if(Math.hypot(ex-player.x,ey-player.y)<280) continue;
        enemies.push(makeAlien(ex,ey));
      }
    }
  }

  // ===== 4 MINI-BOSSES, corners, buffed HP =====
  const quadrantCenters=[
    {x:WORLD*0.18,y:WORLD*0.18},{x:WORLD*0.82,y:WORLD*0.18},
    {x:WORLD*0.18,y:WORLD*0.82},{x:WORLD*0.82,y:WORLD*0.82}
  ];
  quadrantCenters.forEach((qc,idx)=>{
    miniBosses.push({x:qc.x,y:qc.y,r:46,hp:160,maxhp:160,
      fireT:90+idx*20,phase:0,alive:true,wob:0,discovered:false,id:idx});
  });
}
function randPow(){ const r=Math.random();
  // WR=fire rate, WS=weapon spread, HP=max hp+heal, SP=suit speed, MED=pure heal, SHIELD=invincible+fast
  return r<0.28?(Math.random()<0.5?'WR':'WS') : r<0.56?(Math.random()<0.5?'HP':'SP') : r<0.84?'MED' : 'SHIELD';
}

function makeAlien(x,y,awake){
  const t=Math.random();
  const aw=awake||false;
  if(t<0.5) return {type:'crawler',x,y,r:13,hp:4,maxhp:4,spd:1.4,fireT:0,score:50,awake:aw};
  if(t<0.8) return {type:'spitter',x,y,r:15,hp:6+Math.floor(Math.random()*4),maxhp:6+Math.floor(Math.random()*4),spd:0.85,fireT:45+Math.random()*40,score:90,awake:aw};
  return {type:'swarm',x,y,r:10,hp:1,maxhp:1,spd:2.4,fireT:0,score:40,awake:aw};
}

// ====================================================================
// PARTICLES
// ====================================================================
function burst(x,y,color,n,spd){
  for(let i=0;i<n;i++){const a=Math.random()*6.283,s=Math.random()*spd+0.5;
    particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:20+Math.random()*16,col:color});}
}
function bigBoom(x,y){ burst(x,y,'#ffb000',36,6);burst(x,y,'#ff2d6f',32,4.5);
  burst(x,y,'#9dff3c',22,3);burst(x,y,'#fff',14,7); }

function grabPow(kind,x,y){
  if(kind==='WR'){ player.fireRate=Math.max(4,player.fireRate-1); banner={text:'FIRE RATE UP',t:70}; powerupWRSound(); }
  else if(kind==='WS'){ player.spread=Math.min(3,player.spread+1); banner={text:'SPREAD UP',t:70}; powerupWSSound(); }
  else if(kind==='HP'){ player.maxhp=Math.min(9,player.maxhp+1); player.hp=Math.min(player.maxhp,player.hp+1); banner={text:'SUIT INTEGRITY UP',t:70}; powerupHPSound(); }
  else if(kind==='MED'){ player.hp=Math.min(player.maxhp,player.hp+2); banner={text:'MEDKIT +2 HP',t:70}; powerupMEDSound(); }
  else if(kind==='SP'){ player.speed=player.baseSpeed=Math.min(5.5,player.baseSpeed+0.4); banner={text:'THRUSTERS UP',t:70}; powerupSPSound(); }
  else if(kind==='SHIELD'){ player.shieldTime=300; player.shieldMax=300; banner={text:'SHIELD ACTIVATED',t:70}; powerupShieldSound(); score+=200; }
  burst(x,y,'#fff',12,3); score+=50;
}

// ====================================================================
// UPDATE - Main game logic (runs every frame)
// ====================================================================
// This function:
// 1. Reads player input and updates position/aim
// 2. Updates all enemies, bosses, bullets, particles
// 3. Checks all collisions (bullets vs enemies, player vs hazards, etc.)
// 4. Manages game state (scores, deaths, powerups)
// Called once per frame with deltaTime parameter (for frame-rate independence)

let shotCooldown=0;
function update(dt){
  // Convert real time (seconds) to "frame equivalents" at 60fps baseline
  // So all the 60fps-calibrated game logic doesn't need to change
  const frameTime=dt*60;
  frame++;
  const pad=readPad();

  // ---- movement ----
  let mx=0,my=0;
  if(keys['KeyA']) mx-=1; if(keys['KeyD']) mx+=1;
  if(keys['KeyW']) my-=1; if(keys['KeyS']) my+=1;
  mx+=pad.mx; my+=pad.my;
  // touch movement (left side)
  const moveStick=getTouchStickVector(touches.moveTouch,false);
  mx+=moveStick.x; my+=moveStick.y;
  const mm=Math.hypot(mx,my); if(mm>1){mx/=mm;my/=mm;}
  player.x+=mx*player.speed*frameTime; player.y+=my*player.speed*frameTime;
  // walk-cycle animation
  player.moving = mm>0.05;
  if(player.moving){ player.walkPhase += 0.25*Math.min(1,mm)*frameTime; }
  else { player.walkPhase += (0 - (player.walkPhase%6.283))*0.2*frameTime; } // ease legs to rest

  // ---- aim ----
  let ax=0,ay=0;
  if(keys['ArrowLeft']) ax-=1; if(keys['ArrowRight']) ax+=1;
  if(keys['ArrowUp']) ay-=1; if(keys['ArrowDown']) ay+=1;
  let aiming = !!(ax||ay);
  if(pad.ax||pad.ay){ ax=pad.ax; ay=pad.ay; aiming=true; }
  // touch aiming (right side)
  const aimStick=getTouchStickVector(touches.aimTouch,true);
  if(aimStick.x||aimStick.y){ ax=aimStick.x; ay=aimStick.y; aiming=true; }
  // mouse aim: direction from player screen-position to cursor
  if(mouse.down || aiming===false){
    const psx=player.x-cam.x, psy=player.y-cam.y;
    const mdx=mouse.x-psx, mdy=mouse.y-psy;
    const md=Math.hypot(mdx,mdy);
    if(md>4){ // ignore if cursor is sitting right on the player
      // mouse overrides arrow keys only when mouse button held or no key aim
      if(mouse.down || !aiming){ ax=mdx/md; ay=mdy/md; aiming=!!mouse.down; }
    }
  }
  if(aiming){ const am=Math.hypot(ax,ay)||1; lastAim={x:ax/am,y:ay/am}; }
  const firing = aiming || pad.fire;

  // ---- rock collision (solid) ----
  rocks.forEach(o=>{
    const nx=Math.max(o.x-o.w/2,Math.min(player.x,o.x+o.w/2));
    const ny=Math.max(o.y-o.h/2,Math.min(player.y,o.y+o.h/2));
    const dx=player.x-nx, dy=player.y-ny, d=Math.hypot(dx,dy);
    if(d<player.r && d>0){ const push=(player.r-d)/d; player.x+=dx*push; player.y+=dy*push; }
  });
  // ---- solid obstacle collision (indestructible formations) ----
  // crystals also damage the player on contact; spires just push
  let crystalHit=false;
  solidObstacles.forEach(o=>{
    const nx=Math.max(o.x-o.w/2,Math.min(player.x,o.x+o.w/2));
    const ny=Math.max(o.y-o.h/2,Math.min(player.y,o.y+o.h/2));
    const dx=player.x-nx, dy=player.y-ny, d=Math.hypot(dx,dy);
    if(d<player.r && d>0){
      const push=(player.r-d)/d; player.x+=dx*push; player.y+=dy*push;
      if(o.kind==='crystal') crystalHit=true;
    }
  });
  player.x=Math.max(player.r,Math.min(WORLD-player.r,player.x));
  player.y=Math.max(player.r,Math.min(WORLD-player.r,player.y));
  if(player.inv>0) player.inv-=frameTime;
  
  // ---- shield handling ----
  if(player.shieldTime>0){
    player.shieldTime-=frameTime;
    player.speed=player.baseSpeed*2; // 2x speed while shielded
    player.inv=Math.max(player.inv,frameTime); // always invincible during shield
  } else {
    player.speed=player.baseSpeed; // normal speed when not shielded
  }

  // ---- camera follow ----
  cam.x += ((player.x-VW/2)-cam.x)*0.12*frameTime;
  cam.y += ((player.y-VH/2)-cam.y)*0.12*frameTime;
  cam.x=Math.max(0,Math.min(WORLD-VW,cam.x));
  cam.y=Math.max(0,Math.min(WORLD-VH,cam.y));

  // ---- firing ----
  if(shotCooldown>0) shotCooldown-=frameTime;
  if(firing && shotCooldown<=0){
    const baseAng=Math.atan2(lastAim.y,lastAim.x);
    const n=player.spread, sp=10;
    for(let i=0;i<n;i++){
      const off=(i-(n-1)/2)*0.16;
      const a=baseAng+off;
      bullets.push({x:player.x,y:player.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,dmg:player.dmg});
    }
    pewSound(); // one pew per volley regardless of spread count
    shotCooldown=player.fireRate;
  }
  bullets.forEach(b=>{b.x+=b.vx*frameTime;b.y+=b.vy*frameTime;});
  bullets=bullets.filter(b=>b.x>cam.x-40&&b.x<cam.x+VW+40&&b.y>cam.y-40&&b.y<cam.y+VH+40
    && b.x>0&&b.x<WORLD&&b.y>0&&b.y<WORLD);

  // ---- enemies: wake check then AI ----
  const VIEW_WAKE = 360; // px beyond viewport edge that wakes enemies
  const CONTAGION  = 140; // awake enemy wakes sleeping neighbors within this range
  enemies.forEach(e=>{
    // sight-line wake: in or near player viewport
    if(!e.awake){
      const inView = e.x>cam.x-VIEW_WAKE && e.x<cam.x+VW+VIEW_WAKE &&
                     e.y>cam.y-VIEW_WAKE && e.y<cam.y+VH+VIEW_WAKE;
      if(inView) e.awake=true;
    }
    if(!e.awake) return; // dormant: skip all AI

    const dx=player.x-e.x, dy=player.y-e.y, d=Math.hypot(dx,dy)||1;
    if(e.type==='spitter'){
      if(d>240){e.x+=dx/d*e.spd*frameTime;e.y+=dy/d*e.spd*frameTime;}
      e.fireT-=frameTime;
      if(e.fireT<=0&&d<560){e.fireT=70;
        const a=Math.atan2(dy,dx),sp=3.4;
        eBullets.push({x:e.x,y:e.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp});}
    } else {e.x+=dx/d*e.spd*frameTime;e.y+=dy/d*e.spd*frameTime;}
  });

  // contagion: awake enemies wake nearby sleepers
  if(frame%8===0){ // only check every 8 frames for perf
    enemies.forEach(e=>{
      if(!e.awake) return;
      enemies.forEach(n=>{
        if(!n.awake && Math.hypot(n.x-e.x,n.y-e.y)<CONTAGION) n.awake=true;
      });
    });
  }

  // ---- mini-bosses ----
  miniBosses.forEach(mb=>{
    if(!mb.alive) return;
    const dx=player.x-mb.x, dy=player.y-mb.y, d=Math.hypot(dx,dy)||1;
    if(!mb.discovered){
      const inView = mb.x>cam.x-80&&mb.x<cam.x+VW+80&&mb.y>cam.y-80&&mb.y<cam.y+VH+80;
      if(inView||d<500) mb.discovered=true;
    }
    mb.wob+=0.05*frameTime;
    if(d<550){mb.x+=dx/d*0.8*frameTime;mb.y+=dy/d*0.8*frameTime;}
    mb.fireT-=frameTime;
    if(mb.fireT<=0&&d<650){
      mb.phase++;
      if(mb.phase%3===0){
        for(let i=0;i<14;i++){const a=i/14*6.283;
          eBullets.push({x:mb.x,y:mb.y,vx:Math.cos(a)*3.2,vy:Math.sin(a)*3.2,source:'miniboss'});}
        miniBossRingFireSound();
        mb.fireT=90;
      } else {
        const a=Math.atan2(dy,dx),sp=4;
        [-0.25,0,0.25].forEach(o=>eBullets.push({x:mb.x,y:mb.y,
          vx:Math.cos(a+o)*sp,vy:Math.sin(a+o)*sp,source:'miniboss'}));
        miniBoss3ShotFireSound();
        mb.fireT=50;
      }
    }
  });

  // ---- apex boss ----
  if(apexBoss&&apexBoss.alive){
    const dx=player.x-apexBoss.x, dy=player.y-apexBoss.y, d=Math.hypot(dx,dy)||1;
    apexBoss.wob+=0.04*frameTime; apexBoss.spiralAngle=(apexBoss.spiralAngle||0)+0.07*frameTime;
    if(d<700){apexBoss.x+=dx/d*1.1*frameTime;apexBoss.y+=dy/d*1.1*frameTime;}

    // ray state machine: 'normal' | 'charging' | 'firing'
    if(!apexBoss.rayState) apexBoss.rayState='normal';
    apexBoss.fireT-=frameTime;

    if(apexBoss.rayState==='normal'){
      if(apexBoss.fireT<=0){
        apexBoss.phase=(apexBoss.phase||0)+1;
        const p=apexBoss.phase%5;
        if(p===0){ // begin ray sequence: charge up
          apexBoss.rayState='charging';
          apexBoss.rayChargeT=90; // ~1.5s warning
          apexBoss.rayAngle=Math.random()*Math.PI/4; // slight random rotation each time
        } else if(p===1||p===3){
          const a=Math.atan2(dy,dx);
          [-0.4,-0.2,0,0.2,0.4].forEach(o=>eBullets.push({x:apexBoss.x,y:apexBoss.y,
            vx:Math.cos(a+o)*5,vy:Math.sin(a+o)*5}));
          apexBoss.fireT=38;
        } else if(p===2){
          for(let i=0;i<20;i++){const a=apexBoss.spiralAngle+i/20*6.283;
            eBullets.push({x:apexBoss.x,y:apexBoss.y,vx:Math.cos(a)*4,vy:Math.sin(a)*4});}
          apexBoss.fireT=70;
        } else {
          for(let i=0;i<12;i++){const a=i/12*6.283;
            eBullets.push({x:apexBoss.x,y:apexBoss.y,vx:Math.cos(a)*3,vy:Math.sin(a)*3});
            eBullets.push({x:apexBoss.x,y:apexBoss.y,vx:Math.cos(a+0.26)*5,vy:Math.sin(a+0.26)*5});}
          apexBoss.fireT=55;
        }
      }
    } else if(apexBoss.rayState==='charging'){
      apexBoss.rayChargeT-=frameTime;
      if(apexBoss.rayChargeT<=0){
        // fire 4 damaging rays
        apexBoss.rayState='firing';
        apexBoss.rayFireT=60;
        rayBeams=[];
        for(let i=0;i<4;i++){
          const a=apexBoss.rayAngle+i*Math.PI/2;
          rayBeams.push({ox:apexBoss.x,oy:apexBoss.y,ax:Math.cos(a),ay:Math.sin(a),life:60});
        }
        screenShake=18;
      }
    } else if(apexBoss.rayState==='firing'){
      apexBoss.rayFireT-=frameTime;
      // update ray life
      rayBeams.forEach(r=>r.life-=frameTime);
      rayBeams=rayBeams.filter(r=>r.life>0);
      // ray vs player: continuous damage check
      rayBeams.forEach(ray=>{
        // project player onto ray line, check perpendicular distance
        const px=player.x-ray.ox, py=player.y-ray.oy;
        const proj=px*ray.ax+py*ray.ay;
        if(proj>0&&proj<VW*1.5){ // only forward along ray, reasonable length
          const perp=Math.abs(px*ray.ay-py*ray.ax);
          if(perp<22){
            if(player.inv<=0&&player.alive){
              player.hp=Math.max(0,player.hp-3*frameTime);
              if(player.hp<=0){ onPlayerDefeated(); }
              else{ player.inv=60; screenShake=14; burst(player.x,player.y,'#ffb000',22,4);
                    damageSound(); rumble(400, 0.8, 1.0); }
            }
          }
        }
      });
      if(apexBoss.rayFireT<=0){
        apexBoss.rayState='normal';
        rayBeams=[];
        apexBoss.fireT=80; // cooldown before next attack cycle
      }
    }
  }

  // ---- check: all mini-bosses dead → final wave ----
  if(!finalWaveTriggered && miniBosses.length>0 && miniBosses.every(mb=>!mb.alive)){
    finalWaveTriggered=true;
    screenShake=30;
    banner={text:'THE HIVE AWAKENS',t:180};
    // ring of 30 fresh awake enemies around player
    for(let i=0;i<30;i++){
      const a=i/30*6.283;
      const dist=420+Math.random()*120;
      const ex=player.x+Math.cos(a)*dist;
      const ey=player.y+Math.sin(a)*dist;
      enemies.push(makeAlien(
        Math.max(60,Math.min(WORLD-60,ex)),
        Math.max(60,Math.min(WORLD-60,ey)),
        true // born awake
      ));
    }
    // apex boss spawns at world center
    apexBoss={x:WORLD/2,y:WORLD/2,r:90,hp:300,maxhp:300,
      fireT:120,phase:0,alive:true,wob:0,spiralAngle:0};
  }

  eBullets.forEach(b=>{b.x+=b.vx*frameTime;b.y+=b.vy*frameTime;});
  eBullets=eBullets.filter(b=>b.x>cam.x-40&&b.x<cam.x+VW+40&&b.y>cam.y-40&&b.y<cam.y+VH+40);

  powerups.forEach(p=>{p.bob+=0.12*frameTime;});
  gems.forEach(g=>{g.spin+=g.spinRate*frameTime; g.pulse+=0.06*frameTime;});

  // ---- player vs gems — generous pickup radius covers gems inside obstacles ----
  for(let j=gems.length-1;j>=0;j--){
    const g=gems[j];
    if(Math.hypot(g.x-player.x,g.y-player.y)<55){
      gemsCollected++;
      score+=500;
      burst(g.x,g.y,g.col,20,4);
      burst(g.x,g.y,'#fff',8,6);
      gemPickupSound();
      banner={text:'GEM COLLECTED  '+gemsCollected+'/'+totalGems,t:90};
      if(gemsCollected>=totalGems){ banner={text:'ALL GEMS FOUND! +2000',t:160}; score+=2000; }
      gems.splice(j,1);
    }
  }

  // ---- bullets vs rocks ----
  for(let i=rocks.length-1;i>=0;i--){const o=rocks[i];
    for(let j=bullets.length-1;j>=0;j--){const b=bullets[j];
      if(b.x>o.x-o.w/2&&b.x<o.x+o.w/2&&b.y>o.y-o.h/2&&b.y<o.y+o.h/2){
        bullets.splice(j,1); o.hp-=b.dmg; burst(b.x,b.y,'#a85',4,2);
        rockTinkSound(); // metallic tink when bullet hits rock
        if(o.hp<=0){ burst(o.x,o.y,'#9a7',16,3); score+=10;
          rockDestroyedSound(); // descending tinks when rock is destroyed
          if(o.hides) powerups.push({kind:o.hides,x:o.x,y:o.y,bob:0});
          rocks.splice(i,1); break; }
      }
    }
  }
  // ---- bullets vs solid obstacles (absorbed, no damage) ----
  for(let i=solidObstacles.length-1;i>=0;i--){const o=solidObstacles[i];
    for(let j=bullets.length-1;j>=0;j--){const b=bullets[j];
      if(b.x>o.x-o.w/2&&b.x<o.x+o.w/2&&b.y>o.y-o.h/2&&b.y<o.y+o.h/2){
        bullets.splice(j,1); burst(b.x,b.y,'#6677aa',3,1.5); break;
      }
    }
  }
  // ---- bullets vs enemies ----
  for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];
    for(let j=bullets.length-1;j>=0;j--){const b=bullets[j];
      if(Math.hypot(b.x-e.x,b.y-e.y)<e.r+3){
        e.hp-=b.dmg; bullets.splice(j,1); burst(b.x,b.y,'#9dff3c',4,2);
        enemyHitSound();
        if(e.hp<=0){ score+=e.score; burst(e.x,e.y,'#ff2d6f',16,3.5); enemyDeathSound();
          if(!funnelFirstKillFired){ funnelFirstKillFired=true; trackCoreLoop(2,'first_enemy_kill'); }
          if(Math.random()<0.16) powerups.push({kind:randPow(),x:e.x,y:e.y,bob:0}); // 16% drop (doubled)
          enemies.splice(i,1); break; }
      }
    }
  }
  // ---- bullets vs mini-bosses ----
  miniBosses.forEach(mb=>{
    if(!mb.alive) return;
    for(let j=bullets.length-1;j>=0;j--){const b=bullets[j];
      if(Math.hypot(b.x-mb.x,b.y-mb.y)<mb.r){
        mb.hp-=b.dmg; bullets.splice(j,1); burst(b.x,b.y,'#ffb000',3,2);
        if(mb.hp<=0){
          mb.alive=false; bigBoom(mb.x,mb.y); miniBossDeathSound(); screenShake=20;
          score+=2000; burst(mb.x,mb.y,'#ff2d6f',40,5);
          banner={text:'HIVE NODE DESTROYED',t:130};
          if(!funnelFirstNodeFired){ funnelFirstNodeFired=true; trackCoreLoop(3,'hive_node_destroyed'); }
          // drop 2 powerups on mini-boss kill (was 4)
          for(let k=0;k<2;k++) powerups.push({kind:randPow(),x:mb.x+(Math.random()-0.5)*80,y:mb.y+(Math.random()-0.5)*80,bob:Math.random()*6.28});
        }
      }
    }
  });

  // ---- bullets vs apex boss ----
  if(apexBoss&&apexBoss.alive){
    for(let j=bullets.length-1;j>=0;j--){const b=bullets[j];
      if(Math.hypot(b.x-apexBoss.x,b.y-apexBoss.y)<apexBoss.r){
        apexBoss.hp-=b.dmg; bullets.splice(j,1); burst(b.x,b.y,'#ffb000',3,2);
        if(apexBoss.hp<=0){
          apexBoss.alive=false; bigBoom(apexBoss.x,apexBoss.y);
          bigBoom(apexBoss.x+40,apexBoss.y-30); bigBoom(apexBoss.x-40,apexBoss.y+30);
          score+=8000; screenShake=40;
          // time bonus: 10000 pts for sub-5min, scaling down to 0 at 20min
          const elapsed=Math.floor((Date.now()-startTime)/1000);
          const timeBonus=Math.max(0, Math.floor(10000*(1-elapsed/1200)));
          score+=timeBonus;
          banner={text:'PLANET LIBERATED', text2:timeBonus>0?'TIME BONUS +'+timeBonus:'', t:220};
          trackCoreLoop(4,'apex_boss_defeated');
          deathTimer=150; state='dying'; player.won=true; player.elapsed=elapsed; player.timeBonus=timeBonus;
        }
      }
    }
  }

  // ---- player vs powerups ----
  for(let j=powerups.length-1;j>=0;j--){const p=powerups[j];
    if(Math.hypot(p.x-player.x,p.y-player.y)<player.r+14){ grabPow(p.kind,p.x,p.y); powerups.splice(j,1); }
  }

  // ---- hazards vs player ----
  function hit(){ if(player.inv>0||!player.alive) return;
    player.hp--; if(player.hp<=0){ onPlayerDefeated(); return; }
    player.inv=60; screenShake=10; burst(player.x,player.y,'#ffb000',16,3);
    damageSound(); rumble(250, 0.5, 0.8); }
  if(crystalHit) hit();
  enemies.forEach(e=>{ if(e.awake&&Math.hypot(e.x-player.x,e.y-player.y)<e.r+player.r) hit(); });
  miniBosses.forEach(mb=>{ if(mb.alive&&Math.hypot(mb.x-player.x,mb.y-player.y)<mb.r+player.r) hit(); });
  if(apexBoss&&apexBoss.alive&&Math.hypot(apexBoss.x-player.x,apexBoss.y-player.y)<apexBoss.r+player.r) hit();
  for(let j=eBullets.length-1;j>=0;j--){const b=eBullets[j];
    if(Math.hypot(b.x-player.x,b.y-player.y)<player.r+4){ eBullets.splice(j,1); hit(); } }

  particles.forEach(p=>{p.x+=p.vx*frameTime;p.y+=p.vy*frameTime;p.vx*=Math.pow(0.94,frameTime);p.vy*=Math.pow(0.94,frameTime);p.life-=frameTime;});
  particles=particles.filter(p=>p.life>0);
  if(banner.t>0) banner.t-=frameTime;
  if(screenShake>0) screenShake*=Math.pow(0.85,frameTime);
}

// ====================================================================
// REWARDED-AD CONTINUE -- one voluntary "watch an ad, revive at half
// health" offer per run (rundot-monetization-ads). Player-positive by
// design: opt-in, only offered when an ad is actually ready (so the
// player never taps a dead button), the reward is granted ONLY when
// showRewardedAdAsync resolves true, and every step fires the analytics
// monetization taxonomy (ad_requested/ad_shown/ad_reward_granted/
// ad_failed) with a stable placement id so the dashboard can attribute it.
// ====================================================================
const REVIVE_AD_PLACEMENT='continue_revive';
const REVIVE_COUNTDOWN_S=8;
let reviveCountdownTimer=null, reviveCountdownLeft=0, reviveBusy=false;

// Called the instant hp hits 0, in place of startDeath(). Freezes the frame
// synchronously (state='reviveCheck' -- loop() no-ops for it, same as
// 'paused') so no extra gameplay sneaks in while we await the ad-ready
// check, then either shows the offer or falls straight through to a normal
// death.
function onPlayerDefeated(){
  if(handlingDefeat) return;
  handlingDefeat=true;
  state='reviveCheck';
  if(continueUsedThisRun){ startDeath(); return; }
  offerContinueOrDie();
}
async function offerContinueOrDie(){
  let ready=false;
  try{ ready=await RundotGameAPI.ads.isRewardedAdReadyAsync(); }catch{ ready=false; }
  if(state!=='reviveCheck') return; // state moved on while we were awaiting -- bail out
  if(!ready){ startDeath(); return; }
  continueUsedThisRun=true; // the offer is spent once shown, regardless of outcome
  showReviveDialog();
}
function showReviveDialog(){
  state='reviveOffer';
  document.getElementById('reviveScore').textContent='SCORE '+String(score).padStart(6,'0');
  setReviveStatus(''); setReviveBusy(false);
  document.getElementById('reviveOffer').classList.remove('hidden');
  reviveCountdownLeft=REVIVE_COUNTDOWN_S;
  updateReviveCountdownText();
  clearInterval(reviveCountdownTimer);
  reviveCountdownTimer=setInterval(()=>{
    reviveCountdownLeft--; updateReviveCountdownText();
    if(reviveCountdownLeft<=0) declineRevive();
  },1000);
}
function updateReviveCountdownText(){
  const el=document.getElementById('reviveCountdown');
  if(el) el.textContent='AUTO-DECLINE IN '+Math.max(0,reviveCountdownLeft)+'s';
}
function setReviveStatus(text){ const el=document.getElementById('reviveStatus'); if(el) el.textContent=text; }
function setReviveBusy(busy){
  reviveBusy=busy;
  const watchBtn=document.getElementById('reviveWatchBtn'), declineBtn=document.getElementById('reviveDeclineBtn');
  if(watchBtn){ watchBtn.disabled=busy; watchBtn.textContent=busy?'LOADING AD…':'▶ WATCH AD — CONTINUE'; }
  if(declineBtn) declineBtn.disabled=busy;
}
function hideReviveDialog(){
  clearInterval(reviveCountdownTimer); reviveCountdownTimer=null;
  document.getElementById('reviveOffer').classList.add('hidden');
}
async function acceptRevive(){
  if(state!=='reviveOffer'||reviveBusy) return;
  clearInterval(reviveCountdownTimer); reviveCountdownTimer=null;
  setReviveBusy(true);
  recordEvent('ad_requested',{placement:REVIVE_AD_PLACEMENT,type:'rewarded'});
  let earned=false;
  try{
    if(await RundotGameAPI.ads.isRewardedAdReadyAsync()){
      earned=await RundotGameAPI.ads.showRewardedAdAsync({
        adDisplayId:REVIVE_AD_PLACEMENT, adDisplayName:'Continue - Revive at Half Health'
      });
    }
  }catch{ earned=false; }
  if(state!=='reviveOffer') return; // player/game moved on mid-ad -- don't resurrect into a stale screen
  if(earned){
    recordEvent('ad_shown',{placement:REVIVE_AD_PLACEMENT,type:'rewarded'});
    recordEvent('ad_reward_granted',{placement:REVIVE_AD_PLACEMENT,reward_id:'half_health_continue'});
    hideReviveDialog();
    revivePlayer();
  } else {
    recordEvent('ad_failed',{placement:REVIVE_AD_PLACEMENT,type:'rewarded',reason:'not_completed'});
    setReviveStatus('AD UNAVAILABLE — CONTINUING WITHOUT REVIVE.');
    setTimeout(()=>{ if(state==='reviveOffer'){ hideReviveDialog(); startDeath(); } },1100);
  }
}
function declineRevive(){
  if(state!=='reviveOffer') return;
  hideReviveDialog();
  startDeath();
}
function revivePlayer(){
  player.alive=true;
  player.hp=Math.max(1,Math.ceil(player.maxhp/2));
  player.inv=180;                                    // ~3s mercy invulnerability
  player.shieldTime=Math.max(player.shieldTime,120);  // visible shield flourish, see draw()
  screenShake=0;
  banner={text:'SUIT REPAIRED',t:90};
  handlingDefeat=false; // this life's defeat cycle is fully resolved -- a later death this run can be handled again
  state='play';
}

function startDeath(){ handlingDefeat=false; player.alive=false; player.won=false; state='dying';
  deathTimer=100; bigBoom(player.x,player.y); screenShake=26;
  deathExplosionSound(); rumble(2500, 1.0, 1.0); }
function updateDeath(dt){
  const frameTime=dt*60;
  frame++;
  enemies.forEach(e=>{const dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy)||1;e.x+=dx/d*e.spd*0.5;e.y+=dy/d*e.spd*0.5;});
  eBullets.forEach(b=>{b.x+=b.vx*frameTime;b.y+=b.vy*frameTime;});
  particles.forEach(p=>{p.x+=p.vx*frameTime;p.y+=p.vy*frameTime;p.vx*=Math.pow(0.95,frameTime);p.vy*=Math.pow(0.95,frameTime);p.life-=frameTime;});
  particles=particles.filter(p=>p.life>0);
  if((frame%14===0||deathTimer<(Math.floor(deathTimer)-1*frameTime))&&deathTimer>20&&!player.won){
    burst(player.x+(Math.random()-0.5)*30,player.y+(Math.random()-0.5)*30,'#ffb000',12,4); screenShake=Math.max(screenShake,8);}
  if(banner.t>0) banner.t-=frameTime;
  if(screenShake>0) screenShake*=Math.pow(0.9,frameTime);
  deathTimer-=frameTime;
  if(deathTimer<=0) afterDeath();
}
function afterDeath(){
  const elapsedSec=Math.floor((Date.now()-startTime)/1000);
  const nodesDestroyed=miniBosses.filter(mb=>!mb.alive).length;
  recordEvent('run_completed',{
    result: player.won?'win':'loss', score, elapsedSec, gemsCollected, nodesDestroyed
  });
  submitRunScore(score, elapsedSec); // real cross-player leaderboard -- independent of the local table below
  if(player.won){ if(qualifies(score)) startEntry(true); else showWin(-1); }
  else { if(qualifies(score)) startEntry(false); else showGameOver(-1); }
}

// ====================================================================
// INITIALS ENTRY
// ====================================================================
let entryInitials,entryPos,entryWon;
function startEntry(won){
  state='entry'; entryWon=won;
  entryInitials=['A','A','A']; entryPos=0;
  document.getElementById('entryScore').textContent='SCORE '+String(score).padStart(6,'0');
  drawEntry(); 
  document.getElementById('entry').classList.remove('hidden');
  setupEntryInitialClicks();
}
function drawEntry(){ document.getElementById('entryInitials').innerHTML=
  entryInitials.map((c,i)=>i===entryPos?`<span class="cur">${c}</span>`:`<span>${c}</span>`).join(''); }
function cycleLetter(d){ 
  // Character set: A-Z (0-25) + 0-9 (26-35) = 36 total
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = chars.indexOf(entryInitials[entryPos]);
  code = (code + d + 36) % 36;
  entryInitials[entryPos] = chars[code]; 
  drawEntry(); 
}
function movePos(d){ entryPos=Math.max(0,Math.min(2,entryPos+d)); drawEntry(); }
function confirmEntry(){ const ini=entryInitials.join(''); const idx=insertScore(ini,score);
  document.getElementById('entry').classList.add('hidden'); refreshTitleTop();
  if(entryWon) showWin(idx); else showGameOver(idx); }
function handleEntryKey(e){
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
  if(e.code==='ArrowUp'||e.code==='KeyW') cycleLetter(1);
  else if(e.code==='ArrowDown'||e.code==='KeyS') cycleLetter(-1);
  else if(e.code==='ArrowLeft'||e.code==='KeyA') movePos(-1);
  else if(e.code==='ArrowRight'||e.code==='KeyD') movePos(1);
  else if(e.code==='Space'||e.code==='Enter') confirmEntry();
}
function entryPadPoll(pad){
  if(pad.up) cycleLetter(1); if(pad.down) cycleLetter(-1);
  if(pad.left) movePos(-1); if(pad.right) movePos(1);
  if(pad.xStart||pad.start) confirmEntry();
}

function setupEntryInitialClicks(){
  const initials = document.getElementById('entryInitials').querySelectorAll('span');
  initials.forEach((span, i)=>{
    span.style.cursor = 'pointer';
    span.onclick = ()=>{ 
      if(state==='entry'){ entryPos = i; drawEntry(); }
    };
  });
}

// ENTRY SCREEN BUTTON HANDLERS
document.getElementById('entryUpBtn').onclick=()=>{ if(state==='entry') cycleLetter(1); };
document.getElementById('entryDownBtn').onclick=()=>{ if(state==='entry') cycleLetter(-1); };
document.getElementById('entryLeftBtn').onclick=()=>{ if(state==='entry') movePos(-1); };
document.getElementById('entryRightBtn').onclick=()=>{ if(state==='entry') movePos(1); };
document.getElementById('entryAcceptBtn').onclick=()=>{ if(state==='entry') confirmEntry(); };

// PRESS START click handlers (game over and win screens)
document.getElementById('overPrompt').onclick=()=>{ if(state==='over') menuAdvance(); };
document.getElementById('winPrompt').onclick=()=>{ if(state==='win') menuAdvance(); };

// ====================================================================
// RENDER
// ====================================================================
function draw(){
  ctx.save();
  if(screenShake>0.3) ctx.translate((Math.random()-0.5)*screenShake,(Math.random()-0.5)*screenShake);

  // ===== PLANET SURFACE =====
  // base dirt
  const g=ctx.createLinearGradient(0,0,0,VH);
  g.addColorStop(0,'#2a1a10'); g.addColorStop(0.5,'#241510'); g.addColorStop(1,'#1d130c');
  ctx.fillStyle=g; ctx.fillRect(-30,-30,VW+60,VH+60);

  // large terrain patches (world space) — gives the ground varied regions
  patches.forEach(p=>{ const sx=p.x-cam.x, sy=p.y-cam.y;
    if(sx<-p.r-10||sx>VW+p.r+10||sy<-p.r-10||sy>VH+p.r+10) return;
    ctx.fillStyle=p.c; ctx.beginPath(); ctx.arc(sx,sy,p.r,0,6.3); ctx.fill();
  });

  // craters (world space)
  craters.forEach(cr=>{ const sx=cr.x-cam.x, sy=cr.y-cam.y;
    if(sx<-cr.r-10||sx>VW+cr.r+10||sy<-cr.r-10||sy>VH+cr.r+10) return;
    ctx.fillStyle='rgba(10,7,5,0.55)'; ctx.beginPath();ctx.arc(sx,sy,cr.r,0,6.3);ctx.fill();
    ctx.strokeStyle='rgba(120,90,60,0.35)'; ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(sx,sy,cr.r,0,6.3);ctx.stroke();
    ctx.fillStyle='rgba(60,45,30,0.4)'; ctx.beginPath();ctx.arc(sx-cr.r*0.2,sy-cr.r*0.2,cr.r*0.55,0,6.3);ctx.fill();
  });

  // surface detail: dust specks, pebbles, cracks, glowing flora (world space)
  bgDots.forEach(d=>{ const sx=d.x-cam.x, sy=d.y-cam.y;
    if(sx<-6||sx>VW+6||sy<-6||sy>VH+6) return;
    if(d.t==='flora'){
      ctx.fillStyle=`rgba(157,255,60,${0.5+Math.sin(frame*0.05+d.x)*0.2})`;
      ctx.shadowBlur=6; ctx.shadowColor='#9dff3c';
      ctx.beginPath();ctx.arc(sx,sy,d.s,0,6.3);ctx.fill(); ctx.shadowBlur=0;
    } else if(d.t==='crack'){
      ctx.strokeStyle=d.c; ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+d.dx,sy+d.dy);ctx.stroke();
    } else {
      ctx.fillStyle=d.c; ctx.fillRect(sx,sy,d.s,d.s);
    }
  });

  // world-edge: planetary ridge / boundary wall
  ctx.strokeStyle='rgba(255,45,111,0.5)'; ctx.lineWidth=4;
  ctx.strokeRect(-cam.x,-cam.y,WORLD,WORLD);
  ctx.strokeStyle='rgba(255,176,0,0.18)'; ctx.lineWidth=14;
  ctx.strokeRect(-cam.x,-cam.y,WORLD,WORLD);

  // rocks
  rocks.forEach(o=>{ const sx=o.x-cam.x, sy=o.y-cam.y;
    if(sx<-80||sx>VW+80||sy<-80||sy>VH+80) return;
    ctx.save(); ctx.translate(sx,sy); ctx.rotate(o.rot);
    ctx.fillStyle='rgba(90,70,50,0.85)'; ctx.strokeStyle='#6b5a44'; ctx.lineWidth=2;
    ctx.beginPath();
    const seg=7; for(let i=0;i<seg;i++){const a=i/seg*6.283;
      const rr=(i%2?0.8:1)*(o.w/2); ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*(rr*o.h/o.w));}
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle='rgba(157,255,60,0.15)'; ctx.beginPath();
    ctx.moveTo(-o.w/4,-o.h/4); ctx.lineTo(o.w/5,o.h/5); ctx.stroke();
    ctx.restore();
  });

  // ===== SOLID alien formations (indestructible) =====
  solidObstacles.forEach(o=>{
    const sx=o.x-cam.x, sy=o.y-cam.y;
    if(sx<-120||sx>VW+120||sy<-120||sy>VH+120) return;
    ctx.save(); ctx.translate(sx,sy);
    if(o.kind==='spire'){
      // dark jagged upthrust formation
      ctx.fillStyle='rgba(45,38,70,0.95)'; ctx.strokeStyle='#7755aa'; ctx.lineWidth=2;
      ctx.shadowBlur=8; ctx.shadowColor='#5533aa';
      ctx.beginPath();
      const seg=6;
      for(let i=0;i<seg;i++){
        const a=i/seg*6.283+o.rot;
        const spike = i%2===0; // alternating spikes
        const rr = spike ? o.w/2 : o.w*0.35;
        const rrh = spike ? o.h/2 : o.h*0.3;
        ctx.lineTo(Math.cos(a)*rr, Math.sin(a)*rrh);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // highlight ridge
      ctx.shadowBlur=0; ctx.strokeStyle='rgba(140,100,220,0.4)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(-o.w*0.2,-o.h*0.3); ctx.lineTo(o.w*0.1,o.h*0.2); ctx.stroke();
    } else {
      // crystal cluster — damages player on contact; blue with red warning edge
      ctx.fillStyle='rgba(30,50,80,0.9)'; ctx.strokeStyle='#3399cc'; ctx.lineWidth=2;
      ctx.shadowBlur=10; ctx.shadowColor='#2266aa';
      ctx.beginPath();
      const seg2=5;
      for(let i=0;i<seg2;i++){
        const a=i/seg2*6.283+o.rot;
        const rr=(i%2===0?1:0.65)*(o.w/2); const rrh=(i%2===0?1:0.65)*(o.h/2);
        ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rrh);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // inner glow facet
      ctx.shadowBlur=0; ctx.fillStyle='rgba(100,200,255,0.15)';
      ctx.beginPath(); ctx.arc(0,0,o.w*0.2,0,6.3); ctx.fill();
      // danger ring — red pulse indicates contact damage
      ctx.strokeStyle=`rgba(255,45,111,${0.35+Math.sin(frame*0.08+o.rot)*0.2})`;
      ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(0,0,o.w*0.52+3,0,6.3); ctx.stroke();
      // extra shards
      for(let s=0;s<o.shards;s++){
        const sa=(s/o.shards)*6.283+o.rot*0.7;
        const sd=o.w*0.45;
        ctx.save(); ctx.translate(Math.cos(sa)*sd,Math.sin(sa)*sd);
        ctx.rotate(sa+1); ctx.fillStyle='rgba(30,50,80,0.85)';
        ctx.strokeStyle='#3399cc'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(0,-o.w*0.18); ctx.lineTo(o.w*0.09,o.w*0.12);
        ctx.lineTo(-o.w*0.09,o.w*0.12); ctx.closePath();
        ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
    ctx.shadowBlur=0; ctx.restore();
  });
  powerups.forEach(p=>{ const sx=p.x-cam.x, sy=p.y-cam.y+Math.sin(p.bob)*3;
    if(sx<-30||sx>VW+30||sy<-30||sy>VH+30) return;
    const col = p.kind==='MED' ? '#ff2d6f' : p.kind[0]==='W' ? '#28e0ff' : '#9dff3c';
    ctx.save(); ctx.translate(sx,sy); ctx.shadowBlur=14; ctx.shadowColor=col;
    ctx.strokeStyle=col; ctx.lineWidth=2; ctx.fillStyle='rgba(0,0,0,0.6)';
    ctx.beginPath();ctx.moveTo(0,-13);ctx.lineTo(13,0);ctx.lineTo(0,13);ctx.lineTo(-13,0);ctx.closePath();
    ctx.fill();ctx.stroke();
    ctx.shadowBlur=0; ctx.fillStyle=col; ctx.font='bold 13px Orbitron,monospace';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.kind,0,1);
    ctx.restore();
  });
  ctx.textBaseline='alphabetic';

  // ===== ALIEN GEMS =====
  gems.forEach(g=>{
    const sx=g.x-cam.x, sy=g.y-cam.y;
    if(sx<-30||sx>VW+30||sy<-30||sy>VH+30) return;
    const pulse=0.75+Math.sin(g.pulse)*0.25;
    ctx.save(); ctx.translate(sx,sy); ctx.rotate(g.spin);
    ctx.shadowBlur=16*pulse; ctx.shadowColor=g.col;
    ctx.strokeStyle=g.col; ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.lineWidth=2;
    // outer diamond
    const r=g.r*pulse;
    ctx.beginPath();
    ctx.moveTo(0,-r*1.4); ctx.lineTo(r,0); ctx.lineTo(0,r*1.4); ctx.lineTo(-r,0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // inner facet cross
    ctx.strokeStyle='rgba(255,255,255,0.6)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,-r*0.7); ctx.lineTo(r*0.5,0); ctx.lineTo(0,r*0.7); ctx.lineTo(-r*0.5,0); ctx.closePath(); ctx.stroke();
    ctx.shadowBlur=0; ctx.restore();
  });

  // player bullets
  ctx.fillStyle='#28e0ff'; ctx.shadowBlur=8; ctx.shadowColor='#28e0ff';
  bullets.forEach(b=>{ const sx=b.x-cam.x, sy=b.y-cam.y;
    ctx.beginPath(); ctx.arc(sx,sy,3,0,6.3); ctx.fill(); });
  ctx.shadowBlur=0;

  // enemy bullets
  eBullets.forEach(b=>{ const sx=b.x-cam.x, sy=b.y-cam.y;
    if(b.source==='miniboss'){
      // mini-boss bullets: bright cyan with strong glow
      ctx.fillStyle='#00ffff'; ctx.shadowBlur=12; ctx.shadowColor='#00ffff';
    } else {
      // regular enemy bullets: pink
      ctx.fillStyle='#ff2d6f'; ctx.shadowBlur=8; ctx.shadowColor='#ff2d6f';
    }
    ctx.beginPath();ctx.arc(sx,sy,4,0,6.3);ctx.fill();
  });
  ctx.shadowBlur=0;

  // enemies — dormant shown dim, awake shown vivid
  enemies.forEach(e=>{ const sx=e.x-cam.x, sy=e.y-cam.y;
    if(sx<-40||sx>VW+40||sy<-40||sy>VH+40) return;
    ctx.save(); ctx.translate(sx,sy);
    const col = e.type==='spitter'?'#b06bff' : e.type==='swarm'?'#ff2d6f':'#9dff3c';
    ctx.globalAlpha = e.awake ? 1.0 : 0.38;
    ctx.fillStyle=col;
    if(e.awake){ctx.shadowBlur=8;ctx.shadowColor=col;}
    ctx.beginPath();
    const seg=8,t=frame*(e.awake?0.1:0.025);
    for(let i=0;i<seg;i++){const a=i/seg*6.283;
      const rr=e.r*(1+Math.sin(t+i)*(e.awake?0.12:0.04));
      ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur=0;
    // eye: closed (dash) when dormant, open (circle) when awake
    if(e.awake){
      ctx.fillStyle='#000'; ctx.beginPath();ctx.arc(0,0,e.r*0.4,0,6.3);ctx.fill();
      ctx.fillStyle='#fff'; ctx.beginPath();ctx.arc(0,0,e.r*0.18,0,6.3);ctx.fill();
    } else {
      ctx.strokeStyle='rgba(0,0,0,0.7)'; ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(-e.r*0.35,0);ctx.lineTo(e.r*0.35,0);ctx.stroke();
    }
    ctx.globalAlpha=1; ctx.restore();
    if(e.awake&&e.hp<e.maxhp){
      ctx.fillStyle='#400';ctx.fillRect(sx-e.r,sy-e.r-7,e.r*2,3);
      ctx.fillStyle='#9dff3c';ctx.fillRect(sx-e.r,sy-e.r-7,e.r*2*(e.hp/e.maxhp),3);}
  });

  // mini-bosses
  miniBosses.forEach(mb=>{
    if(!mb.alive) return;
    const sx=mb.x-cam.x, sy=mb.y-cam.y;
    if(sx<-200||sx>VW+200||sy<-200||sy>VH+200) return;
    ctx.save(); ctx.translate(sx,sy);
    ctx.fillStyle='#ff2d6f'; ctx.shadowBlur=18; ctx.shadowColor='#ff2d6f';
    ctx.beginPath();
    for(let i=0;i<10;i++){const a=i/10*6.283;
      const rr=mb.r*(1+Math.sin(mb.wob+i)*0.15);ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}
    ctx.closePath(); ctx.fill(); ctx.shadowBlur=0;
    ctx.fillStyle='#b06bff'; ctx.beginPath();ctx.arc(0,0,mb.r*0.48,0,6.3);ctx.fill();
    ctx.fillStyle='#000'; ctx.beginPath();ctx.arc(0,0,mb.r*0.26,0,6.3);ctx.fill();
    ctx.fillStyle='#9dff3c'; ctx.beginPath();ctx.arc(0,0,mb.r*0.1,0,6.3);ctx.fill();
    ctx.restore();
    // hp bar when discovered
    if(mb.discovered){
      const bx=sx-mb.r, by=sy-mb.r-10, bw=mb.r*2;
      ctx.fillStyle='#400';ctx.fillRect(bx,by,bw,4);
      ctx.fillStyle='#ff2d6f';ctx.fillRect(bx,by,bw*(mb.hp/mb.maxhp),4);
    }
  });

  // apex boss
  if(apexBoss&&apexBoss.alive){
    const sx=apexBoss.x-cam.x, sy=apexBoss.y-cam.y;

    // ---- ray charge warning: flashing directional lines ----
    if(apexBoss.rayState==='charging'&&apexBoss.rayChargeT!==undefined){
      const blink=Math.floor(apexBoss.rayChargeT/6)%2===0;
      const progress=1-(apexBoss.rayChargeT/90);
      if(blink){
        ctx.save();
        ctx.strokeStyle=`rgba(255,${Math.floor(176*progress)},0,${0.5+progress*0.5})`;
        ctx.lineWidth=3+progress*4;
        ctx.shadowBlur=12; ctx.shadowColor='#ffb000';
        for(let i=0;i<4;i++){
          const a=(apexBoss.rayAngle||0)+i*Math.PI/2;
          const len=600*progress; // grows toward full length as charge completes
          ctx.beginPath();
          ctx.moveTo(sx,sy);
          ctx.lineTo(sx+Math.cos(a)*len, sy+Math.sin(a)*len);
          ctx.stroke();
        }
        ctx.shadowBlur=0; ctx.restore();
      }
    }

    // ---- active ray beams ----
    rayBeams.forEach(ray=>{
      const frac=ray.life/60;
      const rsx=ray.ox-cam.x, rsy=ray.oy-cam.y;
      ctx.save();
      ctx.strokeStyle=`rgba(255,220,0,${frac})`;
      ctx.lineWidth=8*frac+2;
      ctx.shadowBlur=20*frac; ctx.shadowColor='#ffb000';
      ctx.beginPath();
      ctx.moveTo(rsx,rsy);
      ctx.lineTo(rsx+ray.ax*2000, rsy+ray.ay*2000);
      ctx.stroke();
      // inner white core
      ctx.strokeStyle=`rgba(255,255,255,${frac*0.8})`;
      ctx.lineWidth=2;
      ctx.beginPath();
      ctx.moveTo(rsx,rsy);
      ctx.lineTo(rsx+ray.ax*2000, rsy+ray.ay*2000);
      ctx.stroke();
      ctx.shadowBlur=0; ctx.restore();
    });

    if(sx>-250&&sx<VW+250&&sy>-250&&sy<VH+250){
      ctx.save(); ctx.translate(sx,sy);
      // charging: tint boss amber/white
      const chargeTint = apexBoss.rayState==='charging' ?
        Math.floor(apexBoss.rayChargeT/6)%2===0 ? '#ffb000' : '#ff2d6f' : '#ff2d6f';
      // pulsing outer ring
      ctx.globalAlpha=0.3+Math.sin(apexBoss.wob*2)*0.15;
      ctx.fillStyle=chargeTint; ctx.beginPath();ctx.arc(0,0,apexBoss.r*1.3,0,6.3);ctx.fill();
      ctx.globalAlpha=1;
      ctx.fillStyle=chargeTint; ctx.shadowBlur=apexBoss.rayState==='charging'?52:36;
      ctx.shadowColor=chargeTint;
      ctx.beginPath();
      for(let i=0;i<14;i++){const a=i/14*6.283;
        const rr=apexBoss.r*(1+Math.sin(apexBoss.wob+i)*0.18);ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}
      ctx.closePath(); ctx.fill(); ctx.shadowBlur=0;
      ctx.fillStyle='#b06bff'; ctx.beginPath();ctx.arc(0,0,apexBoss.r*0.55,0,6.3);ctx.fill();
      ctx.fillStyle=chargeTint; ctx.beginPath();ctx.arc(0,0,apexBoss.r*0.32,0,6.3);ctx.fill();
      ctx.fillStyle='#000'; ctx.beginPath();ctx.arc(0,0,apexBoss.r*0.18,0,6.3);ctx.fill();
      ctx.fillStyle='#ffb000'; ctx.beginPath();ctx.arc(0,0,apexBoss.r*0.07,0,6.3);ctx.fill();
      ctx.restore();
    }
    // apex HP bar at bottom center
    const bw=340;
    ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(VW/2-bw/2-2,VH-28,bw+4,16);
    ctx.fillStyle='#400';ctx.fillRect(VW/2-bw/2,VH-26,bw,12);
    ctx.fillStyle='#ff2d6f';ctx.fillRect(VW/2-bw/2,VH-26,bw*(apexBoss.hp/apexBoss.maxhp),12);
    ctx.fillStyle='#ffb000';ctx.font='14px VT323,monospace';ctx.textAlign='center';
    ctx.fillText(apexBoss.rayState==='charging'?'!! CHARGING !!':'APEX HIVE',VW/2,VH-32);
  }

  // player astronaut — upright, walks on surface, upper body aims
  if(player.alive){
    const sx=player.x-cam.x, sy=player.y-cam.y;
    const flick=player.inv>0&&Math.floor(frame/4)%2===0;
    if(!flick){
      const ang=Math.atan2(lastAim.y,lastAim.x);
      const wp=player.walkPhase;
      const stride = player.moving ? Math.sin(wp)*4 : 0;       // leg swing
      const bob    = player.moving ? Math.abs(Math.cos(wp))*1.5 : 0; // body bob

      // ground shadow (stays on the ground, world-up)
      ctx.fillStyle='rgba(0,0,0,0.35)';
      ctx.beginPath();ctx.ellipse(sx,sy+15,11,4,0,0,6.3);ctx.fill();

      ctx.save(); ctx.translate(sx,sy-bob);

      // ----- LEGS (upright, animated walk; never rotates with aim) -----
      ctx.strokeStyle='#b9c6d0';ctx.lineWidth=4;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(-3,8);ctx.lineTo(-3+stride*0.5,17+ (stride>0?0:2));ctx.stroke();
      ctx.beginPath();ctx.moveTo(3,8);ctx.lineTo(3-stride*0.5,17+ (stride<0?0:2));ctx.stroke();
      // boots
      ctx.fillStyle='#8895a0';
      ctx.fillRect(-5+stride*0.5,16,5,3);
      ctx.fillRect(1-stride*0.5,16,5,3);

      // ----- TORSO (upright base) -----
      ctx.shadowBlur=10; ctx.shadowColor='#28e0ff';
      ctx.fillStyle='#dfe9f0';
      ctx.beginPath();ctx.ellipse(0,2,9,11,0,0,6.3);ctx.fill();
      ctx.shadowBlur=0;
      // chest panel
      ctx.fillStyle='#ffb000';ctx.fillRect(-4,0,8,5);
      ctx.fillStyle='#28e0ff';ctx.fillRect(-3,6,6,2);

      // ----- AIMING UPPER LAYER (helmet + gun arm rotate toward aim) -----
      ctx.save();
      ctx.rotate(ang+Math.PI/2);   // local up = aim direction
      // gun arm reaching toward aim
      ctx.strokeStyle='#cfe0ea';ctx.lineWidth=4;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(0,-2);ctx.lineTo(0,-15);ctx.stroke();
      // weapon muzzle
      ctx.fillStyle='#28e0ff';ctx.shadowBlur=8;ctx.shadowColor='#28e0ff';
      ctx.fillRect(-2,-19,4,5); ctx.shadowBlur=0;
      // helmet
      ctx.fillStyle='#cfe0ea'; ctx.beginPath();ctx.arc(0,-3,7.5,0,6.3);ctx.fill();
      // visor faces aim (local up)
      ctx.fillStyle='#0a2a3a'; ctx.beginPath();ctx.arc(0,-4.5,5,Math.PI,2*Math.PI);ctx.fill();
      ctx.fillStyle='#28e0ff'; ctx.globalAlpha=0.55;
      ctx.beginPath();ctx.arc(-1.3,-5.5,1.8,0,6.3);ctx.fill(); ctx.globalAlpha=1;
      ctx.restore();

      ctx.restore();

      // ===== SHIELD GLOW (if active) =====
      if(player.shieldTime>0){
        const shieldPulse = 0.5 + Math.sin(frame*0.15)*0.5; // pulsate
        ctx.globalAlpha=0.3*shieldPulse;
        ctx.strokeStyle='#00ffff';
        ctx.lineWidth=3;
        ctx.shadowBlur=20; ctx.shadowColor='#00ffff';
        ctx.beginPath();
        ctx.arc(sx,sy,player.r+12,0,6.3);
        ctx.stroke();
        ctx.shadowBlur=0;
        ctx.globalAlpha=1;
      }
    }
  }

  // particles
  particles.forEach(p=>{ const sx=p.x-cam.x, sy=p.y-cam.y;
    ctx.globalAlpha=Math.max(0,p.life/30); ctx.fillStyle=p.col; ctx.fillRect(sx,sy,2.5,2.5); });
  ctx.globalAlpha=1;

  ctx.restore();

  // ===== HUD =====
  ctx.fillStyle='#00ff9c';ctx.font='22px VT323,monospace';ctx.textAlign='left';
  ctx.fillText('SCORE '+String(score).padStart(6,'0'),12,26);
  ctx.textAlign='right';
  const awakeCount=enemies.filter(e=>e.awake).length;
  ctx.fillText('ALIENS '+awakeCount+'/'+enemies.length,VW-12,26);
  ctx.textAlign='left';
  for(let i=0;i<player.maxhp;i++){ctx.fillStyle=i<player.hp?'#28e0ff':'#1a3a44';
    ctx.fillRect(12+i*15,36,11,8);}
  ctx.fillStyle='#9dff3c';ctx.font='15px VT323,monospace';
  ctx.fillText('WPN x'+player.spread+'  RATE '+(player.fireRate<=5?'MAX':(10-Math.round(player.fireRate))),12,60);
  const mbDead=miniBosses.filter(mb=>!mb.alive).length;
  ctx.fillStyle='#ffb000';ctx.font='16px VT323,monospace';
  ctx.fillText('NODES: '+mbDead+'/4',12,80);
  ctx.fillStyle='#28e0ff';ctx.font='16px VT323,monospace';
  ctx.fillText('\u25c6 GEMS: '+gemsCollected+'/'+totalGems,12,98);

  // ===== MINIMAP =====
  const mm=Math.round(Math.max(90,Math.min(140,VW*0.19))),mmx=VW-mm-10,mmy=VH-mm-10,sc=mm/WORLD;
  ctx.fillStyle='rgba(0,20,12,0.75)';ctx.fillRect(mmx,mmy,mm,mm);
  ctx.strokeStyle='#0a7a4e';ctx.lineWidth=1;ctx.strokeRect(mmx,mmy,mm,mm);
  ctx.strokeStyle='rgba(40,224,255,0.5)';
  ctx.strokeRect(mmx+cam.x*sc,mmy+cam.y*sc,VW*sc,VH*sc);
  enemies.forEach(e=>{
    ctx.fillStyle=e.awake?'rgba(157,255,60,0.9)':'rgba(157,255,60,0.2)';
    ctx.fillRect(mmx+e.x*sc-1,mmy+e.y*sc-1,2,2);
  });
  // gem dots on minimap (small, colored)
  gems.forEach(g=>{
    ctx.fillStyle=g.col; ctx.globalAlpha=0.75;
    ctx.beginPath();ctx.arc(mmx+g.x*sc,mmy+g.y*sc,1.8,0,6.3);ctx.fill();
  });
  ctx.globalAlpha=1;
  miniBosses.forEach(mb=>{
    if(!mb.alive) return;
    ctx.fillStyle=mb.discovered?'#ff2d6f':'rgba(255,45,111,0.4)';
    ctx.beginPath();ctx.arc(mmx+mb.x*sc,mmy+mb.y*sc,mb.discovered?3.5:2,0,6.3);ctx.fill();
  });
  if(apexBoss&&apexBoss.alive){
    ctx.fillStyle='#ffb000';ctx.shadowBlur=6;ctx.shadowColor='#ffb000';
    ctx.beginPath();ctx.arc(mmx+apexBoss.x*sc,mmy+apexBoss.y*sc,5,0,6.3);ctx.fill();
    ctx.shadowBlur=0;
  }
  ctx.fillStyle='#28e0ff';
  ctx.beginPath();ctx.arc(mmx+player.x*sc,mmy+player.y*sc,2.5,0,6.3);ctx.fill();

  // ===== BANNER =====
  if(banner.t>0){
    const a=Math.min(1,banner.t/30);
    const hasTwo=banner.text2&&banner.text2.length>0;
    const y1=hasTwo ? VH/2-22 : VH/2; // shift up if two lines
    ctx.save();
    ctx.globalAlpha=a*0.14;ctx.fillStyle='#00ff9c';ctx.fillRect(0,VH/2-60,VW,hasTwo?120:100);
    ctx.globalAlpha=a;ctx.fillStyle='#00ff9c';ctx.shadowBlur=20;ctx.shadowColor='#00ff9c';
    ctx.font='900 40px Orbitron,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(banner.text,VW/2,y1);
    if(hasTwo){
      ctx.shadowBlur=10;ctx.font='700 22px Orbitron,sans-serif';
      ctx.fillStyle='#ffb000';ctx.shadowColor='#ffb000';
      ctx.fillText(banner.text2,VW/2,y1+40);
    }
    ctx.shadowBlur=0;ctx.restore();ctx.textBaseline='alphabetic';
  }

  // ===== MOUSE CROSSHAIR =====
  if(state==='play'||state==='dying'){
    const sz=8;
    ctx.strokeStyle='rgba(40,224,255,0.75)'; ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.moveTo(mouse.x-sz,mouse.y); ctx.lineTo(mouse.x+sz,mouse.y);
    ctx.moveTo(mouse.x,mouse.y-sz); ctx.lineTo(mouse.x,mouse.y+sz);
    ctx.stroke();
    ctx.strokeStyle='rgba(40,224,255,0.35)';
    ctx.beginPath(); ctx.arc(mouse.x,mouse.y,5,0,6.3); ctx.stroke();
  }
}

// ====================================================================
// LOOP & FLOW
// ====================================================================
// ====================================================================
// GAME LOOP WITH DELTA TIME
// ====================================================================
let lastFrameTime=Date.now();
function loop(){
  const now=Date.now();
  const deltaTime=Math.min((now-lastFrameTime)/1000,0.05); // cap at 50ms (20fps minimum)
  lastFrameTime=now;
  if(state==='play'){ update(deltaTime); draw(); }
  else if(state==='dying'){ updateDeath(deltaTime); draw(); }
  requestAnimationFrame(loop);
}
function startGame(){ reset(); state='play';
  setGlobalRankText('',''); // clear any leftover rank text from the previous run
  trackCoreLoop(1,'run_started');
  ['title','over','win','entry','paused','reviveOffer'].forEach(id=>document.getElementById(id).classList.add('hidden')); }
function showGameOver(idx){ state='over';
  document.getElementById('finalScore').textContent='SCORE '+String(score).padStart(6,'0');
  renderHSTable(idx,'hsTable'); document.getElementById('over').classList.remove('hidden'); }
function showWin(idx){ state='win';
  const mins=Math.floor((player.elapsed||0)/60), secs=(player.elapsed||0)%60;
  const timeStr=mins+'m '+String(secs).padStart(2,'0')+'s';
  const bonusStr=player.timeBonus>0?' // TIME BONUS +'+player.timeBonus:'';
  document.getElementById('winScore').textContent='SCORE '+String(score).padStart(6,'0')+'  //  '+timeStr+bonusStr;
  renderHSTable(idx,'hsTableWin'); document.getElementById('win').classList.remove('hidden'); }
function togglePause(){
  if(state==='play'){state='paused';document.getElementById('paused').classList.remove('hidden');}
  else if(state==='paused'){state='play';document.getElementById('paused').classList.add('hidden');}
}
function menuAdvance(){
  if(state==='title') startGame();
  else if(state==='over'||state==='win'){
    document.getElementById('over').classList.add('hidden');
    document.getElementById('win').classList.add('hidden');
    document.getElementById('title').classList.remove('hidden');
    refreshTitleTop(); state='title';
  } else if(state==='paused') togglePause();
  else if(state==='leaderboard') closeLeaderboard();
  else if(state==='reviveOffer') acceptRevive(); // Enter/pad-confirm == the affirmative "watch ad" action
}
document.getElementById('startBtn').onclick=()=>{ if(state==='title') startGame(); };
document.getElementById('exportBtn').onclick=exportDat;
document.getElementById('importBtn').onclick=()=>document.getElementById('importFile').click();
document.getElementById('importFile').onchange=(e)=>{ if(e.target.files[0]) importDat(e.target.files[0]); e.target.value=''; };

// REWARDED-AD CONTINUE handlers
document.getElementById('reviveWatchBtn').onclick=()=>{ if(state==='reviveOffer') acceptRevive(); };
document.getElementById('reviveDeclineBtn').onclick=()=>{ if(state==='reviveOffer') declineRevive(); };

// GLOBAL LEADERBOARD handlers
document.getElementById('leaderboardBtn').onclick=()=>{ if(state==='title') openLeaderboard('title'); };
document.getElementById('viewLbBtnOver').onclick=()=>{ if(state==='over') openLeaderboard('over'); };
document.getElementById('viewLbBtnWin').onclick=()=>{ if(state==='win') openLeaderboard('win'); };
document.getElementById('lbBackBtn').onclick=()=>{ if(state==='leaderboard') closeLeaderboard(); };

function padMenuPoll(){
  const pad=readPad();
  if(state==='entry') entryPadPoll(pad);
  else if(state!=='play'&&state!=='dying'){ if(pad.start||pad.xStart) menuAdvance(); }
  requestAnimationFrame(padMenuPoll);
}

refreshTitleTop(); // shows AAA/000000 defaults immediately; corrected once loadScores() resolves
reset();
padMenuPoll();
loop();
loadScores().then(refreshTitleTop);
tryShowProfileBadge(); // shows username/avatar on the title + leaderboard panels once SDK handshake resolves

// Boot triad, step 2 -- title screen is up and interactive.
trackBoot(2,'load_finished');

// Boot triad, step 3 -- fires once, on the player's very first tap/click/keypress
// anywhere in the game (not specifically INSERT COIN -- any real input signals
// engagement). Guarded so the three listeners below can't double-fire it.
let firstTapFired=false;
function fireFirstTapOnce(){
  if(firstTapFired) return;
  firstTapFired=true;
  trackBoot(3,'first_tap');
}
window.addEventListener('pointerdown',fireFirstTapOnce,{once:true});
window.addEventListener('keydown',fireFirstTapOnce,{once:true});
window.addEventListener('touchstart',fireFirstTapOnce,{once:true});

// Persist aggressively on sleep -- RUN.world can suspend/teardown the host at
// any time and onQuit is not guaranteed to fire. See LIFECYCLES.md.
try{
  RundotGameAPI.lifecycles.onSleep(()=>{ saveScores(); });
}catch(e){ console.warn('[SDK] could not register onSleep handler:',e); }
