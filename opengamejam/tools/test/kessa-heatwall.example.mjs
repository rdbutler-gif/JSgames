const S = 'C:/Users/rdbut/AppData/Local/Temp/claude/d4c6c4db40af19e9/159cd694-8e25-4db9-9f13-f0dd839b7753/scratchpad';
export default async ({ ev, shot, sleep, key, send }) => {
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await sleep(7000);
  await key('Enter'); await sleep(300); await key('Enter', 'keyUp'); await sleep(600);
  await ev("(()=>{ const R=window.__relic; const p=R.G.planets[0]; R.enterSurface(p, R.ship.pos.clone().sub(p.center).normalize()); return 1; })()");
  await sleep(1500);
  // drive the causeway toward the vault, unplated, full throttle, steering at the vault
  await ev("import('/src/terrain.js').then(m=>{ const c=m.SURFACES.kessa.causeways[0]; const q=m.pathPoint(c.pts, 380); window.__tp=q; return 1; })");
  await ev("(()=>{const D=window.__relic.surface.debug, r=D.rover, T=D.T.terrain, q=window.__tp; r.pos.set(q.x, T.heightAt(q.x,q.z)+1.4, q.z); r.vel.set(0,0,0); r.ang.set(0,0,0); r.quat.setFromAxisAngle(r.pos.clone().set(0,1,0), Math.atan2(-q.dx, -q.dz)); D.cam.pos.copy(r.pos); return 1;})()");
  const st = "(()=>{const R=window.__relic, D=R.surface.debug, r=D.rover, v=D.T.def.vault; return 'toVault '+Math.round(Math.hypot(r.pos.x-v.x,r.pos.z-v.z))+' hull '+Math.round(r.hull)+' obj '+D.S.obj+' kmh '+Math.round(r.speed*3.6)+' wren: '+(R.G.comms.slice(-1)[0]||{}).text?.slice(0,50);})()";
  await ev("import('/src/terrain.js').then(m=>{ window.__pp=m; return 1; })");
  await ev("(()=>{window.__bot=(inp)=>{const m=window.__pp, D=window.__relic.surface.debug, r=D.rover, c=m.SURFACES.kessa.causeways[0]; const info=m.pathInfo(c.pts, r.pos.x, r.pos.z); let tgt=m.pathPoint(c.pts, info.t+25); if (info.t+25>info.length) tgt=D.T.def.vault; const f=r.pos.clone().set(0,0,-1).applyQuaternion(r.quat); const want=Math.atan2(-(tgt.x-r.pos.x), -(tgt.z-r.pos.z)); const head=Math.atan2(-f.x,-f.z); let e=want-head; e=Math.atan2(Math.sin(e),Math.cos(e)); inp.drive=0.8; inp.moveX=Math.max(-1,Math.min(1,-e*2)); inp.handbrake=false;}; return 1;})()");
  for (let k = 0; k < 14; k++) {
    await ev("(()=>{const R=window.__relic; for(let i=0;i<60;i++) R.step(1/60); R.draw(); return 1;})()");
    console.log(await ev(st));
    if (k === 3) await shot(S + '/j1-banner.png');
    if (k === 8) await shot(S + '/j2-heatwall.png');
  }
};
