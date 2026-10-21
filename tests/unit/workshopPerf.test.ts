import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CITY_NEIGHBORHOOD } from '../../src/data/city';
import { EQUIPMENT_IDS } from '../../src/data/equipment';
import { VEHICLES } from '../../src/data/vehicles';
import { findInteractableId } from '../../src/interaction/resolveTarget';
import { buildCityNeighborhood } from '../../src/world/CityNeighborhood';
import { buildWorkshop } from '../../src/world/Workshop';

function countVisibleMeshes(root: THREE.Object3D): number {
  let count = 0;
  root.traverseVisible((obj) => {
    if ((obj as THREE.Mesh).isMesh) count++;
  });
  return count;
}

describe('Prompts 20 e 21 — Oficina Nível Steam e Bairro Vivo de São Cristóvão (desempenho e contratos)', () => {
  it('mantém todos os EQUIPMENT_IDS interativos e reduz as malhas da oficina para <= 200 (meta <= 250)', () => {
    const vehicle = VEHICLES[0]!;
    const workshop = buildWorkshop(vehicle, { color: '#c83e31', plate: 'RIO2A18' });

    const meshesHigh = countVisibleMeshes(workshop.root);
    // Antes do Prompt 20 eram ~368 malhas na oficina (+ rua); agora com mergeStaticMeshes fica <= 180
    expect(meshesHigh).toBeLessThanOrEqual(200);

    // Qualidade baixa esconde decoração secundária e reduz ainda mais
    workshop.setShadowQuality(false, 512);
    const meshesLow = countVisibleMeshes(workshop.root);
    expect(meshesLow).toBeLessThan(meshesHigh);

    // Confere que todos os equipamentos interativos continuam resolvendo corretamente na hierarquia
    const foundIds = new Set<string>();
    workshop.root.traverse((obj) => {
      const id = findInteractableId(obj);
      if (id) foundIds.add(id);
    });
    for (const eqId of Object.values(EQUIPMENT_IDS)) {
      expect(foundIds.has(eqId)).toBe(true);
    }

    // Hora do dia e evolução da oficina
    workshop.setTimeOfDay(17 * 60 + 30);
    workshop.setUpgradeLevel('iluminacao', 2);
    workshop.setUpgradeLevel('armario-ferramentas', 2);
  });

  it('constrói o Bairro de São Cristóvão com <= 120 malhas, ciclo de hora do dia e chuva', async () => {
    const city = buildCityNeighborhood(CITY_NEIGHBORHOOD);
    await city.ensureLocationLoaded('oficina');
    await city.ensureLocationLoaded('lanchonete');

    const meshes = countVisibleMeshes(city.root);
    expect(meshes).toBeLessThanOrEqual(120);

    city.setTimeOfDay?.(20 * 60 + 30);
    city.setRain?.(true);
    city.dispose();
  });
});

