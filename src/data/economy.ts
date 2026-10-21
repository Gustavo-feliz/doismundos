import type { DebtConfig } from '../economy/debt';
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

/**
 * Dívida bancária herdada do tio (GDD §6.1). PROVISÓRIO: valores de
 * balanceamento. Parcela semanal; a primeira vence no fim do dia 3.
 */
export const BANK_DEBT: DebtConfig = {
  total: 4_800_00,
  installment: 400_00,
  firstDueDay: 3,
  intervalDays: 7,
  lateFeePct: 10,
};
