/**
 * Colisão 2D simples (plano XZ) entre o jogador (círculo) e caixas alinhadas
 * aos eixos. Basta para andar dentro da oficina; física de verdade (Rapier)
 * será avaliada quando houver test drive (GDD §21.1).
 */
export interface Box2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Colisor temporariamente desligado (ex.: carro no alto do elevador). */
  disabled?: boolean;
}

export interface Point2D {
  x: number;
  z: number;
}

/** O ponto está dentro da caixa (no plano XZ)? */
export function pointInBox(p: Point2D, box: Box2D): boolean {
  return p.x >= box.minX && p.x <= box.maxX && p.z >= box.minZ && p.z <= box.maxZ;
}

/** Cria uma caixa a partir do centro e do tamanho. */
export function boxFromCenter(x: number, z: number, width: number, depth: number): Box2D {
  return { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 };
}

/**
 * Empurra o círculo para fora de uma caixa. Retorna true se houve contato.
 * Altera `p` no lugar (evita alocações no loop de jogo).
 */
export function pushCircleOutOfBox(p: Point2D, radius: number, box: Box2D): boolean {
  const closestX = Math.min(Math.max(p.x, box.minX), box.maxX);
  const closestZ = Math.min(Math.max(p.z, box.minZ), box.maxZ);
  const dx = p.x - closestX;
  const dz = p.z - closestZ;
  const distSq = dx * dx + dz * dz;

  if (distSq >= radius * radius) return false;

  if (distSq > 1e-12) {
    // Centro fora da caixa: empurra na direção do ponto mais próximo.
    const dist = Math.sqrt(distSq);
    const push = radius - dist;
    p.x += (dx / dist) * push;
    p.z += (dz / dist) * push;
    return true;
  }

  // Centro dentro da caixa: sai pelo lado mais próximo.
  const left = p.x - box.minX;
  const right = box.maxX - p.x;
  const back = p.z - box.minZ;
  const front = box.maxZ - p.z;
  const min = Math.min(left, right, back, front);
  if (min === left) p.x = box.minX - radius;
  else if (min === right) p.x = box.maxX + radius;
  else if (min === back) p.z = box.minZ - radius;
  else p.z = box.maxZ + radius;
  return true;
}

/** Resolve contra várias caixas, repetindo para tratar cantos. */
export function resolveCollisions(p: Point2D, radius: number, boxes: readonly Box2D[], iterations = 3): boolean {
  let hit = false;
  for (let i = 0; i < iterations; i++) {
    let any = false;
    for (const box of boxes) {
      if (!box.disabled && pushCircleOutOfBox(p, radius, box)) any = true;
    }
    if (!any) break;
    hit = true;
  }
  return hit;
}

/** Passo máximo por subpasso: menor que a parede mais fina, para não atravessar. */
export const MAX_COLLISION_STEP = 0.1;

/**
 * Move de `p` por (dx, dz) em subpassos, resolvendo colisão em cada um.
 * Evita atravessar paredes finas em quadros lentos.
 */
export function moveWithCollisions(p: Point2D, dx: number, dz: number, radius: number, boxes: readonly Box2D[]): void {
  const distance = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(distance / MAX_COLLISION_STEP));
  const sx = dx / steps;
  const sz = dz / steps;
  for (let i = 0; i < steps; i++) {
    p.x += sx;
    p.z += sz;
    resolveCollisions(p, radius, boxes);
  }
}
