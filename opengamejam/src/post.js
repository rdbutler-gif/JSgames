// The post chain: one place that decides how every frame is finished.
//   world -> cockpit (flight only) -> GTAO on the cockpit -> bloom -> lens grade -> output
// The renderer has no tone curve (NoToneMapping); colour reaches the screen through
// OutputPass's sRGB conversion only, so lava and emissives keep the brightness the owner approved.
// LOOK presets below are the single table of grade values per game phase.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// vignette: edge darkening; ca: chromatic aberration at the frame edge (UV units);
// grain: film grain amount; lift/gain: shadow and highlight tint; sat/contrast on luma.
export const LOOK = {
  flight: { vignette: 0.42, ca: 0.0004, grain: 0.035, lift: [0.0, 0.004, 0.012], gain: [1.05, 1.0, 0.95], sat: 1.06, contrast: 1.06 },
  assault: { vignette: 0.32, ca: 0.0007, grain: 0.03, lift: [0.0, 0.003, 0.01], gain: [1.04, 1.0, 0.96], sat: 1.05, contrast: 1.04 },
  surface: { vignette: 0.28, ca: 0.0005, grain: 0.025, lift: [0.004, 0.003, 0.006], gain: [1.02, 1.0, 0.98], sat: 1.03, contrast: 1.03 },
  title: { vignette: 0.5, ca: 0.0008, grain: 0.035, lift: [0.0, 0.004, 0.014], gain: [1.04, 1.0, 0.96], sat: 1.05, contrast: 1.05 },
};

const LensShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, aspect: { value: 1 },
    vignette: { value: 0.4 }, ca: { value: 0.002 }, grain: { value: 0.03 },
    lift: { value: new THREE.Vector3() }, gain: { value: new THREE.Vector3(1, 1, 1) },
    sat: { value: 1 }, contrast: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, aspect, vignette, ca, grain, sat, contrast;
    uniform vec3 lift, gain; varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main(){
      vec2 d = vUv - 0.5; d.x *= aspect;
      float r2 = dot(d, d);
      // lateral chromatic aberration: grows with the square of the distance from centre
      vec2 off = (vUv - 0.5) * ca * r2 * 4.0;
      vec3 c;
      c.r = texture2D(tDiffuse, vUv - off).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv + off).b;
      c = max(c, 0.0);
      // grade (linear light): contrast around mid grey in log space, then lift and gain, then saturation
      c = 0.18 * pow(c / 0.18 + 1e-5, vec3(contrast));
      c = c * gain + lift * (1.0 - clamp(c, 0.0, 1.0));
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, sat);
      // optical vignette: cos^4-style falloff, never to black
      c *= mix(1.0, 1.0 - smoothstep(0.15, 1.25, sqrt(r2) * 1.25), vignette);
      // grain: luminance-weighted so blacks stay black, refreshed at 24 Hz
      float t = floor(time * 24.0);
      float n = hash(gl_FragCoord.xy + t * 17.0) - 0.5;
      c += n * grain * (0.08 + sqrt(max(l, 0.0))) * 0.5;
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

export function createPost(renderer, scene, camera, cockpit) {
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  const worldPass = new RenderPass(scene, camera);
  composer.addPass(worldPass);

  const cockpitPass = new RenderPass(cockpit.scene, cockpit.camera);
  cockpitPass.clear = false; cockpitPass.clearDepth = true;
  composer.addPass(cockpitPass);

  // ambient occlusion on the cockpit only (the world is planet-scale; AO there is meaningless)
  const gtao = new GTAOPass(cockpit.scene, cockpit.camera, 1, 1);
  gtao.updateGtaoMaterial({ radius: 0.14, distanceExponent: 1.6, thickness: 0.5, scale: 1.25, samples: 16 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16 });
  gtao.blendIntensity = 1.0;
  const gtaoRender = gtao.render.bind(gtao);
  gtao.render = (...a) => { cockpit.setGlass(false); gtaoRender(...a); cockpit.setGlass(true); };
  composer.addPass(gtao);

  // one bad pixel (NaN or infinity) gets blurred by bloom into a screen-sized black block; zero it first
  const sanitize = new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){ vec4 c=texture2D(tDiffuse,vUv);
        if (!(c.r < 65000.0 && c.g < 65000.0 && c.b < 65000.0) || !(c.r >= 0.0 && c.g >= 0.0 && c.b >= 0.0)) c = vec4(0.0, 0.0, 0.0, 1.0);
        gl_FragColor = c; }`,
  });
  composer.addPass(sanitize);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.45, 0.92);
  // bloom can run at a fraction of the frame size (it is a blur; half size is hard to tell apart)
  let bloomK = 1;
  const bloomSetSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w, h) => bloomSetSize(Math.max(1, Math.round(w * bloomK)), Math.max(1, Math.round(h * bloomK)));
  composer.addPass(bloom);
  const lens = new ShaderPass(LensShader);
  composer.addPass(lens);
  composer.addPass(new OutputPass());

  const U = lens.uniforms;
  // ?hq in the URL pins full quality (headless captures run slow on a software GPU)
  const pinned = /[?&]hq/.test(location.search);
  let base = LOOK.flight, kick = 0;
  let mode = '', aoOn = true, lastW = 1, lastH = 1;
  function setMode(m) {
    if (m === mode) return;
    mode = m;
    const L = LOOK[m] || LOOK.flight;
    base = L;
    U.vignette.value = L.vignette; U.ca.value = L.ca; U.grain.value = L.grain;
    U.lift.value.fromArray(L.lift); U.gain.value.fromArray(L.gain);
    U.sat.value = L.sat; U.contrast.value = L.contrast;
    const inCockpit = m === 'flight';
    cockpitPass.enabled = inCockpit; gtao.enabled = inCockpit && aoOn;
  }
  setMode('flight');

  return {
    composer, worldPass, bloom, lens, gtao, setMode, LOOK,
    get mode() { return mode; },
    get pinned() { return /[?&]hq/.test(location.search); },
    setSize(w, h) { lastW = w; lastH = h; composer.setSize(w, h); U.aspect.value = w / h; },
    // q: { samples (MSAA), ao (cockpit GTAO), bloomK (bloom resolution), grain }
    setQuality(q) {
      aoOn = q.ao; gtao.enabled = cockpitPass.enabled && aoOn;
      bloomK = q.bloomK;
      for (const t of [composer.renderTarget1, composer.renderTarget2]) if (t.samples !== q.samples) { t.samples = q.samples; t.dispose(); }
      composer.setSize(lastW, lastH);
    },
    // speed feel: boost and cruise drive pull the lens (more edge fringing and vignette), eased
    render(time, speedKick = 0, dt = 1 / 60) {
      kick += (speedKick - kick) * Math.min(1, dt * 3);
      U.ca.value = base.ca + kick * 0.0022; U.vignette.value = base.vignette + kick * 0.14;
      U.time.value = time; composer.render();
    },
  };
}
