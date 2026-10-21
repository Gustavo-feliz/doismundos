/**
 * Sensação da câmera em primeira pessoa (Prompt 25), em matemática pura:
 * balanço ao andar, inclinação leve ao virar e ao andar de lado, e mira
 * assistida (o mouse fica mais lento sobre algo interativo).
 *
 * Nada aqui muda regras do jogo: só a câmera e a sensibilidade.
 * "Reduzir movimento" ou "balanço desligado" zeram o balanço e a inclinação.
 */

export interface CameraFeelState {
  /** Fase do passo (radianos). */
  bobPhase: number;
  /** Deslocamento vertical da cabeça (m). */
  bob: number;
  /** Inclinação lateral da câmera (radianos). */
  roll: number;
}

export interface CameraFeelInput {
  dt: number;
  /** Velocidade no chão (m/s). */
  speed: number;
  /** Velocidade de lado, positiva para a direita (m/s). */
  strafe: number;
  /** Quanto o olhar girou neste quadro (radianos; positivo = para a esquerda). */
  yawDelta: number;
  walkSpeed: number;
  /** false com "reduzir movimento" ou com o balanço desligado. */
  enabled: boolean;
}

export const CAMERA_FEEL = {
  /** Passos por metro, aproximado. */
  bobFrequency: 1.9,
  bobAmplitude: 0.035,
  /** Inclinação por m/s de passo lateral. */
  strafeRoll: 0.006,
  /** Inclinação por rad/s de giro. */
  turnRoll: 0.004,
  maxRoll: 0.025,
  /** Quão rápido a inclinação alcança o alvo (1/s). */
  rollResponse: 8,
  /** Fator da sensibilidade com a mira sobre um interativo. */
  aimAssistFactor: 0.6,
} as const;

export function createCameraFeel(): CameraFeelState {
  return { bobPhase: 0, bob: 0, roll: 0 };
}

export function resetCameraFeel(s: CameraFeelState): void {
  s.bobPhase = 0;
  s.bob = 0;
  s.roll = 0;
}

/** Um passo da câmera. Desligada, tudo volta a zero suavemente (sem tranco). */
export function stepCameraFeel(s: CameraFeelState, i: CameraFeelInput): CameraFeelState {
  const settle = Math.max(0, 1 - i.dt * 10);
  if (i.enabled && i.speed > 0.2) {
    s.bobPhase += i.speed * i.dt * CAMERA_FEEL.bobFrequency * Math.PI;
    s.bob = Math.sin(s.bobPhase) * CAMERA_FEEL.bobAmplitude * Math.min(i.speed / i.walkSpeed, 1.4);
  } else {
    s.bob *= settle;
    if (Math.abs(s.bob) < 1e-5) s.bob = 0;
  }

  if (i.enabled) {
    const turnRate = i.dt > 0 ? i.yawDelta / i.dt : 0;
    const target = clamp(-i.strafe * CAMERA_FEEL.strafeRoll + turnRate * CAMERA_FEEL.turnRoll, -CAMERA_FEEL.maxRoll, CAMERA_FEEL.maxRoll);
    const k = 1 - Math.exp(-CAMERA_FEEL.rollResponse * i.dt);
    s.roll += (target - s.roll) * k;
  } else {
    s.roll *= settle;
  }
  if (Math.abs(s.roll) < 1e-5) s.roll = 0;
  return s;
}

/** Sensibilidade com a mira assistida: mais lenta sobre um interativo. */
export function aimAssistScale(onInteractive: boolean, enabled: boolean): number {
  return enabled && onInteractive ? CAMERA_FEEL.aimAssistFactor : 1;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
