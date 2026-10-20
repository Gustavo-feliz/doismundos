import type * as THREE from 'three';

/** Chave em userData que liga um Object3D (ou um ancestral) a um interativo. */
export const INTERACTABLE_KEY = 'interactableId';

/** Marca um objeto (e tudo dentro dele) como parte de um interativo. */
export function tagInteractable(object: THREE.Object3D, id: string): void {
  object.userData[INTERACTABLE_KEY] = id;
}

/** Sobe na hierarquia até achar o id do interativo mais próximo. */
export function findInteractableId(object: THREE.Object3D | null): string | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const id = current.userData?.[INTERACTABLE_KEY];
    if (typeof id === 'string') return id;
    current = current.parent;
  }
  return null;
}

/**
 * Decide o alvo a partir dos acertos do raio (ordenados do mais perto ao mais
 * longe). Só o PRIMEIRO acerto conta: se ele não for interativo, nada é
 * selecionado — assim não se interage através de paredes, carros etc.
 */
export function resolveTarget(hits: ReadonlyArray<{ object: THREE.Object3D }>): string | null {
  const first = hits[0];
  return first ? findInteractableId(first.object) : null;
}
