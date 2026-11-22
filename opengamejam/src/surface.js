// Phase III: the rover on a planet surface. Raycast-vehicle physics on the shared heightfield,
// a chase camera the player can orbit, the landing pad with the Wayfarer parked, and the vault beacon.
import * as THREE from 'three';
import { createTerrain, SURFACES, pathInfo, pathPoint, RAMP } from './terrain.js';
import { makeParticles } from './assault.js';
import { cloneModel, onModel, hasModel } from './models.js';
import { settings } from './settings.js';
import { sfx, lanceHum, noise } from './audio.js';
import { createTitan, TITAN_HP } from './guardian.js';
import { createSentinel, SENTINEL_HP } from './sentinel.js';
import { createMatriarch, MATRIARCH_HP } from './matriarch.js';
import { createFauna } from './fauna.js';
import { eff } from './workshop.js';
import { VLight, createLightPool } from './lightpool.js';

const clamp = THREE.MathUtils.clamp;
const FONT = '"Chakra Petch", sans-serif';
const CYAN = '110,242,255', AMBER = '255,179,90', RED = '255,77,109', GOLD = '255,211,106';

// Tuning, per unit mass (so forces are accelerations).
const R = {
  gravity: 14,
  wheelR: 0.48, rest: 0.62, travel: 0.42,
  // suspension (owner, 2026-11-21: "the front end hits the ground and causes sudden stops"): a progressive spring that
  // stiffens over the last of its travel instead of slamming the bump stop, and damping near critical
  spring: 17, springProg: 120, progStart: 0.3, dampBump: 3.0, dampRebound: 4.2,
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
const HULL_PTS = [[-1.1, -0.28, -1.9], [1.1, -0.28, -1.9], [-1.1, -0.28, 1.9], [1.1, -0.28, 1.9], [-1, 0.9, -0.6], [1, 0.9, -0.6], [-1, 0.9, 0.9], [1, 0.9, 0.9]];

// where the generated body sits relative to the physics chassis (tuned so the arches clear the wheels)
const ROVER_FIT = { offset: new THREE.Vector3(0, -0.15, 0.05) };
const TURRET_POS = new THREE.Vector3(0, 0.6, 0.15); // seated on the generated cab roof (roof top ~0.53 at z -0.2..0.45)
// The crosshair sits above screen centre so the rover never covers it; the aim ray goes through it.
const AIM_NDC_Y = 0.2;
const ARENA_R = 64;
// Each world's vault guardian and relic: names, WREN's lines, and colours for the arena wall and the relic.
const GUARD = {
  kessa: {
    name: 'FOUNDRY TITAN', short: 'TITAN', relic: 'EMBER CORE', relicName: 'the Ember Core', hp: TITAN_HP, curtain: [2.4, 0.7, 0.15],
    wake: 'Something is climbing out of the shaft. A Warden foundry guardian. Its armour is too thick for us. Watch for the vents.',
    awake: 'Foundry Titan. Keep moving, its shells land where you are going.',
    wall: 'It has sealed the field with heat. There is no way out but through it.',
    dead: 'It is down. And there, rising from the shaft: the Ember Core. Bring us close.',
    obj: 'Destroy the Foundry Titan · shoot its core when it vents',
    colors: { core: [5, 2.6, 0.8], ring: [3.4, 1.6, 0.4], shell: '#3a2418', em: '#5a1e04', light: '#ffa040', burst: [[5, 2.6, 0.8], [5, 4, 2]] },
  },
  thalor: {
    name: 'SENTINEL PRIME', short: 'SENTINEL', relic: 'RIME COMPASS', relicName: 'the Rime Compass', hp: SENTINEL_HP, curtain: [0.18, 0.55, 0.75], curtainK: 0.55,
    wake: 'The ice over the vault is breaking. A Warden sentinel. Those shields will eat our shots. Watch the floor.',
    awake: 'Sentinel Prime. When the floor glows under us, get to the other ring, fast. Shoot the core when the shields fly out.',
    wall: 'It has walled the centre in. We finish this here.',
    dead: 'It is gone. And there, over the vault: the Rime Compass. Bring us close.',
    obj: 'Shatter Sentinel Prime · shoot the core when its shields fly out',
    colors: { core: [1.6, 3.2, 4], ring: [1.2, 2.6, 3.4], shell: '#20323e', em: '#0d3a4e', light: '#9fe6ff', burst: [[1.6, 2.6, 3.2], [2.6, 3, 3.4]] },
  },
  vireo: {
    name: 'HOLLOWED MATRIARCH', short: 'MATRIARCH', relic: 'VEIL LENS', relicName: 'the Veil Lens', hp: MATRIARCH_HP, curtain: [0.5, 0.25, 0.9], curtainK: 0.6,
    wake: 'The veil over the vault is tearing open. Something huge is coming through. Hollowed, but old. Very old.',
    awake: 'The Hollowed Matriarch. While she is veiled our shots go straight through her. Blink through her waves, and hit the light in her chest when she turns solid.',
    wall: 'The veil has closed behind us. We finish this here.',
    dead: 'She is gone. And there, where she hung: the Veil Lens. Bring us close.',
    obj: 'Bring down the Hollowed Matriarch · blink through her waves, shoot her heart when she turns solid',
    colors: { core: [2.4, 1.2, 4], ring: [1.6, 0.8, 3], shell: '#2a1a40', em: '#3a1060', light: '#c49cff', burst: [[2.4, 1.2, 4], [3, 2.4, 4]] },
  },
};
const ICE_GRIP = 0.1; // share of normal tyre grip on Thalor's sea ice (rear tyres; the fronts keep a little more)
const ICE_FRONT = 0.14;
// Nitro (owner, 2026-11-21): a short rocket push with a cooldown. It is a force on the chassis, not on the
// tyres, so it works on ice too (and spins you if you are sideways).
const NITRO = { dur: 2.5, cd: 8, thrust: 14, topK: 1.8, engineK: 1.5 };
// Phase Blink (Vireo's armory): the rover steps `dist` metres ahead in an instant (through veil walls, across gaps),
// keeps its speed plus a little `kick`, and recharges for `cd` seconds.
const BLINK = { dist: 14, cd: 3.5, kick: 4, grace: 0.5 }; // grace: how long we pass through veil walls and waves
const HULL_MU = 0.35; // body-on-rock sliding friction
// on ice the tyres' forward and side grip are limited separately: spinning rear tyres still push
// (ICE_DRIVE of normal traction) while their side grip collapses, which swings the tail out
const ICE_DRIVE = 0.4;
// power oversteer on ice: throttle with steering swings the tail out (cookies), up to ICE_SPIN_MAX rad/s of yaw
const ICE_SPIN = 6, ICE_SPIN_MAX = 2.8;
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
    uniforms: { top: { value: new THREE.Color(def.sky.top) }, hor: { value: new THREE.Color(def.sky.horizon) }, sunDir: { value: new THREE.Vector3(...def.sky.sunDir).normalize() }, sunCol: { value: new THREE.Color(def.sky.sun) },
      rings: { value: def.sky.rings ? 1 : 0 }, ringN: { value: new THREE.Vector3(0.35, 0.55, -0.76).normalize() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top, hor, sunDir, sunCol, ringN; uniform float rings; varying vec3 vD;
      void main(){ float h = clamp(vD.y, -0.2, 1.0);
        vec3 c = mix(hor, top, pow(max(h, 0.0), 0.45));
        c = mix(c, hor * 0.5, smoothstep(0.0, -0.2, vD.y));
        float s = max(dot(vD, sunDir), 0.0);
        c += sunCol * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.35);
        // the planet's rings: a broad banded arc across the sky (seen from inside their plane's offset)
        if (rings > 0.5) {
          float d = dot(vD, ringN);
          float band = smoothstep(0.10, 0.13, d) * (1.0 - smoothstep(0.29, 0.32, d));
          float gap = 1.0 - 0.85 * smoothstep(0.003, 0.0, abs(d - 0.215));            // a dark division
          float bands = 0.65 + 0.35 * sin(d * 260.0) * sin(d * 97.0);
          float a = band * gap * bands * smoothstep(-0.02, 0.12, vD.y) * 0.55;
          c = mix(c, vec3(0.93, 0.96, 1.0), a);
        }
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

// Thalor's frozen sea: a flat sheet at the "lava" level, pale blue with white pressure cracks.
// Low roughness so the low sun glints off it. It has no uniforms to step.
function makeIce(def, size) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 512;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 512, 512); grd.addColorStop(0, '#9cc3d6'); grd.addColorStop(0.5, '#b7d7e6'); grd.addColorStop(1, '#8fb9cf');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
  let sd = 3;
  const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${0.03 + rnd() * 0.05})`; g.beginPath(); g.arc(rnd() * 512, rnd() * 512, 6 + rnd() * 40, 0, 7); g.fill(); }
  g.lineCap = 'round';
  for (let i = 0; i < 26; i++) { // cracks: jagged random walks, drawn wrapped so the tile repeats
    let x = rnd() * 512, y = rnd() * 512, a = rnd() * 6.28;
    g.strokeStyle = `rgba(240,250,255,${0.35 + rnd() * 0.4})`; g.lineWidth = 0.6 + rnd() * 1.4;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 30; k++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); }
    g.stroke();
    for (const [ox, oy] of [[512, 0], [-512, 0], [0, 512], [0, -512]]) { g.save(); g.translate(ox, oy); g.stroke(); g.restore(); }
  }
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(size / 60, size / 60);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({ map: tex, color: '#ffffff', roughness: 0.22, metalness: 0.05 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mat);
  mesh.position.y = def.lava; mesh.receiveShadow = true;
  return mesh;
}

// Vireo's veil: the top of a sea of violet fog, drawn as a slow-swirling translucent sheet over a darker
// one further down, so the chasm floors fade out instead of showing. Its clock is stepped like the lava's.
function makeVeil(def, size) {
  const mk = (deep) => {
    const m = new THREE.ShaderMaterial({
      fog: true, transparent: true, depthWrite: false,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 } }]),
      vertexShader: `varying vec2 vP; #include <fog_pars_vertex>
        void main(){ vP = position.xz; vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mvPosition; #include <fog_vertex> }`,
      fragmentShader: `uniform float time; varying vec2 vP; #include <fog_pars_fragment>
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        float fb(vec2 p){ return n(p)*0.5 + n(p*2.1+3.1)*0.3 + n(p*4.3-1.7)*0.2; }
        void main(){ vec2 p = vP * ${deep ? '0.012' : '0.02'};
          vec2 w = vec2(fb(p + vec2(time*0.03, 0.0)), fb(p + vec2(5.2, time*0.025)));
          float a = fb(p * 1.6 + w * 1.8 + vec2(-time*0.02, time*0.015));
          vec3 c = ${deep ? 'mix(vec3(0.07,0.03,0.14), vec3(0.16,0.08,0.28), a)' : 'mix(vec3(0.20,0.10,0.38), vec3(0.62,0.42,0.95), smoothstep(0.45, 0.85, a))'};
          gl_FragColor = vec4(c, ${deep ? '0.96' : '0.55 + 0.35 * smoothstep(0.3, 0.8, a)'});
          #include <fog_fragment>
        }`,
    });
    m.vertexShader = m.vertexShader.replace(/#include <([a-z_]+)>/g, '\n#include <$1>\n');
    m.fragmentShader = m.fragmentShader.replace(/#include <([a-z_]+)>/g, '\n#include <$1>\n');
    return m;
  };
  const top = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mk(false));
  top.position.y = def.lava; top.renderOrder = 2;
  const deep = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mk(true));
  deep.position.y = -12; top.add(deep); // a child, so it sits at lava - 12
  const tick = top.material.uniforms.time;
  deep.onBeforeRender = () => { deep.material.uniforms.time.value = tick.value; };
  return top;
}

// Vireo's floating rock: islands with flat tops and pointed undersides, hanging over the mesas and the
// veil and bobbing slowly, each with a few violet crystals glowing underneath. Scenery only (no collision).
function makeIslands(def, terrain, accent) {
  const geo = new THREE.ConeGeometry(1, 1.7, 11, 4).rotateX(Math.PI).translate(0, -0.85, 0); // top at y 0, tip at -1.7
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3), cTop = new THREE.Color('#7c6c94'), cSide = new THREE.Color('#2e2640'), cc = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    v1.fromBufferAttribute(p, i);
    const r = Math.hypot(v1.x, v1.z);
    if (r > 0.01) { const k = 0.8 + Math.sin(Math.atan2(v1.z, v1.x) * 3 + v1.y * 4) * 0.12 + Math.random() * 0.14; v1.x *= k; v1.z *= k; }
    if (v1.y < -0.05) v1.y += (Math.random() - 0.5) * 0.12;
    p.setXYZ(i, v1.x, v1.y, v1.z);
    cc.copy(v1.y > -0.02 ? cTop : cSide).multiplyScalar(0.85 + Math.random() * 0.3);
    col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const N = 70, K = 3; // islands, crystals per island
  const rockM = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true }), N);
  const crys = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0).scale(0.35, 1, 0.35), new THREE.MeshBasicMaterial({ color: new THREE.Color(...accent).multiplyScalar(0.55) }), N * K);
  rockM.frustumCulled = crys.frustumCulled = false;
  const list = [];
  let sd = 11;
  const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) {
    const x = (rnd() - 0.5) * terrain.size * 0.95, z = (rnd() - 0.5) * terrain.size * 0.95;
    const big = rnd() < 0.15;
    const r = big ? 26 + rnd() * 30 : 4 + rnd() * rnd() * 20;
    const y = Math.max(terrain.heightAt(x, z), def.lava) + (big ? 90 + rnd() * 120 : 28 + rnd() * 100) + r * 0.4;
    const cr = Array.from({ length: K }, () => [(rnd() - 0.5) * 0.9, -0.9 - rnd() * 0.7, (rnd() - 0.5) * 0.9, 0.12 + rnd() * 0.16]);
    list.push({ x, y, z, r, yaw: rnd() * 6.28, spin: (rnd() - 0.5) * 0.03, bob: 1 + rnd() * 2.5, ph: rnd() * 6.28, cr });
  }
  const m4 = new THREE.Matrix4(), m5 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pp = new THREE.Vector3();
  const update = (t) => {
    list.forEach((I, i) => {
      q.setFromAxisAngle(UP, I.yaw + t * I.spin);
      pp.set(I.x, I.y + Math.sin(t * 0.25 + I.ph) * I.bob, I.z);
      m4.compose(pp, q, s.set(I.r, I.r * 0.85, I.r));
      rockM.setMatrixAt(i, m4);
      I.cr.forEach((c, k) => {
        m5.compose(v2.set(c[0], c[1], c[2]), q1.identity(), v3.setScalar(c[3] * 2.2)).premultiply(m4);
        crys.setMatrixAt(i * K + k, m5);
      });
    });
    rockM.instanceMatrix.needsUpdate = true; crys.instanceMatrix.needsUpdate = true;
  };
  update(0);
  const g = new THREE.Group(); g.add(rockM, crys);
  return { g, list, update };
}

// Stand-ins for the Kessa-only systems, so a world without them runs the same update code.
function noTitan() {
  return { reset() {}, wake() {}, update() { return null; }, hitTest() { return null; }, onBolt() {}, state: 'dormant', hp: 0, open: 0, hitMark: 0, act: '',
    centre: new THREE.Vector3(), corePos: (o) => o, debug: { stage: 0 } };
}
function noFauna() {
  return { list: [], reset() {}, hideAll() {}, update() {}, hitTest() { return null; }, damage() { return false; }, kill() {}, meadow: null, packHomes: [],
    deathFx: { smoke: { emit() {} }, clear() {} } };
}

function makeRocks(terrain, def, count) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { v1.fromBufferAttribute(p, i); v1.multiplyScalar(0.75 + Math.random() * 0.45); p.setXYZ(i, v1.x, v1.y * 0.75, v1.z); }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: def.rock || '#2e2622', roughness: 0.9, flatShading: true });
  const list = [], placed = [];
  const m4 = new THREE.Matrix4();
  let k = 0, tries = 0;
  while (k < count && tries++ < count * 20) {
    const x = (Math.random() - 0.5) * terrain.size * 0.85, z = (Math.random() - 0.5) * terrain.size * 0.85;
    const h = terrain.heightAt(x, z);
    if (h < def.lava + 1.5) continue;
    if (Math.hypot(x - def.pad.x, z - def.pad.z) < def.pad.r * 1.5) continue;
    if (Math.hypot(x - def.vault.x, z - def.vault.z) < (def.maze ? def.maze.rings[0] + 16 : 72)) continue; // keep the guardian arena (and Thalor's maze) clear
    if (def.spire && Math.hypot(x - def.spire.x, z - def.spire.z) < 26) continue;
    if (def.shrine && Math.hypot(x - def.shrine.x, z - def.shrine.z) < 30) continue;
    if ((def.ramps || []).some((r) => { // ramps and their 50 m run-ups stay clear of boulders
      const dx = Math.cos(r.a), dz = Math.sin(r.a), u = (x - r.x) * dx + (z - r.z) * dz, v = Math.abs(-(x - r.x) * dz + (z - r.z) * dx);
      return u > -55 && u < 6 && v < 12;
    })) continue;
    if (onRoad(def, x, z, 7)) continue; // causeways and the canyon ridge stay drivable
    const big = Math.random() < 0.18;
    const r = big ? 2.2 + Math.random() * 3.8 : 0.25 + Math.random() * 0.45;
    q1.setFromEuler(new THREE.Euler(Math.random() * 0.4, Math.random() * 6.28, Math.random() * 0.4));
    m4.compose(new THREE.Vector3(x, h + r * (big ? 0.25 : -0.1), z), q1, new THREE.Vector3(r, r, r));
    k++;
    const rec = { x, z, y: h, r: r * 0.9, m: m4.clone() };
    placed.push(rec);
    if (big) { rec.hp = rec.max = Math.ceil(r * 2.2); list.push(rec); }
  }
  // split into a 4x4 grid of instanced meshes so the camera and the shadow box can skip whole cells
  const G = 4, cellW = terrain.size / G, inst = new THREE.Group();
  const cellsOf = Array.from({ length: G * G }, () => []);
  for (const r of placed) {
    const ci = Math.min(G - 1, Math.max(0, Math.floor((r.x + terrain.size / 2) / cellW)));
    const cj = Math.min(G - 1, Math.max(0, Math.floor((r.z + terrain.size / 2) / cellW)));
    cellsOf[cj * G + ci].push(r);
  }
  for (const group of cellsOf) {
    if (!group.length) continue;
    const im = new THREE.InstancedMesh(geo, mat, group.length);
    im.castShadow = true; im.receiveShadow = true;
    group.forEach((r, i) => { im.setMatrixAt(i, r.m); r.inst = im; r.idx = i; });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    inst.add(im);
  }
  for (const r of placed) if (r.hp === undefined) { delete r.m; } // only shootable boulders keep their matrix
  return { inst, list };
}

// true if (x,z) lies on a causeway or the canyon ridge road, plus a margin
function onRoad(def, x, z, margin) {
  for (const c of def.causeways || []) if (pathInfo(c.pts, x, z).d < c.half + margin) return true;
  if (def.canyon && pathInfo(def.canyon.pts, x, z).d < def.canyon.half + margin) return true;
  return false;
}

function makeEmbers(kind = 'embers') { // rising embers (Kessa), falling, drifting snow (Thalor), or Vireo's slow violet motes
  const snow = kind === 'snow', motes = kind === 'motes';
  const N = 400, pos = new Float32Array(N * 3), P = [];
  for (let i = 0; i < N; i++) P.push(new THREE.Vector3((Math.random() - 0.5) * 120, Math.random() * 40, (Math.random() - 0.5) * 120));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const m = snow
    ? new THREE.PointsMaterial({ color: new THREE.Color(1.1, 1.15, 1.25), size: 0.16, transparent: true, opacity: 0.9, depthWrite: false })
    : motes ? new THREE.PointsMaterial({ color: new THREE.Color(1.3, 0.75, 2.2), size: 0.2, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false })
    : new THREE.PointsMaterial({ color: new THREE.Color(3, 1.2, 0.3), size: 0.18, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return {
    pts,
    update(dt, centre, t) {
      for (let i = 0; i < N; i++) {
        const p = P[i];
        if (motes) { p.y += Math.sin(t * 0.4 + i * 0.7) * dt * 0.5; p.x += Math.sin(t * 0.21 + i) * dt * 0.7; p.z += Math.cos(t * 0.17 + i * 1.3) * dt * 0.7; p.y = (p.y + 40) % 40; }
        else if (snow) { p.y -= dt * (1.6 + (i % 5) * 0.35); p.x += (2.2 + Math.sin(t * 0.9 + i) * 1.2) * dt; p.z += Math.cos(t * 0.6 + i * 1.7) * dt * 0.8; if (p.y < 0) { p.y = 40; p.x = (Math.random() - 0.5) * 120; } if (p.x > 60) p.x -= 120; }
        else { p.y += dt * (1.2 + (i % 7) * 0.3); p.x += Math.sin(t * 0.7 + i) * dt * 0.6; }
        if (!snow && !motes && p.y > 40) p.y = 0;
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
// (Thalor's Rime Compass is the same shape in ice colours.)
function makeEmberCore(c = GUARD.kessa.colors) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(...c.core) }));
  g.add(core);
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 1), new THREE.MeshStandardMaterial({ color: c.shell, roughness: 0.4, metalness: 0.7, emissive: c.em, wireframe: true }));
  g.add(shell);
  const rings = [0, 1].map((i) => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(2.4 + i * 0.5, 0.07, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(...c.ring) }));
    g.add(r); return r;
  });
  const light = new VLight(c.light, 80, 30, 1.5); g.add(light);
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
  let hudCam = null; // the camera of the last update, for health bars over creatures
  const hb = new THREE.Vector3();

  function build(id) {
    if (built.has(id)) return built.get(id);
    const def = SURFACES[id];
    const root = new THREE.Group();
    const terrain = createTerrain(def);
    root.add(terrain.mesh);
    const sky = makeSky(def); root.add(sky);
    const lava = def.hazard === 'ice' ? makeIce(def, def.size) : def.hazard === 'veil' ? makeVeil(def, def.size) : makeLava(def, def.size); root.add(lava);
    const islands = def.islands ? makeIslands(def, terrain, def.accent) : null;
    if (islands) root.add(islands.g);
    const rocks = makeRocks(terrain, def, 1400); root.add(rocks.inst);
    const embers = makeEmbers(def.weather); root.add(embers.pts);
    const sun = new THREE.DirectionalLight(def.sky.sun, 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 300 });
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
    root.add(sun); root.add(sun.target);
    root.add(new THREE.HemisphereLight(...(def.hemi || ['#ffb48a', '#3a120a']), 0.9));
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
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 400, 12, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(...(def.accent || [3.5, 1.4, 0.3])).multiplyScalar(0.46), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beacon.position.set(def.vault.x, terrain.vaultH + 200, def.vault.z); root.add(beacon);
    const vaultBase = new THREE.Mesh(new THREE.CylinderGeometry(9, 11, 3, 6), new THREE.MeshStandardMaterial({ color: '#d8cdb8', roughness: 0.6, metalness: 0.2 }));
    vaultBase.position.set(def.vault.x, terrain.vaultH + 1, def.vault.z); vaultBase.castShadow = true; vaultBase.receiveShadow = true; root.add(vaultBase);
    const glyph = new THREE.Mesh(new THREE.TorusGeometry(6, 0.25, 6, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(...(def.accent || [3.5, 1.4, 0.3])) }));
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
    ventRing.visible = !!def.vents;
    for (let i = 0; i < (def.vents ? 14 : 0); i++) {
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
    // Thalor's ice maze: ring walls of ice shards round the vault (solid to the rover), and the lit
    // lanes through it, which only show once the Compass Trim is fitted
    let maze = null;
    if (def.maze) {
      const M = def.maze, V = def.vault;
      const shard = new THREE.CylinderGeometry(0.85, 1.35, 1, 6).translate(0, 0.5, 0);
      const iceMat = new THREE.MeshStandardMaterial({ color: '#cfeefc', roughness: 0.1, metalness: 0, emissive: '#10303f', flatShading: true });
      const spots = [], wallRecs = [];
      const angIn = (a, c, half) => Math.abs(Math.atan2(Math.sin(a - c), Math.cos(a - c))) < half;
      M.rings.forEach((R, i) => {
        const n = Math.round((Math.PI * 2 * R) / 2.5), half = (M.gapW / 2) / R;
        for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; if (!angIn(a, M.gaps[i], half)) spots.push([V.x + Math.cos(a) * R, V.z + Math.sin(a) * R]); }
      });
      M.blocks.forEach((a, i) => { for (let r = M.rings[i + 1] + 1.5; r < M.rings[i] - 1; r += 2.5) spots.push([V.x + Math.cos(a) * r, V.z + Math.sin(a) * r]); });
      const im = new THREE.InstancedMesh(shard, iceMat, spots.length);
      let sd = 17; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), e = new THREE.Euler();
      spots.forEach(([x, z], i) => {
        const y = terrain.heightAt(x, z), h = 6 + rnd() * 6;
        e.set((rnd() - 0.5) * 0.25, rnd() * 6.28, (rnd() - 0.5) * 0.25); qq.setFromEuler(e);
        m4.compose(v1.set(x, y - 0.6, z), qq, v2.set(1 + rnd() * 0.4, h, 1 + rnd() * 0.4));
        im.setMatrixAt(i, m4);
        const rec = { x, z, y, r: 1.75, wall: true }; rocks.list.push(rec); wallRecs.push(rec); // solid, not shootable
      });
      im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
      root.add(im);
      // the lanes: a line of small lights along the one way through
      const R0 = M.rings, path = [];
      const arc = (r, a0, a1) => { const n = Math.ceil((Math.abs(a1 - a0) * r) / 5); for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * (k / n); path.push([V.x + Math.cos(a) * r, V.z + Math.sin(a) * r]); } };
      const radial = (a, r0, r1) => { const n = Math.ceil(Math.abs(r1 - r0) / 5); for (let k = 0; k <= n; k++) { const r = r0 + (r1 - r0) * (k / n); path.push([V.x + Math.cos(a) * r, V.z + Math.sin(a) * r]); } };
      const c1 = (R0[0] + R0[1]) / 2, c2 = (R0[1] + R0[2]) / 2;
      radial(M.gaps[0], R0[0] + 12, c1);
      arc(c1, M.gaps[0], M.gaps[0] - Math.PI);           // the long way round (the block is the other way)
      radial(M.gaps[1], c1, c2);
      arc(c2, M.gaps[1], M.gaps[1] - Math.PI);
      radial(M.gaps[2], c2, 14);
      const post = new THREE.CylinderGeometry(0.14, 0.2, 0.9, 6).translate(0, 0.45, 0);
      const lanes = new THREE.InstancedMesh(post, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 2.6, 3.2) }), path.length);
      path.forEach(([x, z], i) => { m4.makeTranslation(x, terrain.heightAt(x, z), z); lanes.setMatrixAt(i, m4); });
      lanes.computeBoundingSphere(); lanes.visible = false; root.add(lanes);
      const laneLight = new VLight('#8fe8ff', 0, 30, 1.6); root.add(laneLight);
      maze = { lanes, path, laneLight, outer: R0[0] + 10, entry: path[0], walls: im, wallRecs };
    }
    // the Rime Spire: a Warden obelisk of ice and stone with the Compass Trim crate at its foot
    let spire = null;
    if (def.spire) {
      const P = def.spire, y = terrain.heightAt(P.x, P.z);
      const g = new THREE.Group(); g.position.set(P.x, y, P.z); root.add(g);
      const stone = new THREE.MeshStandardMaterial({ color: '#8f9aa3', roughness: 0.7, metalness: 0.2 });
      const iceM = new THREE.MeshStandardMaterial({ color: '#bfeaff', roughness: 0.08, emissive: '#1c5d78', flatShading: true });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(7, 8.5, 2, 6), stone); base.position.y = 0.6; g.add(base);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, 22, 6).translate(0, 11, 0), iceM); col.position.set(0, 1.5, 4); g.add(col);
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(2.2, 0).scale(1, 1.8, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.8, 3.4) })); tip.position.set(0, 27, 4); g.add(tip);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.2, 6, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 2.2, 2.8) })); halo.position.set(0, 18, 4); halo.rotation.x = Math.PI / 2; g.add(halo);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      rocks.list.push({ x: P.x, z: P.z + 4, y, r: 2.6, wall: true });
      const crate = new THREE.Group(); crate.position.set(P.x, y + 3.2, P.z - 2); root.add(crate);
      const fallback = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.5, 6), new THREE.MeshStandardMaterial({ color: '#d8e6ee', roughness: 0.5, metalness: 0.3, emissive: '#0a2a38' }));
      crate.add(fallback);
      onModel('crate', () => { const m = cloneModel('crate'); if (m) { crate.remove(fallback); crate.add(m); } });
      const cl = new VLight('#8fe8ff', 25, 14, 1.6); cl.position.y = 1.5; crate.add(cl);
      spire = { g, crate, halo, tip, x: P.x, z: P.z - 2, y: y + 3.2 };
    }
    // Vireo: the Veil Shrine (the armory: a Warden arch with a crystal turning in it, and the Phase Blink crate)
    let shrine = null;
    if (def.shrine) {
      const P = def.shrine, y = terrain.heightAt(P.x, P.z);
      const g = new THREE.Group(); g.position.set(P.x, y, P.z); root.add(g);
      const stone = new THREE.MeshStandardMaterial({ color: '#8a8198', roughness: 0.75, metalness: 0.2 });
      const lit = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.8, 2.8) });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(8, 9.5, 1.6, 8), stone); base.position.y = 0.4; g.add(base);
      for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.6, 12, 1.6).translate(0, 6, 0), stone); p.position.set(s * 6, 1, 4); g.add(p); }
      const arch = new THREE.Mesh(new THREE.TorusGeometry(6, 0.55, 8, 40, Math.PI), stone); arch.position.set(0, 13, 4); g.add(arch);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.16, 6, 48), lit); ring.position.set(0, 9, 4); g.add(ring);
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(1.4, 0).scale(1, 1.7, 1), lit); tip.position.set(0, 9, 4); g.add(tip);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      for (const s of [-1, 1]) rocks.list.push({ x: P.x + s * 6, z: P.z + 4, y, r: 1.3, wall: true });
      const crate = new THREE.Group(); crate.position.set(P.x, y + 2.6, P.z - 3); root.add(crate);
      const fallback = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.5, 6), new THREE.MeshStandardMaterial({ color: '#d8d0e6', roughness: 0.5, metalness: 0.3, emissive: '#2a1048' }));
      crate.add(fallback);
      onModel('crate', () => { const m = cloneModel('crate'); if (m) { crate.remove(fallback); crate.add(m); } });
      const cl = new VLight('#c49cff', 25, 14, 1.6); cl.position.y = 1.5; crate.add(cl);
      shrine = { g, crate, ring, tip, x: P.x, z: P.z - 3, y: y + 2.6 };
    }
    // Vireo: the veil wall round the vault, a shimmering ring of fog that pushes back anything that touches it
    let veilWall = null;
    if (def.veilWall) {
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        uniforms: { time: { value: 0 }, fade: { value: 1 } },
        vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform float time, fade; varying vec2 vU;
          float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
          float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
          void main(){
            float x = vU.x * 120.0, y = vU.y;
            float streak = n(vec2(x * 1.3, y * 3.0 - time * 0.6)) * 0.6 + n(vec2(x * 4.0 + time * 0.3, y * 8.0 - time * 1.2)) * 0.4;
            float a = smoothstep(0.35, 0.9, streak) * (1.0 - smoothstep(0.55, 1.0, y)) * smoothstep(0.0, 0.08, y);
            a = a * 0.55 + 0.12 * (1.0 - y);
            gl_FragColor = vec4(vec3(0.55, 0.3, 0.95) * a * fade, 1.0);
          }`,
      });
      veilWall = new THREE.Mesh(new THREE.CylinderGeometry(def.veilWall, def.veilWall, 34, 160, 1, true), m);
      veilWall.position.set(def.vault.x, terrain.vaultH + 9, def.vault.z); veilWall.frustumCulled = false; root.add(veilWall);
    }
    // Vireo's Warden ramps: lit rails up each side and a bar along the lip, so they read from a distance
    if (def.ramps) {
      const rail = new THREE.MeshBasicMaterial({ color: new THREE.Color(...def.accent).multiplyScalar(0.6) });
      for (const r of def.ramps) {
        const dx = Math.cos(r.a), dz = Math.sin(r.a), yaw = Math.atan2(dx, dz);
        const sx = r.x - dx * (RAMP.len - 2), sz = r.z - dz * (RAMP.len - 2);
        const y0 = terrain.heightAt(sx, sz), y1 = terrain.heightAt(r.x - dx * 0.5, r.z - dz * 0.5);
        const slope = Math.atan2(y1 - y0, RAMP.len - 1.5), L = Math.hypot(RAMP.len - 1.5, y1 - y0);
        for (const s of [-1, 1]) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, L), rail);
          b.position.set((sx + r.x) / 2 + dz * s * (RAMP.w / 2), (y0 + y1) / 2 + 0.35, (sz + r.z) / 2 - dx * s * (RAMP.w / 2));
          b.rotation.set(-slope, yaw, 0, 'YXZ'); root.add(b);
        }
        const lip = new THREE.Mesh(new THREE.BoxGeometry(RAMP.w, 0.2, 0.3), rail);
        lip.position.set(r.x - dx * 0.5, y1 + 0.15, r.z - dz * 0.5); lip.rotation.y = yaw; root.add(lip);
      }
    }
    // the vault base is solid
    rocks.list.push({ x: def.vault.x, z: def.vault.z, y: terrain.vaultH, r: 10 });
    // guardian, its arena wall, and the relic
    const titan = def.titan ? createTitan({ root, def, terrain, fx }) : def.sentinel ? createSentinel({ root, def, terrain, fx }) : def.matriarch ? createMatriarch({ root, def, terrain, fx }) : noTitan();
    const G = GUARD[id] || GUARD.kessa, arenaR = def.arenaR || ARENA_R;
    // heat curtain: bright at the ground, fading out by head height, with flickering streaks
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const cx2 = cv.getContext('2d');
    const grd = cx2.createLinearGradient(0, 64, 0, 0); grd.addColorStop(0, '#fff'); grd.addColorStop(0.35, '#777'); grd.addColorStop(1, '#000');
    cx2.fillStyle = grd; cx2.fillRect(0, 0, 256, 64);
    cx2.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 256; i += 4) { const k = 120 + Math.random() * 135; cx2.fillStyle = `rgb(${k},${k},${k})`; cx2.fillRect(i, 0, 4, 64); }
    const ctex = new THREE.CanvasTexture(cv); ctex.wrapS = THREE.RepeatWrapping; ctex.repeat.set(10, 1);
    const curtain = new THREE.Mesh(new THREE.CylinderGeometry(arenaR, arenaR, 7, 96, 1, true), new THREE.MeshBasicMaterial({ map: ctex, color: new THREE.Color(...G.curtain), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    curtain.position.set(def.vault.x, terrain.vaultH + 3.2, def.vault.z); curtain.visible = false; root.add(curtain);
    const ember = makeEmberCore(G.colors); root.add(ember.g);
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
    // creatures (and the parts they shatter into) stand on the sea ice, not on the sea bed under it
    const walkGround = def.hazard === 'ice' ? { ...terrain, heightAt: (x, z) => Math.max(terrain.heightAt(x, z), def.lava) } : terrain;
    const fauna = def.fauna ? createFauna({ root, def, terrain: walkGround, fx }) : noFauna();
    const b = { shrine, veilWall, islands, lance, def, root, terrain, sky, lava, rocks, embers, sun, lavaGlow, shipHolder, glyph, fx, geysers, geyserLight, ventRing, forge, titan, curtain, ember, bolts, fauna, maze, spire, G, arenaR, beacon };
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
    S = { time: 0, prompt: null, said: new Set(), hint: 9, hintMode: 'drive', lost: 0, planet: planetId, obj: taken ? 'return' : planetId === 'kessa' && upgrades.forgeplate ? 'cross' : 'vault', fight: false, gunCd: 0, barrel: 0, recoil: [0, 0], aimLift: 0, special: 'lance', heat: 0, over: false, lanceOn: false, lanceT: 0, lanceTgt: null, rockAcc: 0 };
    if (T.forge) T.forge.crate.visible = !upgrades.forgeplate;
    T.titan.reset();
    T.fauna.reset(rover.pos, Math.atan2(-v1.set(0, 0, -1).applyQuaternion(rover.quat).x, -v1.z));
    S.hurtT = 0; S.prevHull = rover.hull; S.hitMark = 0;
    T.curtain.visible = false;
    T.ember.g.visible = false;
    T.bolts.forEach((b) => { b.on = false; b.m.visible = false; });
    T.glyph.visible = !taken;
    T.beacon.visible = true;
    applyPlating();
    S.practiceN = 0;
    if (planetId === 'thalor') {
      // Thalor (6b): the vault sits inside an ice maze. Without the Compass Trim a whiteout drives us back;
      // the trim is in the Rime Spire across the sea, and with it the maze's lanes light up.
      const trim = !!upgrades.compassTrim;
      if (!taken) S.obj = trim ? 'maze' : 'vault';
      if (T.spire) T.spire.crate.visible = !trim;
      if (T.maze) T.maze.lanes.visible = trim && !taken;
      if (T.maze) setMazeSink(taken ? 1 : 0); // the walls went down when the Sentinel fell
      hooks.say('Rover is down. Thalor. Snow shelves, and the sea is frozen solid between them.');
      if (!taken) setTimeout(() => S && S.time < 12 && (S.obj === 'vault' || S.obj === 'maze') && hooks.say(trim
        ? 'The Compass Trim is fitted. The maze lanes are lit. Follow them to the vault.'
        : 'The vault signal is that cold light column. The Wayfarer is on the pad when you want to lift off.'), 6000);
      return;
    }
    if (planetId === 'vireo') {
      // Vireo (7b): a veil wall rings the vault; Phase Blink, from the Veil Shrine to the east, gets through it
      const blink = !!upgrades.phaseBlink;
      if (!taken) S.obj = blink ? 'veil' : 'vault';
      if (T.shrine) T.shrine.crate.visible = !blink;
      if (T.veilWall) { T.veilWall.visible = !taken; T.veilWall.material.uniforms.fade.value = 1; }
      hooks.say('Rover is down. Vireo. Gravity is light here, so we will float off every crest. And that fog has no floor I can find. Stay on the rock.');
      if (!taken) setTimeout(() => S && S.time < 14 && (S.obj === 'vault' || S.obj === 'veil') && hooks.say(blink
        ? 'Phase Blink is fitted. The vault is the violet column, north-west. Blink through the veil wall when we reach it.'
        : 'The vault signal is the violet column, to the north-west. There are land bridges between the mesas.'), 7000);
      return;
    }
    hooks.say('Rover is down. Kessa is basalt and lava. Stay off the bright ground.');
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
    hooks.say(T.G.wake);
  }
  function arenaRespawn() {
    const d = T.def;
    const a = Math.atan2(rover.pos.z - d.vault.z, rover.pos.x - d.vault.x);
    rover.pos.set(d.vault.x + Math.cos(a) * (T.arenaR - 12), 0, d.vault.z + Math.sin(a) * (T.arenaR - 12));
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
    blinking: () => (S.blinkGrace || 0) > 0, // mid-blink: the Matriarch's waves pass through us
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
        if (c.fade && c.alpha < 0.5) continue; // a faded Hollowed is not there to aim at
        v1.set(c.x, c.y + c.k.hitY, c.z).sub(camera.position);
        const d = v1.length(); if (d > 140 || d < 4) continue;
        const ang = v1.divideScalar(d).angleTo(aim.dir);
        if (ang < best) { best = ang; bc = c; }
      }
      if (bc) { aim.p.set(bc.x, bc.y + bc.k.hitY, bc.z); aim.lock = true; return; }
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
    r.inst.setMatrixAt(r.idx, m4b.compose(ps, qs, v1.copy(sc).multiplyScalar(r.hp > 0 ? k : 0.0001)));
    r.inst.instanceMatrix.needsUpdate = true;
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
      const boltDmg = eff(upgrades, 'bore', 'dmg'); // Workshop autocannon bore
      if (h) { T.titan.onBolt(h, titanCtx, boltDmg); b.on = false; b.m.visible = false; continue; }
      const fh = T.fauna.hitTest(segA, segB), rh = rockHit(segA, segB);
      if (fh && (!rh || fh.u <= rh.u)) {
        const died = T.fauna.damage(fh.c, boltDmg);
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
    if (hooks.shards) hooks.shards(c.k.shards || 1); // natives carry Wayshards
    if (c.kind === 'hound') faunaSay('hound-kill', 'Hound down. They are only following the heat. So are we.');
    else if (c.kind === 'shardback') faunaSay('shard-kill', 'Shardback down. Their plates grow from the ring-ice. They were here long before the Wardens.');
    else if (S.obj === 'practice') practiceKill();
  }

  // ---------- heat lance (the special weapon) ----------
  const lv = new THREE.Vector3(), lEnd = new THREE.Vector3();
  function updateLance(dt, inp) {
    const L = SPECIALS[S.special], B = T.lance;
    S.lanceOn = !!inp.special && !S.over;
    S.heat = S.lanceOn ? Math.min(1, S.heat + dt * L.heatPerSec * eff(upgrades, 'sink', 'heatK')) : Math.max(0, S.heat - dt * L.coolPerSec);
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
    if (kind === 'titan') { if (hit.kind === 'core' || hit.kind === 'orb' || hit.kind === 'shade') { T.titan.onBolt(hit, titanCtx, n, true); S.hitMark = 0.1; } } // the lance also burns the Matriarch's orbs and shades
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
    T.curtain.material.opacity = (S.fight ? 0.55 + 0.15 * Math.sin(S.time * 5) + clamp((toC - T.arenaR + 14) / 14, 0, 1) * 0.4 : 0) * (T.G.curtainK || 1);
    T.curtain.material.map.offset.x = S.time * 0.02;
    T.ventRing.visible = !!d.vents && !S.fight && T.titan.state === 'dormant' && !relics[S.planet];
    T.beacon.visible = !S.fight && T.titan.state === 'dormant'; // the vault's light column would run through the guardian
    if (S.fight && toC > T.arenaR - 3) {
      const nx = (rover.pos.x - d.vault.x) / toC, nz = (rover.pos.z - d.vault.z) / toC;
      const outv = rover.vel.x * nx + rover.vel.z * nz;
      if (outv > 0) { rover.vel.x -= nx * outv * 1.6; rover.vel.z -= nz * outv * 1.6; }
      rover.vel.x -= nx * 30 * dt; rover.vel.z -= nz * 30 * dt;
      S.shake = Math.max(S.shake, 0.3);
      say1('arena-wall', T.G.wall);
    }
    const ev = T.titan.update(dt, titanCtx);
    if (ev === 'awake') say1('awake', T.G.awake);
    if (ev === 'dead') {
      S.fight = false; T.curtain.visible = false;
      if (T.maze) { S.sinking = 0.001; noise(5.5, 0.5, 260, 40, 0.7); } // the maze goes down with its keeper
      if (T.veilWall) { S.veilFall = 0.001; noise(4.5, 0.4, 1400, 200, 0.8); } // and Vireo's veil wall comes apart with its keeper
      T.ember.g.visible = true; T.ember.t = 0;
      setObj('core');
      sfx.victory();
      if (hooks.shards) hooks.shards(120);
      hooks.say(T.G.dead);
    }
    // the Ember Core rises and turns
    if (T.ember.g.visible) {
      T.ember.t = (T.ember.t || 0) + dt;
      const C = T.titan.centre;
      T.ember.g.position.set(C.x, C.y + Math.min(5, T.ember.t * 2) + Math.sin(S.time * 1.6) * 0.3, C.z);
      T.ember.core.rotation.y += dt * 0.6; T.ember.shell.rotation.y -= dt * 0.3; T.ember.shell.rotation.x += dt * 0.2;
      T.ember.rings[0].rotation.set(S.time * 0.9, S.time * 0.4, 0); T.ember.rings[1].rotation.set(-S.time * 0.5, 0, S.time * 0.7);
      if (Math.random() < 0.4) T.fx.emit(T.ember.g.position, 1, { speed: 2, life: 1.2, size: 1, colors: [T.G.colors.core.map((v) => v * 0.8)], drag: 0.5 });
    }
  }

  function takeCore() {
    T.ember.g.visible = false;
    T.glyph.visible = false;
    setObj('return');
    sfx.victory();
    T.fx.emit(T.ember.g.position, 160, { speed: 16, life: 1.6, size: 2.4, colors: T.G.colors.burst, drag: 1.4 });
    if (hooks.relic) hooks.relic(S.planet); else relics[S.planet] = true; // main records it (relics is G.relics)
  }

  // ---------- physics ----------
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  const force = new THREE.Vector3(), torque = new THREE.Vector3();
  const mountW = new THREE.Vector3(), rel = new THREE.Vector3(), pv = new THREE.Vector3(), nrm = new THREE.Vector3();
  const wf = new THREE.Vector3(), ws = new THREE.Vector3(), cp = new THREE.Vector3(), fc = new THREE.Vector3();
  const qInv = new THREE.Quaternion();

  // Lava is a molten crust: wheels sink half a metre into it and burn, but never go under.
  // Sea ice (Thalor) is solid at its own level.
  const CRUST = 0.55;
  // Vireo's veil is fog, not a floor: the ground there is the chasm bed far below.
  const floorY = () => (T.def.hazard === 'veil' ? -Infinity : T.def.lava - (T.def.hazard === 'ice' ? 0 : CRUST));
  function ground(x, z) { return Math.max(T.terrain.heightAt(x, z), floorY()); }
  function groundNormal(x, z, out) {
    if (T.terrain.heightAt(x, z) < floorY()) return out.set(0, 1, 0);
    return T.terrain.normalAt(x, z, out);
  }
  function pointVel(r, out) { return out.crossVectors(rover.ang, r).add(rover.vel); }
  // the ground a tyre rests on: the highest point under its footprint, each sample lowered by the tyre's curve
  const tyreDir = new THREE.Vector3();
  const TYRE_SAMPLES = [-0.7, -0.35, 0, 0.35, 0.7, 0.95].map((k) => [k * R.wheelR, R.wheelR - Math.sqrt(Math.max(0, R.wheelR * R.wheelR - (k * R.wheelR) ** 2))]);
  function tyreGround(x, z) {
    let g = -Infinity;
    for (const [d, drop] of TYRE_SAMPLES) g = Math.max(g, ground(x + tyreDir.x * d, z + tyreDir.z * d) - drop);
    return g;
  }
  function applyAt(F, r) { force.add(F); torque.add(v4.crossVectors(r, F)); }

  function physicsStep(h, inp) {
    const terrain = T.terrain;
    fwd.set(0, 0, -1).applyQuaternion(rover.quat);
    right.set(1, 0, 0).applyQuaternion(rover.quat);
    up.set(0, 1, 0).applyQuaternion(rover.quat);
    force.set(0, -(T.def.gravity || R.gravity), 0); torque.set(0, 0, 0);
    const vF = rover.vel.dot(fwd);
    rover.speed = vF;

    // steering eases toward the stick; less lock at speed
    const steerMax = THREE.MathUtils.lerp(R.steerMax, R.steerFast, clamp(Math.abs(vF) / R.topSpeed, 0, 1));
    rover.steer += (-inp.moveX * steerMax - rover.steer) * Math.min(1, R.steerRate * h);

    let grounded = 0, rearIce = 0, iceN = 0;
    const drive = inp.drive;
    for (let w = 0; w < 4; w++) {
      const m = MOUNTS[w];
      rel.set(m[0], m[1], m[2]).applyQuaternion(rover.quat);
      mountW.copy(rover.pos).add(rel);
      // find where the wheel meets the ground along the suspension axis (-up). The tyre feels the ground across its
      // footprint, not just under its centre, so it starts to climb a rise before the body runs into it.
      tyreDir.set(fwd.x, 0, fwd.z); if (tyreDir.lengthSq() < 1e-4) tyreDir.set(0, 0, -1); tyreDir.normalize();
      let s = R.rest;
      for (let it = 0; it < 3; it++) {
        v1.copy(mountW).addScaledVector(up, -s);
        const gap = v1.y - R.wheelR - tyreGround(v1.x, v1.z);
        s += gap / Math.max(0.3, up.y);
      }
      s = clamp(s, 0, R.rest + R.travel);
      rover.comp[w] = s;
      const contact = s < R.rest + R.travel * 0.999 && (mountW.y - up.y * s - R.wheelR - tyreGround(mountW.x - up.x * s, mountW.z - up.z * s)) < 0.08;
      rover.contact[w] = contact;
      if (!contact) { rover.comp[w] = R.rest + R.travel; continue; }
      grounded++;
      cp.copy(mountW).addScaledVector(up, -(s + R.wheelR));
      groundNormal(cp.x, cp.z, nrm);
      pointVel(v2.subVectors(cp, rover.pos), pv);
      // spring + damper along the chassis up: progressive over the last of the travel, so it cushions instead of
      // slamming; the bump stop is only for a really hard landing
      const x = R.rest - s, vUp = pv.dot(up), xp = Math.max(0, x - R.progStart);
      let Fs = R.spring * x + R.springProg * xp * xp - (vUp < 0 ? R.dampBump : R.dampRebound) * vUp;
      if (s <= 0.001) { Fs += 40 * Math.max(0, -pv.dot(up)); rover.bumpN = (rover.bumpN || 0) + 1; } // bottomed out (counted for tests)
      Fs = Math.max(0, Fs);
      applyAt(v3.copy(up).multiplyScalar(Fs), rel);

      // tyre frame on the ground plane
      wf.copy(fwd);
      if (FRONT[w]) wf.applyAxisAngle(up, rover.steer);
      wf.addScaledVector(nrm, -wf.dot(nrm)).normalize();
      ws.crossVectors(wf, nrm).normalize();
      const vl = pv.dot(wf), vs = pv.dot(ws);
      const rearHand = inp.handbrake && !FRONT[w];
      // sea ice: a fraction of the grip, so the rover slides and needs room to stop and turn
      const onIce = (T.def.hazard === 'ice' && T.terrain.heightAt(cp.x, cp.z) < T.def.lava + 0.02) ||
        (T.titan.icy && Math.hypot(cp.x - T.def.vault.x, cp.z - T.def.vault.z) < T.arenaR); // Sentinel Prime's frozen arena
      const iceK = onIce ? (FRONT[w] ? ICE_FRONT : ICE_GRIP) : 1;
      // drive split: all four on solid ground; on ice the rear wheels do the work (so the tail steps out)
      const share = onIce ? (FRONT[w] ? 0 : 0.5) : 0.25;
      const nitroK = S.nitroT > 0 ? NITRO.engineK : 1;
      let Fl = 0;
      if (drive > 0.05) {
        const top = R.topSpeed * (T.boost || 1) * (S.nitroT > 0 ? NITRO.topK : 1);
        if (vF < -1) Fl = R.brake / 4 * drive; // braking out of reverse
        else Fl = R.engine * share * nitroK * drive * clamp(1 - vF / top, 0, 1);
      } else if (drive < -0.05) {
        if (vF > 1) Fl = -R.brake / 4 * -drive;
        else Fl = -R.engine * share * -drive * 0.7 * clamp(1 + vF / R.reverseTop, 0, 1);
      }
      Fl -= vl * R.roll;
      if (rearHand) Fl -= Math.sign(vl) * Math.min(Math.abs(vl) * 6, R.brake / 4);
      if (onIce) { if (!S.fight) rover.onIce = 0.25; Fl += vl * R.roll * 0.7; if (!FRONT[w]) rearIce++; iceN++; } // less rolling drag on ice too
      // throttle on ice spins the rear tyres: they lose most of their side grip, and round she goes
      const spin = onIce && !FRONT[w] && Math.abs(drive) > 0.05 ? 1 - 0.6 * Math.abs(drive) : 1;
      let Fy = -vs * R.grip * (rearHand ? 0.3 : 1) * iceK * spin;
      // friction circle: total tyre force limited by load
      if (onIce) {
        const limL = R.mu * Fs * (FRONT[w] ? ICE_FRONT : ICE_DRIVE), limS = R.mu * Fs * iceK * spin * (rearHand ? 0.55 : 1);
        Fl = clamp(Fl, -limL, limL); Fy = clamp(Fy, -limS, limS);
      } else {
        const lim = R.mu * Fs * (rearHand ? 0.55 : 1) * (T.def.gripK || 1); // light gravity means light load: Vireo pads the grip back
        const mag = Math.hypot(Fl, Fy);
        if (mag > lim) { Fl *= lim / mag; Fy *= lim / mag; }
      }
      fc.copy(wf).multiplyScalar(Fl).addScaledVector(ws, Fy);
      // apply tyre forces closer to the centre of mass so it carves instead of tipping
      v3.copy(rel).addScaledVector(up, -rel.dot(up) * 0.92);
      applyAt(fc, v3);
      rover.wheelSpin[w] += (vl / R.wheelR) * h;
      // lava under a wheel
      if (T.def.hazard === 'lava' && cp.y < T.def.lava + 0.05) rover.lavaT = 0.3;
    }

    // the chassis down in the lava burns too (rolled over, or bellied in)
    if (T.def.hazard === 'lava' && rover.pos.y < T.def.lava + 1.0) rover.lavaT = 0.3;

    // hull points: keep the body out of the ground (rolled or high-centred)
    for (const p of HULL_PTS) {
      rel.set(p[0], p[1], p[2]).applyQuaternion(rover.quat);
      v1.copy(rover.pos).add(rel);
      const g = ground(v1.x, v1.z);
      const pen = g - v1.y;
      if (pen > 0) {
        rover.hullN = (rover.hullN || 0) + 1; (rover.hullAt || (rover.hullAt = new Array(HULL_PTS.length).fill(0)))[HULL_PTS.indexOf(p)]++; // body scraping the ground (counted for tests)
        groundNormal(v1.x, v1.z, nrm);
        pointVel(rel, pv);
        const vn = pv.dot(nrm);
        const Fn = pen * 120 - Math.min(0, vn) * 10;
        v3.copy(nrm).multiplyScalar(Fn);
        // scrape friction: capped by how hard the body presses (Coulomb), so a scrape slides instead of stopping us dead
        // (it was 3 x the sliding speed per point: two points at 20 m/s braked at 120 m/s^2 and yanked the heading)
        v2.copy(pv).addScaledVector(nrm, -vn);
        const vt = v2.length();
        if (vt > 1e-4) v2.multiplyScalar(-Math.min(3, (HULL_MU * Math.max(0, Fn)) / vt));
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
    if (grounded === 0 && S.launched) {
      // a launch-ramp flight: the coil holds the rover level (holding throttle would otherwise tuck the nose into a dive)
      torque.addScaledVector(v1.crossVectors(up, UP), 7);
      torque.x -= rover.ang.x * 3; torque.z -= rover.ang.z * 3;
      torque.addScaledVector(UP, -inp.moveX * R.airTorque * 0.8);
    } else if (grounded === 0) {
      torque.addScaledVector(right, -inp.drive * R.airTorque);
      torque.addScaledVector(UP, -inp.moveX * R.airTorque * 0.8); // steer = yaw in the air, never roll
    }

    // power oversteer: both rear wheels on ice, throttle and lock -> the tail comes round
    if (rearIce === 2 && drive > 0.2 && Math.abs(inp.moveX) > 0.2) {
      const yawRate = rover.ang.dot(up), want = -Math.sign(inp.moveX);
      if (yawRate * want < ICE_SPIN_MAX) torque.addScaledVector(up, want * ICE_SPIN * drive * Math.abs(inp.moveX));
    }
    // nitro: a straight push along the chassis, fading toward its own top speed
    if (S.nitroT > 0) force.addScaledVector(fwd, NITRO.thrust * clamp(1 - vF / (R.topSpeed * NITRO.topK), 0, 1));

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
    rover.iceWheels = iceN; // for the rover sound
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
    hooks.say('Forgeplate is fused on. Back to the vault.');
    // the memory fragment is voiced on the drive back, not written on the card (owner, 2026-11-21)
    S.frag = { at: S.time + 5, lines: ['frag-forge-1', 'frag-forge-2'] };
    hooks.event && hooks.event({
      kicker: 'ARMORY · KESSA', title: 'FORGEPLATE HULL',
      text: 'Warden heat plating, fused to the rover. Heat vents cannot touch you, and lava burns slower.',
    });
  }

  // ---------- Thalor: the Rime Spire, the Compass Trim and the ice maze ----------
  // u = 0 (walls up) .. 1 (sunk out of sight). Colliders drop once the tops are below the rover.
  function setMazeSink(u) {
    const M = T.maze;
    M.sink = u;
    M.walls.position.y = -Math.pow(u, 1.4) * 14;
    M.walls.visible = u < 1;
    for (const r of M.wallRecs) r.dead = u > 0.55;
    if (u > 0) M.lanes.visible = false;
  }
  function collectTrim() {
    upgrades.compassTrim = true;
    T.spire.crate.visible = false;
    T.maze.lanes.visible = true;
    setObj('maze');
    sfx.victory();
    T.fx.emit(T.spire.crate.position, 120, { speed: 14, life: 1.4, size: 2.2, colors: [[1.6, 2.6, 3.2], [2.6, 3, 3.4]], drag: 1.5 });
    hooks.say('The trim is reading the ice already. There. The maze has lanes, and now I can see them.');
    hooks.event && hooks.event({
      kicker: 'ARMORY · THALOR', title: 'COMPASS TRIM',
      text: 'A Warden navigation trim, fitted to the rover\'s mast. It reads the lanes the Wardens cut through the ice, and the whiteout in the maze no longer blinds it.',
    });
    S.frag = { at: S.time + 6, lines: ['frag-trim-1', 'frag-trim-2'] };
  }
  function thalorMissions(dt, P, toVault) {
    if (S.sinking > 0 && T.maze) {
      S.sinking += dt / 5.5;
      setMazeSink(Math.min(1, S.sinking));
      S.shake = Math.max(S.shake, 0.35 * (1 - Math.min(1, S.sinking)));
      if (Math.random() < 0.5) { const q = T.maze.path[(Math.random() * T.maze.path.length) | 0]; T.fx.emit(v1.set(q[0] + (Math.random() - 0.5) * 20, ground(q[0], q[1]) + 0.5, q[1] + (Math.random() - 0.5) * 20), 4, { speed: 3, life: 1.4, size: 2.2, colors: [[0.9, 1, 1.1], [0.7, 0.85, 1]], drag: 1, dir: v2.set(0, 2, 0) }); }
      if (S.sinking >= 1) { S.sinking = 0; say1('sunk', 'The maze went down with its keeper. The way out is clear.'); }
    }
    const trim = !!upgrades.compassTrim, M = T.maze;
    // the whiteout: without the trim the maze's storm shoves us back out, like Kessa's heat wall
    S.whiteout = Math.max(0, (S.whiteout || 0) - dt);
    if (M && toVault < M.outer && !trim && !relics[S.planet]) {
      const nx = (P.x - T.def.vault.x) / toVault, nz = (P.z - T.def.vault.z) / toVault;
      const inward = -(rover.vel.x * nx + rover.vel.z * nz);
      if (inward > 0) { rover.vel.x += nx * inward * 1.6; rover.vel.z += nz * inward * 1.6; }
      rover.vel.x += nx * 26 * dt; rover.vel.z += nz * 26 * dt;
      S.whiteout = 0.5; S.shake = Math.max(S.shake, 0.25);
      if (S.obj === 'vault') setObj('trim');
      say1('whiteout', 'Whiteout! The storm in the maze is blinding my sensors and pushing us out. There is a Warden spire across the frozen sea. If anything can read this ice, it is there.');
    }
    if (M && toVault < M.outer + 30 && trim) say1('lanes', 'Lanes are lit. Stay on them, the maze only has one way through.');
    // the spire's crate
    if (!S.prompt && T.spire && !trim) {
      const fd = Math.hypot(P.x - T.spire.x, P.z - T.spire.z);
      if (fd < 9) S.prompt = { type: 'trim', label: 'COLLECT COMPASS TRIM' };
      if (fd < 45) say1('spire', 'The Rime Spire. A Warden armory crate at its foot. Bring us close.');
    }
    if (T.spire && T.spire.crate.visible) {
      T.spire.crate.rotation.y += dt * 0.8;
      T.spire.crate.position.y = T.spire.y + Math.sin(S.time * 1.8) * 0.25;
    }
    if (T.spire) { T.spire.halo.rotation.z += dt * 0.4; T.spire.tip.rotation.y += dt * 0.6; }
    // the centre: the vault door wakes Sentinel Prime (main shows the card, then calls wakeGuardian)
    if (!S.prompt && S.obj === 'maze' && toVault < 24) {
      S.prompt = { type: 'vault', label: 'OPEN THE VAULT' };
      say1('door2', 'We are through. The vault is right here, and the ice over it is humming. Ready when you are.');
    }
    if (!S.prompt && S.obj === 'core' && T.ember.g.visible && T.ember.t > 2 && toVault < 14) S.prompt = { type: 'core', label: 'TAKE THE ' + T.G.relic };
    // a lane light that follows the rover along the path so the lanes glow near us
    if (M && M.lanes.visible) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < M.path.length; i += 2) { const q = M.path[i], dd = (q[0] - P.x) ** 2 + (q[1] - P.z) ** 2; if (dd < bd) { bd = dd; bi = i; } }
      const q = M.path[bi];
      M.laneLight.position.set(q[0], ground(q[0], q[1]) + 2, q[1]);
      M.laneLight.intensity = bd < 900 ? 18 : 0;
    }
    return null;
  }

  // ---------- Vireo: the veil and the mesas ----------
  // Drop into the veil and the fog slows the fall, the view goes violet, and after a second WREN hauls the
  // rover back to the last open rock it stood on (away from any edge), for a little hull.
  function veilStep(dt) {
    const d = T.def;
    S.veilFlash = Math.max(0, (S.veilFlash || 0) - dt);
    if (!S.safe) { S.safe = []; S.safeT = 0; S.veilN = 0; }
    S.safeT += dt;
    if (S.safeT > 0.4 && S.grounded >= 3 && rover.pos.y > d.lava + 3) {
      S.safeT = 0;
      const x = rover.pos.x, z = rover.pos.z;
      let ok = true;
      for (let k = 0; k < 8 && ok; k++) { const a = (k * Math.PI) / 4; if (T.terrain.heightAt(x + Math.cos(a) * 8, z + Math.sin(a) * 8) < d.lava + 3) ok = false; }
      if (ok) { S.safe.push({ x, z, yaw: Math.atan2(-fwd.x, -fwd.z) }); if (S.safe.length > 12) S.safe.shift(); }
    }
    if (rover.pos.y > d.lava - 1.5) { S.veilT = 0; return; }
    S.veilT = (S.veilT || 0) + dt;
    rover.vel.multiplyScalar(Math.exp(-2.5 * dt)); // the fog is thick: it slows the fall
    if (S.veilT < 1.0) return;
    const p = S.safe.length > 2 ? S.safe[S.safe.length - 3] : S.safe[S.safe.length - 1];
    if (p) {
      rover.pos.set(p.x, ground(p.x, p.z) + 1.4, p.z);
      rover.quat.setFromAxisAngle(UP, p.yaw);
    } else placeAtPad();
    rover.vel.set(0, 0, 0); rover.ang.set(0, 0, 0);
    cam.yaw = 0; cam.pos.copy(rover.pos).add(v1.set(0, 4, 10).applyQuaternion(rover.quat));
    rover.hull -= 12; sfx.playerHit(true);
    S.veilT = 0; S.veilFlash = 1.2; S.veilN++;
    hooks.say(S.veilN === 1
      ? 'Into the veil! I have the tether on the rock. Hold on... got us. The hull felt that. Stay away from the edges.'
      : S.veilN % 2 ? 'Hauled us out again. Mind the edges.' : 'Got us. The veil is not a road.');
  }
  function collectBlink() {
    upgrades.phaseBlink = true;
    T.shrine.crate.visible = false;
    setObj('veil');
    sfx.victory();
    T.fx.emit(T.shrine.crate.position, 120, { speed: 14, life: 1.4, size: 2.2, colors: [[2, 1, 3.2], [2.8, 2, 3.4]], drag: 1.5 });
    hooks.say('Phase Blink is fitted. Tap V, or Y on a pad, and we step straight through anything thin. Back to the vault.');
    S.frag = { at: S.time + 6, lines: ['frag-blink-1', 'frag-blink-2'] }; // the memory fragment, voiced on the drive back
    hooks.event && hooks.event({
      kicker: 'ARMORY · VIREO', title: 'PHASE BLINK',
      text: 'A Warden phase coil, fitted under the rover. Tap V (Y on a gamepad) and the rover steps fourteen metres ahead in an instant: through the veil wall, or across a gap in the rock in mid-air. It recharges in a few seconds.',
    });
  }
  function doBlink() {
    const f = v1.set(0, 0, -1).applyQuaternion(rover.quat); f.y = 0;
    if (f.lengthSq() < 0.01) f.set(rover.vel.x, 0, rover.vel.z);
    f.normalize();
    // never into a cliff face: shorten the step until the ground there is no higher than we can land on
    let D = BLINK.dist;
    for (; D > 4; D -= 2) if (ground(rover.pos.x + f.x * D, rover.pos.z + f.z * D) < rover.pos.y + 2.5) break;
    v2.copy(rover.pos);
    rover.pos.x += f.x * D; rover.pos.z += f.z * D;
    const g = ground(rover.pos.x, rover.pos.z);
    if (rover.pos.y < g + 1.2) rover.pos.y = g + 1.2;
    rover.vel.addScaledVector(f, BLINK.kick);
    S.blinkCd = BLINK.cd; S.blinkGrace = BLINK.grace; S.shake = Math.max(S.shake, 0.3);
    for (let k = 0; k <= 10; k++) T.fx.emit(v3.lerpVectors(v2, rover.pos, k / 10), 4, { raw: true, speed: 1.5, life: 0.55, size: 1.2, colors: [[1.6, 0.8, 2.8], [2.4, 1.6, 3.4]], drag: 3 });
    sfx.blink();
    say1('blink-1', 'Blink! Fourteen metres in no time at all. It needs a few seconds to charge again.');
  }
  function vireoMissions(dt, P, toVault) {
    const d = T.def, blink = !!upgrades.phaseBlink;
    // the first long hang off a crest
    if (S.grounded === 0 && rover.pos.y - ground(P.x, P.z) > 2.5) S.airT = (S.airT || 0) + dt; else S.airT = 0;
    if (S.airT > 0.7) say1('float', 'Light gravity. We hang in the air off every crest. Land it straight.');
    for (const c of d.causeways || []) {
      const ci = pathInfo(c.pts, P.x, P.z);
      if (ci.d < c.half && ci.t > 60 && T.terrain.heightAt(P.x + 14, P.z) < d.lava) say1('bridge', 'A land bridge. Warden work, I think. Keep it straight: the drop on either side goes into the veil.');
    }
    // the veil wall: touching it shoves us back to whichever side we came from, unless we blink through it
    S.veilWallT = Math.max(0, (S.veilWallT || 0) - dt);
    if (T.veilWall && T.veilWall.visible) {
      const R = d.veilWall, band = 3.5;
      if (Math.abs(toVault - R) < band && !(S.blinkGrace > 0)) {
        const out = toVault > R ? 1 : -1, nx = (P.x - d.vault.x) / toVault * out, nz = (P.z - d.vault.z) / toVault * out;
        const into = -(rover.vel.x * nx + rover.vel.z * nz);
        if (into > 0) { rover.vel.x += nx * into * 1.6; rover.vel.z += nz * into * 1.6; }
        rover.vel.x += nx * 24 * dt; rover.vel.z += nz * 24 * dt;
        S.veilWallT = 0.5; S.shake = Math.max(S.shake, 0.3);
        if (!blink) {
          if (S.obj === 'vault') setObj('blink');
          say1('veilwall', 'A veil wall! Nothing drives through that. There is a Warden shrine on the far mesa to the east, across the long bridge. If anything gets us past this, it is there.');
        } else say1('veilwall-b', 'Now blink! Straight at the wall, and tap it.');
      }
      if (blink && toVault < R - band && S.obj === 'veil') {
        setObj('door');
        say1('through', 'We are through the veil. The vault is right ahead, and something in there knows we came.');
      }
    }
    // after the Matriarch: the veil wall thins and comes apart over 4 s, so the way out is open
    if (S.veilFall > 0 && T.veilWall) {
      S.veilFall += dt / 4;
      T.veilWall.material.uniforms.fade.value = Math.max(0, 1 - S.veilFall);
      if (Math.random() < 0.6) { const a = Math.random() * 6.28; T.fx.emit(v1.set(d.vault.x + Math.cos(a) * d.veilWall, T.terrain.vaultH + 2 + Math.random() * 10, d.vault.z + Math.sin(a) * d.veilWall), 3, { speed: 2, life: 1.6, size: 2.4, colors: [[1, 0.5, 1.8], [0.6, 0.4, 1]], drag: 0.8, dir: v2.set(0, 2, 0) }); }
      if (S.veilFall >= 1) { S.veilFall = 0; T.veilWall.visible = false; say1('veil-down', 'The veil wall went with her. The way back to the Wayfarer is open.'); }
    }
    // the vault: the door wakes the Matriarch (main shows the banner, then calls wakeGuardian); then the Veil Lens
    if (!S.prompt && S.obj === 'door' && toVault < 24) {
      S.prompt = { type: 'vault', label: 'OPEN THE VAULT' };
      say1('door-v', 'The vault. The veil is thinnest right here. Ready when you are.');
    }
    if (!S.prompt && S.obj === 'core' && T.ember.g.visible && T.ember.t > 2 && toVault < 14) S.prompt = { type: 'core', label: 'TAKE THE ' + T.G.relic };
    // the shrine's crate
    if (!S.prompt && T.shrine && !blink) {
      const fd = Math.hypot(P.x - T.shrine.x, P.z - T.shrine.z);
      if (fd < 9) S.prompt = { type: 'blinkmod', label: 'COLLECT PHASE BLINK' };
      if (fd < 50) say1('shrine', 'The Veil Shrine. A Warden armory crate under the arch. Bring us close.');
    }
    if (T.shrine) {
      if (T.shrine.crate.visible) { T.shrine.crate.rotation.y += dt * 0.8; T.shrine.crate.position.y = T.shrine.y + Math.sin(S.time * 1.8) * 0.25; }
      T.shrine.ring.rotation.y += dt * 0.5; T.shrine.tip.rotation.y -= dt * 0.9;
    }
    return null;
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
        if (T.fauna && dist < 80) for (const c of T.fauna.list) {
          if (!c.alive || Math.abs(c.x - g.x) > 4.5 || Math.abs(c.z - g.z) > 4.5 || S.time - (c.ventT || -9) < 1.2) continue;
          if (Math.hypot(c.x - g.x, c.z - g.z) < 4.5) { c.ventT = S.time; if (T.fauna.damage(c, 3, true)) sfx.explode(false); }
        }
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

    if (d.hazard === 'ice') return thalorMissions(dt, P, toVault);
    if (d.hazard === 'veil') return vireoMissions(dt, P, toVault);

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
    if (!S.prompt && S.obj === 'core' && T.ember.g.visible && T.ember.t > 2 && toVault < 14) S.prompt = { type: 'core', label: 'TAKE THE ' + T.G.relic };
    if (!S.prompt && plated && toVault < 24 && S.obj === 'cross') {
      S.prompt = { type: 'vault', label: 'OPEN THE VAULT' };
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
    // nitro: press boost (Shift / pad B) when it is charged
    S.nitroT = Math.max(0, (S.nitroT || 0) - dt); S.nitroCd = Math.max(0, (S.nitroCd || 0) - dt);
    if (inp.boost && !S.boostPrev && S.nitroCd <= 0) {
      S.nitroT = NITRO.dur; S.nitroCd = NITRO.dur + NITRO.cd; S.shake = Math.max(S.shake, 0.5);
      sfx.nitro && sfx.nitro();
      say1('nitro', 'Nitro. It recharges in a few seconds. Good for getting out of trouble.');
    } else if (inp.boost && !S.boostPrev && S.nitroCd > 0) sfx.denied && sfx.denied();
    S.boostPrev = inp.boost;
    rover.onIce = Math.max(0, (rover.onIce || 0) - dt);
    if (rover.onIce > 0) say1('ice', 'Sea ice. There is almost no grip out here. Ease off, and turn early.');
    for (let i = 0; i < steps; i++) grounded = physicsStep(h, inp);
    S.grounded = grounded;
    if (T.def.hazard === 'veil') veilStep(dt);
    // Warden launch ramps: crossing the lit lip on the ground throws us up, harder the faster we hit it,
    // and levels the rover for the flight (about 25 m at 55 km/h, about 50 m with nitro, at Vireo gravity)
    S.launchCd = Math.max(0, (S.launchCd || 0) - dt);
    if (S.launched) { S.launchT += dt; if (S.launchT > 0.4 && S.grounded >= 2) S.launched = false; } // down again
    if (T.def.ramps && S.launchCd <= 0 && S.grounded >= 2) for (const r of T.def.ramps) {
      const dx = Math.cos(r.a), dz = Math.sin(r.a);
      const u = (rover.pos.x - r.x) * dx + (rover.pos.z - r.z) * dz, v = Math.abs(-(rover.pos.x - r.x) * dz + (rover.pos.z - r.z) * dx);
      const vAlong = rover.vel.x * dx + rover.vel.z * dz;
      if (u > -3 && u < 0.8 && v < RAMP.w / 2 + 0.5 && vAlong > 6) {
        rover.vel.y = Math.max(rover.vel.y, 4 + vAlong * 0.09);
        rover.ang.x = 0; rover.ang.z = 0; // keep the nose level in the air
        S.launchCd = 1.2; S.shake = Math.max(S.shake, 0.35); S.launched = true; S.launchT = 0;
        T.fx.emit(v1.set(r.x, rover.pos.y - 0.6, r.z), 30, { raw: true, speed: 6, life: 0.6, size: 1.3, colors: [[1.6, 0.8, 2.8], [2.4, 1.6, 3.4]], drag: 2.5, dir: v2.set(dx * 4, 5, dz * 4) });
        sfx.blink();
        say1('ramp', 'A Warden launch ramp! The faster we hit it, the further it throws us. With nitro, mind where we land.');
        break;
      }
    }
    // Phase Blink (once the shrine's coil is fitted): V or pad Y
    S.blinkCd = Math.max(0, (S.blinkCd || 0) - dt); S.blinkGrace = Math.max(0, (S.blinkGrace || 0) - dt);
    if (inp.pressed.has('blink') && upgrades.phaseBlink && !(S.prompt && S.prompt.type === 'right') && rover.pos.y > T.def.lava - 1) {
      if (S.blinkCd > 0) sfx.denied(); else doBlink();
    }
    // a memory fragment from an armory pickup, voiced a few seconds into the drive (S.time stops while a card is up)
    if (S.frag && S.time > S.frag.at) { hooks.lines && hooks.lines(S.frag.lines); S.frag = null; }

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
      T.fauna.update(dt, S.time, { rover, heading: Math.atan2(-fw.x, -fw.z), quiet: S.fight, damage: (n) => { rover.hull -= n; sfx.playerHit(true); }, shake: (k) => { S.shake = Math.max(S.shake, k); }, say: faunaSay,
        push: (x, z) => { rover.vel.x += x; rover.vel.z += z; rover.vel.y += 3; rover.ang.y += (Math.random() - 0.5) * 2.5; } }); // a shardback's ram
      // Workshop armour: every loss this frame, whatever caused it, is cut down
      if (rover.hull < S.prevHull && rover.hull > 0) rover.hull = S.prevHull - (S.prevHull - rover.hull) * eff(upgrades, 'armour', 'dmgK');
      // the hull mends slowly once nothing has hurt it for a while (never mid-fight)
      if (rover.hull < S.prevHull - 0.001) S.hurtT = S.time;
      if (!S.fight && S.time - S.hurtT > 6 && rover.hull < 100) rover.hull = Math.min(100, rover.hull + 2.5 * dt);
      S.prevHull = rover.hull;
      S.hitMark = Math.max(0, S.hitMark - dt);
    }
    if (inp.pressed.has('accept') || (S.prompt && S.prompt.type === 'right' && inp.pressed.has('zero'))) {
      if (S.prompt?.type === 'orbit') result = { type: 'orbit' };
      else if (S.prompt?.type === 'collect') collectForgeplate();
      else if (S.prompt?.type === 'trim') collectTrim();
      else if (S.prompt?.type === 'blinkmod') collectBlink();
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
    if (T.lava.material.uniforms) T.lava.material.uniforms.time.value = S.time; // the ice sheet has no clock
    // Thalor's maze: the fog thickens toward the maze (a whiteout without the trim, a light haze with it)
    if (T.maze && scene.fog) {
      const tv = Math.hypot(rover.pos.x - d.vault.x, rover.pos.z - d.vault.z);
      const k = clamp(1 - (tv - T.maze.outer) / 40, 0, 1);
      const want = d.sky.fogDensity * (1 + k * (S.fight || T.titan.state !== 'dormant' ? 0 : upgrades.compassTrim || relics[S.planet] ? 1.2 : 9));
      scene.fog.density += (want - scene.fog.density) * Math.min(1, dt * 2);
    }
    T.embers.update(dt, rover.pos, S.time);
    if (T.islands) T.islands.update(S.time);
    if (T.veilWall) T.veilWall.material.uniforms.time.value = S.time;
    T.fx.update(dt); // sparks, fire and dust (was never stepped, so surface particles never showed)
    if (S.nitroT > 0) for (const sx of [-0.55, 0.55]) { // twin exhaust flames off the tail
      v2.set(sx, 0.25, 2.0).applyQuaternion(rover.quat).add(rover.pos);
      v3.set(0, 0, 1).applyQuaternion(rover.quat).multiplyScalar(9).add(rover.vel);
      T.fx.emit(v2, 3, { raw: true, speed: 2, life: 0.22, size: 1.1, colors: [[1.2, 2.2, 3.2], [2.6, 1.6, 0.6], [3, 2.6, 1.6]], drag: 3, dir: v3 });
    }
    T.glyph.rotation.z += dt * 0.3;
    T.sun.position.copy(rover.pos).addScaledVector(v1.set(...d.sky.sunDir).normalize(), 120);
    T.sun.target.position.copy(rover.pos);
    T.sky.position.copy(camera.position);
    // lava light near the rover when lava is close below
    const nearLava = d.hazard === 'lava' ? clamp(1 - (rover.pos.y - d.lava) / 12, 0, 1) : 0;
    T.lavaGlow.position.set(rover.pos.x, d.lava + 2, rover.pos.z);
    T.lavaGlow.intensity = nearLava * 26;

    // ----- camera: chase behind the heading, orbit with right stick or mouse -----
    const inv = settings.invertRover ? -1 : 1;
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
    // in a guardian fight the camera stays inside the arena wall (behind the ice walls it can't see the fight):
    // pull it in along the boom toward the rover until it is inside
    if (S.fight) {
      const lim = T.arenaR - 0.5, cx = d.vault.x, cz = d.vault.z; // just inside the (see-through) arena wall
      let keep = 1;
      for (let k = 0; k < 24 && Math.hypot(v1.x - cx, v1.z - cz) > lim; k++) {
        v1.x = rover.pos.x + (v1.x - rover.pos.x) * 0.88; v1.z = rover.pos.z + (v1.z - rover.pos.z) * 0.88; keep *= 0.88;
      }
      v1.y += (1 - keep) * 3.5; // a little higher as the boom shortens
      S.camKeep = keep;
    }
    const gy = ground(v1.x, v1.z) + 1.4;
    if (v1.y < gy) v1.y = gy;
    if (d.hazard === 'veil' && v1.y < d.lava + 4) v1.y = d.lava + 4; // stay over the veil: watch the rover sink into it
    cam.pos.lerp(v1, 1 - Math.exp(-8 * dt));
    // a shortened boom looks past the rover, along the view, so it sees the fight over the rover's roof
    const ahead = S.fight ? (1 - (S.camKeep ?? 1)) * 9 : 0;
    if (!S.fight) S.camKeep = 1;
    cam.look.lerp(v2.copy(rover.pos).add(v3.set(-Math.sin(yaw) * ahead, 1.4 + S.aimLift, -Math.cos(yaw) * ahead)), 1 - Math.exp(-12 * dt));
    camera.position.copy(cam.pos);
    if (S.shake > 0) camera.position.add(v3.set(Math.random() - 0.5, Math.random() - 0.5, 0).multiplyScalar(S.shake * 0.3));
    camera.up.set(0, 1, 0);
    camera.lookAt(cam.look);
    const fov = 68 + clamp(Math.abs(rover.speed) - 15, 0, 10) * 0.6 + (S.nitroT > 0 ? 8 : 0);
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    updateAim(camera, inp.device);
    updateTurret(dt, inp);
    updateLance(dt, inp);
    T.lights.update(camera.position);
    hudCam = camera;
    return result;
  }

  // ---------- HUD ----------
  function text(ctx, str, x, y, size, rgb, a = 1, align = 'center', weight = 600) {
    ctx.font = `${weight} ${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(${rgb},${a})`; ctx.fillText(str, x, y);
  }
  // A dark box with an amber kicker and a white line. The line shrinks to fit, and the box grows to hold it,
  // so the text never runs past the box (owner, 2026-11-21).
  function panel(ctx, W, y, kicker, line, size, a) {
    const maxW = Math.min(W * 0.92, 980) - 48;
    ctx.font = `700 ${size}px ${FONT}`;
    const w = ctx.measureText(line).width;
    if (w > maxW) size *= maxW / w;
    ctx.font = `700 ${size}px ${FONT}`;
    const bw = Math.min(W * 0.92, Math.max(Math.min(W * 0.84, 520), ctx.measureText(line).width + 48));
    ctx.fillStyle = `rgba(6,12,22,${0.9 * a})`; ctx.fillRect(W / 2 - bw / 2, y - 38, bw, 76);
    text(ctx, kicker, W / 2, y - 14, Math.min(size * 0.7, 14 * Math.min(W, 900) / 900 + 5), AMBER, a, 'center', 700);
    text(ctx, line, W / 2, y + 14, size, '255,255,255', a, 'center', 700);
  }
  function drawHud(ctx, W, H, G, device) {
    if (!S) return;
    const sc = Math.min(W, H) / 900;
    // health bars over wounded creatures (nothing over a creature at full health)
    if (hudCam && T) for (const c of T.fauna.list) {
      if (!c.alive || !c.g.visible || c.hp >= c.k.hp) continue;
      const d = Math.hypot(c.x - hudCam.position.x, c.z - hudCam.position.z);
      if (d > 140) continue;
      hb.set(c.x, c.y + c.k.barY, c.z).project(hudCam);
      if (hb.z > 1 || Math.abs(hb.x) > 1.05 || Math.abs(hb.y) > 1.05) continue;
      const x = (hb.x + 1) / 2 * W, y = (1 - hb.y) / 2 * H;
      const k = clamp(28 / Math.max(d, 1), 0.55, 1.4), bw = c.k.barW * k * (0.6 + sc * 0.4), bh = Math.max(3, 6 * k);
      const f = clamp(c.hp / c.k.hp, 0, 1), a = clamp((140 - d) / 30, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(6,12,22,0.75)'; ctx.fillRect(x - bw / 2 - 2, y - bh / 2 - 2, bw + 4, bh + 4);
      ctx.fillStyle = 'rgba(' + RED + ',0.25)'; ctx.fillRect(x - bw / 2, y - bh / 2, bw, bh);
      ctx.fillStyle = 'rgba(' + (f > 0.5 ? AMBER : RED) + ',0.95)'; ctx.fillRect(x - bw / 2, y - bh / 2, bw * f, bh);
      ctx.globalAlpha = 1;
    }
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
    else if (S.obj === 'blink' && T.shrine) {
      mark(bear(T.shrine.x, T.shrine.z), '◆ VEIL SHRINE ' + Math.round(Math.hypot(T.shrine.x - rover.pos.x, T.shrine.z - rover.pos.z)) + ' M', AMBER, true);
      mark(bear(d.vault.x, d.vault.z), 'VAULT', '190,160,230', false);
    }
    else if (S.obj === 'trim' && T.spire) {
      mark(bear(T.spire.x, T.spire.z), '◆ RIME SPIRE ' + Math.round(Math.hypot(T.spire.x - rover.pos.x, T.spire.z - rover.pos.z)) + ' M', AMBER, true);
      mark(bear(d.vault.x, d.vault.z), 'VAULT', '150,200,220', false);
    } else if (S.obj === 'maze' && T.maze) {
      const e = T.maze.entry, de = Math.hypot(e[0] - rover.pos.x, e[1] - rover.pos.z);
      if (Math.hypot(rover.pos.x - d.vault.x, rover.pos.z - d.vault.z) > T.maze.outer + 4) mark(bear(e[0], e[1]), '◆ MAZE ENTRY ' + Math.round(de) + ' M', AMBER, true);
      else mark(bear(d.vault.x, d.vault.z), '◆ VAULT ' + Math.round(dv) + ' M', AMBER, true);
    }
    else if (S.obj === 'guardian') mark(bear(d.vault.x, d.vault.z), '◆ ' + T.G.short, RED, true);
    else if (S.obj === 'core') mark(bear(d.vault.x, d.vault.z), '◆ ' + T.G.relic + ' ' + Math.round(dv) + ' M', GOLD, true);
    else if (S.obj !== 'return') mark(bear(d.vault.x, d.vault.z), '◆ VAULT ' + Math.round(dv) + ' M', AMBER, true);
    const OBJ = {
      practice: 'Target practice · shoot cinder skitters by the pad ' + Math.min(5, S.practiceN || 0) + '/5',
      vault: 'Reach the vault signal',
      plate: 'Find heat plating · the Forge Gate, end of the Magma Canyon',
      cross: 'Return to the vault',
      guardian: T.G.obj,
      core: 'Take ' + T.G.relicName,
      return: 'Return to the Wayfarer and lift off',
      trim: 'Get through the whiteout · find the Rime Spire across the sea',
      maze: 'Follow the lit lanes through the ice maze to the vault',
      scouted: S.planet === 'vireo' ? 'Through the veil · the guardian is the next build step' : 'Through the maze · the guardian is the next build step',
      blink: 'Find a way through the veil wall · the Veil Shrine, east across the long bridge',
      door: 'Open the vault',
      veil: 'Blink through the veil wall to the vault',
    };
    text(ctx, OBJ[S.obj] || '', W / 2, 90, 14 * sc + 5, '230,251,255', 0.9, 'center', 600);
    // a short card that fades by itself (the vault opening), then the NEW OBJECTIVE flash waits its turn
    if (S.banner) {
      const B = S.banner, t = (B.t += 1 / 60);
      const a = Math.min(1, t / 0.3) * Math.min(1, (B.dur - t) / 0.8);
      if (t >= B.dur) S.banner = null;
      else panel(ctx, W, H * 0.3, B.kicker, B.title, 22 * sc + 10, Math.max(0, a));
    } else if (S.objFlash > 0) {
      S.objFlash -= 1 / 60;
      const a = Math.min(1, S.objFlash) * Math.min(1, (4 - S.objFlash) * 4);
      panel(ctx, W, H * 0.33, 'NEW OBJECTIVE', OBJ[S.obj] || '', 20 * sc + 8, a);
    }
    {
      const va = Math.max(clamp(S.veilT || 0, 0, 1) * 0.8, Math.min(1, S.veilFlash || 0) * 0.6);
      if (va > 0.01) {
        ctx.fillStyle = `rgba(42,18,74,${va})`; ctx.fillRect(0, 0, W, H);
        if (S.veilT > 0) text(ctx, 'IN THE VEIL · HAULING BACK', W / 2, H * 0.25, 24 * sc + 10, '205,170,255', 0.6 + 0.4 * Math.sin(S.time * 10), 'center', 700);
      }
    }
    if (S.veilWallT > 0) text(ctx, upgrades.phaseBlink ? 'VEIL WALL · BLINK THROUGH IT' : 'VEIL WALL · NEED PHASE BLINK', W / 2, H * 0.25, 24 * sc + 10, '205,170,255', 0.6 + 0.4 * Math.sin(S.time * 10), 'center', 700);
    if (S.whiteout > 0) text(ctx, 'WHITEOUT · SENSORS BLIND', W / 2, H * 0.25, 24 * sc + 10, '200,235,255', 0.6 + 0.4 * Math.sin(S.time * 10), 'center', 700);
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
      text(ctx, T.G.name + ' · VAULT GUARDIAN', W / 2, by2 - 12, 13 * sc + 5, RED, 0.95, 'center', 700);
      ctx.fillStyle = 'rgba(6,12,22,0.75)'; ctx.fillRect(bx2 - 3, by2 - 3, bw2 + 6, 16);
      ctx.fillStyle = 'rgba(255,77,109,0.22)'; ctx.fillRect(bx2, by2, bw2, 10);
      ctx.fillStyle = 'rgba(255,120,60,0.95)'; ctx.fillRect(bx2, by2, bw2 * clamp(T.titan.hp / T.G.hp, 0, 1), 10);
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
      // nitro, above the lance: drains while it burns, refills over the cooldown
      const ny = ly - 38, on = S.nitroT > 0, ready = !on && (S.nitroCd || 0) <= 0;
      const nf = on ? S.nitroT / NITRO.dur : ready ? 1 : 1 - (S.nitroCd || 0) / NITRO.cd;
      const nc = on ? '140,230,255' : ready ? CYAN : '120,150,170';
      ctx.fillStyle = 'rgba(6,12,22,0.72)'; ctx.fillRect(bx - 4, ny - 4, bw + 8, 14);
      ctx.fillStyle = 'rgba(' + nc + ',0.2)'; ctx.fillRect(bx, ny, bw, 6);
      ctx.fillStyle = 'rgba(' + nc + ',0.95)'; ctx.fillRect(bx, ny, bw * clamp(nf, 0, 1), 6);
      text(ctx, 'NITRO' + (padL ? ' · B' : ' · SHIFT'), bx, ny - 12, 12, nc, 0.85, 'left');
      text(ctx, on ? 'BURNING' : ready ? 'READY' : 'CHARGING', bx + bw, ny - 12, 12, nc, ready ? 0.6 + 0.4 * Math.abs(Math.sin(S.time * 3)) : 0.85, 'right');
      if (upgrades.phaseBlink) { // Phase Blink, above nitro
        const ky = ny - 38, kr = (S.blinkCd || 0) <= 0, kf = kr ? 1 : 1 - S.blinkCd / BLINK.cd, kc = kr ? '200,160,255' : '140,120,170';
        ctx.fillStyle = 'rgba(6,12,22,0.72)'; ctx.fillRect(bx - 4, ky - 4, bw + 8, 14);
        ctx.fillStyle = 'rgba(' + kc + ',0.2)'; ctx.fillRect(bx, ky, bw, 6);
        ctx.fillStyle = 'rgba(' + kc + ',0.95)'; ctx.fillRect(bx, ky, bw * clamp(kf, 0, 1), 6);
        text(ctx, 'PHASE BLINK' + (padL ? ' · Y' : ' · V'), bx, ky - 12, 12, kc, 0.85, 'left');
        text(ctx, kr ? 'READY' : 'CHARGING', bx + bw, ky - 12, 12, kc, kr ? 0.6 + 0.4 * Math.abs(Math.sin(S.time * 3)) : 0.85, 'right');
      }
    }
    if (rover.lavaT > 0 && !(S.heatWall > 0)) text(ctx, 'HEAT CRITICAL', W / 2, H * 0.25, 26 * sc + 10, RED, 0.6 + 0.4 * Math.sin(S.time * 14), 'center', 700);

    // WREN subtitle (latest line)
    const c = G.comms[G.comms.length - 1];
    if (c && c.t < 7) {
      const shown = c.text.slice(0, Math.floor(c.t * 55));
      ctx.font = `500 ${15 * sc + 6}px ${FONT}`;
      // the box fits the speaker's whole label (Ilsa's is long), and the line shrinks if it would not fit
      let fs = 15 * sc + 6;
      const full = c.from + ':  ' + c.text, maxW = W * 0.9 - 40;
      const tw = ctx.measureText(full).width;
      if (tw > maxW) { fs *= maxW / tw; ctx.font = `500 ${fs}px ${FONT}`; }
      const w = Math.min(W * 0.9, ctx.measureText(full).width + 40);
      ctx.fillStyle = 'rgba(4,8,16,0.72)'; ctx.fillRect(W / 2 - w / 2, H * 0.78 - 18, w, 36);
      text(ctx, c.from + ':  ' + shown, W / 2, H * 0.78, fs, '230,251,255', 1, 'center', 500);
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
        : (pad ? 'RT drive · LT brake/reverse · LEFT STICK steer · X handbrake · B nitro · RIGHT STICK camera · RB turret · LB lance' : 'W/S drive and brake · A/D steer · SPACE handbrake · SHIFT nitro · MOUSE camera · CLICK turret · RIGHT CLICK lance') + (upgrades.phaseBlink ? (pad ? ' · Y blink' : ' · V blink') : '');
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
    scene, enter, exit, update, drawHud, rover, wakeGuardian, banner: (kicker, title, dur = 3.2) => { if (S) S.banner = { kicker, title, dur, t: 0 }; },
    get active() { return !!S; },
    get debug() { return { S, rover, cam, T, aim, mesh }; },
  };
}
