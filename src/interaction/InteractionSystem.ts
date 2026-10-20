import * as THREE from 'three';
import { resolveTarget } from './resolveTarget';
import type { Interactable, InteractionPrompt, InteractionResult } from './types';

const SCREEN_CENTER = new THREE.Vector2(0, 0);

/**
 * Mira por raycast a partir do centro da tela e executa a ação do alvo.
 * Não conhece nenhum equipamento específico: só o contrato Interactable.
 */
export class InteractionSystem {
  private readonly raycaster = new THREE.Raycaster();
  private readonly registry = new Map<string, Interactable>();
  private readonly hits: THREE.Intersection[] = [];
  private focused: Interactable | null = null;

  constructor(
    /** Tudo que pode bloquear ou receber a mira. */
    private readonly targets: THREE.Object3D[],
    range: number,
  ) {
    this.raycaster.near = 0;
    this.raycaster.far = range;
  }

  register(interactable: Interactable): void {
    if (this.registry.has(interactable.id)) throw new Error(`Interativo duplicado: "${interactable.id}"`);
    this.registry.set(interactable.id, interactable);
  }

  get focusedId(): string | null {
    return this.focused?.id ?? null;
  }

  /** Atualiza o alvo sob a mira. Retorna o prompt a exibir (ou null). */
  update(camera: THREE.Camera): InteractionPrompt | null {
    this.raycaster.setFromCamera(SCREEN_CENTER, camera);
    this.hits.length = 0;
    this.raycaster.intersectObjects(this.targets, true, this.hits);
    const id = resolveTarget(this.hits);
    this.focused = id ? (this.registry.get(id) ?? null) : null;
    return this.focused?.getPrompt() ?? null;
  }

  /** Executa a ação do alvo atual. null = não há alvo. */
  interact(): InteractionResult | null {
    return this.focused?.interact() ?? null;
  }

  clearFocus(): void {
    this.focused = null;
  }
}
