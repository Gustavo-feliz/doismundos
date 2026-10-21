import type { Settings } from '../save/settings';
import type { GameStateName } from './GameState';

/** Quem fala num diálogo (legenda e som de "fala"). */
export type SpeakerId = 'seu-ze' | 'cliente' | 'narrador' | 'gerente-banco';

/** Todos os eventos do jogo e seus dados. Adicione aqui ao criar um novo. */
export interface GameEvents {
  'state:changed': { from: GameStateName; to: GameStateName };
  'settings:changed': { settings: Settings };
  /** Objeto da cena que o tutorial quer destacar (id de EQUIPMENT_IDS) ou null para apagar o destaque. */
  'tutorial:highlight': { targetId: string | null };
  'mission:step': { missionId: string; stepId: string; status: 'iniciado' | 'concluido' };
  'mission:completed': { missionId: string };
  /** Uma fala apareceu na legenda. */
  'dialogue:line': { speaker: SpeakerId; text: string };
}
