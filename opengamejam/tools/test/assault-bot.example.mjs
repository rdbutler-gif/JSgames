const S = 'C:/Users/rdbut/AppData/Local/Temp/claude/d4c6c4db40af19e9/159cd694-8e25-4db9-9f13-f0dd839b7753/scratchpad';
export default async ({ ev, shot, sleep, send }) => {
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await sleep(7000);
  // Test pilot: chase the nearest formation enemy sideways, fire always, dodge bolts about to hit.
  await ev(`window.__bot = (inp, G) => {
    const A = window.__relic.assault; if (!A.active) return;
    const { S, player, eBolts } = A.debug;
    let tx = 0, ty = -6, bd = 1e9;
    for (const e of S.enemies) { if (!e.alive || e.state === 'enter') continue; const d = Math.abs(e.pos.x - player.pos.x) + (e.state==='dive'?400:0); if (d < bd) { bd = d; tx = e.pos.x; ty = Math.max(-25, Math.min(20, e.pos.y)); } }
    let threat = null;
    for (const b of eBolts) { if (b.life <= 0) continue; if (b.seen === undefined) b.seen = Math.random() < 0.55; if (!b.seen) continue; if (b.life > 5.9) b.seen = undefined; const p = b.m.position; if (p.z > -45 && p.z < 5 && Math.hypot(p.x - player.pos.x, p.y - player.pos.y) < 7) threat = p; }
    window.__jit = (window.__jitT = (window.__jitT||0) + 1) % 30 === 0 ? (Math.random()-0.5)*14 : (window.__jit||0); window.__tx = (window.__tx ?? 0) + (tx + window.__jit - (window.__tx ?? 0)) * 0.12; inp.moveX = Math.max(-1, Math.min(1, (window.__tx - player.pos.x) / 12));
    inp.moveY = Math.max(-1, Math.min(1, (ty - player.pos.y) / 12));
    if (threat) inp.moveX = threat.x > player.pos.x ? -1 : 1;
    inp.fire = true; inp.dodge = !!threat && Math.random() < 0.15; if (threat && Math.random() < 0.4) inp.moveX = 0;
    window.__log = window.__log || []; 
  }; 'ok'`);
  await ev("document.getElementById('title').classList.remove('show'); window.__relic.G.state='flight'; window.__relic.startAssault(window.__relic.G.squads[1]); 'ok'");
  await sleep(1500);
  const run = async (sec) => ev("(()=>{const R=window.__relic; for(let i=0;i<" + Math.round(sec*30) + ";i++){ if(R.G.state!=='assault') break; R.step(1/30); } R.draw(); const A=R.assault.debug; return A.S ? JSON.stringify({t:+A.S.time.toFixed(1), wave:A.S.wave+1, alive:A.S.enemies.length, kills:A.S.kills, shield:Math.round(A.player.shield), hull:Math.round(A.player.hull), score:A.S.score}) : R.G.state;})()");
  console.log(await run(5)); await shot(S + '/b1.png');
  let i = 0;
  while (i++ < 40) {
    const r = await run(4); console.log(r);
    if (i === 3) await shot(S + '/b2.png');
    if (r.includes('"wave":3') && !globalThis.w3) { globalThis.w3 = 1; await run(4); await shot(S + '/b3-warden.png'); }
    if (!r.startsWith('{')) break;
  }
  await sleep(1200);
  await shot(S + '/b4-end.png');
  console.log('final', await ev("window.__relic.G.state + ' salvage=' + window.__relic.G.salvage + ' won=' + window.__relic.G.assaultsWon"));
};
