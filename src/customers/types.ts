import type { Cents } from '../economy/money';

/**
 * Perfil do cliente (GDD §14.1, subconjunto do Prompt 5).
 * `typeLabel` e `persona` são públicos; os limites numéricos ficam ESCONDIDOS:
 * o jogador descobre negociando.
 */
export interface CustomerProfile {
  id: string;
  name: string;
  typeLabel: string;
  /** O que o jogador percebe do cliente. */
  persona: string;
  /** Orçamento máximo que aceita sem pechinchar. */
  maxBudget: Cents;
  /** Até quanto acima do máximo ainda vale contraproposta (ex.: 1,25 = 25% acima). */
  counterRatio: number;
  /** Quantas contrapropostas aguenta antes de desistir. */
  patience: number;
  /** Exigência: só aceita peça original? */
  requiresOriginal: boolean;
  minWarrantyDays: number;
  /** Tolerância a atraso: prazo máximo aceito, em horas. */
  maxDeadlineHours: number;
  /** Aceita serviços extras sugeridos pela oficina? */
  acceptsExtras: boolean;
}

export type DemandKind = 'preco' | 'prazo' | 'garantia' | 'qualidade' | 'extras';

export interface CustomerDemand {
  kind: DemandKind;
  /** Fala do cliente explicando a exigência. */
  text: string;
}

export type CustomerDecision =
  | { kind: 'aceita'; message: string }
  | { kind: 'contraproposta'; message: string; demands: CustomerDemand[]; targetTotal: Cents | null }
  | { kind: 'recusa'; message: string; demands: CustomerDemand[] };
