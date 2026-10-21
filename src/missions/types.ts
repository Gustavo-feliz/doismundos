import type { SpeakerId } from '../core/events';
import type { Cents } from '../economy/money';
import type { OrderStatus } from '../orders/types';

/**
 * Missões orientadas por dados (GDD §15.2, Prompt 10). Cada missão define ID,
 * objetivo (passos), pré-requisitos, recompensa, falha, repetibilidade e
 * gatilhos de conclusão. Os gatilhos olham o ESTADO do jogo (não eventos
 * soltos): assim um passo feito antes da hora conta, e salvar/carregar não
 * perde progresso.
 */

/** Coisas que o jogador fez e que o estado da sessão não guarda sozinho. */
export type MissionFlag = 'andou' | 'abriu-painel-carro' | 'abriu-computador' | 'viu-caixa';
export const MISSION_FLAGS: readonly MissionFlag[] = ['andou', 'abriu-painel-carro', 'abriu-computador', 'viu-caixa'];

/** Etapas de uma OS em ordem; "recusada" fica de fora (não é avanço). */
export type OrderStage = Exclude<OrderStatus, 'recusada' | 'contraproposta'>;
export const ORDER_STAGES: readonly OrderStage[] = ['diagnostico', 'orcamento', 'aprovada', 'em-reparo', 'concluida', 'entregue'];

export type MissionCondition =
  | { kind: 'flag'; flag: MissionFlag }
  /** Pelo menos `count` OS chegaram a esta etapa (ou passaram dela). */
  | { kind: 'orders-reached'; stage: OrderStage; count: number }
  /** A OS do box 1 está neste status. */
  | { kind: 'active-order'; status: OrderStatus }
  | { kind: 'purchases'; count: number }
  | { kind: 'installments-paid'; count: number }
  | { kind: 'installment-overdue' }
  | { kind: 'any'; of: readonly MissionCondition[] };

/** O que as condições enxergam. Montado pelo jogo a partir da sessão. */
export interface MissionFacts {
  flags: ReadonlySet<string>;
  /** Quantas OS chegaram a cada etapa (ou passaram dela). */
  ordersReached: Readonly<Record<OrderStage, number>>;
  activeOrderStatus: OrderStatus | null;
  purchases: number;
  installmentsPaid: number;
  installmentOverdue: boolean;
}

/** Orientação quando algo saiu do roteiro: a campanha nunca trava. */
export interface StepRecovery {
  when: MissionCondition;
  objective: string;
  tip: string;
}

export interface MissionStepDef {
  id: string;
  /** Texto do HUD: o jogador sempre sabe o que fazer. */
  objective: string;
  /** Dica contextual (dispensável com H). */
  tip: string;
  /** Objeto da cena a destacar (id de EQUIPMENT_IDS) ou null. */
  highlight: string | null;
  done: MissionCondition;
  /** Diálogo ao começar o passo (só se o passo não for concluído na hora). */
  dialogue?: string;
  recovery?: readonly StepRecovery[];
}

export interface MissionDef {
  id: string;
  act: number;
  title: string;
  prerequisites: readonly string[];
  steps: readonly MissionStepDef[];
  reward: { cash: Cents; text: string };
  /** Como a missão pode dar errado. null = não falha; só orienta. */
  failure: string | null;
  repeatable: boolean;
  /** Diálogos ao começar e ao concluir. */
  startDialogue?: string;
  endDialogue?: string;
}

/** Efeito de uma escolha de diálogo (a consequência fica registrada no save). */
export type DialogueEffect =
  | { kind: 'tips'; on: boolean }
  /** Adia a próxima parcela da dívida, com uma tarifa. */
  | { kind: 'postpone-installment'; days: number; fee: Cents };

export interface DialogueLine {
  speaker: SpeakerId;
  text: string;
}

export interface DialogueOption {
  id: string;
  label: string;
  /** Resposta de quem perguntou. */
  reply: DialogueLine | null;
  effects: readonly DialogueEffect[];
}

export interface DialogueDef {
  id: string;
  lines: readonly DialogueLine[];
  /** Escolha ao fim das falas (opcional). */
  choice?: { options: readonly DialogueOption[] };
}

export const SPEAKER_NAME: Readonly<Record<SpeakerId, string>> = {
  'seu-ze': 'Seu Zé',
  cliente: 'Cliente',
  narrador: '',
  'gerente-banco': 'Gerente do banco',
};

/** Troca marcadores como {cliente} pelos valores atuais; marcador sem valor fica como está. */
export function fillText(text: string, vars: Readonly<Record<string, string>>): string {
  return text.replace(/\{([a-z]+)\}/g, (all, key: string) => vars[key] ?? all);
}
