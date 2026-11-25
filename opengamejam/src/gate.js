// The Final Gate and the Heart (step 9a).
// The Gate is a Warden ring on Lantern's line, GATE_FROM_HEART short of the Heart, where every road narrows
// to one. Three empty sockets in it are where the keys go (9c). Past it hangs the Heart: a dark lattice
// round a dim, failing core, with the dead lines of the cluster running into it. The Quiet lives here.
// The *Last Light* (Orrick's flagship, models/lastlight.glb, owner-approved concept 2026-11-25) sits in the
// Gate's mouth, nose toward Lantern.
import * as THREE from 'three';
import { HEART, FINAL_GATE, PLANETS, LANTERN } from './data.js';
import { makeBeam } from './station.js';
import { VLight } from './lightpool.js';
import { cloneModel, onModel } from './models.js';

const RING = { R: FINAL_GATE.R, tube: 46 };
const HEART_R = 1100;          // the core
const LATTICE_R = 2600;        // the shell round it
export const LAST_LIGHT = { at: new THREE.Vector3(0, 140, 620), r: 150, length: 900 }; // gate-local, in the mouth on the Lantern side // gate-local, on the Lantern side of the ring

function stone(c, e = '#000000', ei = 0) {
  return new THREE.MeshStandardMaterial({ color: c, roughness: 0.86, metalness: 0.18, emissive: new THREE.Color(e), emissiveIntensity: ei });
}

export function createGate(scene) {
  // ---------- the ring ----------
  // Local frame: the ring lies in XY, +Z faces Lantern (the way we come in), -Z faces the Heart.
  const root = new THREE.Group();
  root.position.fromArray(FINAL_GATE.pos);
  const toLantern = new THREE.Vector3().fromArray(LANTERN.pos).sub(root.position).normalize();
  root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), toLantern);
  scene.add(root);

  // the stone keeps a faint glow of its own: deep in the Quiet the sun alone leaves the Gate unreadable
  const body = stone('#3a3540', '#3a3150', 0.35);
  root.add(new THREE.Mesh(new THREE.TorusGeometry(RING.R, RING.tube, 18, 160), body));
  const glyphMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 1.0, 1.6) });
  // keystones: heavy blocks round the ring, with a gap where each socket sits
  const keyMat = stone('#4a4350', '#3a3150', 0.3);
  const SOCKETS = [Math.PI / 2, Math.PI / 2 + (Math.PI * 2) / 3, Math.PI / 2 + (Math.PI * 4) / 3];
  const nearSocket = (a) => SOCKETS.some((s) => Math.abs(Math.atan2(Math.sin(a - s), Math.cos(a - s))) < 0.12);
  const keyGeo = new THREE.BoxGeometry(150, 132, 170);
  const lampGeo = new THREE.BoxGeometry(46, 16, 6);
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    if (nearSocket(a)) continue;
    const k = new THREE.Mesh(keyGeo, keyMat);
    k.position.set(Math.cos(a) * RING.R, Math.sin(a) * RING.R, 0);
    k.rotation.z = a;
    root.add(k);
    // a lamp on the Lantern face of each keystone, so the ring's whole round reads from far off
    const lamp = new THREE.Mesh(lampGeo, glyphMat);
    lamp.position.set(Math.cos(a) * RING.R, Math.sin(a) * RING.R, 88);
    root.add(lamp);
  }
  // the inner glyph band: pale Warden light, guttering
  const glyph = new THREE.Mesh(new THREE.TorusGeometry(RING.R - 70, 11, 6, 160), glyphMat);
  root.add(glyph);
  // four long vanes reaching out from the ring, so its size reads from far off
  const vaneMat = stone('#2f2b35');
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const v = new THREE.Mesh(new THREE.BoxGeometry(520, 60, 90), vaneMat);
    v.position.set(Math.cos(a) * (RING.R + 300), Math.sin(a) * (RING.R + 300), -40);
    v.rotation.z = a;
    root.add(v);
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(34, 0), glyphMat);
    tip.position.set(Math.cos(a) * (RING.R + 580), Math.sin(a) * (RING.R + 580), -40);
    root.add(tip);
  }
  // the sockets: empty cradles, each with a dark crystal waiting for its key
  const socketMat = new THREE.MeshStandardMaterial({ color: '#191720', roughness: 0.35, metalness: 0.6, emissive: new THREE.Color('#5a4a8a'), emissiveIntensity: 0.15 });
  const sockets = SOCKETS.map((a) => {
    const g = new THREE.Group();
    g.position.set(Math.cos(a) * RING.R, Math.sin(a) * RING.R, 0);
    g.rotation.z = a;
    const cradle = new THREE.Mesh(new THREE.CylinderGeometry(70, 90, 120, 6, 1, true), keyMat);
    cradle.rotation.z = Math.PI / 2; g.add(cradle);
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(40, 0).scale(1, 1.6, 1), socketMat);
    c.rotation.z = Math.PI / 2; g.add(c);
    root.add(g);
    return g;
  });
  const glyphLight = new VLight('#b7a8ff', 300, 3200, 1.1); glyphLight.position.set(0, RING.R - 70, 120); root.add(glyphLight);

  // ---------- the Last Light (stand-in) ----------
  const ll = new THREE.Group();
  ll.position.copy(LAST_LIGHT.at);
  root.add(ll);
  onModel('lastlight', () => {
    const m = cloneModel('lastlight');
    m.scale.setScalar(LAST_LIGHT.length);
    m.rotation.y = Math.PI; // nose toward Lantern (+Z): it is waiting for us
    ll.add(m);
  });
  const runMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.35, 0.25) });
  const runLights = [].map((p) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(6, 8, 6), runMat); b.position.fromArray(p); ll.add(b); return b;
  });
  const llLight = new VLight('#ff7a5a', 900, 2600, 1.1); llLight.position.set(0, 420, 700); ll.add(llLight); // a key from above the bow, so the hull reads in the Quiet

  // ---------- the Heart ----------
  const heart = new THREE.Group();
  heart.position.fromArray(HEART.pos);
  scene.add(heart);
  const coreMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, beat: { value: 0 }, col: { value: new THREE.Color('#ffd9a0') } },
    vertexShader: /* glsl */ `
      varying vec3 vN, vV;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float time, beat; uniform vec3 col; varying vec3 vN, vV;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        // a dark body with a thin, failing rim: most of the light it had is gone
        vec3 c = vec3(0.01, 0.008, 0.014) + col * (pow(f, 3.0) * (0.35 + 0.9 * beat) + 0.03 * beat);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  heart.add(new THREE.Mesh(new THREE.SphereGeometry(HEART_R, 48, 24), coreMat));
  // the cage: heavy Warden bands round the core at different tilts, like an armillary sphere, each
  // carrying a thin line of the same guttering light as the Gate. They turn very slowly.
  const bandMat = stone('#35303b', '#2a2238', 0.6);
  const bands = [];
  const tilts = [[0, 0, 0], [Math.PI / 2, 0, 0], [Math.PI / 2, 0, Math.PI / 3], [Math.PI / 2, 0, -Math.PI / 3], [0.5, 0.9, 0]];
  tilts.forEach((e, i) => {
    const R = LATTICE_R * (1 - i * 0.07);
    const g = new THREE.Group(); g.rotation.set(e[0], e[1], e[2]);
    const spin = new THREE.Group(); g.add(spin);
    spin.add(new THREE.Mesh(new THREE.TorusGeometry(R, 44 - i * 4, 10, 120), bandMat));
    spin.add(new THREE.Mesh(new THREE.TorusGeometry(R - 60, 4, 4, 120), glyphMat));
    heart.add(g); bands.push({ spin, w: (i % 2 ? -1 : 1) * (0.006 + i * 0.002) });
  });

  // the cluster's lines, all running into the Heart, all but dead (each relic we lifted starved one)
  const deadLines = [];
  const ends = [LANTERN.pos, ...PLANETS.map((p) => p.pos)];
  for (const e of ends) {
    const dir = new THREE.Vector3().fromArray(e).sub(heart.position);
    const len = Math.min(70000, dir.length() * 0.6);
    dir.normalize();
    const b = makeBeam(len, '#ffc46a', 9);
    b.position.copy(heart.position).addScaledVector(dir, HEART_R);
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    b.material.uniforms.alive.value = 0.08;
    scene.add(b);
    deadLines.push(b);
  }

  // ---------- collision (gate-local; the ship is a sphere) ----------
  const inv = new THREE.Matrix4(), lp = new THREE.Vector3(), out = new THREE.Vector3(), seg = new THREE.Vector3();
  function collide(pos, rad) {
    root.updateMatrixWorld();
    inv.copy(root.matrixWorld).invert();
    lp.copy(pos).applyMatrix4(inv);
    let hit = false;
    // the ring and its keystones as one fat torus
    const rxy = Math.hypot(lp.x, lp.y), dr = rxy - RING.R, dist = Math.hypot(dr, lp.z), T = 85;
    if (dist < T + rad) {
      const k = (T + rad) / (dist || 1), nr = RING.R + dr * k;
      lp.x *= nr / (rxy || 1); lp.y *= nr / (rxy || 1); lp.z *= k; hit = true;
    }
    // the Last Light's hull as a capsule along its length (gate-local Z), r about half its beam
    const half = LAST_LIGHT.length / 2 - LAST_LIGHT.r;
    seg.copy(LAST_LIGHT.at); seg.z += THREE.MathUtils.clamp(lp.z - LAST_LIGHT.at.z, -half, half);
    const d = lp.distanceTo(seg);
    if (d < LAST_LIGHT.r + rad) { lp.sub(seg).multiplyScalar((LAST_LIGHT.r + rad) / (d || 1)).add(seg); hit = true; }
    // the Heart (world space)
    if (!hit) {
      const dh = pos.distanceTo(heart.position);
      if (dh < LATTICE_R * 0.7 + rad) { out.copy(pos).sub(heart.position).normalize(); pos.copy(heart.position).addScaledVector(out, LATTICE_R * 0.7 + rad); return out.clone(); }
      return null;
    }
    out.copy(lp).applyMatrix4(root.matrixWorld);
    const n = out.clone().sub(pos);
    pos.copy(out);
    return n.normalize();
  }

  let t = 0;
  const tmp = new THREE.Vector3();
  return {
    root, heart, sockets, lastLight: ll,
    pos: root.position, heartPos: heart.position,
    collide,
    toWorld(p, o) { root.updateMatrixWorld(); return o.copy(p).applyMatrix4(root.matrixWorld); },
    lastLightWorld(o = tmp) { root.updateMatrixWorld(); return o.copy(LAST_LIGHT.at).applyMatrix4(root.matrixWorld); },
    // q: the Quiet here (0..1); the Gate's light gutters with it
    update(dt, q = 0) {
      t += dt;
      coreMat.uniforms.time.value = t;
      // a slow, failing heartbeat: two weak beats every 6 s
      const ph = t % 6, beat = Math.exp(-Math.pow((ph - 0.4) * 5, 2)) + 0.6 * Math.exp(-Math.pow((ph - 0.95) * 5, 2));
      coreMat.uniforms.beat.value = beat;
      for (const b of bands) b.spin.rotation.z += dt * b.w;
      // the glyph band dims and catches, never flashes
      const g = 0.55 + 0.25 * Math.sin(t * 0.7) + 0.2 * Math.sin(t * 3.1 + Math.sin(t * 0.37) * 3);
      glyphMat.color.setRGB(1.1, 1.0, 1.6).multiplyScalar(Math.max(0.12, g * (1 - 0.5 * q)));
      glyphLight.intensity = 300 * g;
      for (const b of deadLines) { b.material.uniforms.time.value = t; b.material.uniforms.alive.value = 0.06 + 0.04 * beat; }
      const blink = (Math.sin(t * 2.2) > 0.6) ? 1 : 0.25;
      runMat.color.setRGB(3 * blink, 0.35 * blink, 0.25 * blink);
    },
  };
}
