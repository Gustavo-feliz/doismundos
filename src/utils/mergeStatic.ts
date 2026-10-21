import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { INTERACTABLE_KEY } from '../interaction/resolveTarget';

/**
 * Junta as malhas ESTÁTICAS de um grupo por material (GDD §22: otimizar onde a
 * medição justificar). Cada material vira uma malha só: menos chamadas de
 * desenho, mesma aparência. Só use em cenário que nunca se move nem é
 * interativo; objetos marcados como interativos são ignorados.
 * Retorna quantas malhas havia e quantas ficaram.
 */
export function mergeStaticMeshes(group: THREE.Object3D): { before: number; after: number } {
  group.updateMatrixWorld(true);
  const toGroup = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map<string, { material: THREE.Material; cast: boolean; receive: boolean; geometries: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
  let before = 0;

  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as unknown as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material)) return;
    if (hasInteractableAncestor(mesh, group)) return;
    before++;
    const material = mesh.material as THREE.Material;
    const key = `${material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { material, cast: mesh.castShadow, receive: mesh.receiveShadow, geometries: [], meshes: [] };
      buckets.set(key, bucket);
    }
    // Leva a geometria para o espaço do grupo (posição, rotação e escala "assadas").
    const g = mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(toGroup, mesh.matrixWorld));
    bucket.geometries.push(g.index ? g.toNonIndexed() : g);
    bucket.meshes.push(mesh);
  });

  let after = 0;
  for (const bucket of buckets.values()) {
    if (bucket.meshes.length < 2) {
      for (const g of bucket.geometries) g.dispose();
      after += bucket.meshes.length;
      continue;
    }
    const merged = mergeGeometries(normalizeAttributes(bucket.geometries), false);
    for (const g of bucket.geometries) g.dispose();
    if (!merged) {
      after += bucket.meshes.length; // atributos incompatíveis: deixa como estava
      continue;
    }
    const mesh = new THREE.Mesh(merged, bucket.material);
    mesh.name = 'estatico_unido';
    mesh.castShadow = bucket.cast;
    mesh.receiveShadow = bucket.receive;
    for (const old of bucket.meshes) {
      old.removeFromParent();
      old.geometry.dispose();
    }
    group.add(mesh);
    after++;
  }
  return { before, after };
}

function hasInteractableAncestor(o: THREE.Object3D, stop: THREE.Object3D): boolean {
  for (let cur: THREE.Object3D | null = o; cur && cur !== stop.parent; cur = cur.parent) {
    if (cur.userData[INTERACTABLE_KEY]) return true;
  }
  return false;
}

/** mergeGeometries exige os mesmos atributos em todas: fica só com os comuns (posição, normal, uv). */
function normalizeAttributes(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry[] {
  const common = ['position', 'normal', 'uv'].filter((name) => geometries.every((g) => g.getAttribute(name)));
  for (const g of geometries) {
    for (const name of Object.keys(g.attributes)) if (!common.includes(name)) g.deleteAttribute(name);
    g.morphAttributes = {};
  }
  return geometries;
}
