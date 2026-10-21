import type { Cents } from './money';

/**
 * Livro-caixa da oficina (GDD §16.1). Só o caixa da OFICINA: dinheiro pessoal
 * não existe nesta etapa. Cada transação é identificável: id, momento, tipo,
 * categoria, valor, descrição e referência (OS ou pedido).
 */
export type TransactionKind = 'receita' | 'despesa';
export type TransactionCategory = 'sinal' | 'servico' | 'compra-pecas' | 'estorno-compra' | 'banco' | 'missao';

export const CATEGORY_LABEL: Readonly<Record<TransactionCategory, string>> = {
  sinal: 'Sinal de serviço',
  servico: 'Pagamento de serviço',
  'compra-pecas': 'Compra de peças',
  'estorno-compra': 'Estorno de compra cancelada',
  banco: 'Parcela do empréstimo bancário',
  missao: 'Recompensa de missão',
};

export interface Transaction {
  id: string;
  kind: TransactionKind;
  category: TransactionCategory;
  /** Sempre positivo; o sinal vem de `kind`. */
  amount: Cents;
  description: string;
  /** OS (ex.: "OS #001") ou pedido (ex.: "PED-0001"). */
  ref: string;
  day: number;
  time: string;
  at: number;
}

export function signedAmount(t: Transaction): Cents {
  return t.kind === 'receita' ? t.amount : -t.amount;
}

export function balance(startingCash: Cents, transactions: readonly Transaction[]): Cents {
  return transactions.reduce((sum, t) => sum + signedAmount(t), startingCash);
}

export interface LedgerSummary {
  serviceRevenue: Cents;
  purchases: Cents;
  refunds: Cents;
  /** Compras − estornos. */
  netPurchases: Cents;
}

export function summarize(transactions: readonly Transaction[]): LedgerSummary {
  let serviceRevenue = 0;
  let purchases = 0;
  let refunds = 0;
  for (const t of transactions) {
    if (t.category === 'sinal' || t.category === 'servico') serviceRevenue += t.amount;
    else if (t.category === 'compra-pecas') purchases += t.amount;
    else if (t.category === 'estorno-compra') refunds += t.amount;
  }
  return { serviceRevenue, purchases, refunds, netPurchases: purchases - refunds };
}

/** Pode gastar `amount` sem passar do limite de crédito (0 = sem crédito)? */
export function canSpend(cash: Cents, amount: Cents, creditLimit: Cents): boolean {
  return amount >= 0 && cash - amount >= -creditLimit;
}
