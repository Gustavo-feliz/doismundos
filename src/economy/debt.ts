import type { Cents } from './money';

/**
 * Dívida bancária herdada do tio (GDD §6.1, Prompt 10). Regras puras.
 * Pagar atrasado custa uma multa, mas nunca encerra o jogo: a campanha não
 * trava por uma falha pequena (Prompt 10).
 */
export interface DebtConfig {
  /** Saldo devedor inicial. */
  total: Cents;
  /** Valor de cada parcela (a última pode ser menor). */
  installment: Cents;
  /** Dia em que vence a primeira parcela (paga até o fim desse dia, sem multa). */
  firstDueDay: number;
  intervalDays: number;
  /** Multa por atraso, em % da parcela. */
  lateFeePct: number;
}

export interface DebtState {
  /** Quanto ainda falta pagar (sem multas nem tarifas). */
  balance: Cents;
  nextDueDay: number;
  /** Tarifa que entra na próxima parcela (ex.: adiamento combinado com o banco). */
  pendingFee: Cents;
  paidCount: number;
}

export interface InstallmentDue {
  base: Cents;
  fee: Cents;
  lateFee: Cents;
  total: Cents;
  overdue: boolean;
}

export function initialDebt(cfg: DebtConfig, firstDueDay = cfg.firstDueDay): DebtState {
  return { balance: cfg.total, nextDueDay: firstDueDay, pendingFee: 0, paidCount: 0 };
}

export function isDebtPaid(state: DebtState): boolean {
  return state.balance <= 0;
}

/** Venceu e não foi paga: a partir do dia seguinte ao vencimento. */
export function isOverdue(state: DebtState, day: number): boolean {
  return !isDebtPaid(state) && day > state.nextDueDay;
}

/** Quanto custa pagar a próxima parcela hoje. */
export function installmentDue(state: DebtState, day: number, cfg: DebtConfig): InstallmentDue {
  const base = Math.min(cfg.installment, state.balance);
  const overdue = isOverdue(state, day);
  const lateFee = overdue ? Math.round((base * cfg.lateFeePct) / 100) : 0;
  return { base, fee: state.pendingFee, lateFee, total: base + state.pendingFee + lateFee, overdue };
}

export type DebtResult = { ok: true; state: DebtState; paid: InstallmentDue } | { ok: false; message: string };

export function payInstallment(state: DebtState, day: number, cfg: DebtConfig): DebtResult {
  if (isDebtPaid(state)) return { ok: false, message: 'A dívida com o banco já está quitada.' };
  const paid = installmentDue(state, day, cfg);
  return {
    ok: true,
    paid,
    state: {
      balance: state.balance - paid.base,
      nextDueDay: state.nextDueDay + cfg.intervalDays,
      pendingFee: 0,
      paidCount: state.paidCount + 1,
    },
  };
}

/** Adia a próxima parcela em `days` dias, com uma tarifa somada a ela. */
export function postponeInstallment(state: DebtState, days: number, fee: Cents): DebtState {
  if (isDebtPaid(state)) return state;
  return { ...state, nextDueDay: state.nextDueDay + days, pendingFee: state.pendingFee + fee };
}

export function debtProblems(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) return ['dívida ausente'];
  const d = raw as Record<string, unknown>;
  const int = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
  return ['balance', 'nextDueDay', 'pendingFee', 'paidCount'].every((k) => int(d[k])) ? [] : ['dívida com valores inválidos'];
}
