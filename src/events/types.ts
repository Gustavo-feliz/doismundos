import type { Cents } from '../economy/money';

/**
 * Categorias do sistema reutilizável de eventos da oficina (GDD §16.4, §16.5 e §24 Prompt 16):
 * - `'fiscalizacao'`: alvará, descarte ambiental, segurança do trabalho e ruído.
 * - `'pressao-local'`: encontro ficcional de pressão criminosa / associação paralela no bairro,
 *   sem violência gráfica e sempre com alternativas legíveis e recuperáveis.
 */
export type GameEventCategory = 'fiscalizacao' | 'pressao-local';

export const GAME_EVENT_CATEGORY_LABEL: Readonly<Record<GameEventCategory, string>> = {
  fiscalizacao: 'Fiscalização Municipal',
  'pressao-local': 'Pressão Local no Bairro',
};

/** Regra de disparo determinístico de um evento. */
export interface GameEventTriggerDef {
  /** Dia mínimo do jogo para o evento poder ocorrer. */
  minDay: number;
  /** Quantidade mínima de OS entregues (0 = não exige OS entregue). */
  minDeliveredOrders: number;
  /** Dias mínimos de intervalo após o último evento disparado. */
  cooldownDays: number;
  /** Se `true`, pode voltar a ocorrer após `cooldownDays`; se `false`, ocorre uma única vez na campanha. */
  repeatable: boolean;
}

/** Alternativa legível de decisão diante de um evento. */
export interface GameEventOptionDef {
  id: string;
  label: string;
  /** Explicação clara do risco, custo e consequência antes da escolha. */
  description: string;
  /** Custo financeiro imediato em centavos inteiros (0 = sem custo em dinheiro). */
  cost: Cents;
  /** Se `true`, exige saldo/crédito disponível para escolher. Todo evento deve ter ao menos 1 opção com `cost === 0` ou `requireCash === false`. */
  requireCash: boolean;
  /** Mudança na reputação geral da oficina (ex.: +3, +1, -2). */
  reputationDelta: number;
  /** Minutos do relógio gastos para executar a escolha. */
  timeMinutes: number;
  /** Mensagem de desfecho exibida ao jogador e gravada no histórico. */
  outcomeText: string;
}

/** Definição estática de um evento narrativo/operacional (`src/data/events.ts`). */
export interface GameEventDef {
  id: string;
  category: GameEventCategory;
  title: string;
  speaker: string;
  message: string;
  trigger: GameEventTriggerDef;
  options: readonly GameEventOptionDef[];
}

/** Registro persistente de um evento resolvido pelo jogador. */
export interface EventHistoryEntry {
  id: string;
  eventId: string;
  category: GameEventCategory;
  title: string;
  optionId: string;
  optionLabel: string;
  cost: Cents;
  reputationDelta: number;
  timeMinutes: number;
  outcomeText: string;
  day: number;
  time: string;
  at: number;
}

/** Estado persistente do sistema de eventos na sessão e no save. */
export interface EventState {
  /** ID do evento atualmente aguardando decisão do jogador (`null` = nenhum pendente). */
  activeEventId: string | null;
  /** Histórico cronológico de eventos resolvidos. */
  history: EventHistoryEntry[];
  /** Último dia em que qualquer evento foi disparado (0 = nenhum ainda). */
  lastTriggeredDay: number;
  /** Sequencial determinístico para IDs de histórico (`EVT-0001`, `EVT-0002`...). */
  nextEventSeq: number;
}

