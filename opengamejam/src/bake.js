// Draw-call reduction for models built from many primitives (the cockpit, the creatures).
// Every mesh that never moves on its own is merged, per material, into one mesh under the
// nearest "anchor": an object whose transform changes at runtime (a leg pivot, a needle, a jaw).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ATTRS = ['position', 'normal', 'uv'];

function prep(geo, matrix) {
  let g = geo.clone();
  for (const k of Object.keys(g.attributes)) if (!ATTRS.includes(k)) g.deleteAttribute(k);
  for (const k of Object.keys(g.morphAttributes)) delete g.morphAttributes[k];
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.index) { const n = g.attributes.position.count, idx = new (n > 65535 ? Uint32Array : Uint16Array)(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
  g.clearGroups();
  g.applyMatrix4(matrix);
  return g;
}

// root: the model; anchors: objects that move (their subtrees bake into themselves);
// keep(mesh): meshes to leave untouched. Returns the original parts (geometry, material, anchor,
// local matrix) so effects such as gibs can still use the separate pieces.
export function bakeStatic(root, anchors = [], keep = () => false) {
  const anchorSet = new Set([root, ...anchors]);
  root.updateMatrixWorld(true);
  // a mesh that carries an anchor or a kept mesh below it cannot be removed
  const pinned = new Set();
  root.traverse((o) => {
    if (o === root || !(anchorSet.has(o) || (o.isMesh && keep(o)))) return;
    for (let p = o.parent; p && p !== root; p = p.parent) pinned.add(p);
  });
  const buckets = new Map(), parts = [], gone = [];
  const inv = new THREE.Matrix4();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || anchorSet.has(o) || pinned.has(o) || keep(o)) return;
    let a = o.parent; while (a && !anchorSet.has(a)) a = a.parent;
    if (!a) return;
    const local = new THREE.Matrix4().multiplyMatrices(inv.copy(a.matrixWorld).invert(), o.matrixWorld);
    parts.push({ geometry: o.geometry, material: o.material, anchor: a, local });
    const key = a.uuid + '|' + o.material.uuid + '|' + o.castShadow + o.receiveShadow + '|' + o.renderOrder;
    if (!buckets.has(key)) buckets.set(key, { a, mat: o.material, cast: o.castShadow, recv: o.receiveShadow, order: o.renderOrder, geos: [] });
    buckets.get(key).geos.push(prep(o.geometry, local));
    gone.push(o);
  });
  for (const o of gone) if (o.parent) o.parent.remove(o);
  const made = [];
  for (const b of buckets.values()) {
    const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (!geo) continue;
    const m = new THREE.Mesh(geo, b.mat);
    m.castShadow = b.cast; m.receiveShadow = b.recv; m.renderOrder = b.order;
    b.a.add(m); made.push(m);
  }
  return { parts, meshes: made, before: gone.length, after: made.length };
}
