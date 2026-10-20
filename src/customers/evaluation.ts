import type { Cents } from '../economy/money';
import type { QualityLabel } from '../orders/types';

/**
 * Avaliação do cliente na entrega (GDD Prompt 8): prazo, orçamento, qualidade
 * do reparo e comunicação. Regras fixas; cada critério gera um motivo legível.
 */
export interface EvaluationInput {
  /** Minuto absoluto prometido (aprovação + prazo do orçamento). */
  promisedAt: number;
  deliveredAt: number;
  paidTotal: Cents;
  maxBudget: Cents;
  quality: QualityLabel;
  /** Quantas contrapropostas o cliente precisou fazer. */
  counters: number;
  /** Serviço coberto pela garantia (cliente não pagou). */
  warrantyCovered: boolean;
}

export type ReasonEffect = 'positivo' | 'neutro' | 'negativo';

export interface ReviewReason {
  criterion: 'prazo' | 'orcamento' | 'qualidade' | 'comunicacao';
  effect: ReasonEffect;
  points: number;
  text: string;
}

export interface Review {
  stars: number;
  reasons: ReviewReason[];
  /** Cliente satisfeito volta no futuro. */
  willReturn: boolean;
  /** Cliente insatisfeito reclama (texto da reclamação) ou null. */
  complaint: string | null;
}

const effectOf = (points: number): ReasonEffect => (points > 0 ? 'positivo' : points < 0 ? 'negativo' : 'neutro');
/** Tolerância de atraso que ainda não irrita o cliente. */
export const LATE_TOLERANCE_MINUTES = 120;

export function evaluateService(input: EvaluationInput): Review {
  const reasons: ReviewReason[] = [];
  const add = (criterion: ReviewReason['criterion'], points: number, text: string) => reasons.push({ criterion, points, effect: effectOf(points), text });

  const late = input.deliveredAt - input.promisedAt;
  if (late <= 0) add('prazo', 1, 'Ficou pronto dentro do prazo prometido.');
  else if (late <= LATE_TOLERANCE_MINUTES) add('prazo', 0, `Atrasou um pouco (${late} min além do prometido).`);
  else add('prazo', -1, `Atrasou ${(late / 60).toFixed(1).replace('.', ',')} h além do prometido.`);

  if (input.warrantyCovered) add('orcamento', 1, 'Não paguei nada: estava na garantia.');
  else if (input.paidTotal <= Math.round(input.maxBudget * 0.85)) add('orcamento', 1, 'Preço justo pelo serviço.');
  else add('orcamento', 0, 'Preço dentro do que eu esperava.');

  const quality: Record<QualityLabel, [number, string]> = {
    excelente: [2, 'Serviço caprichado: o problema sumiu.'],
    boa: [1, 'O problema sumiu.'],
    regular: [0, 'Resolveu, mas o serviço teve tropeços.'],
    retrabalho: [-2, 'O problema continua!'],
  };
  add('qualidade', ...quality[input.quality]);

  if (input.counters === 0) add('comunicacao', 1, 'Orçamento claro logo de primeira.');
  else if (input.counters === 1) add('comunicacao', 0, 'Negociação tranquila.');
  else add('comunicacao', -1, 'Muitas idas e vindas no orçamento.');

  const sum = reasons.reduce((s, r) => s + r.points, 0);
  // Arredonda para baixo: um critério ruim sempre custa estrela (ex.: atraso tira o 5★).
  const stars = Math.min(5, Math.max(1, 3 + Math.floor(sum / 2)));
  const negatives = reasons.filter((r) => r.effect === 'negativo').map((r) => r.text);
  return {
    stars,
    reasons,
    willReturn: stars >= 4,
    complaint: stars <= 2 ? `Reclamação: ${negatives.join(' ') || 'não gostei do serviço.'}` : null,
  };
}
