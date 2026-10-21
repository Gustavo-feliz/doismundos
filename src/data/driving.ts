import type { DrivingProfile, TestTrackDef } from '../driving/types';
import type { VehicleCategory } from '../vehicles/types';

/**
 * Direção e test drive (Prompt 13). PROVISÓRIO: valores de balanceamento,
 * ajustados para um pátio pequeno a no máximo 60 km/h.
 * O entre-eixos vem das dimensões de cada modelo (data/vehicles.ts).
 */
export const DRIVING_PROFILES: Readonly<Record<VehicleCategory, DrivingProfile>> = {
  popular: { massKg: 950, engineForceN: 2900, brakeForceN: 8200, idleRpm: 850, maxRpm: 6000, gearTopKmh: [22, 40, 60, 85, 140], dragCoef: 0.42, maxSteerDeg: 34 },
  hatch: { massKg: 1080, engineForceN: 3500, brakeForceN: 9200, idleRpm: 850, maxRpm: 6200, gearTopKmh: [24, 44, 66, 92, 160], dragCoef: 0.4, maxSteerDeg: 34 },
  sedan: { massKg: 1250, engineForceN: 3900, brakeForceN: 10_500, idleRpm: 800, maxRpm: 6000, gearTopKmh: [24, 45, 68, 95, 170], dragCoef: 0.38, maxSteerDeg: 32 },
  suv: { massKg: 1550, engineForceN: 4600, brakeForceN: 12_500, idleRpm: 800, maxRpm: 5800, gearTopKmh: [22, 42, 64, 90, 165], dragCoef: 0.5, maxSteerDeg: 31 },
  picape: { massKg: 1850, engineForceN: 5200, brakeForceN: 14_000, idleRpm: 750, maxRpm: 4500, gearTopKmh: [20, 38, 58, 82, 150], dragCoef: 0.55, maxSteerDeg: 30 },
  van: { massKg: 2000, engineForceN: 5000, brakeForceN: 14_500, idleRpm: 750, maxRpm: 5000, gearTopKmh: [20, 38, 56, 80, 140], dragCoef: 0.6, maxSteerDeg: 30 },
};

/** Pátio de teste: um retângulo murado com cones. Coordenadas em metros (plano XZ). */
export const TEST_TRACK: TestTrackDef = {
  halfX: 30,
  halfZ: 20,
  wallThickness: 0.6,
  speedLimitKmh: 60,
  start: { x: -24, z: 14, heading: 0 },
  // Cones em zigue-zague no meio e uma "chicane" perto do fim.
  cones: [
    { x: -12, z: 8 },
    { x: -6, z: 2 },
    { x: 0, z: 8 },
    { x: 6, z: 2 },
    { x: 12, z: 8 },
    { x: 18, z: -6 },
    { x: 18, z: -12 },
    { x: -18, z: -10 },
  ],
  coneRadius: 0.35,
  /** Pilares de concreto (obstáculos maiores). */
  pillars: [
    { x: 0, z: -8, width: 2, depth: 2 },
    { x: -10, z: -2, width: 1.2, depth: 6 },
  ],
};
