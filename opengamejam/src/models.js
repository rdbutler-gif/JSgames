// Generated models (Meshy GLBs in public/models). Each loads in the background; until it
// arrives, callers get a procedural stand-in, and onModel() lets them swap later.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Convention after normalising: nose points -Z, Y up, centred on the origin, length = `length` units.
const DEFS = {
  raider: { url: 'models/raider.glb', length: 23, yaw: -Math.PI / 2, pitch: 0 }, // Meshy output: nose on -X
  forgegate: { url: 'models/forgegate.glb', height: 13, yaw: 0, pitch: 0 },
  crate: { url: 'models/crate.glb', height: 1.7, yaw: 0, pitch: 0 },
  rover: { url: 'models/rover.glb', length: 4.3, yaw: -Math.PI / 2, pitch: 0 }, // front on -X
  player: { url: 'models/player.glb', length: 20, yaw: -Math.PI / 2, pitch: 0 }, // nose on -X too
  lastlight: { url: 'models/lastlight.glb', length: 1, yaw: -Math.PI / 2, pitch: 0 }, // Orrick's flagship (9b); scaled where used
};

const loaded = new Map();   // name -> normalised template Group
const waiters = new Map();  // name -> [callback]
const loader = new GLTFLoader();

// Generated meshes can carry zero-length normals. A GPU normalises them to NaN, and bloom smears
// NaN pixels into big black blocks (the "black wall" at the Forge Gate). Give each one its face's normal.
function fixNormals(geo) {
  const n = geo.attributes.normal, p = geo.attributes.position;
  if (!n || !p) return;
  const idx = geo.index, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const bad = new Set();
  for (let i = 0; i < n.count; i++) { const x = n.getX(i), y = n.getY(i), z = n.getZ(i); if (!(x * x + y * y + z * z > 1e-8)) bad.add(i); }
  if (!bad.size) return;
  const tris = idx ? idx.count / 3 : p.count / 3;
  for (let t = 0; t < tris && bad.size; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    if (!bad.has(i0) && !bad.has(i1) && !bad.has(i2)) continue;
    a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1).sub(a); c.fromBufferAttribute(p, i2).sub(a);
    b.cross(c); if (b.lengthSq() < 1e-12) b.set(0, 1, 0); b.normalize();
    for (const i of [i0, i1, i2]) if (bad.has(i)) { n.setXYZ(i, b.x, b.y, b.z); bad.delete(i); }
  }
  for (const i of bad) n.setXYZ(i, 0, 1, 0);
  n.needsUpdate = true;
}

function normalise(root, def) {
  root.rotation.set(def.pitch, def.yaw, 0);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  // ships fit by length (nose to tail), structures and props by height
  const k = def.height ? def.height / Math.max(size.y, 1e-6) : def.length / Math.max(size.z, 1e-6);
  const holder = new THREE.Group();
  root.position.sub(centre);
  const scaler = new THREE.Group();
  scaler.scale.setScalar(k);
  scaler.add(root);
  holder.add(scaler);
  root.traverse((o) => {
    if (o.isMesh) {
      const m = o.material;
      // Generated maps arrive glossy and metal; this is a painted style, so keep them matte.
      if (m && 'metalness' in m) { m.metalness = Math.min(m.metalness, 0.25); m.roughness = Math.max(m.roughness, 0.6); }
      o.castShadow = false; o.receiveShadow = false;
      fixNormals(o.geometry);
    }
  });
  holder.userData.size = size.multiplyScalar(k);
  return holder;
}

export function loadModels() {
  for (const [name, def] of Object.entries(DEFS)) {
    loader.load(def.url, (gltf) => {
      const t = normalise(gltf.scene, def);
      loaded.set(name, t);
      (waiters.get(name) || []).forEach((cb) => cb());
      waiters.delete(name);
    }, undefined, () => { /* not generated yet: stand-ins stay */ });
  }
}

export function hasModel(name) { return loaded.has(name); }

// A fresh copy with its own materials (so hit flashes and tints don't leak between copies).
export function cloneModel(name) {
  const t = loaded.get(name);
  if (!t) return null;
  const c = t.clone(true);
  c.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
  return c;
}

export function onModel(name, cb) {
  if (loaded.has(name)) { cb(); return; }
  if (!waiters.has(name)) waiters.set(name, []);
  waiters.get(name).push(cb);
}

// Tint every material in a model (used for raider variants) and record base colours for flashes.
export function tintModel(obj, color, emissive) {
  const c = new THREE.Color(color);
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m.color && color) m.color.multiply(c);
      if (m.emissive && emissive) m.emissive.set(emissive);
    }
  });
}
