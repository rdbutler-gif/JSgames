// Arcade 6-DOF flight model with boost, cruise drive and a little drift.
import * as THREE from 'three';

export const FLIGHT = {
  maxSpeed: 230,     // u/s at full throttle (x10 m/s on the instruments)
  boostSpeed: 560,
  cruiseSpeed: 3400,
  rates: new THREE.Vector3(1.45, 1.0, 2.3), // pitch, yaw, roll rad/s
  spoolTime: 1.6,
  boostSeconds: 4.5,
};

const clamp = THREE.MathUtils.clamp;
const FWD = new THREE.Vector3(0, 0, -1);
const euler = new THREE.Euler(0, 0, 0, 'XYZ');
const dq = new THREE.Quaternion();
const fwd = new THREE.Vector3();
const desired = new THREE.Vector3();

export function createShip() {
  return {
    pos: new THREE.Vector3(0, 0, 0),
    quat: new THREE.Quaternion(),
    vel: new THREE.Vector3(),
    ang: new THREE.Vector3(),
    throttle: 0.35,
    speed: 0,
    accel: 0,
    boostEnergy: 1,
    boosting: false,
    cruise: 0, // 0 off, 1 spooling, 2 engaged
    spool: 0,
    shake: 0,
    head: new THREE.Vector3(),
    headRoll: 0,
    fov: 75,
    hull: 1, shield: 1,
  };
}

export function updateShip(s, inp, dt, opts = {}) {
  const autopilot = opts.autopilot; // title-screen drift
  if (!autopilot) {
    s.throttle = clamp(s.throttle + inp.throttleRate * 0.65 * dt, 0, 1);
  }

  // boost
  const wantBoost = !autopilot && inp.boost && s.boostEnergy > 0.03 && s.cruise !== 2;
  s.boosting = wantBoost;
  if (wantBoost) s.boostEnergy = Math.max(0, s.boostEnergy - dt / (s.boostSecs || FLIGHT.boostSeconds)); // Workshop boost cell
  else s.boostEnergy = Math.min(1, s.boostEnergy + dt / (s.boostRecharge || 9));

  // rotation
  const cruiseK = s.cruise === 2 ? 0.42 : 1;
  const r = FLIGHT.rates;
  const tp = autopilot ? 0.02 : inp.pitch * r.x * cruiseK;
  const ty = autopilot ? 0.03 : inp.yaw * r.y * cruiseK;
  const tr = autopilot ? 0.04 : inp.roll * r.z * cruiseK;
  const k = 1 - Math.exp(-7.5 * dt);
  s.ang.x += (tp - s.ang.x) * k;
  s.ang.y += (ty - s.ang.y) * k;
  s.ang.z += (tr - s.ang.z) * k;
  euler.set(s.ang.x * dt, s.ang.y * dt, s.ang.z * dt);
  dq.setFromEuler(euler);
  s.quat.multiply(dq).normalize();

  // speed
  let target = s.throttle * FLIGHT.maxSpeed;
  if (s.boosting) target = FLIGHT.boostSpeed;
  if (s.cruise === 2) target = FLIGHT.cruiseSpeed;
  const up = s.cruise === 2 ? 1500 : s.boosting ? 320 : 120;
  const down = s.speed > FLIGHT.boostSpeed ? 2600 : 170;
  const prev = s.speed;
  if (s.speed < target) s.speed = Math.min(target, s.speed + up * dt);
  else s.speed = Math.max(target, s.speed - down * dt);
  s.accel = dt > 0 ? (s.speed - prev) / dt : 0;

  // velocity follows the nose with some slip
  fwd.copy(FWD).applyQuaternion(s.quat);
  desired.copy(fwd).multiplyScalar(s.speed);
  const grip = s.cruise === 2 ? 7 : 2.4;
  s.vel.lerp(desired, 1 - Math.exp(-grip * dt));
  s.pos.addScaledVector(s.vel, dt);

  // head motion: lags behind turns and acceleration
  const hk = 1 - Math.exp(-5 * dt);
  const hx = -s.ang.y * 0.018;
  const hy = s.ang.x * 0.012 - clamp(s.accel / 6000, -0.03, 0.03);
  const hz = clamp(s.accel / 9000, -0.02, 0.04);
  s.head.x += (hx - s.head.x) * hk;
  s.head.y += (hy - s.head.y) * hk;
  s.head.z += (hz - s.head.z) * hk;
  s.headRoll += (-s.ang.y * 0.05 - s.ang.z * 0.012 - s.headRoll) * hk;

  // shake and field of view
  const buzz = (s.boosting ? 0.35 : 0) + (s.cruise === 2 ? 0.25 : 0) + (s.cruise === 1 ? s.spool / FLIGHT.spoolTime * 0.5 : 0);
  s.shake = Math.max(buzz, s.shake - dt * 2.5);
  const fovTarget = 75 + (s.boosting ? 7 : 0) + (s.cruise === 2 ? 13 : 0);
  s.fov += (fovTarget - s.fov) * (1 - Math.exp(-3 * dt));
}
