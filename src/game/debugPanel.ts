import GUI from 'lil-gui';
import type * as THREE from 'three';
import type { MovementTuning } from '../player/movement';

/**
 * Painel de ajuste ao vivo (abrir com ?debug na URL).
 * Carregado sob demanda: não entra no pacote principal.
 */
export function createDebugPanel(
  tuning: MovementTuning,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  onChange: () => void,
): () => void {
  const gui = new GUI({ title: 'Ajustes (debug)' });
  const move = gui.addFolder('Movimento');
  move.add(tuning, 'walkSpeed', 1, 6, 0.1).name('andar (m/s)');
  move.add(tuning, 'runSpeed', 2, 10, 0.1).name('correr (m/s)');
  move.add(tuning, 'acceleration', 4, 40, 0.5).name('aceleração');
  move.add(tuning, 'deceleration', 4, 40, 0.5).name('frenagem');
  const look = gui.addFolder('Imagem');
  look.add(renderer, 'toneMappingExposure', 0.4, 2, 0.01).name('exposição').onChange(onChange);
  look.add(scene, 'environmentIntensity', 0, 1.5, 0.01).name('reflexos').onChange(onChange);
  return () => gui.destroy();
}
