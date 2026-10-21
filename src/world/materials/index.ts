import * as THREE from 'three';
import {
  asphaltRoadTexture,
  concreteFloorRoughnessTexture,
  concreteFloorTexture,
  microGrainMapTexture,
  portugueseStoneTexture,
  tileWallTexture,
  woodWorkbenchTexture,
} from '../../utils/canvasTextures';

/**
 * Biblioteca de 10 materiais PBR compartilhados do projeto (Prompt 19).
 * Respeita os 3 níveis de qualidade ('baixa', 'media', 'alta'):
 * - 'baixa': desliga mapas secundários (roughnessMap, bumpMap) para economizar memória e tempo de shader.
 * - 'media': ativa mapa difuso e mapa de rugosidade.
 * - 'alta': ativa mapa difuso, rugosidade e micro-relevo (bumpMap).
 *
 * Nenhum modelo ou cenário cria materiais duplicados sem necessidade: todos vêm do cache.
 */

export type MaterialQuality = 'baixa' | 'media' | 'alta';

export type SharedMaterialId =
  | 'concreto'
  | 'metalPintado'
  | 'metalCromado'
  | 'borracha'
  | 'plastico'
  | 'vidro'
  | 'azulejo'
  | 'madeira'
  | 'asfalto'
  | 'pedraPortuguesa';

export const SHARED_MATERIAL_IDS: readonly SharedMaterialId[] = [
  'concreto',
  'metalPintado',
  'metalCromado',
  'borracha',
  'plastico',
  'vidro',
  'azulejo',
  'madeira',
  'asfalto',
  'pedraPortuguesa',
] as const;

export interface MaterialRequestOptions {
  /** Cor opcional para variantes (ex.: metalPintado azul, vermelho ou amarelo). */
  color?: number | string;
  /** Identificador de variante para cache. */
  variant?: string;
}

export interface MaterialLibraryStats {
  quality: MaterialQuality;
  cachedMaterials: number;
  activeMaps: number;
}

export interface SharedMaterialLibrary {
  get(id: SharedMaterialId, options?: MaterialRequestOptions): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
  setQuality(quality: MaterialQuality): void;
  getQuality(): MaterialQuality;
  stats(): MaterialLibraryStats;
  dispose(): void;
}

interface CachedEntry {
  id: SharedMaterialId;
  material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
  diffuseMap: THREE.Texture | null;
  roughnessMap: THREE.Texture | null;
  bumpMap: THREE.Texture | null;
}

export function createMaterialLibrary(initialQuality: MaterialQuality = 'alta'): SharedMaterialLibrary {
  let currentQuality: MaterialQuality = initialQuality;
  const cache = new Map<string, CachedEntry>();
  let sharedGrainMap: THREE.CanvasTexture | null = null;
  let sharedConcreteRoughMap: THREE.CanvasTexture | null = null;

  const getGrainMap = (): THREE.CanvasTexture => {
    if (!sharedGrainMap) sharedGrainMap = microGrainMapTexture(256, 176, 0.22, 181);
    return sharedGrainMap;
  };

  const getConcreteRoughMap = (): THREE.CanvasTexture => {
    if (!sharedConcreteRoughMap) sharedConcreteRoughMap = concreteFloorRoughnessTexture(11);
    return sharedConcreteRoughMap;
  };

  const applyQualityToEntry = (entry: CachedEntry) => {
    const mat = entry.material;
    mat.map = entry.diffuseMap;
    if (currentQuality === 'baixa') {
      mat.roughnessMap = null;
      mat.bumpMap = null;
      mat.bumpScale = 0;
    } else if (currentQuality === 'media') {
      mat.roughnessMap = entry.roughnessMap;
      mat.bumpMap = null;
      mat.bumpScale = 0;
    } else {
      mat.roughnessMap = entry.roughnessMap;
      mat.bumpMap = entry.bumpMap;
      mat.bumpScale = entry.bumpMap ? 0.012 : 0;
    }
    mat.needsUpdate = true;
  };

  const buildEntry = (id: SharedMaterialId, options?: MaterialRequestOptions): CachedEntry => {
    const grain = getGrainMap();
    switch (id) {
      case 'concreto': {
        const diffuse = concreteFloorTexture(14, 18, 11);
        const rough = getConcreteRoughMap();
        const material = new THREE.MeshStandardMaterial({
          color: options?.color ?? 0xffffff,
          roughness: 0.92,
          metalness: 0.05,
        });
        return { id, material, diffuseMap: diffuse, roughnessMap: rough, bumpMap: grain };
      }
      case 'metalPintado': {
        const material = new THREE.MeshStandardMaterial({
          color: options?.color ?? 0x24518a,
          roughness: 0.4,
          metalness: 0.38,
        });
        return { id, material, diffuseMap: null, roughnessMap: grain, bumpMap: grain };
      }
      case 'metalCromado': {
        const material = new THREE.MeshStandardMaterial({
          color: options?.color ?? 0xdce0e4,
          roughness: 0.16,
          metalness: 0.96,
        });
        return { id, material, diffuseMap: null, roughnessMap: null, bumpMap: null };
      }
      case 'borracha': {
        const material = new THREE.MeshStandardMaterial({
          color: options?.color ?? 0x161618,
          roughness: 0.92,
          metalness: 0.02,
        });
        return { id, material, diffuseMap: null, roughnessMap: grain, bumpMap: grain };
      }
      case 'plastico': {
        const material = new THREE.MeshStandardMaterial({
          color: options?.color ?? 0x23272b,
          roughness: 0.62,
          metalness: 0.08,
        });
        return { id, material, diffuseMap: null, roughnessMap: grain, bumpMap: null };
      }
      case 'vidro': {
        const material = new THREE.MeshPhysicalMaterial({
          color: options?.color ?? 0x1b2834,
          roughness: 0.08,
          metalness: 0.15,
          clearcoat: 1.0,
          clearcoatRoughness: 0.04,
          transparent: true,
          opacity: 0.82,
        });
        return { id, material, diffuseMap: null, roughnessMap: null, bumpMap: null };
      }
      case 'azulejo': {
        const hex = typeof options?.color === 'string' ? options.color : '#2b5852';
        const diffuse = tileWallTexture(hex, '#18332f', 512, 131);
        const material = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.56,
          metalness: 0.06,
        });
        return { id, material, diffuseMap: diffuse, roughnessMap: grain, bumpMap: grain };
      }
      case 'madeira': {
        const diffuse = woodWorkbenchTexture(89);
        const material = new THREE.MeshStandardMaterial({
          color: options?.color ?? 0xffffff,
          roughness: 0.68,
          metalness: 0.04,
        });
        return { id, material, diffuseMap: diffuse, roughnessMap: grain, bumpMap: grain };
      }
      case 'asfalto': {
        const diffuse = asphaltRoadTexture(512, 149);
        const material = new THREE.MeshStandardMaterial({
          color: options?.color ?? 0xffffff,
          roughness: 0.88,
          metalness: 0.05,
        });
        return { id, material, diffuseMap: diffuse, roughnessMap: grain, bumpMap: grain };
      }
      case 'pedraPortuguesa': {
        const diffuse = portugueseStoneTexture(512, 163);
        const material = new THREE.MeshStandardMaterial({
          color: options?.color ?? 0xffffff,
          roughness: 0.82,
          metalness: 0.02,
        });
        return { id, material, diffuseMap: diffuse, roughnessMap: grain, bumpMap: grain };
      }
    }
  };

  return {
    get(id: SharedMaterialId, options?: MaterialRequestOptions) {
      const colorKey = options?.color !== undefined ? String(options.color) : 'default';
      const variantKey = options?.variant ?? 'base';
      const key = `${id}|${colorKey}|${variantKey}`;
      let entry = cache.get(key);
      if (!entry) {
        entry = buildEntry(id, options);
        entry.material.name = `mat_${id}_${variantKey}`;
        applyQualityToEntry(entry);
        cache.set(key, entry);
      }
      return entry.material;
    },

    setQuality(quality: MaterialQuality) {
      if (currentQuality === quality) return;
      currentQuality = quality;
      for (const entry of cache.values()) {
        applyQualityToEntry(entry);
      }
    },

    getQuality() {
      return currentQuality;
    },

    stats(): MaterialLibraryStats {
      let activeMaps = 0;
      for (const entry of cache.values()) {
        if (entry.material.map) activeMaps++;
        if (entry.material.roughnessMap) activeMaps++;
        if (entry.material.bumpMap) activeMaps++;
      }
      return {
        quality: currentQuality,
        cachedMaterials: cache.size,
        activeMaps,
      };
    },

    dispose() {
      for (const entry of cache.values()) {
        entry.diffuseMap?.dispose();
        entry.material.dispose();
      }
      cache.clear();
      sharedGrainMap?.dispose();
      sharedGrainMap = null;
      sharedConcreteRoughMap?.dispose();
      sharedConcreteRoughMap = null;
    },
  };
}

/** Instância global compartilhada pelos cenários da oficina, pátio e bairro. */
export const sharedMaterials = createMaterialLibrary('alta');

