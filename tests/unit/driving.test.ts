import { describe, expect, it } from 'vitest';
import { DRIVING_PROFILES, TEST_TRACK } from '../../src/data/driving';
import { drivingCondition } from '../../src/driving/condition';
import { FIXED_STEP, forward, initialDriveState, kmh, simulate, trackColliders, type CarGeometry } from '../../src/driving/physics';
import type { DriveInput, DriveState, DrivingCondition, TestTrackDef } from '../../src/driving/types';
import type { VehicleState } from '../../src/vehicles/state';
import { catalogs, newSession } from './fixtures';

const profile = DRIVING_PROFILES.sedan;
const geometry: CarGeometry = { wheelbase: 2.55, width: 1.72, length: 4.3 };
const colliders = trackColliders(TEST_TRACK);
/** Pista sem obstáculos (para medir aceleração e frenagem sem bater). */
const open: TestTrackDef = { ...TEST_TRACK, halfX: 500, halfZ: 500, cones: [], pillars: [], start: { x: 0, z: 0, heading: 0 } };
const openColliders = trackColliders(open);
const GOOD: DrivingCondition = { grip: 1, brake: 1, brakeShake: 0, sway: 0, misfire: 0, overheats: false, cannotStart: null, lights: [] };
const IDLE: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
const GAS: DriveInput = { ...IDLE, throttle: 1 };
const BRAKE: DriveInput = { ...IDLE, brake: 1 };

const run = (s: DriveState, input: DriveInput, seconds: number, cond = GOOD, track = open, cols = openColliders) => simulate(s, input, seconds, profile, geometry, cond, track, cols);

/** Distância de frenagem a partir da velocidade máxima da área. */
function brakingDistance(cond: DrivingCondition): number {
  const fast = run(initialDriveState(open), GAS, 15, cond);
  let s = fast;
  // Para no instante em que o carro parou (segurar o freio parado vira ré).
  while (s.speed > 0.3) s = run(s, BRAKE, FIXED_STEP, cond);
  return s.distance - fast.distance;
}

/** Carro de demonstração com o desgaste de uma posição trocado. */
function demoWith(slot: string, wear: number): VehicleState {
  const v = newSession().getVehicle('demo-brisa-001');
  return { ...v, parts: { ...v.parts, [slot]: { ...v.parts[slot]!, wear } } };
}

describe('física de direção', () => {
  it('acelera, respeita o limite de 60 km/h do pátio e troca de marcha', () => {
    const s = run(initialDriveState(open), GAS, 20);
    expect(kmh(s.speed)).toBeGreaterThan(55);
    expect(kmh(s.speed)).toBeLessThanOrEqual(60.01);
    expect(s.gear).toBeGreaterThanOrEqual(3);
    expect(s.rpm).toBeGreaterThan(profile.idleRpm);
  });

  it('determinística: a mesma entrada dá sempre o mesmo resultado', () => {
    const input: DriveInput = { throttle: 0.8, brake: 0, steer: 0.4, handbrake: false };
    expect(run(initialDriveState(open), input, 6)).toEqual(run(initialDriveState(open), input, 6));
  });

  it('freia até parar, e segurando o freio parado vira ré lenta', () => {
    const fast = run(initialDriveState(open), GAS, 6);
    const stopped = run(fast, BRAKE, 0.1 + fast.speed / ((profile.brakeForceN / profile.massKg) * 0.9));
    expect(Math.abs(stopped.speed)).toBeLessThan(1.5);
    const reversing = run(stopped, BRAKE, 5);
    expect(reversing.speed).toBeLessThan(0);
    expect(kmh(Math.abs(reversing.speed))).toBeLessThanOrEqual(11);
  });

  it('esterçar para a direita vira o carro para a direita (+X quando aponta para -Z)', () => {
    const s = run(initialDriveState(open), { ...GAS, steer: 1, throttle: 0.4 }, 2);
    expect(s.x).toBeGreaterThan(0);
    expect(forward(0)).toEqual({ x: -0, z: -1 });
  });

  it('bate na parede, para e conta a batida; reiniciar volta ao ponto de partida', () => {
    let s = initialDriveState(TEST_TRACK);
    s = { ...s, heading: Math.PI / 2 }; // aponta para -X, a parede da esquerda está a 6 m
    s = run(s, GAS, 6, GOOD, TEST_TRACK, colliders);
    expect(s.collisions).toBeGreaterThan(0);
    expect(s.x).toBeGreaterThan(-TEST_TRACK.halfX); // não atravessou
    expect(initialDriveState(TEST_TRACK)).toMatchObject({ x: TEST_TRACK.start.x, z: TEST_TRACK.start.z, speed: 0, collisions: 0 });
  });

  it('carro que não pega não sai do lugar', () => {
    const s = run(initialDriveState(open), GAS, 5, { ...GOOD, cannotStart: 'bateria morta' });
    expect(s.speed).toBe(0);
    expect(s.rpm).toBe(0);
  });
});

describe('estado real das peças muda a direção', () => {
  it('pastilha gasta: frenagem mais longa', () => {
    const worn = drivingCondition(demoWith('freios.pastilhas-dianteiras', 95), catalogs);
    const fresh = drivingCondition(demoWith('freios.pastilhas-dianteiras', 5), catalogs);
    expect(worn.brake).toBeLessThan(fresh.brake);
    expect(worn.lights).toContain('freio');
    // Contra um freio perfeito, a pastilha no fim anda bem mais até parar.
    expect(brakingDistance(worn)).toBeGreaterThan(brakingDistance(GOOD) * 1.4);
  });

  it('pneu gasto: escorrega numa curva que o pneu bom faz', () => {
    const worn = drivingCondition(demoWith('rodas.pneus', 100), catalogs);
    // Curva moderada a ~45 km/h: o pneu bom segura, o careca escorrega.
    const curve: DriveInput = { throttle: 0, brake: 0, steer: 0.35, handbrake: false };
    const fast = run(initialDriveState(open), GAS, 4);
    const slides = (cond: DrivingCondition) => {
      let s = fast;
      for (let i = 0; i < 30; i++) {
        s = run(s, curve, FIXED_STEP, cond);
        if (s.sliding) return true;
      }
      return false;
    };
    expect(slides({ ...GOOD, grip: worn.grip })).toBe(true);
    expect(slides(GOOD)).toBe(false);
  });

  it('luzes e falhas: bateria morta não pega; arrefecimento ruim esquenta andando', () => {
    expect(drivingCondition(demoWith('eletrica.bateria', 100), catalogs).cannotStart).toMatch(/bateria/);
    const hot = drivingCondition(demoWith('arrefecimento.valvula-termostatica', 100), catalogs);
    expect(hot.overheats).toBe(true);
    expect(run(initialDriveState(open), { ...GAS, throttle: 0.3 }, 40, hot).temperature).toBeGreaterThan(0.85);
    const sparks = drivingCondition(demoWith('motor.velas', 98), catalogs);
    expect(sparks.misfire).toBeGreaterThan(0.9);
    expect(sparks.lights).toContain('injecao');
    // Falha de ignição: acelera menos que o motor bom no mesmo tempo.
    expect(run(initialDriveState(open), GAS, 3, sparks).distance).toBeLessThan(run(initialDriveState(open), GAS, 3).distance);
  });

  it('peça faltando: o carro não anda e o motivo diz qual', () => {
    const v = newSession().getVehicle('demo-brisa-001');
    const c = drivingCondition({ ...v, parts: { ...v.parts, 'freios.pastilhas-dianteiras': null } }, catalogs);
    expect(c.cannotStart).toBe('Falta peça: Pastilhas de freio dianteiras. O carro não anda assim.');
  });
});
