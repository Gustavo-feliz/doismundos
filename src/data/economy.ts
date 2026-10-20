import type { Cents } from '../economy/money';

/**
 * Economia básica (Prompt 7). PROVISÓRIO: valores de balanceamento.
 * Crédito com fornecedor: DESLIGADO (0). Com um limite > 0, o caixa pode
 * ficar negativo até esse valor (regra explícita, GDD Prompt 7).
 */
export const ECONOMY = {
  startingCash: 1_500_00 as Cents,
  creditLimit: 0 as Cents,
} as const;
