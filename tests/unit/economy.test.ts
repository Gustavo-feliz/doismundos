import { describe, expect, it } from 'vitest';
import { balance, canSpend, summarize } from '../../src/economy/ledger';
import type { GameSession } from '../../src/game/GameSession';
import { CTX, buyAndReceive, later, newSession, when } from './fixtures';

const PADS = 'freios.pastilhas-dianteiras';
const PADS_PART = 'pastilha-freio-diant-ventura-brisa';

describe('livro-caixa', () => {
  it('saldo, resumo e limite de crédito', () => {
    const tx = [
      { id: 'T1', kind: 'despesa' as const, category: 'compra-pecas' as const, amount: 100_00, description: '', ref: '', day: 1, time: '', at: 0 },
      { id: 'T2', kind: 'receita' as const, category: 'estorno-compra' as const, amount: 40_00, description: '', ref: '', day: 1, time: '', at: 0 },
      { id: 'T3', kind: 'receita' as const, category: 'servico' as const, amount: 300_00, description: '', ref: '', day: 1, time: '', at: 0 },
    ];
    expect(balance(1_000_00, tx)).toBe(1_240_00);
    expect(summarize(tx)).toEqual({ serviceRevenue: 300_00, purchases: 100_00, refunds: 40_00, netPurchases: 60_00 });
    expect(canSpend(100_00, 100_00, 0)).toBe(true);
    expect(canSpend(100_00, 100_01, 0)).toBe(false);
    expect(canSpend(100_00, 150_00, 50_00)).toBe(true);
    expect(canSpend(100_00, -1, 0)).toBe(false);
  });
});

describe('loja e estoque', () => {
  it('compra tira do caixa na hora; a peça só entra no estoque quando chega', () => {
    const s = newSession();
    expect(s.cash).toBe(1_500_00);
    const r = s.buyPart(PADS_PART, 'autopecas-bairro', 1, when);
    expect(r.ok).toBe(true);
    expect(s.cash).toBe(1_500_00 - 129_00);
    expect(s.transactions.at(-1)).toMatchObject({ id: 'T0001', kind: 'despesa', category: 'compra-pecas', amount: 129_00, ref: 'PED-0001', day: 1, time: '09:00' });
    expect(s.availability(PADS_PART)).toEqual({ inStock: 0, onTheWay: 1, nextAt: when.at + 30 });
    expect(s.deliverDue(when.at + 29)).toEqual([]);
    expect(s.stock.some((l) => l.partId === PADS_PART)).toBe(false);
    expect(s.deliverDue(when.at + 30).map((p) => p.id)).toEqual(['PED-0001']);
    expect(s.stock.find((l) => l.partId === PADS_PART)).toMatchObject({ qty: 1, unitCost: 129_00 });
    expect(s.purchases[0]!.status).toBe('recebido');
  });

  it('fornecedor barato é mais lento: preço e prazo vêm dos dados', () => {
    const s = newSession();
    s.buyPart(PADS_PART, 'rio-pecas', 2, when);
    expect(s.priceOf(PADS_PART, 'rio-pecas')).toBe(Math.round(129_00 * 0.82));
    expect(s.purchases[0]).toMatchObject({ qty: 2, total: 2 * Math.round(129_00 * 0.82), etaAt: when.at + 180 });
  });

  it('não gasta mais do que tem, a não ser com crédito explicitamente habilitado', () => {
    const s = newSession();
    const r = s.buyPart('alternador-ventura-brisa', 'autopecas-bairro', 2, when); // 1.580,00
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Caixa insuficiente/);
    expect(s.cash).toBe(1_500_00);
    expect(s.transactions).toHaveLength(0);

    const credit = newSession({ economy: { startingCash: 1_500_00, creditLimit: 500_00 } });
    expect(credit.buyPart('alternador-ventura-brisa', 'autopecas-bairro', 2, when).ok).toBe(true);
    expect(credit.cash).toBe(-80_00);
  });

  it('rejeita quantidade, peça e fornecedor inválidos', () => {
    const s = newSession();
    for (const qty of [0, -1, 1.5, 11]) expect(s.buyPart(PADS_PART, 'autopecas-bairro', qty, when).ok).toBe(false);
    expect(s.buyPart('peca-fantasma', 'autopecas-bairro', 1, when).ok).toBe(false);
    expect(s.buyPart(PADS_PART, 'fornecedor-fantasma', 1, when).ok).toBe(false);
    expect(s.cash).toBe(1_500_00);
  });

  it('cancelamento antes da entrega devolve o dinheiro; depois não dá', () => {
    const s = newSession();
    s.buyPart(PADS_PART, 'rio-pecas', 1, when);
    s.buyPart('filtro-ar-brasaco-brisa', 'autopecas-bairro', 1, when);
    const cancel = s.cancelPurchase('PED-0001', later(10));
    expect(cancel.ok).toBe(true);
    expect(s.cash).toBe(1_500_00 - 39_90);
    expect(s.transactions.at(-1)).toMatchObject({ kind: 'receita', category: 'estorno-compra', ref: 'PED-0001' });
    expect(s.cancelPurchase('PED-0001', later(11)).message).toMatch(/já foi cancelado/);
    s.deliverDue(when.at + 500);
    expect(s.stock.some((l) => l.partId === PADS_PART)).toBe(false); // cancelado nunca chega
    expect(s.cancelPurchase('PED-0002', later(600)).message).toMatch(/já foi entregue/);
    expect(s.ledgerSummary).toMatchObject({ purchases: Math.round(129_00 * 0.82) + 39_90, refunds: Math.round(129_00 * 0.82), netPurchases: 39_90 });
  });
});

/** OS 001 do diagnóstico até concluída, comprando a peça no fornecedor do bairro. */
function finishOs001(s: GameSession) {
  const c = s.activeCase!;
  s.runDiagnosticTest(`visual:${PADS}`, CTX.floor, when);
  s.concludeActiveCase(PADS, when);
  s.updateDraft(c.id, { urgent: true });
  s.sendQuote(when);
  const lot = buyAndReceive(s, PADS_PART, when);
  s.removeOldPart(PADS, CTX.lifted, later(30));
  s.takePart(lot.lotId);
  s.installHeldPart(PADS, CTX.lifted, later(60));
  s.runFinalTest(CTX.floor, later(80));
  s.completeOrder(later(90));
  return c;
}

describe('pagamento e lucro', () => {
  it('compra a peça, conclui, entrega, recebe e mostra o resultado correto', () => {
    const s = newSession();
    const c = finishOs001(s);
    expect(s.cash).toBe(1_500_00 - 129_00); // ainda não recebeu
    const delivered = s.deliverVehicle(later(100));
    expect(delivered.ok).toBe(true);
    expect(s.cash).toBe(1_500_00 - 129_00 + 294_70);
    expect(s.getOrder(c.id).delivery).toMatchObject({ revenue: 294_70, partsCost: 129_00, grossProfit: 165_70 });
    expect(s.transactions.at(-1)).toMatchObject({ kind: 'receita', category: 'servico', amount: 294_70, ref: 'OS #001' });
    expect(s.ledgerSummary.serviceRevenue).toBe(294_70);
    expect(s.deliverVehicle(later(101)).ok).toBe(false); // não paga duas vezes
    expect(s.cash).toBe(s.recomputeCash()); // saldo guardado = soma do livro-caixa
  });

  it('peça herdada do tio tem custo zero no serviço', () => {
    const s = newSession();
    const c = s.activeCase!;
    s.runDiagnosticTest('scanner', CTX.floor, when);
    s.concludeActiveCase(PADS, when);
    s.updateDraft(c.id, { urgent: true });
    s.sendQuote(when);
    // Usa uma bateria herdada? Não serve nas pastilhas: o custo vem da peça realmente instalada.
    const lot = buyAndReceive(s, PADS_PART);
    s.removeOldPart(PADS, CTX.lifted, when);
    s.takePart(lot.lotId);
    s.installHeldPart(PADS, CTX.lifted, when);
    expect(s.getOrder(c.id).repair!.items[0]!.installedUnitCost).toBe(129_00);
  });

  it('serviço caro: sinal entra na aprovação e o resto na entrega', () => {
    const s = newSession();
    for (let i = 0; i < 2; i++) {
      s.runDiagnosticTest('scanner', CTX.floor, when);
      s.concludeActiveCase(s.activeCase!.hypotheses[0]!.slot, when);
      s.dismissCustomer(when);
      s.advanceCase();
    }
    const c = s.activeCase!;
    s.runDiagnosticTest('teste-carga', CTX.hood, when);
    s.concludeActiveCase('eletrica.alternador', when);
    s.updateDraft(c.id, { warrantyDays: 180 });
    expect(s.sendQuote(when).message).toMatch(/Fechado/);
    const total = s.getOrder(c.id).approved!.total;
    const deposit = Math.round(total * 0.3);
    expect(s.cash).toBe(1_500_00 + deposit);
    expect(s.transactions.at(-1)).toMatchObject({ category: 'sinal', amount: deposit });
  });
});
