import { describe, expect, it } from 'vitest';
import { buildComputerView } from '../../src/orders/views';
import { CTX, newSession, when } from './fixtures';

const PADS = 'freios.pastilhas-dianteiras';
const PADS_PART = 'pastilha-freio-diant-ventura-brisa';

/** OS 001 aprovada (falta a pastilha, que não vem no estoque herdado). */
function approved(cash?: number) {
  const s = newSession(cash === undefined ? {} : { economy: { startingCash: cash, creditLimit: 0 } });
  const c = s.activeCase!;
  s.runDiagnosticTest(`visual:${PADS}`, CTX.floor, when);
  s.concludeActiveCase(PADS, when);
  s.updateDraft(c.id, { urgent: true });
  s.sendQuote(when);
  return s;
}

describe('"comprar o que falta" para a OS (Prompt 24)', () => {
  it('lista só o que falta: orçado, sem estoque e sem pedido a caminho', () => {
    const s = approved();
    expect(s.missingPartsForActive()).toEqual([{ partId: PADS_PART, qty: 1 }]);
    expect(newSession().missingPartsForActive()).toEqual([]); // sem orçamento aprovado, nada
  });

  it('mostra uma opção por fornecedor (rápido e econômico) com o total certo', () => {
    const s = approved();
    const v = buildComputerView(s, when.at, s.activeCase!.vehicle.id).missing!;
    expect(v).toMatchObject({ orderLabel: 'OS #001', count: 1 });
    expect(v.options.map((o) => o.label)).toEqual(['Rápido', 'Econômico']);
    expect(s.missingPartsCost('rio-pecas')).toBeLessThan(s.missingPartsCost('autopecas-bairro')!);
  });

  it('compra tudo de uma vez; depois disso não falta mais nada (está a caminho)', () => {
    const s = approved();
    const cash = s.cash;
    const cost = s.missingPartsCost('rio-pecas')!;
    const r = s.buyMissingParts('rio-pecas', when);
    expect(r.ok).toBe(true);
    expect(s.cash).toBe(cash - cost);
    expect(s.purchases.at(-1)).toMatchObject({ partId: PADS_PART, supplierId: 'rio-pecas', status: 'a-caminho' });
    expect(s.missingPartsForActive()).toEqual([]);
    expect(buildComputerView(s, when.at, null).missing).toBeNull();
    expect(s.buyMissingParts('rio-pecas', when)).toMatchObject({ ok: false, message: 'Não falta nenhuma peça para esta OS.' });
  });

  it('sem caixa para tudo, não compra nada (nunca metade)', () => {
    const s = approved(50_00);
    const cash = s.cash;
    const purchases = s.purchases.length;
    const r = s.buyMissingParts('autopecas-bairro', when);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Caixa insuficiente/);
    expect(s.cash).toBe(cash);
    expect(s.purchases.length).toBe(purchases);
  });
});
