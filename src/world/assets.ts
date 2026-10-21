import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/**
 * Pipeline central de assets 3D (Prompt 19):
 * - Carregador com cache e deduplicação de chamadas concorrentes;
 * - Suporte a GLB compactado (Meshopt / Draco) e texturas KTX2;
 * - Barra/evento de progresso real e tratamento seguro de falha de rede (nunca trava o jogo);
 * - Nível de detalhe automático (`createAutoLod`) e instancing (`createInstancedProps`).
 */

export interface AssetProgress {
  loaded: number;
  total: number;
  ratio: number;
  currentUrl: string | null;
  failed: number;
}

export class AssetLoadError extends Error {
  readonly url: string;
  override readonly cause?: unknown;

  constructor(url: string, cause?: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause ?? 'erro desconhecido');
    super(`Falha ao carregar asset "${url}": ${detail}`);
    this.name = 'AssetLoadError';
    this.url = url;
    this.cause = cause;
  }
}

export interface LodLevelSpec {
  object: THREE.Object3D;
  distance: number;
}

export interface InstanceTransform {
  position: readonly [number, number, number];
  rotationY?: number;
  scale?: number | readonly [number, number, number];
}

export interface AssetPipelineOptions {
  dracoDecoderPath?: string;
  ktx2TranscoderPath?: string;
  renderer?: THREE.WebGLRenderer;
  /** Permite injetar carregador customizado em testes unitários (sem rede/WebGL). */
  customModelLoader?: (url: string) => Promise<THREE.Group>;
}

/**
 * Cria um objeto `THREE.LOD` ordenado por distância crescente.
 */
export function createAutoLod(levels: readonly LodLevelSpec[], name = 'lod_objeto'): THREE.LOD {
  const lod = new THREE.LOD();
  lod.name = name;
  const sorted = [...levels].sort((a, b) => a.distance - b.distance);
  for (const level of sorted) {
    lod.addLevel(level.object, Math.max(0, level.distance));
  }
  return lod;
}

/**
 * Cria um `THREE.InstancedMesh` otimizado para objetos repetidos (caixas, latas,
 * pneus, ferramentas, cones), reduzindo N malhas para 1 única chamada de desenho.
 */
export function createInstancedProps(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  transforms: readonly InstanceTransform[],
  options: { name?: string; castShadow?: boolean; receiveShadow?: boolean } = {},
): THREE.InstancedMesh {
  const count = Math.max(1, transforms.length);
  const instanced = new THREE.InstancedMesh(geometry, material, count);
  instanced.name = options.name ?? 'instanced_props';
  instanced.castShadow = options.castShadow ?? false;
  instanced.receiveShadow = options.receiveShadow ?? true;

  const matrix = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3(1, 1, 1);

  if (transforms.length === 0) {
    instanced.count = 0;
    return instanced;
  }

  transforms.forEach((t, i) => {
    pos.set(t.position[0], t.position[1], t.position[2]);
    euler.set(0, t.rotationY ?? 0, 0);
    quat.setFromEuler(euler);
    if (typeof t.scale === 'number') {
      scale.set(t.scale, t.scale, t.scale);
    } else if (t.scale) {
      scale.set(t.scale[0], t.scale[1], t.scale[2]);
    } else {
      scale.set(1, 1, 1);
    }
    matrix.compose(pos, quat, scale);
    instanced.setMatrixAt(i, matrix);
  });
  instanced.instanceMatrix.needsUpdate = true;
  return instanced;
}

export class AssetPipeline {
  private readonly modelCache = new Map<string, THREE.Group>();
  private readonly inFlight = new Map<string, Promise<THREE.Group>>();
  private readonly listeners = new Set<(progress: AssetProgress) => void>();
  private gltfLoader: GLTFLoader | null = null;
  private dracoLoader: DRACOLoader | null = null;
  private ktx2Loader: KTX2Loader | null = null;

  private loadedCount = 0;
  private totalCount = 0;
  private failedCount = 0;
  private currentUrl: string | null = null;

  constructor(private readonly options: AssetPipelineOptions = {}) {}

  private ensureLoaders(): GLTFLoader {
    if (this.gltfLoader) return this.gltfLoader;
    const loader = new GLTFLoader();
    try {
      const draco = new DRACOLoader();
      draco.setDecoderPath(this.options.dracoDecoderPath ?? '/draco/');
      loader.setDRACOLoader(draco);
      this.dracoLoader = draco;
    } catch {
      // Segue sem Draco caso o ambiente não suporte WebWorker
    }
    try {
      loader.setMeshoptDecoder(MeshoptDecoder);
    } catch {
      // Segue caso o ambiente de teste não tenha WebAssembly
    }
    try {
      const ktx2 = new KTX2Loader();
      ktx2.setTranscoderPath(this.options.ktx2TranscoderPath ?? '/basis/');
      if (this.options.renderer) ktx2.detectSupport(this.options.renderer);
      loader.setKTX2Loader(ktx2);
      this.ktx2Loader = ktx2;
    } catch {
      // Segue sem KTX2 em ambiente sem WebGL
    }
    this.gltfLoader = loader;
    return loader;
  }

  private emitProgress(): void {
    const progress = this.getProgress();
    for (const listener of this.listeners) {
      listener(progress);
    }
  }

  getProgress(): AssetProgress {
    const ratio = this.totalCount > 0 ? Math.min(1, (this.loadedCount + this.failedCount) / this.totalCount) : 1;
    return {
      loaded: this.loadedCount,
      total: this.totalCount,
      ratio,
      currentUrl: this.currentUrl,
      failed: this.failedCount,
    };
  }

  onProgress(listener: (progress: AssetProgress) => void): () => void {
    this.listeners.add(listener);
    listener(this.getProgress());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Carrega um modelo GLB/GLTF com cache e deduplicação de chamadas simultâneas.
   * Retorna um clone leve da cena (compartilhando BufferGeometry e Material).
   */
  async loadModel(url: string): Promise<THREE.Group> {
    const cached = this.modelCache.get(url);
    if (cached) {
      return cached.clone(true);
    }
    const pending = this.inFlight.get(url);
    if (pending) {
      const base = await pending;
      return base.clone(true);
    }

    this.totalCount++;
    this.currentUrl = url;
    this.emitProgress();

    const task = (async () => {
      try {
        let group: THREE.Group;
        if (this.options.customModelLoader) {
          group = await this.options.customModelLoader(url);
        } else {
          const loader = this.ensureLoaders();
          const gltf = await new Promise<GLTF>((resolve, reject) => {
            loader.load(url, resolve, undefined, reject);
          });
          group = gltf.scene;
        }
        this.modelCache.set(url, group);
        this.loadedCount++;
        return group;
      } catch (err) {
        this.failedCount++;
        throw new AssetLoadError(url, err);
      } finally {
        this.inFlight.delete(url);
        this.currentUrl = this.inFlight.size > 0 ? [...this.inFlight.keys()][0]! : null;
        this.emitProgress();
      }
    })();

    this.inFlight.set(url, task);
    const base = await task;
    return base.clone(true);
  }

  /**
   * Carrega um modelo GLB com fallback seguro: se a rede falhar ou o arquivo não existir,
   * nunca trava o jogo e devolve o grupo procedural de contingência.
   */
  async loadSafeModel(
    url: string,
    fallbackFactory: () => THREE.Group,
  ): Promise<{ group: THREE.Group; fromFallback: boolean; error: AssetLoadError | null }> {
    try {
      const group = await this.loadModel(url);
      return { group, fromFallback: false, error: null };
    } catch (err) {
      const error = err instanceof AssetLoadError ? err : new AssetLoadError(url, err);
      const fallback = fallbackFactory();
      fallback.userData.assetFallback = true;
      fallback.userData.failedUrl = url;
      return { group: fallback, fromFallback: true, error };
    }
  }

  getStats(): { cachedModels: number; inFlight: number; loaded: number; failed: number } {
    return {
      cachedModels: this.modelCache.size,
      inFlight: this.inFlight.size,
      loaded: this.loadedCount,
      failed: this.failedCount,
    };
  }

  clearCache(): void {
    this.modelCache.clear();
    this.inFlight.clear();
  }

  dispose(): void {
    this.clearCache();
    this.dracoLoader?.dispose();
    this.ktx2Loader?.dispose();
  }
}

/** Instância padrão compartilhada do pipeline de assets. */
export const assetPipeline = new AssetPipeline();

