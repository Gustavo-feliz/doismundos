import type { CustomerDecision } from '../customers/types';
import type { QuoteBreakdown } from '../economy/quote';

/**
 * Ordem de serviço (OS): o caminho de um carro pela oficina.
 * diagnostico → orcamento → (contraproposta ↔) → aprovada → em-reparo → concluida
 *                         ↘ recusada (cliente desistiu ou foi dispensado)
 */
export type OrderStatus = 'diagnostico' | 'orcamento' | 'contraproposta' | 'aprovada' | 'em-reparo' | 'concluida' | 'recusada';

export const ORDER_STATUS_LABEL: Readonly<Record<OrderStatus, string>> = {
  diagnostico: 'Em diagnóstico',
  orcamento: 'Aguardando orçamento',
  contraproposta: 'Contraproposta do cliente',
  aprovada: 'Aprovada: pronta para o reparo',
  'em-reparo': 'Em reparo',
  concluida: 'Serviço concluído: aguardando entrega',
  recusada: 'Encerrada sem serviço',
};

const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  diagnostico: ['orcamento'],
  orcamento: ['aprovada', 'contraproposta', 'recusada'],
  contraproposta: ['aprovada', 'contraproposta', 'recusada'],
  aprovada: ['em-reparo'],
  'em-reparo': ['concluida'],
  concluida: [],
  recusada: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** OS fechada: libera o box para o próximo carro. */
export function isOrderClosed(status: OrderStatus): boolean {
  return status === 'concluida' || status === 'recusada';
}

/** Rascunho do orçamento que o jogador monta. */
export interface QuoteDraft {
  /** Posições de serviços extras incluídos. */
  extras: readonly string[];
  markupPct: number;
  discountPct: number;
  urgent: boolean;
  warrantyDays: number;
}

export interface ProposalRecord {
  round: number;
  breakdown: QuoteBreakdown;
  decision: CustomerDecision;
  day: number;
  time: string;
}

export interface RepairItemState {
  slot: string;
  /** Peça orçada. */
  plannedPartId: string;
  removed: boolean;
  installedPartId: string | null;
}

export interface RepairLogEntry {
  kind: 'ok' | 'erro';
  text: string;
  day: number;
  time: string;
}

export interface RepairState {
  items: readonly RepairItemState[];
  finalTest: null | { resolved: boolean; text: string };
  /** Peça errada, ação fora de ordem ou repetida: pesam na qualidade. */
  invalidAttempts: number;
  /** Peça instalada diferente da orçada (compatível, mas não a combinada). */
  substitutions: number;
  minutes: number;
  log: readonly RepairLogEntry[];
}

export type QualityLabel = 'excelente' | 'boa' | 'regular' | 'retrabalho';

export const QUALITY_LABEL_TEXT: Readonly<Record<QualityLabel, string>> = {
  excelente: 'Excelente',
  boa: 'Boa',
  regular: 'Regular',
  retrabalho: 'Retrabalho: o defeito continua',
};

export interface CompletionRecord {
  qualityScore: number;
  qualityLabel: QualityLabel;
  symptomResolved: boolean;
  repairMinutes: number;
  day: number;
  time: string;
}

export interface OrderState {
  status: OrderStatus;
  draft: QuoteDraft;
  proposals: readonly ProposalRecord[];
  /** Quantas contrapropostas o cliente já fez. */
  counters: number;
  approved: QuoteBreakdown | null;
  repair: RepairState | null;
  completion: CompletionRecord | null;
  closedReason: string | null;
}
