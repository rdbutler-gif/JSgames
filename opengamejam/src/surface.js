// Phase III: the rover on a planet surface. Raycast-vehicle physics on the shared heightfield,
// a chase camera the player can orbit, the landing pad with the Wayfarer parked, and the vault beacon.
import * as THREE from 'three';
import { createTerrain, SURFACES, pathInfo, pathPoint } from './terrain.js';
import { makeParticles } from './assault.js';
import { cloneModel, onModel, hasModel } from './models.js';
import { settings } from './settings.js';
import { sfx, lanceHum } from './audio.js';
import { createTitan, TITAN_HP } from './guardian.js';
import { createFauna } from './fauna.js';
import { VLight, createLightPool } from './lightpool.js';

const clamp = THREE.MathUtils.clamp;
const FONT = '"Chakra Petch", sans-serif';
const CYAN = '110,242,255', AMBER = '255,179,90', RED = '255,77,109', GOLD = '255,211,106';

// Tuning, per unit mass (so forces are accelerations).
const R = {
  gravity: 14,
  wheelR: 0.48, rest: 0.62, travel: 0.42,
  spring: 15, damp: 2.6,
  grip: 7.5, mu: 1.25,
  engine: 10.5, topSpeed: 25, reverseTop: 9, brake: 14, roll: 0.03,
  steerMax: 0.55, steerFast: 0.13, steerRate: 4,
  keel: 7, keelDamp: 2.4, // self-righting: keeps it wheels-down through turns, still flips on a bad landing
  inertia: new THREE.Vector3(1.7, 2.2, 0.85), // local x (pitch), y (yaw), z (roll)
  airTorque: 2.2,
};
// wheel mounts in chassis space (x right, y up, z forward is -Z)
const MOUNTS = [[-1.15, -0.25, -1.35], [1.15, -0.25, -1.35], [-1.15, -0.25, 1.35], [1.15, -0.25, 1.35]];
const FRONT = [true, true, false, false];
// chassis hull points that must stay above ground (keeps a flipped rover out of the rock)
const HULL_PTS = [[-1.1, -0.35, -1.9], [1.1, -0.35, -1.9], [-1.1, -0.35, 1.9], [1.1, -0.35, 1.9], [-1, 0.9, -0.6], [1, 0.9, -0.6], [-1, 0.9, 0.9], [1, 0.9, 0.9]];

// where the generated body sits relative to the physics chassis (tuned so the arches clear the wheels)
const ROVER_FIT = { offset: new THREE.Vector3(0, -0.15, 0.05) };
const TURRET_POS = new THREE.Vector3(0, 0.6, 0.15); // seated on the generated cab roof (roof top ~0.53 at z -0.2..0.45)
// The crosshair sits above screen centre so the rover never covers it; the aim ray goes through it.
const AIM_NDC_Y = 0.2;
const ARENA_R = 64;
let shadowSize = 2048; // set by the graphics quality level
// Special weapons: one is selected at a time (held on right mouse, Q or LB). Only the heat lance exists so far.
// The lance burns whatever the beam touches, harder the longer it stays on one target, and overheats.
const SPECIALS = {
  lance: { name: 'HEAT LANCE', range: 75, heatPerSec: 1 / 3.2, coolPerSec: 0.32, restart: 0.3, dps: [3, 9], rampT: 1.0 },
};

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
const q1 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

function makeSky(def) {
  const g = new THREE.SphereGeometry(4000, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(def.sky.top) }, hor: { value: new THREE.Color(def.sky.horizon) }, sunDir: { value: new THREE.Vector3(...def.sky.sunDir).normalize() }, sunCol: { value: new THREE.Color(def.sky.sun) } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top, hor, sunDir, sunCol; varying vec3 vD;
      void main(){ float h = clamp(vD.y, -0.2, 1.0);
        vec3 c = mix(hor, top, pow(max(h, 0.0), 0.45));
        c = mix(c, hor * 0.5, smoothstep(0.0, -0.2, vD.y));
        float s = max(dot(vD, sunDir), 0.0);
        c += sunCol * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.35);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  return new THREE.Mesh(g, m);
}

function makeLava(def, size) {
  const m = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 } }]),
    vertexShader: `varying vec2 vP; #include <fog_pars_vertex>
      void main(){ vP = position.xz; vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mvPosition; #include <fog_vertex> }`,
    fragmentShader: `uniform float time; varying vec2 vP; #include <fog_pars_fragment>
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){ vec2 p = vP * 0.05;
        float a = n(p + vec2(time*0.05, time*0.03)) * 0.6 + n(p*2.7 - vec2(time*0.08, -time*0.04)) * 0.4;
        float crust = smoothstep(0.42, 0.62, a);
        // just over the bloom threshold in the hottest seams; most of the surface is dark crust
        vec3 hot = mix(vec3(2.0, 0.5, 0.06), vec3(2.6, 1.15, 0.22), n(p*6.0 + time*0.2));
        vec3 c = mix(hot, vec3(0.09, 0.03, 0.02), crust);
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }`,
  });
  // the shader chunk includes need line breaks
  m.vertexShader = m.vertexShader.replace(/#include <([a-z_]+)>/g, '\n#include <$1>\n');
  m.fragmentShader = m.fragmentShader.replace(/#include <([a-z_]+)>/g, '\n#include <$1>\n');
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), m);
  mesh.position.y = def.lava;
  return mesh;
}

function makeRocks(terrain, def, count) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { v1.fromBufferAttribute(p, i); v1.multiplyScalar(0.75 + Math.random() * 0.45); p.setXYZ(i, v1.x, v1.y * 0.75, v1.z); }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: '#2e2622', roughness: 0.9, flatShading: true });
  const inst = new THREE.InstancedMesh(geo, mat, count);
  inst.castShadow = true; inst.receiveShadow = true;
  const list = [];
  const m4 = new THREE.Matrix4();
  let k = 0, tries = 0;
  while (k < count && tries++ < count * 20) {
    const x = (Math.random() - 0.5) * terrain.size * 0.85, z = (Math.random() - 0.5) * terrain.size * 0.85;
    const h = terrain.heightAt(x, z);
    if (h < def.lava + 1.5) continue;
    if (Math.hypot(x - def.pad.x, z - def.pad.z) < def.pad.r * 1.5) continue;
    if (Math.hypot(x - def.vault.x, z - def.vault.z) < 72) continue; // keep the guardian arena clear
    if (onRoad(def, x, z, 7)) continue; // causeways and the canyon ridge stay drivable
    const big = Math.random() < 0.18;
    const r = big ? 2.2 + Math.random() * 3.8 : 0.25 + Math.random() * 0.45;
    q1.setFromEuler(new THREE.Euler(Math.random() * 0.4, Math.random() * 6.28, Math.random() * 0.4));
    m4.compose(new THREE.Vector3(x, h + r * (big ? 0.25 : -0.1), z), q1, new THREE.Vector3(r, r, r));
    inst.setMatrixAt(k++, m4);
    if (big) list.push({ x, z, y: h, r: r * 0.9, idx: k - 1, hp: Math.ceil(r * 2.2), max: Math.ceil(r * 2.2), m: m4.clone() });
  }
  inst.count = k;
  return { inst, list };
}

// true if (x,z) lies on a causeway or the canyon ridge road, plus a margin
function onRoad(def, x, z, margin) {
  for (const c of def.causeways || []) if (pathInfo(c.pts, x, z).d < c.half + margin) return true;
  if (def.canyon && pathInfo(def.canyon.pts, x, z).d < def.canyon.half + margin) return true;
  return false;
}

function makeEmbers() {
  const N = 400, pos = new Float32Array(N * 3), P = [];
  for (let i = 0; i < N; i++) P.push(new THREE.Vector3((Math.random() - 0.5) * 120, Math.random() * 40, (Math.random() - 0.5) * 120));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.PointsMaterial({ color: new THREE.Color(3, 1.2, 0.3), size: 0.18, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return {
    pts,
    update(dt, centre, t) {
      for (let i = 0; i < N; i++) {
        const p = P[i];
        p.y += dt * (1.2 + (i % 7) * 0.3); p.x += Math.sin(t * 0.7 + i) * dt * 0.6;
        if (p.y > 40) p.y = 0;
        pos[i * 3] = centre.x + p.x; pos[i * 3 + 1] = centre.y - 5 + p.y; pos[i * 3 + 2] = centre.z + p.z;
      }
      g.attributes.position.needsUpdate = true;
    },
  };
}

function makeRoverMesh() {
  const g = new THREE.Group();
  const std = (c, r = 0.62, m = 0.15) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const white = std('#c4bdb0'), teal = std('#23857f'), orange = std('#d9771f'), dark = std('#26292e', 0.8, 0.3);
  const body = new THREE.Group();
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.55, 3.7), white); chassis.position.y = 0.15; body.add(chassis);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.2, 3.3), dark); skirt.position.y = -0.18; body.add(skirt);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.75, 1.5), white); cab.position.set(0, 0.75, -0.25); body.add(cab);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.4, 1.5) }));
  glass.position.set(0, 0.85, -1.0); glass.rotation.x = -0.35; body.add(glass);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.12, 3.72), teal); stripe.position.y = 0.32; body.add(stripe);
  for (const s of [-1, 1]) {
    const hz = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.9), orange); hz.position.set(s * 1.06, 0.2, -1.5); body.add(hz);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.8, 2.2) }));
    lamp.position.set(s * 0.65, 0.3, -1.88); body.add(lamp);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 0.3, 0.2) }));
    tail.position.set(s * 0.75, 0.3, 1.88); body.add(tail);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.12), dark); bar.position.set(0, 1.2, 0.6); body.add(bar);
  for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), dark); post.position.set(s * 0.8, 0.85, 0.6); body.add(post); }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9), dark); mast.position.set(0.6, 1.4, 1.2); body.add(mast);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 3, 3.5) })); tip.position.set(0.6, 1.88, 1.2); body.add(tip);
  body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const placeholder = [...body.children];
  g.add(body);
  // roof turret: yaw ring -> pitch cradle -> twin barrels along -Z
  const turret = new THREE.Group(); turret.position.copy(TURRET_POS); body.add(turret);
  const tStd = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.4 });
  const ringM = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.3, 12), tStd('#2b2e33')); ringM.position.y = -0.06; turret.add(ringM);
  const cradle = new THREE.Group(); cradle.position.y = 0.28; turret.add(cradle);
  cradle.add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.36, 0.7), tStd('#c4bdb0')));
  const stripeT = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.08, 0.72), tStd('#23857f')); stripeT.position.y = 0.1; cradle.add(stripeT);
  const barrels = [-1, 1].map((s) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 1.3, 8).rotateX(Math.PI / 2), tStd('#26292e'));
    b.position.set(s * 0.17, 0, -0.85); cradle.add(b);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.14, 8).rotateX(Math.PI / 2), tStd('#d9771f'));
    tip.position.z = -0.6; b.add(tip);
    return b;
  });
  turret.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const wheels = MOUNTS.map(() => {
    const pivot = new THREE.Group();
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(R.wheelR, R.wheelR, 0.42, 14), new THREE.MeshStandardMaterial({ color: '#1d1f23', roughness: 0.95 }));
    tyre.rotation.z = Math.PI / 2; tyre.castShadow = true; spin.add(tyre);
    for (let k = 0; k < 7; k++) { // tread blocks so you can see it turn
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.16), new THREE.MeshStandardMaterial({ color: '#2a2c31', roughness: 0.95 }));
      const a = (k / 7) * Math.PI * 2; b.position.set(0, Math.cos(a) * R.wheelR, Math.sin(a) * R.wheelR); b.rotation.x = -a; spin.add(b);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.44, 8), new THREE.MeshStandardMaterial({ color: '#d9771f', roughness: 0.5, metalness: 0.3 })); hub.rotation.z = Math.PI / 2; spin.add(hub);
    pivot.add(spin); g.add(pivot);
    return { pivot, spin };
  });
  // Swap in the generated body when it loads; wheels stay separate so they can spin and steer.
  onModel('rover', () => {
    const m = cloneModel('rover');
    placeholder.forEach((c) => body.remove(c));
    m.position.copy(ROVER_FIT.offset);
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    body.add(m);
  });
  return { group: g, body, wheels, turret, cradle, barrels };
}

// The Ember Core: a slow-turning heart of light with two orbiting rings.
function makeEmberCore() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.6, 0.8) }));
  g.add(core);
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 1), new THREE.MeshStandardMaterial({ color: '#3a2418', roughness: 0.4, metalness: 0.7, emissive: '#5a1e04', wireframe: true }));
  g.add(shell);
  const rings = [0, 1].map((i) => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(2.4 + i * 0.5, 0.07, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 1.6, 0.4) }));
    g.add(r); return r;
  });
  const light = new VLight('#ffa040', 80, 30, 1.5); g.add(light);
  g.visible = false;
  return { g, core, shell, rings, light };
}

export function createSurface(hooks) {
  const scene = new THREE.Scene();
  let T = null; // the active terrain bundle
  const built = new Map();
  const rover = {
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), quat: new THREE.Quaternion(), ang: new THREE.Vector3(),
    steer: 0, hull: 100, wheelSpin: [0, 0, 0, 0], comp: [0, 0, 0, 0], contact: [false, false, false, false],
    upsideT: 0, lavaT: 0, speed: 0,
  };
  const mesh = makeRoverMesh();
  const headlight = new THREE.SpotLight('#fff4e0', 40, 60, 0.5, 0.5, 1.2);
  headlight.position.set(0, 0.5, -1.9); headlight.target.position.set(0, -1.5, -14);
  mesh.body.add(headlight); mesh.body.add(headlight.target);
  const cam = { yaw: 0, elev: 0.3, dist: 9.5, idle: 0, pos: new THREE.Vector3(), look: new THREE.Vector3() };
  let S = null;

  function build(id) {
    if (built.has(id)) return built.get(id);
    const def = SURFACES[id];
    const root = new THREE.Group();
    const terrain = createTerrain(def);
    root.add(terrain.mesh);
    const sky = makeSky(def); root.add(sky);
    const lava = makeLava(def, def.size); root.add(lava);
    const rocks = makeRocks(terrain, def, 1400); root.add(rocks.inst);
    const embers = makeEmbers(); root.add(embers.pts);
    const sun = new THREE.DirectionalLight(def.sky.sun, 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 300 });
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
    root.add(sun); root.add(sun.target);
    root.add(new THREE.HemisphereLight('#ffb48a', '#3a120a', 0.9));
    const lavaGlow = new VLight('#ff6a1f', 0, 90, 1.6); root.add(lavaGlow);
    // landing pad: lit ring and the parked Wayfarer
    const pad = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(def.pad.r * 0.56, def.pad.r * 0.585, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.75, 0.85) }));
    ring.position.y = terrain.padH + 0.05; pad.add(ring);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.8, 0.25) }));
      l.position.set(Math.cos(a) * def.pad.r * 0.7, terrain.padH + 0.3, Math.sin(a) * def.pad.r * 0.7); pad.add(l);
    }
    const ship = cloneModel('player');
    const shipHolder = new THREE.Group();
    if (ship) { ship.scale.setScalar(0.75); shipHolder.add(ship); }
    shipHolder.position.set(def.pad.x + 6, terrain.padH + 2.6, def.pad.z + 4);
    shipHolder.rotation.y = 0.6;
    pad.add(shipHolder);
    root.add(pad);
    // vault beacon: a light column visible across the map
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 400, 12, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.7, 0.2), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beacon.position.set(def.vault.x, terrain.vaultH + 200, def.vault.z); root.add(beacon);
    const vaultBase = new THREE.Mesh(new THREE.CylinderGeometry(9, 11, 3, 6), new THREE.MeshStandardMaterial({ color: '#d8cdb8', roughness: 0.6, metalness: 0.2 }));
    vaultBase.position.set(def.vault.x, terrain.vaultH + 1, def.vault.z); vaultBase.castShadow = true; vaultBase.receiveShadow = true; root.add(vaultBase);
    const glyph = new THREE.Mesh(new THREE.TorusGeometry(6, 0.25, 6, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 1.4, 0.3) }));
    glyph.rotation.x = Math.PI / 2; glyph.position.set(def.vault.x, terrain.vaultH + 2.6, def.vault.z); root.add(glyph);
    root.add(mesh.group);
    // surface effects were authored while the particles were never stepped (so never seen); at full
    // strength they stack into white blobs, so colours are scaled down here. raw: true skips the scaling.
    const fxRaw = makeParticles(1600); fxRaw.mat.uniforms.pr.value = 1.5; root.add(fxRaw.pts);
    const FX_GAIN = 0.4;
    const fx = { ...fxRaw, emit: (p, n, o) => fxRaw.emit(p, n, o.raw ? o : { ...o, colors: o.colors.map((c) => c.map((v) => v * FX_GAIN)) }) };
    const geysers = [];
    const ventMat = () => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.35, 0.08) });
    const addGeyser = (x, z, period, phase, ring) => {
      const y = terrain.heightAt(x, z);
      const crack = new THREE.Mesh(new THREE.CircleGeometry(2.2, 7).rotateX(-Math.PI / 2), ventMat());
      crack.position.set(x, y + 0.08, z); root.add(crack);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.2, 16, 10, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.7, 0.15), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      col.position.set(x, y + 8, z); root.add(col);
      geysers.push({ x, z, y, period, phase, crack, col, ring, hitT: -9 });
    };
    if (def.canyon) {
      const C = def.canyon;
      [170, 240, 305, 370, 430, 490, 545].forEach((tt, i) => {
        const q = pathPoint(C.pts, tt);
        const side = i % 2 ? 1 : -1; // alternate sides of the road so you weave
        addGeyser(q.x - q.dz * side * 2.2, q.z + q.dx * side * 2.2, 4.2 + (i % 3) * 0.6, i * 1.3, false);
      });
    }
    // vent field around the vault: always hot, only Forgeplate gets through
    const ventRing = new THREE.Mesh(new THREE.RingGeometry(30, 56, 64, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.3, 0.06), transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }));
    ventRing.position.set(def.vault.x, terrain.vaultH + 0.12, def.vault.z); root.add(ventRing);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2, r = 36 + (i % 3) * 7;
      addGeyser(def.vault.x + Math.cos(a) * r, def.vault.z + Math.sin(a) * r, 2.6 + (i % 4) * 0.5, i * 0.7, true);
    }
    const geyserLight = new VLight('#ff7a2a', 0, 40, 1.5); root.add(geyserLight);

    // Forge Gate and the armory crate
    let forge = null;
    if (def.canyon) {
      const F = def.canyon.forge;
      const last = def.canyon.pts[def.canyon.pts.length - 1], prev = def.canyon.pts[def.canyon.pts.length - 2];
      const yaw = Math.atan2(last[0] - prev[0], last[1] - prev[1]);
      const gate = new THREE.Group();
      gate.position.set(F.x, terrain.heightAt(F.x, F.z), F.z);
      gate.rotation.y = yaw;
      const addGate = () => {
        const m = cloneModel('forgegate');
        if (!m) return;
        m.position.y = m.userData.size ? m.userData.size.y / 2 : 6.5;
        m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        gate.add(m);
      };
      onModel('forgegate', addGate);
      root.add(gate);
      // the pillars block; the opening is drivable
      const rgt = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      for (const s of [-1, 1]) rocks.list.push({ x: F.x + rgt.x * s * 4.9, z: F.z + rgt.z * s * 4.9, y: gate.position.y, r: 1.6 });
      const crate = new THREE.Group();
      crate.position.set(F.x, gate.position.y + 1.6, F.z);
      const fallback = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.5, 6), new THREE.MeshStandardMaterial({ color: '#d8cdb8', roughness: 0.5, metalness: 0.3, emissive: '#3a1400' }));
      crate.add(fallback);
      onModel('crate', () => { const m = cloneModel('crate'); if (m) { crate.remove(fallback); crate.add(m); } });
      const crateLight = new VLight('#ff8a3a', 25, 14, 1.6); crateLight.position.y = 1.5; crate.add(crateLight);
      root.add(crate);
      forge = { gate, crate, x: F.x, z: F.z, y: gate.position.y };
    }
    // the vault base is solid
    rocks.list.push({ x: def.vault.x, z: def.vault.z, y: terrain.vaultH, r: 10 });
    // guardian, its arena wall, and the relic
    const titan = createTitan({ root, def, terrain, fx });
    // heat curtain: bright at the ground, fading out by head height, with flickering streaks
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const cx2 = cv.getContext('2d');
    const grd = cx2.createLinearGradient(0, 64, 0, 0); grd.addColorStop(0, '#fff'); grd.addColorStop(0.35, '#777'); grd.addColorStop(1, '#000');
    cx2.fillStyle = grd; cx2.fillRect(0, 0, 256, 64);
    cx2.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 256; i += 4) { const k = 120 + Math.random() * 135; cx2.fillStyle = `rgb(${k},${k},${k})`; cx2.fillRect(i, 0, 4, 64); }
    const ctex = new THREE.CanvasTexture(cv); ctex.wrapS = THREE.RepeatWrapping; ctex.repeat.set(10, 1);
    const curtain = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_R, ARENA_R, 7, 96, 1, true), new THREE.MeshBasicMaterial({ map: ctex, color: new THREE.Color(2.4, 0.7, 0.15), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    curtain.position.set(def.vault.x, terrain.vaultH + 3.2, def.vault.z); curtain.visible = false; root.add(curtain);
    const ember = makeEmberCore(); root.add(ember.g);
    // turret bolts
    const boltGeo = new THREE.BoxGeometry(0.11, 0.11, 2.4);
    const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 2.6, 1.1) });
    const bolts = [];
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(boltGeo, boltMat); m.visible = false; root.add(m); bolts.push({ m, on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 0 }); }
    // heat lance: an orange sheath round a white-hot core, stretched from the turret to what it touches
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).rotateX(Math.PI / 2);
    const beamMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
    const lance = {
      glow: new THREE.Mesh(beamGeo, beamMat(new THREE.Color(2.0, 0.55, 0.1), 0.55)),
      core: new THREE.Mesh(beamGeo, beamMat(new THREE.Color(3.0, 2.1, 1.0), 1)),
      light: new VLight('#ff7a2a', 0, 18, 2),
    };
    for (const m of [lance.glow, lance.core]) { m.visible = false; m.frustumCulled = false; root.add(m); }
    root.add(lance.light);
    const fauna = createFauna({ root, def, terrain, fx });
    const b = { lance, def, root, terrain, sky, lava, rocks, embers, sun, lavaGlow, shipHolder, glyph, fx, geysers, geyserLight, ventRing, forge, titan, curtain, ember, bolts, fauna };
    b.lights = createLightPool(root, 3); b.lights.collect(); // every point light above is virtual; 3 real ones serve them
    built.set(id, b);
    return b;
  }

  function applyPlating() {
    mesh.body.traverse((o) => {
      if (!o.isMesh || !o.material || !o.material.emissive) return;
      if (!o.userData.baseEmissive) o.userData.baseEmissive = o.material.emissive.clone();
      o.material.emissive.copy(o.userData.baseEmissive);
      if (upgrades.forgeplate) o.material.emissive.add(new THREE.Color('#2a1206'));
    });
  }

  function placeAtPad() {
    const d = T.def;
    rover.pos.set(d.pad.x - 4, T.terrain.padH + 1.4, d.pad.z - 2);
    rover.vel.set(0, 0, 0); rover.ang.set(0, 0, 0);
    // face the vault
    const yaw = Math.atan2(-(d.vault.x - d.pad.x), -(d.vault.z - d.pad.z));
    rover.quat.setFromAxisAngle(UP, yaw);
    cam.yaw = 0; cam.elev = 0.3;
    cam.pos.copy(rover.pos).add(v1.set(0, 4, 10).applyQuaternion(rover.quat));
  }

  let upgrades = {};
  let relics = {};
  function enter(planetId, upgradeState, relicState) {
    upgrades = upgradeState || {};
    relics = relicState || {};
    T = build(planetId);
    scene.clear();
    scene.add(T.root);
    scene.fog = new THREE.FogExp2(T.def.sky.fog, T.def.sky.fogDensity);
    scene.background = null;
    rover.hull = 100;
    placeAtPad();
    const taken = !!relics[planetId];
    S = { time: 0, prompt: null, said: new Set(), hint: 9, hintMode: 'drive', lost: 0, planet: planetId, obj: taken ? 'return' : upgrades.forgeplate ? 'cross' : 'vault', fight: false, gunCd: 0, barrel: 0, recoil: [0, 0], aimLift: 0, special: 'lance', heat: 0, over: false, lanceOn: false, lanceT: 0, lanceTgt: null, rockAcc: 0 };
    if (T.forge) T.forge.crate.visible = !upgrades.forgeplate;
    T.titan.reset();
    T.fauna.reset(rover.pos, Math.atan2(-v1.set(0, 0, -1).applyQuaternion(rover.quat).x, -v1.z));
    S.hurtT = 0; S.prevHull = rover.hull; S.hitMark = 0;
    T.curtain.visible = false;
    T.ember.g.visible = false;
    T.bolts.forEach((b) => { b.on = false; b.m.visible = false; });
    T.glyph.visible = !taken;
    applyPlating();
    hooks.say('Rover is down. Kessa is basalt and lava. Stay off the bright ground.');
    S.practiceN = 0;
    if (!taken && !upgrades.turretTrained && T.fauna.meadow) {
      S.objAfter = S.obj; S.obj = 'practice';
      setTimeout(() => {
        if (!S || S.obj !== 'practice') return;
        hooks.say('Before we roll: the turret. Those cinder skitters by the pad are harmless, and they make good targets. Tag five.');
        S.hint = 14; S.hintMode = 'practice';
      }, 4500);
    }
    setTimeout(() => S && S.time < 12 && (S.obj === 'vault' || S.obj === 'cross') && hooks.say(upgrades.forgeplate
      ? 'Forgeplate is fitted. The vault is the light column, north-east. The vents cannot touch us now.'
      : 'The vault signal is that light column, north-east. The Wayfarer is on the pad when you want to lift off.'), 6000);
  }
  function exit() { lanceHum(false); if (T) { T.titan.reset(); T.fauna.hideAll(); } S = null; scene.clear(); }

  // ---------- the guardian fight ----------
  function wakeGuardian() {
    if (!S || S.fight) return;
    S.fight = true;
    setObj('guardian');
    T.curtain.visible = true;
    T.titan.wake(rover.pos);
    S.hint = 8; S.hintMode = 'gun';
    hooks.say('Something is climbing out of the shaft. A Warden foundry guardian. Its armour is too thick for us. Watch for the vents.');
  }
  function arenaRespawn() {
    const d = T.def;
    const a = Math.atan2(rover.pos.z - d.vault.z, rover.pos.x - d.vault.x);
    rover.pos.set(d.vault.x + Math.cos(a) * 52, 0, d.vault.z + Math.sin(a) * 52);
    rover.pos.y = ground(rover.pos.x, rover.pos.z) + 1.4;
    rover.vel.set(0, 0, 0); rover.ang.set(0, 0, 0);
    rover.quat.setFromAxisAngle(UP, Math.atan2(-(d.vault.x - rover.pos.x), -(d.vault.z - rover.pos.z)));
    cam.yaw = 0; cam.elev = 0.2;
  }
  const titanCtx = {
    rover,
    ground: (x, z) => ground(x, z),
    damage: (n) => { rover.hull -= n; sfx.playerHit(true); },
    burn: () => { rover.lavaT = 0.3; },
    shake: (k) => { S.shake = Math.max(S.shake || 0, k); },
    say: (line) => hooks.say(line),
    grounded: () => S.grounded > 0,
  };

  // Bolts fly from the muzzles toward the aim point; they test the Titan's shapes, then the ground.
  const aim = { p: new THREE.Vector3(), dir: new THREE.Vector3(), lock: false };
  const segA = new THREE.Vector3(), segB = new THREE.Vector3(), mz = new THREE.Vector3(), corePt = new THREE.Vector3();
  function updateAim(camera, device) {
    aim.dir.set(0, AIM_NDC_Y, 0.5).unproject(camera).sub(camera.position).normalize();
    aim.lock = false;
    // a little help onto an open core, more on a stick than on a mouse
    if (S.fight && T.titan.open > 0.6) {
      T.titan.corePos(corePt);
      v1.subVectors(corePt, camera.position).normalize();
      if (v1.angleTo(aim.dir) < (device === 'gamepad' ? 0.07 : 0.03)) { aim.p.copy(corePt); aim.lock = true; return; }
    }
    segA.copy(camera.position); segB.copy(camera.position).addScaledVector(aim.dir, 320);
    const h = T.titan.hitTest(segA, segB);
    if (h) { aim.p.copy(h.p); return; }
    // a light pull onto the nearest creature under the crosshair (stronger on a stick)
    {
      const lim = device === 'gamepad' ? 0.06 : 0.025;
      let best = lim, bc = null;
      for (const c of T.fauna.list) {
        if (!c.alive) continue;
        v1.set(c.x, c.y + (c.kind === 'hound' ? 1.1 : 0.45), c.z).sub(camera.position);
        const d = v1.length(); if (d > 140 || d < 4) continue;
        const ang = v1.divideScalar(d).angleTo(aim.dir);
        if (ang < best) { best = ang; bc = c; }
      }
      if (bc) { aim.p.set(bc.x, bc.y + (bc.kind === 'hound' ? 1.1 : 0.45), bc.z); aim.lock = true; return; }
    }
    const fh = T.fauna.hitTest(segA, segB), rh = rockHit(segA, segB);
    if (fh && (!rh || fh.u <= rh.u)) { aim.p.copy(fh.p); return; }
    if (rh) { aim.p.copy(rh.p); return; }
    // march the ground, starting past the rover
    for (let s = cam.dist; s < 320; s += 2) {
      v1.copy(camera.position).addScaledVector(aim.dir, s);
      if (v1.y < ground(v1.x, v1.z)) { aim.p.copy(v1); return; }
    }
    aim.p.copy(segB);
  }
  // bolts vs big boulders: segment against a sphere around each rock's visible bulk
  const rockP = new THREE.Vector3(), rc = new THREE.Vector3(), rd = new THREE.Vector3(), rq = new THREE.Vector3();
  function rockHit(a, b) {
    rd.subVectors(b, a); const L2 = rd.lengthSq() || 1;
    const minX = Math.min(a.x, b.x) - 8, maxX = Math.max(a.x, b.x) + 8, minZ = Math.min(a.z, b.z) - 8, maxZ = Math.max(a.z, b.z) + 8;
    let best = 2, hit = null;
    for (const r of T.rocks.list) {
      if (r.idx === undefined || r.dead || r.x < minX || r.x > maxX || r.z < minZ || r.z > maxZ) continue;
      rc.set(r.x, r.y + r.r * 0.3, r.z);
      const u = clamp(rq.subVectors(rc, a).dot(rd) / L2, 0, 1);
      rq.copy(a).addScaledVector(rd, u);
      if (rq.distanceToSquared(rc) < r.r * r.r * 1.1 && u < best) { best = u; hit = r; rockP.copy(rq); }
    }
    return hit ? { r: hit, p: rockP, u: best } : null;
  }
  const m4b = new THREE.Matrix4(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), qs = new THREE.Quaternion();
  function hitRock(r, p) {
    r.hp -= 1;
    T.fx.emit(p, 5, { speed: 5, life: 0.5, size: 1.1, colors: [[3, 2, 1], [0.45, 0.38, 0.33]], drag: 3 });
    r.m.decompose(ps, qs, sc);
    const k = 0.75 + 0.25 * Math.max(0, r.hp / r.max); // shrinks a little as it is chipped
    T.rocks.inst.setMatrixAt(r.idx, m4b.compose(ps, qs, v1.copy(sc).multiplyScalar(r.hp > 0 ? k : 0.0001)));
    T.rocks.inst.instanceMatrix.needsUpdate = true;
    if (r.hp <= 0) {
      r.dead = true;
      v1.set(r.x, r.y + r.r * 0.4, r.z);
      T.fx.emit(v1, 50, { speed: 3 + r.r * 2.2, life: 1.2, size: 2 + r.r * 0.4, colors: [[0.45, 0.36, 0.3], [0.3, 0.24, 0.2], [3, 1.4, 0.4]], drag: 2 });
      T.fx.emit(v1, 16, { speed: 2, life: 2, size: 3 + r.r * 0.8, colors: [[0.35, 0.28, 0.24]], drag: 1, dir: v2.set(0, 2, 0) });
      sfx.explode(false);
      S.shake = Math.max(S.shake, clamp(1 - Math.hypot(r.x - rover.pos.x, r.z - rover.pos.z) / 60, 0, 0.5));
    }
  }

  function updateTurret(dt, inp) {
    // point the turret (in body space) at the aim point
    mesh.turret.getWorldPosition(v1);
    v2.subVectors(aim.p, v1).applyQuaternion(qInv.copy(rover.quat).invert());
    const yaw = Math.atan2(-v2.x, -v2.z);
    const pitch = clamp(Math.atan2(v2.y, Math.hypot(v2.x, v2.z)), -0.3, 0.95);
    let dy = yaw - mesh.turret.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    mesh.turret.rotation.y += dy * Math.min(1, dt * 14);
    mesh.cradle.rotation.x += (pitch - mesh.cradle.rotation.x) * Math.min(1, dt * 14);
    S.recoil[0] = Math.max(0, S.recoil[0] - dt * 2.5); S.recoil[1] = Math.max(0, S.recoil[1] - dt * 2.5);
    mesh.barrels.forEach((b, i) => { b.position.z = -0.85 + S.recoil[i]; });
    S.gunCd -= dt;
    if (inp.gun && S.gunCd <= 0 && !S.lanceOn) {
      S.gunCd = 1 / 7;
      const i = S.barrel = 1 - S.barrel;
      const bl = mesh.barrels[i];
      bl.updateMatrixWorld();
      bl.localToWorld(mz.set(0, 0, -0.72));
      const bolt = T.bolts.find((q) => !q.on);
      if (bolt) {
        // fly at the aim point from this muzzle, with a touch of spread
        v3.subVectors(aim.p, mz).normalize();
        v3.x += (Math.random() - 0.5) * 0.012; v3.y += (Math.random() - 0.5) * 0.012; v3.z += (Math.random() - 0.5) * 0.012;
        bolt.on = true; bolt.t = 0; bolt.p.copy(mz); bolt.v.copy(v3.normalize()).multiplyScalar(240).add(rover.vel);
        bolt.m.visible = true;
      }
      S.recoil[i] = 0.18;
      T.fx.emit(mz, 5, { speed: 4, life: 0.12, size: 0.9, colors: [[5, 3.4, 1.4]], drag: 6 });
      sfx.cannon();
    }
    for (const b of T.bolts) {
      if (!b.on) continue;
      b.t += dt;
      segA.copy(b.p); b.p.addScaledVector(b.v, dt); segB.copy(b.p);
      b.m.position.copy(b.p); b.m.lookAt(v1.copy(b.p).add(b.v));
      const h = T.titan.hitTest(segA, segB);
      if (h) { T.titan.onBolt(h, titanCtx); b.on = false; b.m.visible = false; continue; }
      const fh = T.fauna.hitTest(segA, segB), rh = rockHit(segA, segB);
      if (fh && (!rh || fh.u <= rh.u)) {
        const died = T.fauna.damage(fh.c, 1);
        S.hitMark = died ? 0.35 : 0.15;
        if (died) creatureKilled(fh.c);
        else sfx.hit();
        b.on = false; b.m.visible = false; continue;
      }
      if (rh) { hitRock(rh.r, rh.p); S.hitMark = 0.12; b.on = false; b.m.visible = false; continue; }
      if (b.p.y < ground(b.p.x, b.p.z) || b.t > 1.4) {
        if (b.t <= 1.4) T.fx.emit(v1.copy(b.p).setY(ground(b.p.x, b.p.z) + 0.2), 5, { speed: 4, life: 0.4, size: 1, colors: [[3, 2, 1], [0.5, 0.4, 0.35]], drag: 3 });
        b.on = false; b.m.visible = false;
      }
    }
  }

  function creatureKilled(c) {
    sfx.explode(false);
    if (c.kind === 'hound') faunaSay('hound-kill', 'Hound down. They are only following the heat. So are we.');
    else if (S.obj === 'practice') practiceKill();
  }

  // ---------- heat lance (the special weapon) ----------
  const lv = new THREE.Vector3(), lEnd = new THREE.Vector3();
  function updateLance(dt, inp) {
    const L = SPECIALS[S.special], B = T.lance;
    S.lanceOn = !!inp.special && !S.over;
    S.heat = S.lanceOn ? Math.min(1, S.heat + dt * L.heatPerSec) : Math.max(0, S.heat - dt * L.coolPerSec);
    if (S.heat >= 1 && !S.over) { S.over = true; S.lanceOn = false; sfx.overheat(); say1('lance-hot', 'Lance overheated. Let it cool, the cannon still works.'); }
    if (S.over && S.heat <= L.restart) { S.over = false; sfx.lanceReady(); }
    lanceHum(S.lanceOn, S.heat);
    if (!S.lanceOn) { B.glow.visible = B.core.visible = false; B.light.intensity = 0; S.lanceT = 0; S.lanceTgt = null; return; }
    // from between the barrels toward the aim point, cut short at the lance's reach
    mesh.barrels[0].updateMatrixWorld(); mesh.barrels[1].updateMatrixWorld();
    mesh.barrels[0].localToWorld(v1.set(0, 0, -0.72)); mesh.barrels[1].localToWorld(v2.set(0, 0, -0.72));
    mz.addVectors(v1, v2).multiplyScalar(0.5);
    lv.subVectors(aim.p, mz); const full = lv.length() || 1; lv.divideScalar(full);
    let end = Math.min(full, L.range);
    segA.copy(mz); segB.copy(mz).addScaledVector(lv, end + 0.8);
    // what does it touch first?
    let tgt = null, kind = null, hit = null;
    const th = T.titan.hitTest(segA, segB);
    if (th) { const d = th.p.distanceTo(mz); if (d <= end + 0.8) { end = d; tgt = T.titan; kind = 'titan'; hit = th; } }
    const fh = T.fauna.hitTest(segA, segB);
    if (fh) { const d = fh.p.distanceTo(mz); if (d < end + 0.8 && (!tgt || d < end)) { end = d; tgt = fh.c; kind = 'fauna'; hit = fh; } }
    const rh = rockHit(segA, segB);
    if (rh) { const d = rh.p.distanceTo(mz); if (d < end + 0.8 && (!tgt || d < end)) { end = d; tgt = rh.r; kind = 'rock'; hit = { p: rh.p.clone() }; } }
    // burn: the ramp builds while the beam stays on one target
    S.lanceT = tgt && tgt === S.lanceTgt ? S.lanceT + dt : 0;
    S.lanceTgt = tgt;
    const n = (L.dps[0] + (L.dps[1] - L.dps[0]) * clamp(S.lanceT / L.rampT, 0, 1)) * dt;
    if (kind === 'titan') { if (hit.kind === 'core') { T.titan.onBolt(hit, titanCtx, n, true); S.hitMark = 0.1; } }
    else if (kind === 'fauna') { S.hitMark = 0.1; if (T.fauna.damage(tgt, n, true)) creatureKilled(tgt); }
    else if (kind === 'rock') {
      S.rockAcc += n; S.hitMark = 0.08;
      while (S.rockAcc >= 1 && !tgt.dead) { S.rockAcc -= 1; hitRock(tgt, hit.p); }
    }
    // draw it
    lEnd.copy(mz).addScaledVector(lv, end);
    const fl = 0.8 + 0.2 * Math.sin(S.time * 63) * Math.sin(S.time * 41);
    for (const [m, w] of [[B.glow, (0.15 + S.heat * 0.07) * fl], [B.core, 0.045 * fl]]) {
      m.visible = true; m.position.addVectors(mz, lEnd).multiplyScalar(0.5); m.lookAt(lEnd); m.scale.set(w, w, end);
    }
    B.glow.material.color.setRGB(2.0 + S.heat * 0.6, 0.55 + S.heat * 0.4, 0.1 + S.heat * 0.15);
    B.light.position.copy(lEnd).addScaledVector(lv, -0.6); B.light.intensity = 22 * fl;
    T.fx.emit(lEnd, 2, { speed: 6, life: 0.35, size: 1.0, colors: [[6, 3, 1], [5, 1.6, 0.3]], drag: 3 });
    if (Math.random() < dt * 12) T.fauna.deathFx.smoke.emit(lEnd, 1, { speed: 0.6, spread: 0.2, rise: 1.2, life: 1.6, size: 1.1, alpha: 0.45, colors: [[0.12, 0.1, 0.09]] });
    S.recoil[0] = S.recoil[1] = 0.015 * Math.random(); // the barrels buzz
  }

  function updateFight(dt) {
    const d = T.def;
    // the arena wall: heat that pushes you back in while the guardian lives
    const toC = Math.hypot(rover.pos.x - d.vault.x, rover.pos.z - d.vault.z);
    T.curtain.material.opacity = S.fight ? 0.55 + 0.15 * Math.sin(S.time * 5) + clamp((toC - ARENA_R + 14) / 14, 0, 1) * 0.4 : 0;
    T.curtain.material.map.offset.x = S.time * 0.02;
    T.ventRing.visible = !S.fight && T.titan.state === 'dormant' && !relics[S.planet];
    if (S.fight && toC > ARENA_R - 3) {
      const nx = (rover.pos.x - d.vault.x) / toC, nz = (rover.pos.z - d.vault.z) / toC;
      const outv = rover.vel.x * nx + rover.vel.z * nz;
      if (outv > 0) { rover.vel.x -= nx * outv * 1.6; rover.vel.z -= nz * outv * 1.6; }
      rover.vel.x -= nx * 30 * dt; rover.vel.z -= nz * 30 * dt;
      S.shake = Math.max(S.shake, 0.3);
      say1('arena-wall', 'It has sealed the field with heat. There is no way out but through it.');
    }
    const ev = T.titan.update(dt, titanCtx);
    if (ev === 'awake') say1('awake', 'Foundry Titan. Keep moving, its shells land where you are going.');
    if (ev === 'dead') {
      S.fight = false; T.curtain.visible = false;
      T.ember.g.visible = true; T.ember.t = 0;
      setObj('core');
      sfx.victory();
      hooks.say('It is down. And there, rising from the shaft: the Ember Core. Bring us close.');
    }
    // the Ember Core rises and turns
    if (T.ember.g.visible) {
      T.ember.t = (T.ember.t || 0) + dt;
      const C = T.titan.centre;
      T.ember.g.position.set(C.x, C.y + Math.min(5, T.ember.t * 2) + Math.sin(S.time * 1.6) * 0.3, C.z);
      T.ember.core.rotation.y += dt * 0.6; T.ember.shell.rotation.y -= dt * 0.3; T.ember.shell.rotation.x += dt * 0.2;
      T.ember.rings[0].rotation.set(S.time * 0.9, S.time * 0.4, 0); T.ember.rings[1].rotation.set(-S.time * 0.5, 0, S.time * 0.7);
      if (Math.random() < 0.4) T.fx.emit(T.ember.g.position, 1, { speed: 2, life: 1.2, size: 1, colors: [[4, 2, 0.5]], drag: 0.5 });
    }
  }

  function takeCore() {
    T.ember.g.visible = false;
    T.glyph.visible = false;
    setObj('return');
    sfx.victory();
    T.fx.emit(T.ember.g.position, 160, { speed: 16, life: 1.6, size: 2.4, colors: [[5, 2.6, 0.8], [5, 4, 2]], drag: 1.4 });
    if (hooks.relic) hooks.relic(S.planet); else relics[S.planet] = true; // main records it (relics is G.relics)
  }

  // ---------- physics ----------
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  const force = new THREE.Vector3(), torque = new THREE.Vector3();
  const mountW = new THREE.Vector3(), rel = new THREE.Vector3(), pv = new THREE.Vector3(), nrm = new THREE.Vector3();
  const wf = new THREE.Vector3(), ws = new THREE.Vector3(), cp = new THREE.Vector3(), fc = new THREE.Vector3();
  const qInv = new THREE.Quaternion();

  // Lava is a molten crust: wheels sink half a metre into it and burn, but never go under.
  const CRUST = 0.55;
  function ground(x, z) { return Math.max(T.terrain.heightAt(x, z), T.def.lava - CRUST); }
  function groundNormal(x, z, out) {
    if (T.terrain.heightAt(x, z) < T.def.lava - CRUST) return out.set(0, 1, 0);
    return T.terrain.normalAt(x, z, out);
  }
  function pointVel(r, out) { return out.crossVectors(rover.ang, r).add(rover.vel); }
  function applyAt(F, r) { force.add(F); torque.add(v4.crossVectors(r, F)); }

  function physicsStep(h, inp) {
    const terrain = T.terrain;
    fwd.set(0, 0, -1).applyQuaternion(rover.quat);
    right.set(1, 0, 0).applyQuaternion(rover.quat);
    up.set(0, 1, 0).applyQuaternion(rover.quat);
    force.set(0, -R.gravity, 0); torque.set(0, 0, 0);
    const vF = rover.vel.dot(fwd);
    rover.speed = vF;

    // steering eases toward the stick; less lock at speed
    const steerMax = THREE.MathUtils.lerp(R.steerMax, R.steerFast, clamp(Math.abs(vF) / R.topSpeed, 0, 1));
    rover.steer += (-inp.moveX * steerMax - rover.steer) * Math.min(1, R.steerRate * h);

    let grounded = 0;
    const drive = inp.drive;
    for (let w = 0; w < 4; w++) {
      const m = MOUNTS[w];
      rel.set(m[0], m[1], m[2]).applyQuaternion(rover.quat);
      mountW.copy(rover.pos).add(rel);
      // find where the wheel meets the ground along the suspension axis (-up)
      let s = R.rest;
      for (let it = 0; it < 3; it++) {
        v1.copy(mountW).addScaledVector(up, -s);
        const gap = v1.y - R.wheelR - ground(v1.x, v1.z);
        s += gap / Math.max(0.3, up.y);
      }
      s = clamp(s, 0, R.rest + R.travel);
      rover.comp[w] = s;
      const contact = s < R.rest + R.travel * 0.999 && (mountW.y - up.y * s - R.wheelR - ground(mountW.x - up.x * s, mountW.z - up.z * s)) < 0.08;
      rover.contact[w] = contact;
      if (!contact) { rover.comp[w] = R.rest + R.travel; continue; }
      grounded++;
      cp.copy(mountW).addScaledVector(up, -(s + R.wheelR));
      groundNormal(cp.x, cp.z, nrm);
      pointVel(v2.subVectors(cp, rover.pos), pv);
      // spring + damper along the chassis up; bump stop when fully compressed
      const x = R.rest - s;
      let Fs = R.spring * x - R.damp * pv.dot(up);
      if (s <= 0.001) Fs += 40 * Math.max(0, -pv.dot(up));
      Fs = Math.max(0, Fs);
      applyAt(v3.copy(up).multiplyScalar(Fs), rel);

      // tyre frame on the ground plane
      wf.copy(fwd);
      if (FRONT[w]) wf.applyAxisAngle(up, rover.steer);
      wf.addScaledVector(nrm, -wf.dot(nrm)).normalize();
      ws.crossVectors(wf, nrm).normalize();
      const vl = pv.dot(wf), vs = pv.dot(ws);
      const rearHand = inp.handbrake && !FRONT[w];
      let Fl = 0;
      if (drive > 0.05) {
        const top = R.topSpeed * (T.boost || 1);
        if (vF < -1) Fl = R.brake / 4 * drive; // braking out of reverse
        else Fl = R.engine / 4 * drive * clamp(1 - vF / top, 0, 1);
      } else if (drive < -0.05) {
        if (vF > 1) Fl = -R.brake / 4 * -drive;
        else Fl = -R.engine / 4 * -drive * 0.7 * clamp(1 + vF / R.reverseTop, 0, 1);
      }
      Fl -= vl * R.roll;
      if (rearHand) Fl -= Math.sign(vl) * Math.min(Math.abs(vl) * 6, R.brake / 4);
      let Fy = -vs * R.grip * (rearHand ? 0.3 : 1);
      // friction circle: total tyre force limited by load
      const lim = R.mu * Fs * (rearHand ? 0.55 : 1);
      const mag = Math.hypot(Fl, Fy);
      if (mag > lim) { Fl *= lim / mag; Fy *= lim / mag; }
      fc.copy(wf).multiplyScalar(Fl).addScaledVector(ws, Fy);
      // apply tyre forces closer to the centre of mass so it carves instead of tipping
      v3.copy(rel).addScaledVector(up, -rel.dot(up) * 0.92);
      applyAt(fc, v3);
      rover.wheelSpin[w] += (vl / R.wheelR) * h;
      // lava under a wheel
      if (cp.y < T.def.lava + 0.05) rover.lavaT = 0.3;
    }

    // the chassis down in the lava burns too (rolled over, or bellied in)
    if (rover.pos.y < T.def.lava + 1.0) rover.lavaT = 0.3;

    // hull points: keep the body out of the ground (rolled or high-centred)
    for (const p of HULL_PTS) {
      rel.set(p[0], p[1], p[2]).applyQuaternion(rover.quat);
      v1.copy(rover.pos).add(rel);
      const g = ground(v1.x, v1.z);
      const pen = g - v1.y;
      if (pen > 0) {
        groundNormal(v1.x, v1.z, nrm);
        pointVel(rel, pv);
        const vn = pv.dot(nrm);
        const Fn = pen * 120 - Math.min(0, vn) * 10;
        v3.copy(nrm).multiplyScalar(Fn);
        // scrape friction
        v2.copy(pv).addScaledVector(nrm, -vn).multiplyScalar(-3);
        v3.add(v2);
        applyAt(v3, rel);
      }
    }

    // keel: a roll-only righting torque, strong on the ground and gentle in the air
    {
      v1.crossVectors(up, UP);
      const k = grounded > 0 ? R.keel : R.keel * 0.7;
      const rollErr = v1.dot(fwd);
      torque.addScaledVector(fwd, rollErr * k - rover.ang.dot(fwd) * R.keelDamp * (grounded > 0 ? 1 : 0.6));
    }
    // air control: tuck the nose and level the roll in a jump
    if (grounded === 0) {
      torque.addScaledVector(right, -inp.drive * R.airTorque);
      torque.addScaledVector(UP, -inp.moveX * R.airTorque * 0.8); // steer = yaw in the air, never roll
    }

    // rocks: push the chassis out of boulders
    for (const r of T.rocks.list) {
      if (r.dead) continue;
      const dx = rover.pos.x - r.x, dz = rover.pos.z - r.z;
      const rr = r.r + 1.6;
      if (Math.abs(dx) > rr || Math.abs(dz) > rr) continue;
      const d = Math.hypot(dx, dz);
      if (d < rr && rover.pos.y < r.y + r.r * 1.1) {
        const nx = dx / (d || 1), nz = dz / (d || 1);
        const vn = rover.vel.x * nx + rover.vel.z * nz;
        if (vn < 0) { rover.vel.x -= nx * vn * 1.3; rover.vel.z -= nz * vn * 1.3; if (vn < -6) { S.shake = Math.min(1, -vn / 14); sfx.bump(); } }
        force.x += nx * (rr - d) * 60; force.z += nz * (rr - d) * 60;
      }
    }

    // integrate
    rover.vel.addScaledVector(force, h);
    qInv.copy(rover.quat).invert();
    v1.copy(torque).applyQuaternion(qInv);
    v1.set(v1.x / R.inertia.x, v1.y / R.inertia.y, v1.z / R.inertia.z).applyQuaternion(rover.quat);
    rover.ang.addScaledVector(v1, h);
    rover.ang.multiplyScalar(Math.exp(-0.6 * h));
    rover.vel.multiplyScalar(Math.exp(-0.02 * h));
    rover.pos.addScaledVector(rover.vel, h);
    const al = rover.ang.length();
    if (al > 1e-6) { q1.setFromAxisAngle(v1.copy(rover.ang).divideScalar(al), al * h); rover.quat.premultiply(q1).normalize(); }

    // world edge
    const lim = T.terrain.half * 0.9;
    if (Math.abs(rover.pos.x) > lim) { rover.pos.x = Math.sign(rover.pos.x) * lim; rover.vel.x *= -0.3; }
    if (Math.abs(rover.pos.z) > lim) { rover.pos.z = Math.sign(rover.pos.z) * lim; rover.vel.z *= -0.3; }
    return grounded;
  }

  // ---------- missions: geysers, the Forge Gate, the vent field, the vault door ----------
  function setObj(o) { if (S.obj !== o) { S.obj = o; S.objFlash = 4; sfx.wave(); } }
  function practiceKill() {
    S.practiceN++;
    if (S.practiceN === 1) hooks.say('One. Lead them a little when they run.');
    if (S.practiceN === 3) hooks.say('Three. You are getting the feel of it.');
    if (S.practiceN >= 5) endPractice(true);
  }
  function endPractice(done) {
    upgrades.turretTrained = true;
    setObj(S.objAfter || 'vault');
    S.hint = 0;
    hooks.say(done
      ? 'Five. Good shooting. Save it for things that bite. ' + (upgrades.forgeplate ? 'The vault is the light column, north-east.' : 'The vault signal is that light column, north-east.')
      : 'Practice can wait. ' + (upgrades.forgeplate ? 'The vault is the light column, north-east.' : 'The vault signal is that light column, north-east.'));
    if (done) sfx.victory();
  }
  function say1(key, line) { if (!S.said.has(key)) { S.said.add(key); hooks.say(line); } }
  function faunaSay(key, line) { say1(key, line); }

  function collectForgeplate() {
    upgrades.forgeplate = true;
    T.forge.crate.visible = false;
    applyPlating();
    setObj('cross');
    sfx.victory();
    T.fx.emit(T.forge.crate.position, 120, { speed: 14, life: 1.4, size: 2.2, colors: [[4, 2, 0.6], [5, 3.6, 1.6]], drag: 1.5 });
    hooks.say('Hold still. I am matching to this plate\'s schema... Oh. I have done this before.');
    hooks.event && hooks.event({
      kicker: 'ARMORY · KESSA', title: 'FORGEPLATE HULL',
      text: 'Warden ablative plating, fused to the rover. Heat vents cannot touch you, and lava burns slower. WREN recovered a memory fragment: she knows this plating. She does not know how.',
    });
  }

  function missions(dt, inp) {
    const d = T.def;
    const P = rover.pos;
    const plated = !!upgrades.forgeplate;
    const toVault = Math.hypot(P.x - d.vault.x, P.z - d.vault.z);
    if (S.obj === 'practice' && Math.hypot(P.x - d.pad.x, P.z - d.pad.z) > 220) endPractice(false);

    // geysers: glow as a warning, then erupt. Canyon vents hurt unplated rovers; all of them toss you.
    let nearest = null, nd = Infinity;
    const ringOn = !S.fight || T.titan.debug.stage >= 2;
    for (const g of T.geysers) {
      if (g.ring && !ringOn) { g.crack.material.color.setRGB(0.3, 0.09, 0.02); g.col.material.opacity = 0; continue; }
      const c = (S.time + g.phase) % g.period;
      const erupt = g.ring ? c > g.period - 1.1 : c > g.period - 1.6;
      const warn = !erupt && c > g.period - (g.ring ? 2.0 : 3.0);
      const glow = erupt ? 3.2 : warn ? 1.2 + 1.2 * Math.abs(Math.sin(S.time * 10)) : 0.5;
      g.crack.material.color.setRGB(glow, glow * 0.3, glow * 0.07);
      g.col.material.opacity = erupt ? 0.55 + 0.25 * Math.random() : Math.max(0, g.col.material.opacity - dt * 3);
      g.col.scale.y = erupt ? 1 : 0.4;
      const dist = Math.hypot(P.x - g.x, P.z - g.z);
      if (erupt) {
        if (Math.random() < 0.6) T.fx.emit(v1.set(g.x, g.y + 1, g.z), 3, { speed: 4, life: 1.2, size: 1.6, colors: [[4, 1.4, 0.3], [5, 3, 0.8], [0.6, 0.3, 0.25]], drag: 0.4, dir: v2.set(0, 16, 0) });
        if (dist < nd) { nd = dist; nearest = g; }
        if (dist < 5.5 && S.time - g.hitT > 1.2) {
          g.hitT = S.time;
          rover.vel.y += plated ? 4 : 7;
          rover.vel.x += (P.x - g.x) * 0.6; rover.vel.z += (P.z - g.z) * 0.6;
          S.shake = 1;
          sfx.bump();
          if (!plated && !g.ring) { rover.hull -= 22; sfx.playerHit(true); say1('geyser-hit', 'Vent strike. Time it: wait for the glow to die, then go.'); }
        }
      }
    }
    T.geyserLight.intensity = nearest && nd < 60 ? 30 : 0;
    if (nearest) T.geyserLight.position.set(nearest.x, nearest.y + 6, nearest.z);

    // the vent field: impassable heat without Forgeplate
    const inRing = toVault > 30 && toVault < 56;
    S.heatWall = Math.max(0, (S.heatWall || 0) - dt);
    if (inRing && !plated) {
      // heat shoves the rover back out the way it came, with light damage
      const nx = (P.x - d.vault.x) / toVault, nz = (P.z - d.vault.z) / toVault;
      const inward = -(rover.vel.x * nx + rover.vel.z * nz);
      if (inward > 0) { rover.vel.x += nx * inward * 1.6; rover.vel.z += nz * inward * 1.6; }
      rover.vel.x += nx * 30 * dt; rover.vel.z += nz * 30 * dt;
      rover.hull = Math.max(25, rover.hull - 18 * dt);
      S.heatWall = 0.5; S.shake = Math.max(S.shake, 0.4);
      if (S.obj === 'vault') setObj('plate');
      say1('ring-hot', 'Heat wall! The vent field will melt us. There is a Warden forge to the west, at the end of a lava canyon. We need its heat plating.');
    }
    if (inRing && plated) say1('ring-plated', 'Forgeplate is holding. Keep going.');

    // objectives move with what the player has done
    if (d.canyon && !plated) {
      const ci = pathInfo(d.canyon.pts, P.x, P.z);
      if (ci.d < 14 && ci.t > 40 && ci.t < 130) say1('canyon', 'Magma Canyon. Those vents erupt on a rhythm. Watch the glow, then go.');
    }

    // prompts (only when nothing more urgent is showing)
    if (!S.prompt && T.forge && !plated) {
      const fd = Math.hypot(P.x - T.forge.x, P.z - T.forge.z);
      if (fd < 9) S.prompt = { type: 'collect', label: 'COLLECT FORGEPLATE' };
      if (fd < 30) say1('forge', 'The Forge Gate. There is a Warden armory crate inside. Bring us close.');
    }
    if (!S.prompt && S.obj === 'core' && T.ember.g.visible && T.ember.t > 2 && toVault < 14) S.prompt = { type: 'core', label: 'TAKE THE EMBER CORE' };
    if (!S.prompt && plated && toVault < 24 && S.obj === 'cross') {
      S.prompt = { type: 'vault', label: 'ENTER THE VAULT' };
      say1('door', 'The door knows the plating. It is opening for us.');
    }
    // crate bob
    if (T.forge && T.forge.crate.visible) {
      T.forge.crate.rotation.y += dt * 0.8;
      T.forge.crate.position.y = T.forge.y + 1.6 + Math.sin(S.time * 1.8) * 0.25;
    }
    return null;
  }

  // ---------- frame ----------
  function update(dt, inp, camera) {
    if (!S) return null;
    S.time += dt; S.hint -= dt;
    S.shake = Math.max(0, (S.shake || 0) - dt * 3);
    const steps = 4, h = dt / steps;
    let grounded = 0;
    rover.lavaT = Math.max(0, rover.lavaT - dt);
    for (let i = 0; i < steps; i++) grounded = physicsStep(h, inp);
    S.grounded = grounded;

    // lava burns the rover; drag pulls it in
    if (rover.lavaT > 0) {
      rover.hull -= (upgrades.forgeplate ? 6 : 14) * dt;
      rover.vel.multiplyScalar(Math.exp(-1.2 * dt));
      if (!S.said.has('lava') || S.time - (S.lavaSaid || 0) > 8) { S.said.add('lava'); S.lavaSaid = S.time; hooks.say('Lava! Back out, the hull will not take it.'); sfx.alert(); }
    }
    if (rover.hull <= 0 && S.fight) {
      rover.hull = 70;
      sfx.explode(false);
      hooks.say('Hull breach! I have patched what I can and pulled us back to the edge. It is still hurt. Go again.');
      arenaRespawn();
    }
    if (rover.hull <= 0) {
      rover.hull = 60;
      hooks.say('We lost the rover\'s hull. I have pulled it back to the pad on the tether. Try another way round.');
      sfx.explode(false);
      placeAtPad();
    }

    // flipped: offer to right it
    up.set(0, 1, 0).applyQuaternion(rover.quat);
    if (up.y < 0.3 && rover.vel.length() < 3) rover.upsideT += dt; else rover.upsideT = 0;

    // prompts
    S.prompt = null;
    const d = T.def;
    const toShip = Math.hypot(rover.pos.x - T.shipHolder.position.x, rover.pos.z - T.shipHolder.position.z);
    if (rover.upsideT > 1.2) S.prompt = { type: 'right', label: 'RIGHT THE ROVER' };
    else if (toShip < 16 && Math.abs(rover.speed) < 4) S.prompt = { type: 'orbit', label: 'RETURN TO ORBIT' };
    let result = null;
    result = missions(dt, inp) || result;
    if (T.titan.state !== 'dormant' || T.ember.g.visible || S.fight) updateFight(dt);
    {
      const fw = v1.set(0, 0, -1).applyQuaternion(rover.quat);
      T.fauna.update(dt, S.time, { rover, heading: Math.atan2(-fw.x, -fw.z), quiet: S.fight, damage: (n) => { rover.hull -= n; sfx.playerHit(true); }, shake: (k) => { S.shake = Math.max(S.shake, k); }, say: faunaSay });
      // the hull mends slowly once nothing has hurt it for a while (never mid-fight)
      if (rover.hull < S.prevHull - 0.001) S.hurtT = S.time;
      if (!S.fight && S.time - S.hurtT > 6 && rover.hull < 100) rover.hull = Math.min(100, rover.hull + 2.5 * dt);
      S.prevHull = rover.hull;
      S.hitMark = Math.max(0, S.hitMark - dt);
    }
    if (inp.pressed.has('accept') || (S.prompt && S.prompt.type === 'right' && inp.pressed.has('zero'))) {
      if (S.prompt?.type === 'orbit') result = { type: 'orbit' };
      else if (S.prompt?.type === 'collect') collectForgeplate();
      else if (S.prompt?.type === 'vault') result = { type: 'vault' };
      else if (S.prompt?.type === 'core') takeCore();
      else if (S.prompt?.type === 'right') {
        const yaw = Math.atan2(-fwd.x, -fwd.z);
        rover.quat.setFromAxisAngle(UP, yaw); rover.pos.y += 2; rover.ang.set(0, 0, 0); rover.vel.set(0, 0, 0); rover.upsideT = 0;
        sfx.ui();
      }
    }

    // ----- visuals -----
    mesh.group.position.copy(rover.pos);
    mesh.body.quaternion.copy(rover.quat);
    mesh.wheels.forEach((wh, w) => {
      const m = MOUNTS[w];
      v1.set(m[0], m[1] - rover.comp[w], m[2]).applyQuaternion(rover.quat);
      wh.pivot.position.copy(v1);
      wh.pivot.quaternion.copy(rover.quat);
      if (FRONT[w]) wh.pivot.rotateY(rover.steer);
      wh.spin.rotation.x = -rover.wheelSpin[w];
    });
    T.lava.material.uniforms.time.value = S.time;
    T.embers.update(dt, rover.pos, S.time);
    T.fx.update(dt); // sparks, fire and dust (was never stepped, so surface particles never showed)
    T.glyph.rotation.z += dt * 0.3;
    T.sun.position.copy(rover.pos).addScaledVector(v1.set(...d.sky.sunDir).normalize(), 120);
    T.sun.target.position.copy(rover.pos);
    T.sky.position.copy(camera.position);
    // lava light near the rover when lava is close below
    const nearLava = clamp(1 - (rover.pos.y - d.lava) / 12, 0, 1);
    T.lavaGlow.position.set(rover.pos.x, d.lava + 2, rover.pos.z);
    T.lavaGlow.intensity = nearLava * 26;

    // ----- camera: chase behind the heading, orbit with right stick or mouse -----
    const inv = settings.invertY ? -1 : 1;
    const heading = Math.atan2(-fwd.x, -fwd.z);
    if (S.fight && S.lastHeading !== undefined) { let dh = heading - S.lastHeading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); cam.yaw -= dh; }
    S.lastHeading = heading;
    S.aimLift += ((S.fight ? 2.2 : 0) - S.aimLift) * (1 - Math.exp(-2 * dt));
    const look = Math.abs(inp.lookX) + Math.abs(inp.lookY) > 0.05 || Math.abs(inp.mouseDX) + Math.abs(inp.mouseDY) > 0.5;
    cam.yaw -= (inp.lookX * 2.4 * dt + inp.mouseDX * 0.004);
    cam.elev += (-inp.lookY * 1.6 * dt + inp.mouseDY * 0.003) * inv; // stick sense flipped on owner request 2026-11-19
    cam.elev = clamp(cam.elev, S.fight ? -0.32 : -0.15, 1.2);
    cam.yaw = Math.atan2(Math.sin(cam.yaw), Math.cos(cam.yaw));
    cam.idle = look ? 0 : cam.idle + dt;
    if (cam.idle > 1.2 && Math.abs(rover.speed) > 3 && !S.fight) {
      cam.yaw *= Math.exp(-2.2 * dt); // swing back behind the rover
      cam.elev += (0.3 - cam.elev) * (1 - Math.exp(-1.5 * dt));
    }
    const yaw = heading + cam.yaw;
    const dist = cam.dist + S.aimLift * 0.6 + clamp(Math.abs(rover.speed) * 0.08, 0, 2.5);
    v1.set(Math.sin(yaw) * Math.cos(cam.elev) * dist, Math.sin(cam.elev) * dist + 1.6, Math.cos(yaw) * Math.cos(cam.elev) * dist).add(rover.pos);
    const gy = ground(v1.x, v1.z) + 1.4;
    if (v1.y < gy) v1.y = gy;
    cam.pos.lerp(v1, 1 - Math.exp(-8 * dt));
    cam.look.lerp(v2.copy(rover.pos).add(v3.set(0, 1.4 + S.aimLift, 0)), 1 - Math.exp(-12 * dt));
    camera.position.copy(cam.pos);
    if (S.shake > 0) camera.position.add(v3.set(Math.random() - 0.5, Math.random() - 0.5, 0).multiplyScalar(S.shake * 0.3));
    camera.up.set(0, 1, 0);
    camera.lookAt(cam.look);
    const fov = 68 + clamp(Math.abs(rover.speed) - 15, 0, 10) * 0.6;
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    updateAim(camera, inp.device);
    updateTurret(dt, inp);
    updateLance(dt, inp);
    T.lights.update(camera.position);
    return result;
  }

  // ---------- HUD ----------
  function text(ctx, str, x, y, size, rgb, a = 1, align = 'center', weight = 600) {
    ctx.font = `${weight} ${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(${rgb},${a})`; ctx.fillText(str, x, y);
  }
  function drawHud(ctx, W, H, G, device) {
    if (!S) return;
    const sc = Math.min(W, H) / 900;
    // compass strip
    fwd.set(0, 0, -1).applyQuaternion(rover.quat);
    const camYaw = Math.atan2(-(cam.look.x - cam.pos.x), -(cam.look.z - cam.pos.z));
    const cx = W / 2, cw = Math.min(560, W * 0.5), cy = 34;
    ctx.fillStyle = 'rgba(6,12,22,0.6)'; ctx.fillRect(cx - cw / 2, cy - 16, cw, 32);
    ctx.strokeStyle = 'rgba(110,242,255,0.35)'; ctx.strokeRect(cx - cw / 2, cy - 16, cw, 32);
    const mark = (ang, label, rgb, big) => {
      let d = ang - camYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) > 1.2) return;
      const x = cx - (d / 1.2) * (cw / 2);
      text(ctx, label, x, cy, big ? 15 : 12, rgb, big ? 1 : 0.7, 'center', big ? 700 : 600);
    };
    // world north = -Z; yaw angles measured like camYaw (atan2(-x, -z))
    [['N', 0], ['E', -Math.PI / 2], ['S', Math.PI], ['W', Math.PI / 2]].forEach(([l, a]) => mark(a, l, CYAN, false));
    const d = T.def;
    const bear = (x, z) => Math.atan2(-(x - rover.pos.x), -(z - rover.pos.z));
    const dv = Math.hypot(d.vault.x - rover.pos.x, d.vault.z - rover.pos.z);
    if (S.obj === 'plate' && T.forge) {
      const df = Math.hypot(T.forge.x - rover.pos.x, T.forge.z - rover.pos.z);
      mark(bear(T.forge.x, T.forge.z), '◆ FORGE GATE ' + Math.round(df) + ' M', AMBER, true);
      mark(bear(d.vault.x, d.vault.z), 'VAULT', '200,150,90', false);
    } else if (S.obj === 'practice' && T.fauna.meadow) mark(bear(T.fauna.meadow.x, T.fauna.meadow.z), '◆ SKITTERS', AMBER, true);
    else if (S.obj === 'guardian') mark(bear(d.vault.x, d.vault.z), '◆ TITAN', RED, true);
    else if (S.obj === 'core') mark(bear(d.vault.x, d.vault.z), '◆ EMBER CORE ' + Math.round(dv) + ' M', GOLD, true);
    else if (S.obj !== 'return') mark(bear(d.vault.x, d.vault.z), '◆ VAULT ' + Math.round(dv) + ' M', AMBER, true);
    const OBJ = {
      practice: 'Target practice · shoot cinder skitters by the pad ' + Math.min(5, S.practiceN || 0) + '/5',
      vault: 'Reach the vault signal',
      plate: 'Find heat plating · the Forge Gate, end of the Magma Canyon',
      cross: 'Cross the vent field to the vault',
      guardian: 'Destroy the Foundry Titan · shoot its core when it vents',
      core: 'Take the Ember Core',
      return: 'Return to the Wayfarer and lift off',
    };
    text(ctx, OBJ[S.obj] || '', W / 2, 90, 14 * sc + 5, '230,251,255', 0.9, 'center', 600);
    if (S.objFlash > 0) {
      S.objFlash -= 1 / 60;
      const a = Math.min(1, S.objFlash) * Math.min(1, (4 - S.objFlash) * 4);
      ctx.fillStyle = `rgba(6,12,22,${0.9 * a})`; ctx.fillRect(W / 2 - Math.min(W * 0.42, 420), H * 0.33 - 38, Math.min(W * 0.84, 840), 76);
      text(ctx, 'NEW OBJECTIVE', W / 2, H * 0.33 - 14, 14 * sc + 5, AMBER, a, 'center', 700);
      text(ctx, OBJ[S.obj] || '', W / 2, H * 0.33 + 14, 20 * sc + 8, '255,255,255', a, 'center', 700);
    }
    if (S.heatWall > 0) text(ctx, 'HEAT WALL · NEED HEAT PLATING', W / 2, H * 0.25, 24 * sc + 10, RED, 0.6 + 0.4 * Math.sin(S.time * 14), 'center', 700);
    const ds = Math.hypot(T.shipHolder.position.x - rover.pos.x, T.shipHolder.position.z - rover.pos.z);
    if (ds > 20) mark(bear(T.shipHolder.position.x, T.shipHolder.position.z), '▲ WAYFARER' + (S.obj === 'return' ? ' ' + Math.round(ds) + ' M' : ''), S.obj === 'return' ? GOLD : CYAN, true);

    // crosshair (where the turret's aim ray goes) and the hit marker
    {
      const x = W / 2, y = H / 2 - AIM_NDC_Y * H / 2;
      const hot = T.titan.hitMark > 0 || S.hitMark > 0, lock = aim.lock;
      ctx.strokeStyle = hot ? 'rgba(255,211,106,0.95)' : lock ? 'rgba(255,179,90,0.9)' : 'rgba(230,251,255,0.75)';
      ctx.lineWidth = 2;
      const g = lock ? 9 : 6, l = 7;
      ctx.beginPath();
      ctx.moveTo(x - g - l, y); ctx.lineTo(x - g, y); ctx.moveTo(x + g, y); ctx.lineTo(x + g + l, y);
      ctx.moveTo(x, y - g - l); ctx.lineTo(x, y - g); ctx.moveTo(x, y + g); ctx.lineTo(x, y + g + l);
      ctx.stroke();
      if (hot) { ctx.beginPath(); ctx.moveTo(x - 14, y - 14); ctx.lineTo(x - 8, y - 8); ctx.moveTo(x + 14, y - 14); ctx.lineTo(x + 8, y - 8); ctx.moveTo(x - 14, y + 14); ctx.lineTo(x - 8, y + 8); ctx.moveTo(x + 14, y + 14); ctx.lineTo(x + 8, y + 8); ctx.stroke(); }
      ctx.lineWidth = 1;
    }
    // guardian health: the core's heat, in three stages
    if (S.fight || T.titan.state === 'dying') {
      const bw2 = Math.min(W * 0.5, 520), bx2 = W / 2 - bw2 / 2, by2 = 134;
      text(ctx, 'FOUNDRY TITAN · VAULT GUARDIAN', W / 2, by2 - 12, 13 * sc + 5, RED, 0.95, 'center', 700);
      ctx.fillStyle = 'rgba(6,12,22,0.75)'; ctx.fillRect(bx2 - 3, by2 - 3, bw2 + 6, 16);
      ctx.fillStyle = 'rgba(255,77,109,0.22)'; ctx.fillRect(bx2, by2, bw2, 10);
      ctx.fillStyle = 'rgba(255,120,60,0.95)'; ctx.fillRect(bx2, by2, bw2 * clamp(T.titan.hp / TITAN_HP, 0, 1), 10);
      ctx.fillStyle = 'rgba(6,12,22,0.9)'; ctx.fillRect(bx2 + bw2 / 3 - 1, by2, 2, 10); ctx.fillRect(bx2 + bw2 * 2 / 3 - 1, by2, 2, 10);
      if (S.fight && T.titan.open > 0.6) text(ctx, 'CORE EXPOSED · FIRE', W / 2, by2 + 26, 15 * sc + 6, GOLD, 0.7 + 0.3 * Math.sin(S.time * 12), 'center', 700);
    }
    text(ctx, 'PHASE III · ' + S.planet.toUpperCase() + ' SURFACE', W / 2, 66, 13 * sc + 5, AMBER, 0.85);

    // speed and hull
    const kmh = Math.round(Math.abs(rover.speed) * 3.6);
    text(ctx, String(kmh), 40, H - 70, 44 * sc + 14, '255,255,255', 0.95, 'left', 700);
    text(ctx, 'KM/H' + (rover.speed < -0.5 ? ' · REVERSE' : ''), 42, H - 36, 13, CYAN, 0.85, 'left');
    const bw = 200 * sc + 60, bx = W - bw - 30, by = H - 40;
    ctx.fillStyle = 'rgba(6,12,22,0.72)'; ctx.fillRect(bx - 4, by - 4, bw + 8, 18);
    const hc = rover.hull < 35 ? RED : AMBER;
    ctx.fillStyle = `rgba(${hc},0.2)`; ctx.fillRect(bx, by, bw, 10);
    ctx.fillStyle = `rgba(${hc},0.95)`; ctx.fillRect(bx, by, bw * clamp(rover.hull / 100, 0, 1), 10);
    text(ctx, 'ROVER HULL', bx, by - 14, 13, hc, 0.9, 'left');
    text(ctx, Math.round(rover.hull) + '%', bx + bw, by - 14, 13, hc, 0.9, 'right');
    {
      // special weapon heat, above the hull bar
      const ly = by - 46, lc = S.over ? RED : S.heat > 0.75 ? '255,150,60' : GOLD;
      ctx.fillStyle = 'rgba(6,12,22,0.72)'; ctx.fillRect(bx - 4, ly - 4, bw + 8, 14);
      ctx.fillStyle = 'rgba(' + lc + ',0.2)'; ctx.fillRect(bx, ly, bw, 6);
      ctx.fillStyle = 'rgba(' + lc + ',0.95)'; ctx.fillRect(bx, ly, bw * S.heat, 6);
      const padL = device === 'gamepad';
      text(ctx, SPECIALS[S.special].name + (padL ? ' · LB' : ' · RMB / Q'), bx, ly - 12, 12, lc, 0.85, 'left');
      text(ctx, S.over ? 'OVERHEAT' : S.lanceOn ? 'FIRING' : 'READY', bx + bw, ly - 12, 12, lc, S.over ? 0.6 + 0.4 * Math.sin(S.time * 14) : 0.85, 'right');
    }
    if (rover.lavaT > 0 && !(S.heatWall > 0)) text(ctx, 'HEAT CRITICAL', W / 2, H * 0.25, 26 * sc + 10, RED, 0.6 + 0.4 * Math.sin(S.time * 14), 'center', 700);

    // WREN subtitle (latest line)
    const c = G.comms[G.comms.length - 1];
    if (c && c.t < 7) {
      const shown = c.text.slice(0, Math.floor(c.t * 55));
      ctx.font = `500 ${15 * sc + 6}px ${FONT}`;
      const w = Math.min(W * 0.8, ctx.measureText('WREN:  ' + c.text).width + 40);
      ctx.fillStyle = 'rgba(4,8,16,0.72)'; ctx.fillRect(W / 2 - w / 2, H * 0.78 - 18, w, 36);
      text(ctx, c.from + ':  ' + shown, W / 2, H * 0.78, 15 * sc + 6, '230,251,255', 1, 'center', 500);
    }
    // prompt
    if (S.prompt) {
      const pad = device === 'gamepad';
      const key = S.prompt.type === 'right' ? (pad ? 'A' : 'F') : pad ? 'A' : 'F';
      text(ctx, '[' + key + ']  ' + S.prompt.label, W / 2, H * 0.68, 20 * sc + 8, GOLD, 0.95, 'center', 700);
    }
    if (S.hint > 0) {
      const pad = device === 'gamepad';
      const txt = S.hintMode === 'practice'
        ? (pad ? 'RB fire turret · RIGHT STICK aim · the crosshair locks on when close' : 'LEFT CLICK or E fire turret · MOUSE aim · the crosshair locks on when close')
        : S.hintMode === 'gun'
        ? (pad ? 'RB fire turret · LB heat lance · RIGHT STICK aim · keep driving' : 'LEFT CLICK or E turret · RIGHT CLICK or Q heat lance · MOUSE aim')
        : (pad ? 'RT drive · LT brake/reverse · LEFT STICK steer · X handbrake · RIGHT STICK camera · RB turret · LB lance' : 'W/S drive and brake · A/D steer · SPACE handbrake · MOUSE camera · CLICK turret · RIGHT CLICK lance');
      text(ctx, txt, W / 2, H * 0.6, 15 * sc + 5, CYAN, Math.min(1, S.hint) * 0.9);
    }
  }

  // graphics quality: shadow map size for every planet's sun (built ones too)
  function setShadowSize(n) {
    shadowSize = n;
    for (const b of built.values()) { const l = b.sun; if (l.shadow.mapSize.x === n) continue; l.shadow.mapSize.set(n, n); if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; } }
  }

  return {
    setShadowSize,
    scene, enter, exit, update, drawHud, rover, wakeGuardian,
    get active() { return !!S; },
    get debug() { return { S, rover, cam, T, aim, mesh }; },
  };
}
