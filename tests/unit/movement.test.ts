import { describe, expect, it } from 'vitest';
import { applyLook, DEFAULT_MOVEMENT, MAX_PITCH, stepVelocity, wishDirection } from '../../src/player/movement';
import { boxFromCenter, moveWithCollisions, pushCircleOutOfBox, resolveCollisions } from '../../src/world/collision';

describe('wishDirection', () => {
  it('frente com yaw 0 aponta para -Z', () => {
    const d = wishDirection(0, 1, 0, { x: 0, z: 0 });
    expect(d.x).toBeCloseTo(0);
    expect(d.z).toBeCloseTo(-1);
  });

  it('direita com yaw 0 aponta para +X', () => {
    const d = wishDirection(0, 0, 1, { x: 0, z: 0 });
    expect(d.x).toBeCloseTo(1);
    expect(d.z).toBeCloseTo(0);
  });

  it('diagonal é normalizada (não anda mais rápido)', () => {
    const d = wishDirection(0.7, 1, 1, { x: 0, z: 0 });
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1);
  });

  it('sem input não há direção', () => {
    const d = wishDirection(1, 0, 0, { x: 5, z: 5 });
    expect(d).toEqual({ x: 0, z: 0 });
  });

  it('girar 90° para a esquerda faz "frente" virar -X', () => {
    const d = wishDirection(Math.PI / 2, 1, 0, { x: 0, z: 0 });
    expect(d.x).toBeCloseTo(-1);
    expect(d.z).toBeCloseTo(0);
  });
});

describe('stepVelocity', () => {
  it('acelera até a velocidade de caminhada e não passa dela', () => {
    const v = { x: 0, z: 0 };
    for (let i = 0; i < 120; i++) stepVelocity(v, { x: 0, z: -1 }, false, DEFAULT_MOVEMENT, 1 / 60);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(DEFAULT_MOVEMENT.walkSpeed, 5);
  });

  it('correr é mais rápido que andar', () => {
    const v = { x: 0, z: 0 };
    for (let i = 0; i < 120; i++) stepVelocity(v, { x: 1, z: 0 }, true, DEFAULT_MOVEMENT, 1 / 60);
    expect(v.x).toBeCloseTo(DEFAULT_MOVEMENT.runSpeed, 5);
  });

  it('para ao soltar as teclas', () => {
    const v = { x: 3, z: 0 };
    for (let i = 0; i < 60; i++) stepVelocity(v, { x: 0, z: 0 }, false, DEFAULT_MOVEMENT, 1 / 60);
    expect(v).toEqual({ x: 0, z: 0 });
  });
});

describe('applyLook', () => {
  it('limita o olhar vertical', () => {
    const view = { yaw: 0, pitch: 0 };
    applyLook(view, 0, -100000, 1, false);
    expect(view.pitch).toBe(MAX_PITCH);
    applyLook(view, 0, 100000, 1, false);
    expect(view.pitch).toBe(-MAX_PITCH);
  });

  it('inverter eixo Y troca o sentido', () => {
    const normal = { yaw: 0, pitch: 0 };
    const inverted = { yaw: 0, pitch: 0 };
    applyLook(normal, 0, 50, 1, false);
    applyLook(inverted, 0, 50, 1, true);
    expect(normal.pitch).toBeCloseTo(-inverted.pitch);
  });

  it('sensibilidade escala o giro e o yaw fica em [-π, π]', () => {
    const a = { yaw: 0, pitch: 0 };
    const b = { yaw: 0, pitch: 0 };
    applyLook(a, 100, 0, 1, false);
    applyLook(b, 100, 0, 2, false);
    expect(b.yaw).toBeCloseTo(a.yaw * 2);
    const c = { yaw: 0, pitch: 0 };
    for (let i = 0; i < 100; i++) applyLook(c, 500, 0, 3, false);
    expect(Math.abs(c.yaw)).toBeLessThanOrEqual(Math.PI);
  });
});

describe('colisão', () => {
  const wall = { minX: -10, maxX: 10, minZ: -0.1, maxZ: 0.1 }; // parede fina em z=0

  it('empurra o círculo para fora de uma caixa', () => {
    const p = { x: 0, z: 0.3 };
    expect(pushCircleOutOfBox(p, 0.3, wall)).toBe(true);
    expect(p.z).toBeCloseTo(0.4);
  });

  it('não mexe quando não há contato', () => {
    const p = { x: 0, z: 1 };
    expect(pushCircleOutOfBox(p, 0.3, wall)).toBe(false);
    expect(p).toEqual({ x: 0, z: 1 });
  });

  it('centro dentro da caixa sai pelo lado mais próximo', () => {
    const p = { x: 0.9, z: 0 };
    pushCircleOutOfBox(p, 0.3, boxFromCenter(0, 0, 2, 4));
    expect(p.x).toBeCloseTo(1.3);
  });

  it('um passo grande não atravessa parede fina (subpassos)', () => {
    const p = { x: 0, z: 1 };
    moveWithCollisions(p, 0, -3, 0.3, [wall]);
    expect(p.z).toBeGreaterThanOrEqual(0.4 - 1e-9);
  });

  it('desliza ao longo da parede ao andar na diagonal', () => {
    const p = { x: 0, z: 0.5 };
    moveWithCollisions(p, 1, -1, 0.3, [wall]);
    expect(p.x).toBeCloseTo(1);
    expect(p.z).toBeCloseTo(0.4);
  });

  it('resolve cantos com várias caixas', () => {
    const boxes = [
      { minX: -1, maxX: 0, minZ: -5, maxZ: 5 },
      { minX: -5, maxX: 5, minZ: -1, maxZ: 0 },
    ];
    const p = { x: 0.1, z: 0.1 };
    resolveCollisions(p, 0.3, boxes);
    expect(p.x).toBeGreaterThanOrEqual(0.3 - 1e-9);
    expect(p.z).toBeGreaterThanOrEqual(0.3 - 1e-9);
  });
});
