import type { Settings } from '../save/settings';
import type { GameStateName } from './GameState';

/** Todos os eventos do jogo e seus dados. Adicione aqui ao criar um novo. */
export interface GameEvents {
  'state:changed': { from: GameStateName; to: GameStateName };
  'settings:changed': { settings: Settings };
}
