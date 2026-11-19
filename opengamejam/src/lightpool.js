// A small fixed pool of real point lights shared by many "virtual" ones.
// Every point light costs on every lit pixel even at intensity 0, and turning one on or off
// recompiles shaders, so the surface keeps exactly N real lights and, each frame, hands them to
// the virtual lights that matter most to the camera (bright and near).
import * as THREE from 'three';

// Same fields as a PointLight (color, intensity, distance, decay) but renders nothing by itself.
export class VLight extends THREE.Object3D {
  constructor(color = '#ffffff', intensity = 1, distance = 0, decay = 2) {
    super();
    this.isVLight = true;
    this.color = new THREE.Color(color);
    this.intensity = intensity; this.distance = distance; this.decay = decay;
  }
}

const p = new THREE.Vector3();
function shown(o) { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; }

export function createLightPool(root, n = 3) {
  const real = [];
  for (let i = 0; i < n; i++) { const l = new THREE.PointLight('#ffffff', 0, 10, 2); root.add(l); real.push(l); }
  let virt = [];
  const cand = [];
  return {
    real,
    // find every virtual light under root (call once everything is built)
    collect() { virt = []; root.traverse((o) => { if (o.isVLight) virt.push(o); }); return virt.length; },
    update(camPos) {
      cand.length = 0;
      for (const v of virt) {
        if (!(v.intensity > 0) || !shown(v)) continue;
        v.getWorldPosition(p);
        const reach = v.distance || 60, d = p.distanceTo(camPos);
        cand.push({ v, x: p.x, y: p.y, z: p.z, s: v.intensity / (1 + (d / reach) * (d / reach)) });
      }
      cand.sort((a, b) => b.s - a.s);
      for (let i = 0; i < n; i++) {
        const l = real[i], c = cand[i];
        if (!c) { l.intensity = 0; continue; }
        l.position.set(c.x, c.y, c.z); l.color.copy(c.v.color);
        l.intensity = c.v.intensity; l.distance = c.v.distance; l.decay = c.v.decay;
      }
    },
  };
}
