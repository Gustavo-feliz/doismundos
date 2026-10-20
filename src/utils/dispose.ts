import type * as THREE from 'three';

/**
 * Libera geometrias, materiais e texturas de uma árvore de objetos.
 * Recursos compartilhados são liberados uma única vez.
 */
export function disposeObject3D(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of list) materials.add(material);
  });

  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) disposeMaterial(material);
}

function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material as unknown as Record<string, unknown>)) {
    if (value && typeof value === 'object' && (value as { isTexture?: boolean }).isTexture) {
      (value as THREE.Texture).dispose();
    }
  }
  material.dispose();
}
