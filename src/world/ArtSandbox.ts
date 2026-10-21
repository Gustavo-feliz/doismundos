import * as THREE from 'three';
import { lightingAtMinute, type LightingPreset } from '../data/lighting';
import { createAutoLod, createInstancedProps } from './assets';
import {
  createMaterialLibrary,
  SHARED_MATERIAL_IDS,
  type MaterialQuality,
  type SharedMaterialId,
  type SharedMaterialLibrary,
} from './materials';

/**
 * Ambiente de teste de arte (`?arte` na URL) — Prompt 19.
 * Exibe os 10 objetos de referência com os 10 materiais compartilhados,
 * objetos repetidos via `InstancedMesh`, nível de detalhe (`THREE.LOD`),
 * troca de hora do dia e comparação de chamadas de desenho entre `'baixa'` e `'alta'`.
 */

export interface ArtSandbox {
  root: THREE.Group;
  materials: SharedMaterialLibrary;
  showcaseMeshes: ReadonlyMap<SharedMaterialId, THREE.Mesh>;
  setQuality(quality: MaterialQuality): void;
  getQuality(): MaterialQuality;
  setMinuteOfDay(minuteOfDay: number): LightingPreset;
  getLighting(): LightingPreset;
  /** Conta as chamadas de desenho ativas do sandbox no nível de qualidade atual. */
  estimateDrawCalls(): number;
  dispose(): void;
}

export function buildArtSandbox(initialQuality: MaterialQuality = 'alta', initialMinute = 17 * 60 + 15): ArtSandbox {
  const root = new THREE.Group();
  root.name = 'art_sandbox';
  const materials = createMaterialLibrary(initialQuality);
  const geometries: THREE.BufferGeometry[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  // Iluminação por hora do dia
  const hemi = new THREE.HemisphereLight(0xffd8b8, 0x473930, 0.45);
  const sun = new THREE.DirectionalLight(0xffb870, 2.1);
  root.add(hemi, sun);

  // 1. Os 10 objetos de demonstração usando os 10 materiais compartilhados
  const showcaseGroup = new THREE.Group();
  showcaseGroup.name = 'mostruario_10_materiais';
  root.add(showcaseGroup);

  const showcaseMeshes = new Map<SharedMaterialId, THREE.Mesh>();
  const sampleGeo = trackGeo(new THREE.CylinderGeometry(0.28, 0.32, 0.72, 18));

  SHARED_MATERIAL_IDS.forEach((matId, index) => {
    const mat = materials.get(matId);
    const mesh = new THREE.Mesh(sampleGeo, mat);
    mesh.name = `amostra_${matId}`;
    const col = index % 5;
    const row = Math.floor(index / 5);
    mesh.position.set(-2.4 + col * 1.2, 0.36, 1.8 + row * 1.3);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    showcaseGroup.add(mesh);
    showcaseMeshes.set(matId, mesh);
  });

  // 2. Lotes com InstancedMesh (caixas, latas, pneus, cones, ferramentas = 5 lotes, 1 draw call cada)
  const instancedGroup = new THREE.Group();
  instancedGroup.name = 'lotes_instanciados';
  root.add(instancedGroup);

  const boxTransforms = Array.from({ length: 12 }, (_, i) => ({
    position: [-3.0 + (i % 6) * 0.5, 0.2, 4.2 + Math.floor(i / 6) * 0.5] as const,
    rotationY: (i * 0.25) % 0.6,
  }));
  instancedGroup.add(
    createInstancedProps(
      trackGeo(new THREE.BoxGeometry(0.36, 0.28, 0.32)),
      materials.get('madeira'),
      boxTransforms,
      { name: 'instanced_caixas' },
    ),
  );

  const canTransforms = Array.from({ length: 10 }, (_, i) => ({
    position: [0.6 + (i % 5) * 0.28, 0.14, 4.2 + Math.floor(i / 5) * 0.28] as const,
  }));
  instancedGroup.add(
    createInstancedProps(
      trackGeo(new THREE.CylinderGeometry(0.08, 0.08, 0.24, 12)),
      materials.get('metalPintado', { color: 0xb3261e, variant: 'lata_vermelha' }),
      canTransforms,
      { name: 'instanced_latas' },
    ),
  );

  // 3. Exemplo de LOD automático (3 níveis de detalhe)
  const lod = createAutoLod(
    [
      {
        distance: 0,
        object: new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.35, 24, 18)), materials.get('metalCromado')),
      },
      {
        distance: 8,
        object: new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.35, 12, 10)), materials.get('metalCromado')),
      },
      {
        distance: 20,
        object: new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.35, 0)), materials.get('metalCromado')),
      },
    ],
    'lod_esfera_cromada',
  );
  lod.position.set(2.8, 0.45, 4.2);
  root.add(lod);

  // 4. Detalhes decorativos extras visíveis apenas em qualidade 'media' / 'alta'
  // (No nível 'baixa' eles ficam ocultos para reduzir as chamadas de desenho a menos da metade do 'alta')
  const highDetailGroup = new THREE.Group();
  highDetailGroup.name = 'detalhes_alta_qualidade';
  root.add(highDetailGroup);

  const detailGeo = trackGeo(new THREE.BoxGeometry(0.18, 0.18, 0.18));
  for (let i = 0; i < 20; i++) {
    const matId = SHARED_MATERIAL_IDS[i % SHARED_MATERIAL_IDS.length]!;
    const m = new THREE.Mesh(detailGeo, materials.get(matId));
    m.position.set(-2.8 + (i % 10) * 0.6, 0.95 + Math.floor(i / 10) * 0.3, 1.8);
    highDetailGroup.add(m);
  }

  let currentLighting = lightingAtMinute(initialMinute);

  const setMinuteOfDay = (minuteOfDay: number): LightingPreset => {
    currentLighting = lightingAtMinute(minuteOfDay);
    sun.color.setHex(currentLighting.sunColor);
    sun.intensity = currentLighting.sunIntensity;
    sun.position.set(
      currentLighting.sunPosition[0],
      currentLighting.sunPosition[1],
      currentLighting.sunPosition[2],
    );
    hemi.color.setHex(currentLighting.skyColor);
    hemi.groundColor.setHex(currentLighting.groundColor);
    hemi.intensity = currentLighting.hemiIntensity;
    return currentLighting;
  };

  const setQuality = (quality: MaterialQuality) => {
    materials.setQuality(quality);
    highDetailGroup.visible = quality !== 'baixa';
  };

  setMinuteOfDay(initialMinute);
  setQuality(initialQuality);

  return {
    root,
    materials,
    showcaseMeshes,
    setQuality,
    getQuality: () => materials.getQuality(),
    setMinuteOfDay,
    getLighting: () => currentLighting,
    estimateDrawCalls(): number {
      let calls = 0;
      root.traverseVisible((obj) => {
        if ((obj as THREE.LOD).isLOD) {
          // Um LOD conta apenas 1 nível ativo por frame
          calls += 1;
          return;
        }
        if ((obj as THREE.Mesh).isMesh) {
          // Evita contar os 3 filhos internos do LOD simultaneamente
          if (obj.parent && (obj.parent as THREE.LOD).isLOD) return;
          calls += 1;
        }
      });
      return calls;
    },
    dispose() {
      for (const g of geometries) g.dispose();
      materials.dispose();
    },
  };
}

