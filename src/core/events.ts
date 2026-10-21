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
  /** Nível de uma ferramenta/upgrade (0–3): ao comprar e ao começar/carregar um jogo. */
  'upgrade:changed': { upgradeId: string; level: number };
  /** O carro do box 1 mudou (nova OS, jogo novo ou save carregado). Para a cena trocar a carroceria. */
  'vehicle:changed': { modelId: string; category: string; color: string; plate: string; year: number; mileageKm: number };
  /** Uma ação do jogador terminou (Prompt 25): para o som e o retorno visual. `erro` = não deu. */
  'feedback:action': { kind: FeedbackActionKind; minutes: number };
  /** Recompensa (Prompt 25): pagamento em centavos, variação de reputação ou missão concluída. */
  'feedback:reward': { kind: 'pagamento' | 'reputacao' | 'missao'; amount?: number };
}

/** Tipos de ação com retorno visual e sonoro. */
export type FeedbackActionKind = 'remover' | 'instalar' | 'exame' | 'compra' | 'entrega' | 'erro';
