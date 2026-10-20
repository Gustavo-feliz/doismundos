import type { Review } from '../customers/evaluation';
import type { CustomerDecision } from '../customers/types';
import type { Cents } from '../economy/money';
import type { QuoteBreakdown } from '../economy/quote';

/**
 * Ordem de serviço (OS): o caminho de um carro pela oficina.
 * diagnostico → orcamento → (contraproposta ↔) → aprovada → em-reparo → concluida → entregue
 *                         ↘ recusada (cliente desistiu ou foi dispensado)
 */
export type OrderStatus = 'diagnostico' | 'orcamento' | 'contraproposta' | 'aprovada' | 'em-reparo' | 'concluida' | 'entregue' | 'recusada';

export const ORDER_STATUS_LABEL: Readonly<Record<OrderStatus, string>> = {
  diagnostico: 'Em diagnóstico',
  orcamento: 'Aguardando orçamento',
  contraproposta: 'Contraproposta do cliente',
  aprovada: 'Aprovada: pronta para o reparo',
  'em-reparo': 'Em reparo',
  concluida: 'Serviço concluído: aguardando entrega',
  entregue: 'Entregue e paga',
  recusada: 'Encerrada sem serviço',
};

const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  diagnostico: ['orcamento'],
  orcamento: ['aprovada', 'contraproposta', 'recusada'],
  contraproposta: ['aprovada', 'contraproposta', 'recusada'],
  aprovada: ['em-reparo'],
  'em-reparo': ['concluida'],
  concluida: ['entregue'],
  entregue: [],
  recusada: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** OS fechada: libera o box para o próximo carro. */
export function isOrderClosed(status: OrderStatus): boolean {
  return status === 'entregue' || status === 'recusada';
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
  /** Quanto a oficina pagou pela peça instalada (custo do serviço). */
  installedUnitCost: Cents | null;
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
  /** Minuto absoluto da aprovação (o prazo prometido conta daqui). */
  approvedAt: number | null;
  depositPaid: Cents;
  delivery: DeliveryRecord | null;
  /** Garantia: esta OS é coberta? (decidido no retorno ou no diagnóstico). */
  warranty: { covered: boolean; reason: string; warrantyId: string | null } | null;
  /** OS original, quando esta é um retorno em garantia. */
  linkedTo: string | null;
}

export interface DeliveryRecord {
  at: number;
  day: number;
  time: string;
  promisedAt: number;
  revenue: Cents;
  partsCost: Cents;
  grossProfit: Cents;
  review: Review;
  warrantyId: string | null;
}
