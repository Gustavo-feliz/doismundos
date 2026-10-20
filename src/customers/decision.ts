import type { QuoteBreakdown } from '../economy/quote';
import { formatBRL } from '../economy/money';
import type { CustomerDecision, CustomerDemand, CustomerProfile } from './types';

/**
 * Decisão do cliente diante de um orçamento (GDD §14.3). Regras fixas e
 * previsíveis, sem sorteio:
 *
 * 1. Junta as exigências não atendidas, nesta ordem: extras, qualidade,
 *    garantia, prazo, preço.
 * 2. Nenhuma → ACEITA.
 * 3. Preço acima de máximo × counterRatio → RECUSA ("muito acima").
 * 4. Já fez `patience` contrapropostas → RECUSA ("cansei").
 * 5. Senão → CONTRAPROPOSTA com as exigências (e o valor-alvo, se o problema é preço).
 */
export function decideOnQuote(quote: QuoteBreakdown, profile: CustomerProfile, previousCounters: number): CustomerDecision {
  const demands: CustomerDemand[] = [];
  if (quote.extrasCount > 0 && !profile.acceptsExtras) {
    demands.push({ kind: 'extras', text: 'Só quero o que eu vim consertar. Tira esses extras.' });
  }
  if (profile.requiresOriginal && quote.partQualities.some((q) => q !== 'original')) {
    demands.push({ kind: 'qualidade', text: 'Peça genérica no meu carro, não. Quero original.' });
  }
  if (quote.warrantyDays < profile.minWarrantyDays) {
    demands.push({ kind: 'garantia', text: `Garantia de ${quote.warrantyDays} dias é pouco. Quero pelo menos ${profile.minWarrantyDays}.` });
  }
  if (quote.deadlineHours > profile.maxDeadlineHours) {
    demands.push({ kind: 'prazo', text: `Não dá pra ficar ${quote.deadlineHours} h sem o carro. Preciso dele em até ${profile.maxDeadlineHours} h.` });
  }
  const overBudget = quote.total > profile.maxBudget;
  if (overBudget) {
    demands.push({ kind: 'preco', text: `Tá caro. Consigo pagar ${formatBRL(profile.maxBudget)}.` });
  }

  if (demands.length === 0) return { kind: 'aceita', message: `${profile.name}: “Fechado! Pode fazer o serviço.”` };

  if (overBudget && quote.total > Math.round(profile.maxBudget * profile.counterRatio)) {
    return { kind: 'recusa', message: `${profile.name}: “Isso está muito acima do que eu posso pagar. Vou procurar outra oficina.”`, demands };
  }
  if (previousCounters >= profile.patience) {
    return { kind: 'recusa', message: `${profile.name}: “Cansei de negociar. Vou levar o carro embora.”`, demands };
  }
  return {
    kind: 'contraproposta',
    message: `${profile.name}: “${demands.map((d) => d.text).join(' ')}”`,
    demands,
    targetTotal: overBudget ? profile.maxBudget : null,
  };
}

/** Uma contraproposta só de preço pode ser aceita direto (vira desconto negociado). */
export function counterIsPriceOnly(decision: CustomerDecision): boolean {
  return decision.kind === 'contraproposta' && decision.targetTotal !== null && decision.demands.every((d) => d.kind === 'preco');
}
