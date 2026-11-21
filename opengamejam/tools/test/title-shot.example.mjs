// Title backdrop capture (public/title/thalor.jpg). Taken with:
//   ROUGH=0.1 BLOOM=0.22 CAM="38,-15,3,300,-15,6,42" ROVER="-14,-11,1.3" OUT=<png> node tools/test/cdp.mjs tools/test/title-shot.example.mjs 2560 1440
// then: ffmpeg -i <png> -vf "eq=contrast=1.06:saturation=1.08" -q:v 3 public/title/thalor.jpg   (set S below first)
// Stage the Wayfarer and the rover on a Thalor shelf and shoot toward the low sun over the sea ice.
// env CAM = "back,side,up,lookAhead,lookSide,lookUp,fov" (metres from the ship, along / right of the sun line)
// env SPOT = "x,z,shipYaw"; ROVER = "along,right,yawOffset" from the ship
const S = 'C:/Users/rdbut/AppData/Local/Temp/claude/d4c6c4db40af19e9/6df3fd43-335d-46b9-a36d-2a0714fb478c/scratchpad';
const OUT = process.env.OUT || S + '/title-try.png';
const CAM = (process.env.CAM || '34,-10,4,60,-16,4,45').split(',').map(Number);
const SPOT = (process.env.SPOT || '-240,-144,0.6').split(',').map(Number);
const ROVER = (process.env.ROVER || '-10,-9,2.4').split(',').map(Number);
export default async ({ ev, shot, sleep, key, send }) => {
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/?hq' });
  await sleep(7000);
  await key('Enter'); await sleep(300); await key('Enter', 'keyUp'); await sleep(9500);
  await ev("(()=>{ const R=window.__relic; if (R.tutorial.active) R.tutorial.complete(); R.G.tutorialDone=true; const p=R.G.planets.find(p=>p.data.id==='thalor'); R.enterSurface(p, R.ship.pos.clone().sub(p.center).normalize()); return 1; })()");
  await sleep(1500);
  await ev("(()=>{const R=window.__relic; for(let i=0;i<30;i++) R.step(1/60); return 1;})()");
  await sleep(2500); // models
  await ev("(()=>{ const st=document.createElement('style'); st.textContent='body > *:not(#gl){visibility:hidden !important}'; document.head.appendChild(st); return 1; })()");
  const setup = `(()=>{
    const R=window.__relic, D=R.surface.debug, T=D.T, r=D.rover, ship=T.shipHolder.position;
    const SP=${JSON.stringify(SPOT)}, C=${JSON.stringify(CAM)}, RV=${JSON.stringify(ROVER)};
    ship.set(SP[0], T.terrain.heightAt(SP[0],SP[1])+2.6, SP[1]); T.shipHolder.rotation.y=SP[2];
    const sd=T.def.sky.sunDir, L=Math.hypot(sd[0],sd[2]); const dx=sd[0]/L, dz=sd[2]/L;
    const rx=-dz, rz=dx;
    const px=ship.x+dx*RV[0]+rx*RV[1], pz=ship.z+dz*RV[0]+rz*RV[1];
    r.pos.set(px, T.terrain.heightAt(px,pz)+1.2, pz); r.vel.set(0,0,0); r.ang.set(0,0,0);
    r.quat.setFromAxisAngle(r.pos.clone().set(0,1,0), Math.atan2(-dx,-dz)+RV[2]);
    window.__bot=(inp)=>{inp.drive=0; inp.moveX=0; inp.handbrake=true;};
    for(let i=0;i<90;i++) R.step(1/60);
    R.G.state='frozen'; T.fauna.hideAll(); T.beacon.visible=false; T.glyph.visible=false; { const Z=new (R.camera.matrixWorld.constructor)().makeScale(0,0,0); for (const b of T.rocks.list) if (Math.hypot(b.x-ship.x,b.z-ship.z)<90 && b.inst) { b.inst.setMatrixAt(b.idx, Z); b.inst.instanceMatrix.needsUpdate=true; } } D.mesh.body.traverse(o=>{ if (o.isSpotLight) o.intensity=0; }); T.lava.material.roughness=+(${process.env.ROUGH || 0.22}); R.post.bloom.strength=+(${process.env.BLOOM || 0.5}); R.post.bloom.radius=0.3; // the frame loop keeps drawing but stops moving the camera
    const cam=R.camera; cam.fov=C[6]; cam.updateProjectionMatrix();
    const cx=ship.x-dx*C[0]+rx*C[1], cz=ship.z-dz*C[0]+rz*C[1];
    cam.position.set(cx, Math.max(T.terrain.heightAt(cx,cz)+1.5, ship.y-2.6)+C[2], cz);
    cam.lookAt(ship.x+dx*C[3]+rx*C[4], ship.y+C[5], ship.z+dz*C[3]+rz*C[4]);
    R.draw();
    return [cam.position.toArray().map(v=>v.toFixed(1)).join(','), r.pos.toArray().map(v=>v.toFixed(1)).join(',')].join(' | ');
  })()`;
  console.log(await ev(setup));
  await sleep(1500);
  await shot(OUT);
};
