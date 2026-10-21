import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildCharacter, CHARACTER_ROLES, createCastStage } from '../../src/characters';
import { computeExteriorVisualWear } from '../../src/vehicles/models/exteriorWear';

describe('Prompt 22 — Desgaste externo seguro de veículos e modelos de personagens', () => {
  it('calcula desgaste visual externo sem depender de peças internas (Regra de Ouro #2)', () => {
    const novo = computeExteriorVisualWear({
      modelYear: 2023,
      currentYear: 2026,
      mileageKm: 12_000,
      testDriveCollisions: 0,
    });
    const rodado = computeExteriorVisualWear({
      modelYear: 2001,
      currentYear: 2026,
      mileageKm: 195_000,
      testDriveCollisions: 2,
    });

    expect(novo.rustFactor).toBe(0);
    expect(novo.dentCount).toBe(0);
    expect(rodado.dirtFactor).toBeGreaterThan(novo.dirtFactor);
    expect(rodado.rustFactor).toBeGreaterThan(0.5);
    expect(rodado.dentCount).toBeGreaterThanOrEqual(2);
    expect(rodado.paintRoughness).toBeGreaterThan(novo.paintRoughness);
  });

  it('constrói todos os 6 personagens (Seu Zé, protagonista, 3 clientes, gerente) abaixo de 15k triângulos e respeita reduceMotion', () => {
    for (const role of CHARACTER_ROLES) {
      const rig = buildCharacter(role);
      expect(rig.role).toBe(role);
      expect(rig.triangleCount).toBeGreaterThan(20);
      expect(rig.triangleCount).toBeLessThanOrEqual(15_000);

      rig.setAnimation('pointing');
      expect(rig.getAnimation()).toBe('pointing');
      rig.update(1.5, true); // reduceMotion = true fixa a pose
      const fixedRot = rig.rightArmPivot.rotation.x;
      rig.update(3.2, true);
      expect(rig.rightArmPivot.rotation.x).toBeCloseTo(fixedRot, 5);

      rig.setCustomization({ overallColor: 0xffb703, skinTone: 0xd6a17c });
      rig.dispose();
    }
  });

  it('createCastStage posiciona e reaproveita o elenco nas tomadas da abertura (Prompt 23) e limpa com null', () => {
    const parent = new THREE.Group();
    const stage = createCastStage(parent);

    stage.placeCast([
      { role: 'seu-ze', position: [0, 0, 4], yaw: 3.14, animation: 'talking' },
      { role: 'protagonista', position: [1, 0, 5], yaw: 0, animation: 'idle', custom: { overallColor: 0x24518a } },
    ]);

    const ze = stage.getRig('seu-ze');
    const prot = stage.getRig('protagonista');
    expect(ze?.root.visible).toBe(true);
    expect(ze?.getAnimation()).toBe('talking');
    expect(prot?.root.visible).toBe(true);

    stage.update(1.0, false);
    stage.placeCast(null);
    expect(ze?.root.visible).toBe(false);
    expect(prot?.root.visible).toBe(false);

    stage.dispose();
  });
});

