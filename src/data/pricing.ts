import type { PricingRules } from '../economy/quote';

/**
 * Regras de preço da oficina (GDD §14.2).
 * PROVISÓRIO: valores do protótipo; balanceamento no Prompt 7.
 */
export const PRICING: PricingRules = {
  hourlyRate: 90_00,
  // Mão de obra arredondada para cima em blocos de meia hora.
  laborBlockMinutes: 30,
  categoryLaborMultiplier: { popular: 0.9, hatch: 0.95, sedan: 1, suv: 1.15, picape: 1.2, van: 1.2 },
  // Urgência: cobrada UMA vez, só sobre a mão de obra (já com o ajuste de categoria).
  urgencyRate: 0.3,
  disposalFeePerItem: 10_00,
  queueHours: 4,
  urgentQueueHours: 1,
  markupOptions: [0, 0.1, 0.2, 0.3, 0.4, 0.5],
  discountOptions: [0, 0.05, 0.1, 0.15, 0.2],
  // 90 dias é o mínimo legal para serviços (CDC). 180 = garantia estendida.
  warrantyOptions: [90, 180],
  depositThreshold: 1_000_00,
  depositRate: 0.3,
};

/** Valores iniciais do orçamento que o jogador monta. */
export const DEFAULT_QUOTE_SETTINGS = {
  markupPct: 0.3,
  discountPct: 0,
  urgent: false,
  warrantyDays: 90,
} as const;
