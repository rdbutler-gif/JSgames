const S = 'C:/Users/rdbut/AppData/Local/Temp/claude/d4c6c4db40af19e9/e69bc29e-f7b4-4892-80be-7b6014c58db8/scratchpad';
export default async ({ ev, shot, sleep, key, send }) => {
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await sleep(7000);
  await key('Enter'); await sleep(300); await key('Enter', 'keyUp'); await sleep(600);
  await ev("(()=>{ const R=window.__relic; R.G.upgrades.forgeplate=true; const p=R.G.planets[0]; R.enterSurface(p, R.ship.pos.clone().sub(p.center).normalize()); return 1; })()");
  await sleep(1500);
  await ev("(()=>{const D=window.__relic.surface.debug, r=D.rover, v=D.T.def.vault, T=D.T.terrain; r.pos.set(v.x-40, T.heightAt(v.x-40,v.z)+1.4, v.z); r.vel.set(0,0,0); r.ang.set(0,0,0); r.quat.setFromAxisAngle(r.pos.clone().set(0,1,0), -Math.PI/2); D.cam.pos.copy(r.pos); return 1;})()");
  await ev("(()=>{const R=window.__relic; for(let i=0;i<60;i++) R.step(1/60); R.surface.wakeGuardian(); return 1;})()");
  const st = "(()=>{const R=window.__relic, D=R.surface.debug, r=D.rover, t=D.T.titan; return 'titan '+t.state+'/'+t.act+' hp '+t.hp+' open '+t.open.toFixed(2)+' | hull '+Math.round(r.hull)+' obj '+D.S.obj+' aimlock '+D.aim.lock+' | '+(R.G.comms.slice(-1)[0]||{}).text?.slice(0,60);})()";
  // bot: circle the titan at ~32 m, aim camera at the titan, fire when the core is open
  await ev(`(()=>{window.__bot=(inp)=>{const D=window.__relic.surface.debug, r=D.rover, C=D.T.titan.centre, cam=D.cam;
    const dx=r.pos.x-C.x, dz=r.pos.z-C.z, d=Math.hypot(dx,dz); const a=Math.atan2(dz,dx)+0.5; const R0=window.__R0??18;
    const tx=C.x+Math.cos(a)*R0, tz=C.z+Math.sin(a)*R0;
    const f=r.pos.clone().set(0,0,-1).applyQuaternion(r.quat); const want=Math.atan2(-(tx-r.pos.x), -(tz-r.pos.z)); const head=Math.atan2(-f.x,-f.z); let e=want-head; e=Math.atan2(Math.sin(e),Math.cos(e));
    inp.drive=window.__drive??0.55; inp.moveX=Math.max(-1,Math.min(1,-e*2)); inp.handbrake=false;
    // camera: point the world yaw at the core
    const core=D.T.titan.corePos(r.pos.clone()); const cy=Math.atan2(-(core.x-r.pos.x), -(core.z-r.pos.z));
    let cyaw=cy-head; cyaw=Math.atan2(Math.sin(cyaw),Math.cos(cyaw)); const tc=core.clone().sub(cam.pos).normalize(); const ad=D.aim.dir; let ye=Math.atan2(tc.x,tc.z)-Math.atan2(ad.x,ad.z); ye=Math.atan2(Math.sin(ye),Math.cos(ye)); window.__yoff=(window.__yoff||0)+ye*0.3; cam.yaw=cyaw+window.__yoff; /* corrects the chase-camera lag while circling */ window.__eerr=Math.asin(D.aim.dir.y)-Math.asin(tc.y); cam.elev=Math.max(-0.32,Math.min(1.2,cam.elev+window.__eerr*0.3)); inp.lookX=0; inp.lookY=0;
    inp.gun = window.__fire ?? (D.T.titan.open>0.5); if (D.S.prompt && D.S.prompt.type==='core') inp.pressed.add('accept'); };return 1;})()`);
  for (let k = 0; k < (globalThis.MAXK||90); k++) {
    await ev("(()=>{const R=window.__relic; for(let i=0;i<60;i++) R.step(1/60); R.draw(); return 1;})()");
    console.log(k, await ev(st));
    if (k === 1) await shot(S + '/t1-rising.png');
    if (k === 6) await shot(S + '/t2-fight.png');
    if (k === 14) await ev('window.__R0=12'); if (k === 22) await ev('window.__R0=32');
    if (k >= 14 && k < 22) { const a = await ev('window.__relic.surface.debug.T.titan.act'); if (a === 'slam' && !globalThis.sl) { globalThis.sl = 1; await shot(S + '/t5-slam.png'); } }
    const open = await ev("window.__relic.surface.debug.T.titan.open");
    if (open > 0.8 && !globalThis.shotOpen) { globalThis.shotOpen = 1; await shot(S + '/t3-open.png'); }
    const st2 = await ev("window.__relic.surface.debug.T.titan.state");
    if (st2 === 'dead' || st2 === 'dormant') break;
  }
  await shot(S + '/t4-end.png');
};
