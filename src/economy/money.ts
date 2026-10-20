/**
 * Dinheiro é sempre um número inteiro de centavos. Nunca use float para
 * valores monetários: 0,1 + 0,2 !== 0,3.
 * A economia de verdade (caixa, transações) entra no Prompt 7 do GDD.
 */
export type Cents = number;

export function assertCents(value: number): asserts value is Cents {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`Valor monetário inválido (precisa ser inteiro em centavos): ${value}`);
  }
}

/** Converte reais (ex.: 12.5) para centavos, arredondando. */
export function reaisToCents(reais: number): Cents {
  if (!Number.isFinite(reais)) throw new TypeError(`Valor em reais inválido: ${reais}`);
  return Math.round(reais * 100);
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 123456 → "R$ 1.234,56" (com espaço não separável, como o Intl gera). */
export function formatBRL(cents: Cents): string {
  assertCents(cents);
  return BRL.format(cents / 100);
}
