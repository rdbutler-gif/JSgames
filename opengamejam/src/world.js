// Space: nebula sky, stars, sun, flight dust and the three planets.
import * as THREE from 'three';
import { NOISE } from './noise.js';
import { PLANETS } from './data.js';

export const SUN_DIR = new THREE.Vector3(-0.7, 0.35, 0.6).normalize();

function makeSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      cA: { value: new THREE.Color('#40207a') },
      cB: { value: new THREE.Color('#0e6b7d') },
      cC: { value: new THREE.Color('#7a2f6e') },
      sunDir: { value: SUN_DIR },
      pano: { value: null }, panoMix: { value: 0 }, tilt: { value: new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.38, 2.2, 0.22))) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: NOISE + /* glsl */ `
      uniform vec3 cA, cB, cC, sunDir;
      uniform sampler2D pano; uniform float panoMix; uniform mat3 tilt;
      varying vec3 vDir;
      // Painted nebula panorama (fal FLUX, equirectangular). The left/right edges are cross-faded over
      // W of the width so the wrap has no seam; the poles fade to the void where the projection pinches.
      const float W = 0.06;
      vec3 panoAt(vec3 d) {
        d = tilt * d;
        float u = atan(d.z, d.x) / 6.2831853 + 0.5, v = asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5;
        float x = u * (1.0 - W);
        vec3 c = texture2D(pano, vec2(x, v)).rgb;
        if (x < W) c = mix(texture2D(pano, vec2(x + 1.0 - W, v)).rgb, c, x / W);
        return c * (1.0 - smoothstep(0.72, 0.97, abs(d.y)));
      }
      void main() {
        vec3 d = normalize(vDir);
        float n = fbm(d * 2.1 + vec3(3.0));
        float n2 = fbm(d * 4.7 + vec3(11.0));
        float band = exp(-pow(d.y * 2.6 + (n - 0.5) * 1.6, 2.0));
        float neb = smoothstep(0.42, 0.82, n) * 0.85 + band * 0.35;
        neb = floor(neb * 7.0 + 0.5) / 7.0;
        vec3 col = vec3(0.004, 0.005, 0.014);
        col = mix(col, cA * 0.55, neb);
        col = mix(col, cB * 0.6, smoothstep(0.55, 0.85, n2) * neb);
        col += cC * 0.25 * smoothstep(0.6, 0.9, n) * band;
        if (panoMix > 0.0) col = mix(col, vec3(0.002, 0.003, 0.009) + panoAt(d) * 0.4, panoMix);
        float s = max(dot(d, sunDir), 0.0);
        col += vec3(1.0, 0.75, 0.45) * (pow(s, 14.0) * 0.18 + pow(s, 3.0) * 0.03);
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  m.renderOrder = -10; m.frustumCulled = false;
  // Swap in the painted panorama once it loads, with a short fade; the procedural sky stays as the fallback.
  new THREE.TextureLoader().load('sky/nebula.jpg', (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; // no mip seam where atan wraps
    t.wrapS = THREE.RepeatWrapping;
    mat.uniforms.pano.value = t;
    const t0 = performance.now();
    const fade = () => { const k = Math.min(1, (performance.now() - t0) / 800); mat.uniforms.panoMix.value = k; if (k < 1) requestAnimationFrame(fade); };
    fade();
  });
  return m;
}

function makeStars() {
  const N = 7000;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    // bias some stars toward the galactic band
    let y = u;
    if (i % 3 === 0) y *= 0.25;
    const v = new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a)).normalize().multiplyScalar(900);
    pos.set([v.x, v.y, v.z], i * 3);
    const t = Math.random();
    c.set(t < 0.15 ? '#ffc98a' : t < 0.35 ? '#9fd8ff' : '#ffffff');
    const b = Math.random() < 0.04 ? 3.0 : 0.35 + Math.random() * 0.9;
    col.set([c.r * b, c.g * b, c.b * b], i * 3);
    size[i] = Math.random() < 0.04 ? 3.2 : 1.0 + Math.random() * 1.6;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { pr: { value: 1 }, time: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float size; attribute vec3 color; varying vec3 vC; uniform float pr; uniform float time;
      void main() {
        vC = color * (0.85 + 0.15 * sin(time * 2.0 + position.x * 0.37 + position.z * 0.11));
        gl_PointSize = size * pr;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vC;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vC * a, 1.0);
      }`,
    // Opaque pass on purpose: drawn right after the sky and before the planets, so planets cover them.
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: false,
  });
  const p = new THREE.Points(g, mat);
  p.renderOrder = -9; p.frustumCulled = false;
  return p;
}

function radialTexture(stops) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const x = cv.getContext('2d');
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSun() {
  const mat = new THREE.SpriteMaterial({
    map: radialTexture([[0, 'rgba(255,255,255,1)'], [0.06, 'rgba(255,244,214,1)'], [0.16, 'rgba(255,190,110,0.55)'], [0.45, 'rgba(255,120,60,0.12)'], [1, 'rgba(255,80,40,0)']]),
    color: new THREE.Color(2.2, 1.9, 1.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(26000); s.renderOrder = -8;
  return s;
}

function makeDust() {
  const N = 520, B = 700;
  const pts = [];
  for (let i = 0; i < N; i++) pts.push(new THREE.Vector3((Math.random() - 0.5) * B, (Math.random() - 0.5) * B, (Math.random() - 0.5) * B));
  const pos = new Float32Array(N * 6), col = new Float32Array(N * 6);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (let i = 0; i < N; i++) {
    const b = 0.35 + Math.random() * 0.5;
    col.set([b * 0.8, b * 0.95, b, 0, 0, 0], i * 6);
  }
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.LineSegments(g, mat);
  mesh.frustumCulled = false;
  const tmp = new THREE.Vector3();
  return {
    mesh,
    update(camPos, vel) {
      const sp = vel.length();
      const k = Math.min(0.05, 0.02 + sp * 0.00002);
      for (let i = 0; i < N; i++) {
        const p = pts[i];
        tmp.subVectors(p, camPos);
        tmp.x = ((tmp.x + B / 2) % B + B) % B - B / 2;
        tmp.y = ((tmp.y + B / 2) % B + B) % B - B / 2;
        tmp.z = ((tmp.z + B / 2) % B + B) % B - B / 2;
        p.copy(camPos).add(tmp);
        pos[i * 6] = p.x; pos[i * 6 + 1] = p.y; pos[i * 6 + 2] = p.z;
        pos[i * 6 + 3] = p.x - vel.x * k - 0.4; pos[i * 6 + 4] = p.y - vel.y * k; pos[i * 6 + 5] = p.z - vel.z * k;
      }
      g.attributes.position.needsUpdate = true;
      mat.opacity = Math.min(1, 0.25 + sp / 300);
    },
  };
}

function makePlanet(p) {
  const group = new THREE.Group();
  group.position.set(...p.pos);
  const col = (h) => new THREE.Color(h);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      sunDir: { value: SUN_DIR },
      c0: { value: col(p.colors[0]) }, c1: { value: col(p.colors[1]) }, c2: { value: col(p.colors[2]) }, c3: { value: col(p.colors[3]) },
      capCol: { value: col(p.cap ? p.cap.color : '#ffffff') }, capLat: { value: p.cap ? p.cap.lat : 2.0 },
      lava: { value: col(p.lava || '#000000') }, lavaOn: { value: p.lava ? 1 : 0 },
      atmo: { value: col(p.atmo) }, seed: { value: p.seed },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vObj; varying vec3 vW;
      void main() {
        vObj = position;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: NOISE + /* glsl */ `
      uniform vec3 sunDir, c0, c1, c2, c3, capCol, lava, atmo; uniform float capLat, lavaOn, seed;
      varying vec3 vN; varying vec3 vObj; varying vec3 vW;
      void main() {
        vec3 p = normalize(vObj);
        float h = fbm(p * 2.4 + seed);
        float h2 = fbm(p * 9.0 + seed * 2.0);
        float e = h + (h2 - 0.5) * 0.22;
        vec3 col = e < 0.40 ? c0 : e < 0.49 ? c1 : e < 0.58 ? c2 : c3;
        float lat = abs(p.y) + (h2 - 0.5) * 0.12;
        col = mix(col, capCol, step(capLat, lat));
        vec3 n = normalize(vN);
        float d = dot(n, sunDir);
        float light = d > 0.45 ? 1.0 : d > 0.08 ? 0.72 : d > -0.12 ? 0.34 : 0.1;
        vec3 c = col * light;
        c = mix(c, col * vec3(0.12, 0.14, 0.3), (1.0 - step(-0.12, d)) * 0.6);
        // lava glow on the night side
        float lv = lavaOn * (1.0 - smoothstep(0.30, 0.40, e)) * (1.0 - smoothstep(-0.2, 0.2, d));
        c += lava * lv * 1.6;
        vec3 v = normalize(cameraPosition - vW);
        float rim = pow(1.0 - max(dot(n, v), 0.0), 2.6);
        c += atmo * rim * smoothstep(-0.25, 0.45, d) * 0.85;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(p.R, 160, 80), mat);
  group.add(mesh);

  const atmMat = new THREE.ShaderMaterial({
    uniforms: { col: { value: col(p.atmo) }, sunDir: { value: SUN_DIR } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW;
      void main() {
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 col, sunDir; varying vec3 vN; varying vec3 vW;
      void main() {
        vec3 n = normalize(vN);
        vec3 v = normalize(cameraPosition - vW);
        float f = 1.0 - max(dot(n, v), 0.0);
        float a = pow(f, 2.2) * smoothstep(1.0, 0.8, f) * 1.7;
        float lit = smoothstep(-0.35, 0.5, dot(n, sunDir));
        gl_FragColor = vec4(col * a * (0.15 + 0.85 * lit), 1.0);
      }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(p.R * 1.07, 96, 48), atmMat));

  if (p.ring) {
    const ringMat = new THREE.ShaderMaterial({
      uniforms: { center: { value: new THREE.Vector3(...p.pos) }, R: { value: p.R }, sunDir: { value: SUN_DIR }, inner: { value: p.R * 1.45 }, outer: { value: p.R * 2.4 } },
      vertexShader: /* glsl */ `
        varying vec3 vL; varying vec3 vW;
        void main() { vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: NOISE + /* glsl */ `
        uniform vec3 center, sunDir; uniform float R, inner, outer; varying vec3 vL; varying vec3 vW;
        void main() {
          float r = length(vL.xy);
          float t = (r - inner) / (outer - inner);
          float bands = vnoise(vec3(t * 38.0, 0.0, 0.0)) * 0.7 + vnoise(vec3(t * 140.0, 3.0, 0.0)) * 0.3;
          float a = smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.9, t) * smoothstep(0.25, 0.6, bands);
          a = floor(a * 4.0 + 0.5) / 4.0;
          vec3 c = mix(vec3(0.55, 0.75, 0.85), vec3(0.95, 0.97, 1.0), bands);
          vec3 toC = center - vW; float tt = dot(toC, sunDir);
          float dd = length(toC - sunDir * tt);
          if (tt > 0.0 && dd < R) c *= 0.18;
          gl_FragColor = vec4(c * 0.9, a * 0.85);
        }`,
      side: THREE.DoubleSide, transparent: true, depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(p.R * 1.45, p.R * 2.4, 160, 1), ringMat);
    ring.rotation.x = Math.PI / 2 - 0.38;
    ring.rotation.y = 0.2;
    group.add(ring);
  }

  return {
    data: p, group, mesh,
    center: group.position,
    update(dt) { mesh.rotation.y += dt * 0.006; },
  };
}

export function createWorld(scene) {
  const sky = makeSky(); scene.add(sky);
  const stars = makeStars(); scene.add(stars);
  const sun = makeSun(); scene.add(sun);
  const dust = makeDust(); scene.add(dust.mesh);
  const planets = PLANETS.map(makePlanet);
  planets.forEach((p) => scene.add(p.group));

  const sunLight = new THREE.DirectionalLight('#fff1dc', 2.4);
  sunLight.position.copy(SUN_DIR).multiplyScalar(1000);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight('#5a6aa0', 0.55));

  let t = 0;
  return {
    planets,
    setPixelRatio(pr) { stars.material.uniforms.pr.value = pr; },
    update(camPos, vel, dt) {
      t += dt;
      sky.position.copy(camPos);
      stars.position.copy(camPos);
      stars.material.uniforms.time.value = t;
      sun.position.copy(camPos).addScaledVector(SUN_DIR, 90000);
      dust.update(camPos, vel);
      planets.forEach((p) => p.update(dt));
    },
  };
}
