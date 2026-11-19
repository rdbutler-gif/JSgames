import { readFileSync } from 'node:fs';
const S = 'C:/Users/rdbut/AppData/Local/Temp/claude/d4c6c4db40af19e9/159cd694-8e25-4db9-9f13-f0dd839b7753/scratchpad';
const botSrc = readFileSync(S + '/t2.mjs', 'utf8').match(/window.__bot = [\s\S]*?\}; 'ok'/)[0];
export default async ({ ev, shot, sleep, key, send }) => {
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await sleep(7000);
  await key('Enter'); await sleep(300); await key('Enter', 'keyUp'); await sleep(800);
  // fly next to the Kessa approach strike group (level 3) and look at it
  await ev(`(()=>{ const R=window.__relic, sq=R.G.squads[5], s=R.ship;
    s.pos.copy(sq.pos).addScaledVector(sq.dir, -1100); s.pos.y += 120;
    const T=sq.pos, up=s.pos.clone().set(0,1,0), z=s.pos.clone().sub(T).normalize(), x=up.clone().cross(z).normalize(), y=z.clone().cross(x);
    const e=[x.x,y.x,z.x,x.y,y.y,z.y,x.z,y.z,z.z], tr=e[0]+e[4]+e[8], S2=Math.sqrt(tr+1)*2;
    s.quat.set((e[7]-e[5])/S2,(e[2]-e[6])/S2,(e[3]-e[1])/S2,0.25*S2); s.throttle=0.1; s.speed=30; s.vel.set(0,0,0);
    for(let i=0;i<20;i++) R.step(1/30); R.draw(); return R.G.comms.map(c=>c.text).slice(-1)[0] + ' | prompt=' + (R.G.prompt&&R.G.prompt.label); })()`).then(console.log);
  await sleep(300);
  await ev("(()=>{const R=window.__relic; for(let i=0;i<60;i++) R.step(1/30); R.draw(); return 1;})()");
  await shot(S + '/e1-strike-group.png');
  await ev(botSrc);
  const fight = async (idx, relic) => {
    await ev("(()=>{const R=window.__relic; R.G.relics.kessa=" + relic + "; R.ship.hull=1; R.ship.shield=1; R.G.state='flight'; document.getElementById('event').classList.remove('show'); R.startAssault(R.G.squads[" + idx + "]); return 1;})()");
    await sleep(1200);
    const lvl = await ev("window.__relic.assault.debug.S.level + ' waves=' + window.__relic.assault.debug.S.waves.length");
    let r;
    for (let i = 0; i < 60; i++) {
      r = await ev("(()=>{const R=window.__relic; for(let i=0;i<120;i++){ if(R.G.state!=='assault') break; R.step(1/30);} const A=R.assault.debug; return A.S ? JSON.stringify({t:+A.S.time.toFixed(0), wave:A.S.wave+1, hull:Math.round(A.player.hull)}) : 'END';})()");
      if (r === 'END') break;
      globalThis.last = r;
    }
    await sleep(1000);
    console.log('level ' + lvl + ' -> last ' + globalThis.last + ' | ' + await ev("document.getElementById('event-kicker').textContent + ' / ' + document.getElementById('event-text').textContent.slice(0,90)"));
  };
  await fight(0, false);  // L1
  await fight(2, false);  // L2
  await fight(6, false);  // L3
  await fight(7, true);   // L3 + relic = L4
  console.log('wayshards', await ev("window.__relic.G.wayshards"));
  await ev("(()=>{const R=window.__relic; R.G.relics.kessa=false; R.G.state='flight'; document.getElementById('event').classList.remove('show'); for(let i=0;i<5;i++) R.step(1/30); R.draw(); return 1;})()");
  await shot(S + '/e2-cockpit.png');
};
