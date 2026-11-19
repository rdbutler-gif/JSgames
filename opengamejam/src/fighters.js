// Raider squadrons that patrol the system. Placeholder meshes until Meshy models arrive.
import * as THREE from 'three';
import { SQUAD_ANCHORS, THREAT } from './data.js';
import { cloneModel, onModel } from './models.js';

let gradient = null;
export function toonGradient() {
  if (gradient) return gradient;
  const d = new Uint8Array([70, 150, 255]);
  gradient = new THREE.DataTexture(d, 3, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}
export function toon(color, emissive = '#000000', emissiveIntensity = 1) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), emissive, emissiveIntensity });
}

const outlineMat = new THREE.MeshBasicMaterial({ color: '#000000', side: THREE.BackSide });

function part(geo, mat, outline = true) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, mat);
  g.add(m);
  if (outline) { const o = new THREE.Mesh(geo, outlineMat); o.scale.setScalar(1.07); g.add(o); }
  return g;
}

export function makeFighter() {
  const hullM = toon('#3a1730'), wingM = toon('#7a1f2e'), trimM = toon('#d8b25a');
  const f = new THREE.Group();
  const hull = part(new THREE.ConeGeometry(2.2, 13, 6), hullM);
  hull.rotation.x = -Math.PI / 2;
  f.add(hull);
  for (const s of [-1, 1]) {
    const w = part(new THREE.BoxGeometry(9, 0.45, 4.2), wingM);
    w.position.set(s * 5.2, -0.2, 2.2); w.rotation.y = s * 0.38; w.rotation.z = -s * 0.16;
    f.add(w);
    const tip = part(new THREE.BoxGeometry(0.5, 2.6, 3.4), trimM);
    tip.position.set(s * 9.4, 0.6, 3.6); tip.rotation.z = s * 0.25;
    f.add(tip);
  }
  const fin = part(new THREE.BoxGeometry(0.45, 3.2, 3.6), wingM);
  fin.position.set(0, 1.6, 4.2); fin.rotation.x = 0.35;
  f.add(fin);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.5, 1.4) }));
  canopy.scale.set(0.9, 0.55, 2.0); canopy.position.set(0, 1.0, -0.5);
  f.add(canopy);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.7, 1.8) }));
  glow.scale.set(1, 1, 0.6); glow.position.set(0, 0, 6.6);
  f.add(glow);
  f.userData.glow = glow;
  f.userData.parts = f.children.filter((c) => c !== glow);
  f.scale.setScalar(1.8);
  return f;
}

const SLOTS = [[0, 0, 0], [-30, 2, 24], [30, 2, 24], [-60, 4, 48], [60, 4, 48]];
const UP = new THREE.Vector3(0, 1, 0);
const m4 = new THREE.Matrix4();
const qTmp = new THREE.Quaternion();
const qRoll = new THREE.Quaternion();
const vTmp = new THREE.Vector3();
const AXIS_Z = new THREE.Vector3(0, 0, 1);

class Squad {
  constructor(scene, def, i) {
    this.anchor = new THREE.Vector3(...def.pos);
    this.baseLevel = def.level;
    this.escalation = 0;
    this.callsign = def.callsign;
    this.radius = 900 + Math.random() * 700;
    this.speed = 85 + Math.random() * 40;
    this.phase = Math.random() * Math.PI * 2;
    this.tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.6, Math.random() * 6.28, (Math.random() - 0.5) * 0.6));
    this.id = i;
    this.pos = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, -1);
    this.quat = new THREE.Quaternion();
    this.bank = 0;
    this.state = 'patrol';
    this.respawn = 0;
    // Formation size and escort show the threat at a glance: a Warbreaker leads level 3 and up.
    const T = THREAT[this.baseLevel];
    this.members = SLOTS.slice(0, T.fighters).map((s, k) => {
      const f = makeFighter();
      if (T.warbreaker && k === 0) { f.userData.warbreaker = true; f.scale.setScalar(1.8 * 2.4); }
      scene.add(f); return f;
    });
    this.place(0);
    this.members.forEach((f, k) => { f.position.copy(this.slotPos(k, 0)); f.quaternion.copy(this.quat); });
  }
  get level() { return Math.min(5, this.baseLevel + this.escalation); }
  get name() { return this.callsign + ' ' + THREAT[this.level].role; }
  get size() { return this.members.length; }
  get hasWarbreaker() { return !!THREAT[this.baseLevel].warbreaker; }
  pathPoint(ph, out) {
    out.set(Math.cos(ph) * this.radius, Math.sin(ph * 2) * this.radius * 0.18, Math.sin(ph) * this.radius);
    return out.applyQuaternion(this.tilt).add(this.anchor);
  }
  place(dt) {
    const prevDir = this.dir.clone();
    this.phase += (this.speed / this.radius) * dt;
    this.pathPoint(this.phase, this.pos);
    this.pathPoint(this.phase + 0.02, vTmp);
    this.dir.subVectors(vTmp, this.pos).normalize();
    m4.lookAt(this.pos, vTmp, UP);
    this.quat.setFromRotationMatrix(m4);
    if (dt > 0) {
      const turn = prevDir.cross(this.dir).dot(UP) / dt;
      this.bank += (THREE.MathUtils.clamp(turn * 6, -0.9, 0.9) - this.bank) * Math.min(1, dt * 2);
    }
  }
  slotPos(k, t) {
    const s = SLOTS[k];
    const sp = this.hasWarbreaker ? 1.8 : 1; // give the big escort room
    vTmp.set(s[0] * sp, s[1] + Math.sin(t * 1.3 + k) * 1.5, s[2] * sp).applyQuaternion(this.quat);
    return vTmp.add(this.pos);
  }
  update(dt, t) {
    if (this.state === 'engaged') return;
    if (this.state === 'gone') {
      this.respawn -= dt;
      if (this.respawn <= 0) {
        this.state = 'patrol';
        this.phase += Math.PI;
        this.place(0);
        this.members.forEach((f, k) => { f.visible = true; f.position.copy(this.slotPos(k, t)); });
      }
      return;
    }
    this.place(dt);
    qRoll.setFromAxisAngle(AXIS_Z, this.bank);
    qTmp.copy(this.quat).multiply(qRoll);
    this.members.forEach((f, k) => {
      f.position.lerp(this.slotPos(k, t), Math.min(1, dt * 3));
      f.quaternion.slerp(qTmp, Math.min(1, dt * 4));
      const g = f.userData.glow;
      g.scale.z = 0.6 + Math.sin(t * 30 + k) * 0.08;
    });
  }
  engage() {
    this.state = 'engaged';
    this.members.forEach((f) => (f.visible = false));
  }
  // After a fight: won = scattered for a long while, lost = they regroup sooner.
  release(won) {
    this.state = 'gone';
    this.respawn = won ? 120 : 45;
  }
  defeat() {
    this.state = 'gone';
    this.respawn = 75;
    this.members.forEach((f) => (f.visible = false));
  }
}

export function createSquads(scene) {
  const squads = SQUAD_ANCHORS.map((a, i) => new Squad(scene, a, i));
  let escalation = 0;
  // Swap the stand-in meshes for the generated raider once it loads.
  onModel('raider', () => {
    for (const s of squads) for (const f of s.members) {
      f.userData.parts.forEach((p) => f.remove(p));
      const m = cloneModel('raider');
      m.scale.setScalar(1 / 1.8);
      if (f.userData.warbreaker) m.traverse((o) => { if (o.isMesh && o.material.emissive) o.material.emissive.set('#3a2600'); });
      f.add(m);
    }
  });
  let t = 0;
  return {
    list: squads,
    update(dt) { t += dt; squads.forEach((s) => s.update(dt, t)); },
    setEscalation(n) { escalation = n; squads.forEach((s) => (s.escalation = n)); },
  };
}
