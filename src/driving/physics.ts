import { boxFromCenter, resolveCollisions, type Box2D } from '../world/collision';
import type { DriveInput, DriveState, DrivingCondition, DrivingProfile, TestTrackDef } from './types';

/**
 * Física de direção própria e simples (modelo "bicicleta"), escolhida depois
 * de avaliar o Rapier (docs/fisica.md). Puro, com passo fixo: a mesma entrada
 * gera sempre o mesmo resultado, o que deixa a física testável.
 */
export const FIXED_STEP = 1 / 60;
const G = 9.81;
/** Atrito de rolamento (N por m/s). */
const ROLLING = 30;
/** Ré: até ~11 km/h. */
const MAX_REVERSE = 3;
/** Raio dos dois círculos de colisão (frente e traseira) em relação à largura. */
const BODY_RADIUS_FACTOR = 0.5;

export interface CarGeometry {
  wheelbase: number;
  width: number;
  length: number;
}

export const kmh = (ms: number) => ms * 3.6;

export function initialDriveState(track: TestTrackDef): DriveState {
  return {
    x: track.start.x,
    z: track.start.z,
    heading: track.start.heading,
    speed: 0,
    rpm: 0,
    gear: 1,
    temperature: 0.5,
    time: 0,
    distance: 0,
    sliding: false,
    collisions: 0,
    lastImpact: 0,
  };
}

/** Paredes, pilares e cones do pátio como caixas de colisão. */
export function trackColliders(track: TestTrackDef): Box2D[] {
  const { halfX, halfZ, wallThickness: t } = track;
  return [
    boxFromCenter(0, -halfZ - t / 2, halfX * 2 + t * 2, t),
    boxFromCenter(0, halfZ + t / 2, halfX * 2 + t * 2, t),
    boxFromCenter(-halfX - t / 2, 0, t, halfZ * 2),
    boxFromCenter(halfX + t / 2, 0, t, halfZ * 2),
    ...track.pillars.map((p) => boxFromCenter(p.x, p.z, p.width, p.depth)),
    ...track.cones.map((c) => boxFromCenter(c.x, c.z, track.coneRadius * 2, track.coneRadius * 2)),
  ];
}

/** Para onde o carro aponta (0 = -Z, como a câmera do jogador). */
export function forward(heading: number): { x: number; z: number } {
  return { x: -Math.sin(heading), z: -Math.cos(heading) };
}

/** Avança a simulação `seconds` em passos fixos. */
export function simulate(
  state: DriveState,
  input: DriveInput,
  seconds: number,
  profile: DrivingProfile,
  geometry: CarGeometry,
  condition: DrivingCondition,
  track: TestTrackDef,
  colliders: readonly Box2D[],
): DriveState {
  let s = state;
  const steps = Math.max(0, Math.round(seconds / FIXED_STEP));
  for (let i = 0; i < steps; i++) s = step(s, input, profile, geometry, condition, track, colliders);
  return s;
}

/** Um passo fixo de física. */
export function step(
  s: DriveState,
  input: DriveInput,
  profile: DrivingProfile,
  geometry: CarGeometry,
  condition: DrivingCondition,
  track: TestTrackDef,
  colliders: readonly Box2D[],
): DriveState {
  const dt = FIXED_STEP;
  const running = condition.cannotStart === null;
  const throttle = running ? clamp01(input.throttle) : 0;
  const brake = clamp01(input.brake);
  const limit = track.speedLimitKmh / 3.6;
  let speed = s.speed;

  // Falha de ignição determinística: em alguns trechos de tempo o motor "engasga".
  const misfiring = condition.misfire > 0 && Math.sin(s.time * 23) > 1 - condition.misfire * 1.2;
  const torque = misfiring ? 0.25 : 1;

  // --- Longitudinal ---
  let force = 0;
  if (throttle > 0 && speed >= -0.1 && speed < limit) force += profile.engineForceN * throttle * torque;
  if (throttle > 0 && speed < -0.1) force += profile.brakeForceN * condition.brake * throttle; // acelerar na ré = frear
  if (brake > 0) {
    if (speed > 0.3) force -= profile.brakeForceN * condition.brake * brake;
    else if (running && throttle === 0) force -= profile.engineForceN * 0.5 * brake; // ré
    else if (speed < -0.3) force += profile.brakeForceN * condition.brake * brake;
  }
  if (input.handbrake) force -= Math.sign(speed) * profile.brakeForceN * 0.6;
  force -= Math.sign(speed) * (profile.dragCoef * speed * speed + ROLLING * Math.abs(speed));
  let next = speed + (force / profile.massKg) * dt;
  // Freios e atritos não invertem o sentido: param o carro.
  if (speed > 0 && next < 0 && !(brake > 0 && throttle === 0 && speed <= 0.3)) next = 0;
  if (speed < 0 && next > 0) next = 0;
  speed = Math.min(Math.max(next, -MAX_REVERSE), limit);

  // --- Direção (modelo bicicleta com limite de aderência) ---
  const steerAngle = clampAbs(input.steer, 1) * ((profile.maxSteerDeg * Math.PI) / 180) * (1 - 0.55 * Math.min(1, Math.abs(speed) / 16));
  let yawRate = -(speed / geometry.wheelbase) * Math.tan(steerAngle);
  const maxLateral = condition.grip * G * 0.9 * (input.handbrake ? 0.5 : 1);
  let sliding = false;
  if (Math.abs(speed * yawRate) > maxLateral && Math.abs(speed) > 0.5) {
    yawRate = (Math.sign(yawRate) * maxLateral) / Math.abs(speed);
    speed *= 1 - 0.6 * dt; // pneu arrastando perde velocidade
    sliding = true;
  }
  const heading = s.heading + yawRate * dt;

  // --- Posição e colisão (dois círculos: frente e traseira) ---
  const f = forward(heading);
  let x = s.x + f.x * speed * dt;
  let z = s.z + f.z * speed * dt;
  const r = geometry.width * BODY_RADIUS_FACTOR;
  const half = geometry.length / 2 - r;
  let hit = false;
  for (const k of [half, -half]) {
    const p = { x: x + f.x * k, z: z + f.z * k };
    const bx = p.x;
    const bz = p.z;
    if (resolveCollisions(p, r, colliders)) {
      hit = true;
      x += p.x - bx;
      z += p.z - bz;
    }
  }
  let collisions = s.collisions;
  let lastImpact = s.lastImpact;
  if (hit && Math.abs(speed) > 0.2) {
    collisions++;
    lastImpact = Math.abs(speed);
    speed = -speed * 0.2; // quica de leve e perde quase tudo
  }

  // --- Motor, câmbio e temperatura ---
  const v = Math.abs(kmh(speed));
  const gearIndex = Math.max(0, profile.gearTopKmh.findIndex((top) => v < top * 0.92));
  const gear = gearIndex + 1;
  const top = profile.gearTopKmh[gearIndex] ?? profile.gearTopKmh.at(-1)!;
  const rpm = running ? Math.round(profile.idleRpm + Math.min(1, v / top) * (profile.maxRpm - profile.idleRpm) * (0.6 + 0.4 * throttle)) : 0;
  const temperature = condition.overheats && running ? Math.min(1, s.temperature + dt / 75) : s.temperature + (0.5 - s.temperature) * Math.min(1, dt * 0.2);

  return {
    x,
    z,
    heading,
    speed,
    rpm,
    gear,
    temperature,
    time: s.time + dt,
    distance: s.distance + Math.abs(speed) * dt,
    sliding,
    collisions,
    lastImpact,
  };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const clampAbs = (n: number, max: number) => Math.min(max, Math.max(-max, n));
