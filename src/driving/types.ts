/** Tipos da direção e do test drive (Prompt 13). */

/** Como uma categoria de carro anda. Só dados. */
export interface DrivingProfile {
  massKg: number;
  /** Força máxima do motor nas rodas (N), já com a média das marchas. */
  engineForceN: number;
  brakeForceN: number;
  idleRpm: number;
  maxRpm: number;
  /** Velocidade máxima de cada marcha (km/h); câmbio automático simples. */
  gearTopKmh: readonly number[];
  /** Arrasto aerodinâmico (N por (m/s)²). */
  dragCoef: number;
  maxSteerDeg: number;
}

export interface TestTrackDef {
  halfX: number;
  halfZ: number;
  wallThickness: number;
  speedLimitKmh: number;
  start: { x: number; z: number; heading: number };
  cones: ReadonlyArray<{ x: number; z: number }>;
  coneRadius: number;
  pillars: ReadonlyArray<{ x: number; z: number; width: number; depth: number }>;
}

/** Luzes do painel (GDD Prompt 13: "luzes de alerta essenciais"). */
export type WarningLight = 'bateria' | 'oleo' | 'temperatura' | 'freio' | 'injecao';

/**
 * Efeito do estado REAL das peças na direção. Calculado pela regra, nunca
 * mostrado como número: o jogador só SENTE (escorrega, freia mais longe, falha).
 */
export interface DrivingCondition {
  /** 1 = pneus bons; menos = escorrega antes. */
  grip: number;
  /** 1 = freio bom; menos = frenagem mais longa. */
  brake: number;
  /** Vibração no pedal/volante ao frear (disco empenado), 0–1. */
  brakeShake: number;
  /** Balanço da carroceria (amortecedor gasto), 0–1. */
  sway: number;
  /** Falha de ignição: quanto o torque oscila, 0–1. */
  misfire: number;
  /** Arrefecimento ruim: a temperatura sobe andando. */
  overheats: boolean;
  /** Motivo de o carro não poder rodar (null = pode). */
  cannotStart: string | null;
  lights: readonly WarningLight[];
}

/** Estado do carro na pista (puro, JSON). */
export interface DriveState {
  x: number;
  z: number;
  /** Rumo em radianos (0 = olhando para -Z, igual à câmera do jogador). */
  heading: number;
  /** m/s; negativo = ré. */
  speed: number;
  rpm: number;
  gear: number;
  /** 0 = frio, 0,5 = normal, 1 = fervendo. */
  temperature: number;
  /** Tempo de simulação (s): usado nas falhas determinísticas. */
  time: number;
  /** Distância percorrida (m). */
  distance: number;
  /** O carro está escorregando nesta curva? */
  sliding: boolean;
  /** Batidas e a maior velocidade de impacto (m/s). */
  collisions: number;
  lastImpact: number;
}

export interface DriveInput {
  /** 0–1 */
  throttle: number;
  /** 0–1 (parado, vira ré) */
  brake: number;
  /** −1 (esquerda) a 1 (direita) */
  steer: number;
  handbrake: boolean;
}
