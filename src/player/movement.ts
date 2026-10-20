/** Matemática pura do movimento em primeira pessoa (testável sem navegador). */

export interface MovementTuning {
  walkSpeed: number;
  runSpeed: number;
  /** m/s² ao acelerar */
  acceleration: number;
  /** m/s² ao frear sem input */
  deceleration: number;
}

export const DEFAULT_MOVEMENT: MovementTuning = {
  walkSpeed: 3.0,
  runSpeed: 5.2,
  acceleration: 22,
  deceleration: 16,
};

/** Limite de inclinação vertical da câmera (radianos), um pouco menos que 90°. */
export const MAX_PITCH = Math.PI / 2 - 0.02;

/**
 * Converte o input (frente/direita) em direção no mundo, dado o yaw.
 * Câmera olhando para -Z quando yaw = 0 (padrão do three.js).
 * Diagonais são normalizadas para não andar mais rápido.
 */
export function wishDirection(yaw: number, forward: number, right: number, out: { x: number; z: number }): { x: number; z: number } {
  const len = Math.hypot(forward, right);
  if (len < 1e-6) {
    out.x = 0;
    out.z = 0;
    return out;
  }
  const f = forward / len;
  const r = right / len;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // frente = (-sin, -cos), direita = (cos, -sin)
  out.x = -sin * f + cos * r;
  out.z = -cos * f - sin * r;
  return out;
}

/** Aproxima `current` de `target` com taxa máxima `maxDelta`. */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

/**
 * Atualiza a velocidade horizontal rumo à velocidade desejada.
 * Usa aceleração ao andar e desaceleração ao soltar as teclas.
 */
export function stepVelocity(
  velocity: { x: number; z: number },
  wish: { x: number; z: number },
  run: boolean,
  tuning: MovementTuning,
  dt: number,
): void {
  const moving = wish.x !== 0 || wish.z !== 0;
  const speed = run ? tuning.runSpeed : tuning.walkSpeed;
  const targetX = wish.x * speed;
  const targetZ = wish.z * speed;
  const rate = (moving ? tuning.acceleration : tuning.deceleration) * dt;
  // Aproxima o vetor inteiro (não cada eixo separado) para não "derrapar" nas diagonais.
  const dx = targetX - velocity.x;
  const dz = targetZ - velocity.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= rate || dist < 1e-9) {
    velocity.x = targetX;
    velocity.z = targetZ;
  } else {
    velocity.x += (dx / dist) * rate;
    velocity.z += (dz / dist) * rate;
  }
}

/** Aplica o movimento do mouse ao yaw/pitch. Sensibilidade 1 = 0,0022 rad por pixel. */
export function applyLook(
  view: { yaw: number; pitch: number },
  mouseDX: number,
  mouseDY: number,
  sensitivity: number,
  invertY: boolean,
): void {
  const k = 0.0022 * sensitivity;
  view.yaw -= mouseDX * k;
  view.pitch -= mouseDY * k * (invertY ? -1 : 1);
  view.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, view.pitch));
  // Mantém o yaw em [-π, π] para não perder precisão depois de horas girando.
  if (view.yaw > Math.PI) view.yaw -= Math.PI * 2;
  else if (view.yaw < -Math.PI) view.yaw += Math.PI * 2;
}
