// Creature deaths: the body bursts into its own parts, which tumble, bounce and burn,
// with a fireball, sparks, a smoke plume, a short flash of light and a scorch on the ground.
// Parts reuse the creature's own geometry and materials, so a death compiles no new shaders.
import * as THREE from 'three';
import { VLight } from './lightpool.js';

const rand = (a, b) => a + Math.random() * (b - a);
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), m4 = new THREE.Matrix4();
const MAX_GIBS = 90, N_SCORCH = 8, GRAV = 16;

// smoke: soft, normally blended puffs that rise, spread and thin out
function makeSmoke(N) {
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
  const vel = new Float32Array(N * 3), life = new Float32Array(N), max = new Float32Array(N), s0 = new Float32Array(N), a0 = new Float32Array(N);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { pr: { value: 1.5 } },
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; varying float vS;
      uniform float pr;
      void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*pr*(420.0/max(1.0,-mv.z)); vS=position.x*1.7+position.z*2.3; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; varying float vS;
      void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d)*2.0; if(r>1.0) discard;
        float lump=0.82+0.18*sin(atan(d.y,d.x)*5.0+vS)*sin(r*7.0+vS);
        float a=smoothstep(1.0,0.25,r*lump)*vA; gl_FragColor=vec4(vC*(0.75+0.25*(1.0-r)), a); }`,
    transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false; pts.renderOrder = 2;
  let next = 0;
  return {
    pts, mat,
    emit(p, n, o) {
      for (let k = 0; k < n; k++) {
        const i = next; next = (next + 1) % N;
        v1.set(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize().multiplyScalar(rand(o.speed * 0.3, o.speed));
        pos[i * 3] = p.x + rand(-o.spread, o.spread); pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z + rand(-o.spread, o.spread);
        vel[i * 3] = v1.x; vel[i * 3 + 1] = v1.y + (o.rise || 0); vel[i * 3 + 2] = v1.z;
        const c = o.colors[(Math.random() * o.colors.length) | 0], sh = rand(0.8, 1.15);
        col[i * 3] = c[0] * sh; col[i * 3 + 1] = c[1] * sh; col[i * 3 + 2] = c[2] * sh;
        max[i] = life[i] = rand(o.life * 0.6, o.life);
        s0[i] = size[i] = rand(o.size * 0.6, o.size);
        a0[i] = o.alpha ?? 0.7; alpha[i] = 0;
      }
    },
    update(dt) {
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) { alpha[i] = 0; continue; }
        life[i] -= dt;
        const f = Math.exp(-1.6 * dt);
        vel[i * 3] *= f; vel[i * 3 + 2] *= f; vel[i * 3 + 1] = vel[i * 3 + 1] * f + 1.4 * dt; // buoyant
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const k = Math.max(0, life[i] / max[i]), age = 1 - k;
        alpha[i] = a0[i] * Math.min(1, age * 8) * k * k;
        size[i] = s0[i] * (1 + age * 2.6);
      }
      g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true;
      g.attributes.size.needsUpdate = true; g.attributes.color.needsUpdate = true;
    },
    clear() { life.fill(0); alpha.fill(0); g.attributes.alpha.needsUpdate = true; },
  };
}

function scorchTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(0,0,0,0.92)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  // ragged spokes so it reads as a blast mark, not a disc
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * 6.28, r0 = 30 + Math.random() * 18;
    x.fillStyle = `rgba(0,0,0,${0.3 + Math.random() * 0.5})`;
    x.beginPath(); x.arc(64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0, 4 + Math.random() * 9, 0, 6.28); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createDeathFx({ root, terrain, fx }) {
  const smoke = makeSmoke(700);
  root.add(smoke.pts);
  // one pooled flash light, always in the scene so a death never changes the light count
  const flash = new VLight('#ff8a3a', 0, 22, 2);
  root.add(flash);
  let flashI = 0;

  const scorchTex = scorchTexture();
  const scorches = [];
  for (let i = 0; i < N_SCORCH; i++) {
    const geo = new THREE.PlaneGeometry(1, 1, 6, 6).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: scorchTex, color: '#000000', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, opacity: 0 });
    const m = new THREE.Mesh(geo, mat); m.visible = false; m.renderOrder = 1; root.add(m);
    scorches.push({ m, t: 0 });
  }
  let nextScorch = 0;
  function scorch(x, z, r) {
    const s = scorches[nextScorch]; nextScorch = (nextScorch + 1) % N_SCORCH;
    const p = s.m.geometry.attributes.position, base = new THREE.PlaneGeometry(1, 1, 6, 6).rotateX(-Math.PI / 2).attributes.position;
    const a = Math.random() * 6.28, ca = Math.cos(a), sa = Math.sin(a);
    for (let i = 0; i < p.count; i++) {
      const lx = base.getX(i) * r * 2, lz = base.getZ(i) * r * 2;
      const wx = x + lx * ca - lz * sa, wz = z + lx * sa + lz * ca;
      p.setXYZ(i, wx, terrain.heightAt(wx, wz) + 0.05, wz); // hugs the ground
    }
    p.needsUpdate = true; s.m.geometry.computeBoundingSphere();
    s.t = 14; s.m.visible = true;
  }

  const gibs = [];
  const fires = []; // short-lived burning spots where a body fell

  function burst(c) {
    const big = !!(c.k && c.k.big);
    const cy = c.y + (big ? 1.1 : 0.4);
    v1.set(c.x, cy, c.z);
    if (c.k && c.k.veil) { veilBurst(c, big, cy); return gibParts(c, big, true); }
    if (c.k && c.k.ice) { iceBurst(c, big, cy); return gibParts(c, big, true); }
    // fire: a white-hot core, a fireball, then sparks
    fx.emit(v1, 3, { raw: true, speed: 1, life: 0.14, size: big ? 7 : 4, colors: [[4, 2.6, 1.2]], drag: 6 });
    fx.emit(v1, big ? 30 : 14, { raw: true, speed: big ? 7 : 4.5, life: 0.5, size: big ? 2.6 : 1.6, colors: [[1.8, 0.6, 0.1], [1.6, 0.9, 0.25], [2.2, 0.5, 0.08]], drag: 3.2, dir: v2.set(0, big ? 2.5 : 1.5, 0) });
    fx.emit(v1, big ? 50 : 24, { raw: true, speed: big ? 18 : 12, life: 1.1, size: 0.6, colors: [[4, 2, 0.5], [3.5, 1.1, 0.2]], drag: 1.1, dir: v2.set(0, 4, 0) });
    // smoke: a dark ball that boils up after the flash
    smoke.emit(v1, big ? 22 : 10, { speed: big ? 4 : 2.5, spread: big ? 0.8 : 0.4, rise: 1.5, life: big ? 3.6 : 2.6, size: big ? 4.5 : 2.6, alpha: 0.75, colors: [[0.09, 0.075, 0.065], [0.16, 0.13, 0.11], [0.05, 0.045, 0.04]] });
    flash.color.set('#ff8a3a');
    flashI = big ? 90 : 30; flash.position.set(c.x, cy + 0.8, c.z); flash.intensity = flashI;
    fires.push({ x: c.x, z: c.z, y: terrain.heightAt(c.x, c.z), t: big ? 2.4 : 1.3, big });
    scorch(c.x, c.z, big ? 2.4 : 1.2);
    gibParts(c, big, false);
  }

  // Vireo's creatures come apart into the fog: a violet flash and a slow mist, no fire, no scorch
  function veilBurst(c, big) {
    fx.emit(v1, 3, { raw: true, speed: 1, life: 0.16, size: big ? 6 : 3.5, colors: [[2.6, 1.4, 4]], drag: 6 });
    fx.emit(v1, big ? 40 : 18, { raw: true, speed: big ? 9 : 6, life: 1.0, size: big ? 0.8 : 0.55, colors: [[1.6, 0.8, 2.8], [2.2, 1.4, 3.2], [1.0, 0.5, 2.0]], drag: 1.6, dir: v2.set(0, 1.5, 0) });
    smoke.emit(v1, big ? 18 : 8, { speed: big ? 2.5 : 1.6, spread: big ? 0.9 : 0.5, rise: 0.4, life: big ? 2.6 : 1.8, size: big ? 3.8 : 2.2, alpha: 0.45, colors: [[0.42, 0.3, 0.6], [0.32, 0.22, 0.48]] });
  }
  // Thalor's creatures shatter: a cold flash, a spray of ice shards and a puff of frost; no fire, no scorch
  function iceBurst(c, big, cy) {
    fx.emit(v1, 3, { raw: true, speed: 1, life: 0.14, size: big ? 6 : 3.5, colors: [[2.6, 3.4, 4]], drag: 6 });
    fx.emit(v1, big ? 60 : 26, { raw: true, speed: big ? 14 : 9, life: 0.9, size: big ? 0.9 : 0.6, colors: [[1.6, 2.4, 3], [2.4, 2.8, 3.2], [1.1, 1.8, 2.4]], drag: 1.4, dir: v2.set(0, 3.5, 0) });
    smoke.emit(v1, big ? 16 : 8, { speed: big ? 3 : 2, spread: big ? 0.8 : 0.4, rise: 0.5, life: big ? 2.2 : 1.6, size: big ? 3.6 : 2, alpha: 0.5, colors: [[0.82, 0.88, 0.93], [0.7, 0.78, 0.86]] });
    flash.color.set('#9fe6ff');
    flashI = big ? 60 : 20; flash.position.set(c.x, cy + 0.8, c.z); flash.intensity = flashI;
  }

  function gibParts(c, big, ice) {

    // parts: the creature's own meshes, biggest first, flung out from the body's centre
    c.g.updateMatrixWorld(true); root.updateMatrixWorld();
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    // the creature's original pieces (it is drawn merged), placed where its pose has them now
    const parts = [];
    if (c.gibParts) for (const p of c.gibParts) parts.push({ geometry: p.geometry, material: p.material, matrixWorld: new THREE.Matrix4().multiplyMatrices(p.anchor.matrixWorld, p.local) });
    else c.g.traverse((o) => { if (o.isMesh) parts.push(o); });
    for (const o of parts) if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    parts.sort((a, b) => b.geometry.boundingSphere.radius - a.geometry.boundingSphere.radius);
    const n = Math.min(parts.length, big ? 14 : 7);
    for (let i = 0; i < n; i++) {
      const o = parts[i], bs = o.geometry.boundingSphere;
      const piv = new THREE.Group();
      m4.multiplyMatrices(inv, o.matrixWorld).decompose(piv.position, piv.quaternion, piv.scale);
      const m = new THREE.Mesh(o.geometry, o.material);
      m.position.copy(bs.center).negate(); m.castShadow = true;
      piv.add(m);
      piv.position.add(v2.copy(bs.center).multiply(piv.scale).applyQuaternion(piv.quaternion)); // pivot on the part's centre
      root.add(piv);
      v2.set(piv.position.x - c.x, 0, piv.position.z - c.z);
      if (v2.lengthSq() < 0.01) v2.set(rand(-1, 1), 0, rand(-1, 1));
      v2.normalize().multiplyScalar(rand(big ? 3 : 2, big ? 8 : 5));
      gibs.push({
        g: piv, r: bs.radius * piv.scale.x,
        vel: new THREE.Vector3(v2.x + c.vx * 0.5, rand(big ? 5 : 3.5, big ? 11 : 7), v2.z + c.vz * 0.5),
        axis: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), spin: rand(5, 15),
        t: 0, life: rand(3.2, 4.6), burn: !ice && Math.random() < 0.6 ? rand(0.7, 1.6) : 0, s0: piv.scale.x, rest: false, ice,
      });
    }
    while (gibs.length > MAX_GIBS) root.remove(gibs.shift().g);
  }

  const q = new THREE.Quaternion();
  function update(dt) {
    for (let i = gibs.length - 1; i >= 0; i--) {
      const b = gibs[i], p = b.g.position;
      b.t += dt;
      if (!b.rest) {
        b.vel.y -= GRAV * dt;
        p.addScaledVector(b.vel, dt);
        b.g.quaternion.premultiply(q.setFromAxisAngle(b.axis, b.spin * dt));
        const gy = terrain.heightAt(p.x, p.z) + b.r * 0.5;
        if (p.y < gy) {
          p.y = gy;
          if (b.vel.y < -1.5) { b.vel.y *= -0.32; b.vel.x *= 0.55; b.vel.z *= 0.55; b.spin *= 0.5; fx.emit(p, 2, { raw: true, speed: 2, life: 0.4, size: 0.9, colors: [b.ice ? [1.8, 2.4, 3] : [3, 1.2, 0.3]], drag: 3 }); }
          else { b.vel.set(0, 0, 0); b.rest = true; }
        }
      }
      // burning parts trail fire and smoke while they fly, and smoulder a little after
      if (b.t < b.burn) {
        if (Math.random() < dt * 30) fx.emit(p, 1, { raw: true, speed: 0.6, life: 0.3, size: 0.9, colors: [[1.6, 0.55, 0.1], [1.4, 0.75, 0.2]], drag: 2 });
        if (Math.random() < dt * 16) smoke.emit(p, 1, { speed: 0.4, spread: 0.05, rise: 0.8, life: 1.6, size: 1.0, alpha: 0.5, colors: [[0.1, 0.085, 0.075]] });
      } else if (b.rest && b.t < b.burn + 1.5 && Math.random() < dt * 3) smoke.emit(p, 1, { speed: 0.2, spread: 0.1, rise: 0.6, life: 1.8, size: 0.8, alpha: 0.35, colors: [[0.12, 0.1, 0.09]] });
      // then sink into the ground and go
      if (b.t > b.life - 0.8) { const k = Math.max(0.01, (b.life - b.t) / 0.8); b.g.scale.setScalar(b.s0 * k); }
      if (b.t > b.life) { root.remove(b.g); gibs.splice(i, 1); }
    }
    for (let i = fires.length - 1; i >= 0; i--) {
      const f = fires[i]; f.t -= dt;
      if (f.t <= 0) { fires.splice(i, 1); continue; }
      v1.set(f.x + rand(-0.5, 0.5) * (f.big ? 1.4 : 0.6), f.y + 0.2, f.z + rand(-0.5, 0.5) * (f.big ? 1.4 : 0.6));
      if (Math.random() < dt * (f.big ? 22 : 12)) fx.emit(v1, 1, { raw: true, speed: 0.6, life: 0.45, size: f.big ? 1.5 : 0.9, colors: [[1.3, 0.42, 0.07], [1.2, 0.65, 0.16]], drag: 1.5, dir: v2.set(0, 2.4, 0) });
      if (Math.random() < dt * (f.big ? 16 : 8)) smoke.emit(v1, 1, { speed: 0.5, spread: 0.2, rise: 1.6, life: 2.8, size: f.big ? 2.4 : 1.4, alpha: 0.65, colors: [[0.08, 0.07, 0.06], [0.14, 0.12, 0.1]] });
    }
    if (flash.intensity > 0) {
      flashI *= Math.exp(-7 * dt);
      const flick = fires.length ? 0.85 + Math.random() * 0.3 : 1;
      flash.intensity = flashI < 0.5 ? 0 : flashI * flick;
    }
    for (const s of scorches) if (s.t > 0) { s.t -= dt; s.m.material.opacity = Math.min(0.8, s.t / 4) ; if (s.t <= 0) s.m.visible = false; }
    smoke.update(dt);
  }

  function clear() {
    for (const b of gibs) root.remove(b.g);
    gibs.length = 0; fires.length = 0; smoke.clear(); flash.intensity = 0; flashI = 0;
    for (const s of scorches) { s.t = 0; s.m.visible = false; }
  }

  return { burst, update, clear, smoke };
}
