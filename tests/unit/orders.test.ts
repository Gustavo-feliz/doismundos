import { describe, expect, it } from 'vitest';
import { CUSTOMERS } from '../../src/data/customers';
import { PRICING } from '../../src/data/pricing';
import { counterIsPriceOnly, decideOnQuote } from '../../src/customers/decision';
import { computeQuote, type QuoteBreakdown, type QuoteInput } from '../../src/economy/quote';
import type { GameSession } from '../../src/game/GameSession';
import { canTransitionOrder } from '../../src/orders/types';
import { computeQuality, installHeldPart, startRepair } from '../../src/repairs/rules';
import { CTX, buyAndReceive, catalogs, inheritedLot, newSession, when } from './fixtures';

const PADS = 'freios.pastilhas-dianteiras';
const DISCS = 'freios.discos-dianteiros';
const PADS_PART = 'pastilha-freio-diant-ventura-brisa';
const customer = (id: string) => CUSTOMERS.find((c) => c.id === id)!;

const baseInput = (patch: Partial<QuoteInput> = {}): QuoteInput => ({
  items: [{ slot: PADS, partId: PADS_PART, mandatory: true }],
  markupPct: 0.3,
  discountPct: 0,
  urgent: false,
  warrantyDays: 90,
  ...patch,
});
const quote = (patch: Partial<QuoteInput> = {}, category: 'sedan' | 'popular' = 'sedan'): QuoteBreakdown => {
  const r = computeQuote(baseInput(patch), { catalogs, category, rules: PRICING });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};
const quoteError = (patch: Partial<QuoteInput>) => {
  const r = computeQuote(baseInput(patch), { catalogs, category: 'sedan', rules: PRICING });
  return r.ok ? null : r.error.code;
};

describe('fórmula do orçamento', () => {
  it('calcula peças com margem, mão de obra em meia-hora, taxa e prazo', () => {
    const q = quote();
    expect(q.partsSubtotal).toBe(167_70); // 129,00 × 1,3
    expect(q.laborMinutes).toBe(45);
    expect(q.laborHours).toBe(1); // 45 min → 2 blocos de 30 min
    expect(q.laborSubtotal).toBe(90_00);
    expect(q.fees).toBe(10_00);
    expect(q.total).toBe(267_70);
    expect(q.deadlineHours).toBe(5); // 1 h + 4 h de fila
    expect(q.deposit).toBe(0);
  });

  it('a soma das linhas é sempre o total (o que a UI mostra bate com o cálculo)', () => {
    for (const markupPct of PRICING.markupOptions) {
      for (const discountPct of PRICING.discountOptions) {
        for (const urgent of [false, true]) {
          const q = quote({ markupPct, discountPct, urgent, items: [{ slot: PADS, partId: PADS_PART, mandatory: true }, { slot: DISCS, partId: 'disco-freio-diant-brasaco-brisa', mandatory: false }] });
          expect(q.lines.reduce((s, l) => s + l.amount, 0)).toBe(q.total);
          expect(q.total).toBeGreaterThan(0);
        }
      }
    }
  });

  it('urgência é cobrada uma única vez, só sobre a mão de obra já com a categoria', () => {
    const popular = quote({ urgent: true }, 'popular');
    expect(popular.laborSubtotal).toBe(81_00); // 1 h × 90 × 0,9
    expect(popular.urgencyFee).toBe(Math.round(81_00 * PRICING.urgencyRate));
    expect(popular.lines.filter((l) => l.kind === 'urgencia')).toHaveLength(1);
    expect(popular.total).toBe(167_70 + 81_00 + 24_30 + 10_00);
    expect(popular.deadlineHours).toBe(2); // fila curta
  });

  it('desconto vale sobre peças e serviço, não sobre taxas', () => {
    const q = quote({ discountPct: 0.1 });
    expect(q.discount).toBe(Math.round((167_70 + 90_00) * 0.1));
    expect(q.total).toBe(267_70 - q.discount);
  });

  it('margem zero e desconto zero: peça pelo custo, sem linha de desconto', () => {
    const q = quote({ markupPct: 0 });
    expect(q.partsSubtotal).toBe(129_00);
    expect(q.lines.some((l) => l.kind === 'desconto')).toBe(false);
  });

  it('mão de obra arredonda para cima em meia hora e sinal só acima do limite', () => {
    const alt = computeQuote(
      { ...baseInput(), items: [{ slot: 'eletrica.alternador', partId: 'alternador-ventura-brisa', mandatory: true }] },
      { catalogs, category: 'sedan', rules: PRICING },
    );
    expect(alt.ok && alt.value.laborHours).toBe(1.5); // 90 min
    expect(alt.ok && alt.value.total).toBe(1_027_00 + 135_00 + 10_00);
    expect(alt.ok && alt.value.deposit).toBe(Math.round(1_172_00 * PRICING.depositRate));
  });

  it('rejeita valores inválidos, negativos e itens errados', () => {
    expect(quoteError({ markupPct: -0.1 })).toBe('valor-invalido');
    expect(quoteError({ markupPct: 0.25 })).toBe('valor-invalido'); // fora das opções
    expect(quoteError({ discountPct: 0.5 })).toBe('valor-invalido');
    expect(quoteError({ warrantyDays: 0 })).toBe('valor-invalido');
    expect(quoteError({ negotiatedDiscount: -1 })).toBe('valor-invalido');
    expect(quoteError({ negotiatedDiscount: 999_999_00 })).toBe('valor-invalido');
    expect(quoteError({ items: [] })).toBe('sem-itens');
    expect(quoteError({ items: [{ slot: PADS, partId: PADS_PART, mandatory: false }] })).toBe('item-obrigatorio');
    expect(quoteError({ items: [{ slot: PADS, partId: PADS_PART, mandatory: true }, { slot: PADS, partId: PADS_PART, mandatory: false }] })).toBe('item-repetido');
    expect(quoteError({ items: [{ slot: PADS, partId: 'bateria-60ah-brasaco', mandatory: true }] })).toBe('peca-invalida');
  });

  it('desconto negociado entra como linha própria e pode zerar o total, nunca negativar', () => {
    const q = quote({ negotiatedDiscount: 267_70 });
    expect(q.total).toBe(0);
    expect(q.lines.at(-1)).toMatchObject({ label: 'Desconto negociado', amount: -267_70 });
  });
});

describe('decisão do cliente', () => {
  it('Marcão: aceita se couber no prazo; senão contraproposta de prazo (não de preço)', () => {
    const slow = decideOnQuote(quote(), customer('marcao'), 0);
    expect(slow.kind).toBe('contraproposta');
    expect(slow.kind === 'contraproposta' && slow.demands.map((d) => d.kind)).toEqual(['prazo']);
    expect(counterIsPriceOnly(slow)).toBe(false);
    expect(decideOnQuote(quote({ urgent: true }), customer('marcao'), 0).kind).toBe('aceita');
  });

  it('extras: Marcão não aceita serviço extra', () => {
    const q = quote({ urgent: true, items: [{ slot: PADS, partId: PADS_PART, mandatory: true }, { slot: DISCS, partId: 'disco-freio-diant-brasaco-brisa', mandatory: false }] });
    const d = decideOnQuote(q, customer('marcao'), 0);
    expect(d.kind !== 'aceita' && d.demands.map((x) => x.kind)).toContain('extras');
  });

  it('preço: dentro da margem vira contraproposta com valor-alvo; muito acima, recusa', () => {
    const jorge = customer('jorge');
    const near = decideOnQuote({ ...quote(), total: 200_00 }, jorge, 0);
    expect(near).toMatchObject({ kind: 'contraproposta', targetTotal: jorge.maxBudget });
    expect(counterIsPriceOnly(near)).toBe(true);
    const far = decideOnQuote({ ...quote(), total: Math.round(jorge.maxBudget * jorge.counterRatio) + 1 }, jorge, 0);
    expect(far.kind).toBe('recusa');
    expect(decideOnQuote({ ...quote(), total: jorge.maxBudget }, jorge, 0).kind).toBe('aceita'); // limite exato
  });

  it('paciência: depois de N contrapropostas, recusa', () => {
    const cida = customer('cida');
    const q = { ...quote({ items: [{ slot: 'eletrica.alternador', partId: 'alternador-ventura-brisa', mandatory: true }] }) };
    expect(decideOnQuote(q, cida, 0).kind).toBe('contraproposta'); // garantia 90 < 180
    expect(decideOnQuote(q, cida, cida.patience).kind).toBe('recusa');
  });

  it('Dona Cida exige peça original', () => {
    const q = quote({ warrantyDays: 180, items: [{ slot: 'eletrica.alternador', partId: 'alternador-ventura-brisa', mandatory: true }, { slot: 'eletrica.bateria', partId: 'bateria-60ah-brasaco', mandatory: false }] });
    const d = decideOnQuote(q, customer('cida'), 0);
    // Com a bateria extra o total também passa do limite: reclama da qualidade e do preço.
    expect(d.kind !== 'aceita' && d.demands.map((x) => x.kind)).toEqual(['qualidade', 'preco']);
  });
});

/** Diagnostica a OS ativa com uma escolha e deixa no orçamento. */
function diagnose(s: GameSession, chosen: string, testId = 'scanner') {
  expect(s.runDiagnosticTest(testId, CTX.floor, when).ok).toBe(true);
  expect(s.concludeActiveCase(chosen, when).ok).toBe(true);
}

function toCase(s: GameSession, index: number) {
  for (let i = 0; i < index; i++) {
    diagnose(s, s.activeCase!.hypotheses[0]!.slot);
    s.dismissCustomer(when);
    s.advanceCase();
  }
  return s.activeCase!;
}

describe('ordem de serviço: orçamento e negociação', () => {
  it('estados da OS seguem a ordem certa', () => {
    expect(canTransitionOrder('diagnostico', 'orcamento')).toBe(true);
    expect(canTransitionOrder('diagnostico', 'aprovada')).toBe(false);
    expect(canTransitionOrder('orcamento', 'em-reparo')).toBe(false);
    expect(canTransitionOrder('em-reparo', 'concluida')).toBe(true);
    expect(canTransitionOrder('concluida', 'em-reparo')).toBe(false);
  });

  it('OS 001: contraproposta de prazo → orçamento urgente → aprovado; peças chegam ao estoque', () => {
    const s = newSession();
    const c = s.activeCase!;
    expect(s.sendQuote(when).ok).toBe(false); // ainda em diagnóstico
    diagnose(s, PADS, `visual:${PADS}`);
    expect(s.getOrder(c.id).status).toBe('orcamento');

    const first = s.sendQuote(when);
    expect(first.message).toMatch(/Preciso dele em até 4 h/);
    expect(s.getOrder(c.id).status).toBe('contraproposta');
    expect(s.acceptCounter(when).ok).toBe(false); // não é só preço

    expect(s.updateDraft(c.id, { urgent: true }).ok).toBe(true);
    expect(s.sendQuote(when).message).toMatch(/Fechado/);
    const order = s.getOrder(c.id);
    expect(order.status).toBe('aprovada');
    expect(order.approved!.total).toBe(294_70);
    expect(order.proposals.map((p) => p.decision.kind)).toEqual(['contraproposta', 'aceita']);
    // Prompt 7: aprovar não entrega peça nenhuma — é preciso comprar.
    expect(s.stock.some((l) => l.partId === PADS_PART)).toBe(false);
    expect(s.updateDraft(c.id, { urgent: false }).ok).toBe(false); // aprovado: não muda mais
    expect(s.getVehicle(c.vehicle.id).history.at(-1)?.text).toMatch(/Orçamento aprovado: R\$\s294,70/);
  });

  it('OS 002: contraproposta de preço aceita direto vira desconto negociado', () => {
    const s = newSession();
    const c = toCase(s, 1);
    diagnose(s, 'arrefecimento.valvula-termostatica');
    s.sendQuote(when);
    const last = s.getOrder(c.id).proposals.at(-1)!;
    expect(last.decision).toMatchObject({ kind: 'contraproposta', targetTotal: 180_00 });
    expect(s.acceptCounter(when).ok).toBe(true);
    const approved = s.getOrder(c.id).approved!;
    expect(approved.total).toBe(180_00);
    expect(approved.negotiatedDiscount).toBe(last.breakdown.total - 180_00);
    expect(approved.lines.reduce((sum, l) => sum + l.amount, 0)).toBe(180_00);
  });

  it('OS 003: insistir sem atender a cliente esgota a paciência', () => {
    const s = newSession();
    const c = toCase(s, 2);
    diagnose(s, 'eletrica.alternador');
    s.sendQuote(when); // garantia curta
    expect(s.getOrder(c.id).status).toBe('contraproposta');
    expect(s.sendQuote(when).message).toMatch(/Cansei/);
    expect(s.getOrder(c.id).status).toBe('recusada');
    // Era a última OS de demonstração: a próxima é gerada (Prompt 12).
    expect(s.advanceCase()).toBe(true);
    expect(s.activeCase!.id).toMatch(/^gen-1-1-t/);
  });

  it('extras só para peças sabidamente ruins; valores fora das opções são recusados', () => {
    const s = newSession();
    const c = s.activeCase!;
    diagnose(s, PADS, `visual:${PADS}`);
    expect(s.eligibleExtras(c.id)).toEqual([]);
    expect(s.updateDraft(c.id, { extras: [DISCS] }).ok).toBe(false);
    s.runDiagnosticTest(`visual:${DISCS}`, CTX.floor, when); // já concluído: não roda
    expect(s.updateDraft(c.id, { markupPct: 0.33 }).ok).toBe(false);
    expect(s.updateDraft(c.id, { discountPct: -0.1 }).ok).toBe(false);
    expect(s.updateDraft(c.id, { warrantyDays: 30 }).ok).toBe(false);
  });

  it('não avança de OS com a atual em aberto; dispensar o cliente encerra', () => {
    const s = newSession();
    diagnose(s, PADS);
    expect(s.advanceCase()).toBe(false);
    expect(s.dismissCustomer(when).ok).toBe(true);
    expect(s.getOrder(s.activeCase!.id).status).toBe('recusada');
    expect(s.advanceCase()).toBe(true);
  });
});

/** Leva a OS 001 até aprovada, com a escolha de diagnóstico dada. */
function approved(chosen = PADS) {
  const s = newSession();
  const c = s.activeCase!;
  diagnose(s, chosen, `visual:${PADS}`);
  s.updateDraft(c.id, { urgent: true });
  expect(s.sendQuote(when).message).toMatch(/Fechado/);
  return { s, c };
}

describe('reparo', () => {
  it('caminho limpo: acesso → remover → instalar → teste → concluir com qualidade excelente', () => {
    const { s, c } = approved();
    expect(s.removeOldPart(PADS, CTX.lifted, when)).toMatchObject({ ok: true, minutes: 23 });
    expect(s.getOrder(c.id).status).toBe('em-reparo');
    expect(s.takePart(buyAndReceive(s, PADS_PART).lotId).ok).toBe(true);
    expect(s.heldPartId).toBe(PADS_PART);
    expect(s.installHeldPart(PADS, CTX.lifted, when)).toMatchObject({ ok: true, minutes: 22 });
    expect(s.heldPartId).toBeNull();
    expect(s.getVehicle(c.vehicle.id).parts[PADS]).toMatchObject({ partId: PADS_PART, wear: 0 });
    expect(s.scrap).toEqual([PADS_PART]);
    expect(s.runFinalTest(CTX.floor, when).message).toMatch(/chiado sumiu/);
    expect(s.completeOrder(when).ok).toBe(true);
    expect(s.getOrder(c.id)).toMatchObject({ status: 'concluida', completion: { qualityLabel: 'excelente', qualityScore: 100, symptomResolved: true } });
    expect(s.advanceCase()).toBe(false); // falta entregar
    expect(s.deliverVehicle(when).ok).toBe(true);
    expect(s.advanceCase()).toBe(true);
  });

  it('trata falta de acesso, ordem errada, peça errada e repetição', () => {
    const { s, c } = approved();
    const attempts = () => s.getOrder(c.id).repair!.invalidAttempts;

    expect(s.removeOldPart(PADS, CTX.floor, when).message).toMatch(/carro no alto/);
    expect(attempts()).toBe(0); // falta de equipamento não pesa

    expect(s.installHeldPart(PADS, CTX.lifted, when).message).toMatch(/remova a peça antiga/);
    expect(attempts()).toBe(1);

    s.removeOldPart(PADS, CTX.lifted, when);
    expect(s.removeOldPart(PADS, CTX.lifted, when).message).toMatch(/já foi removida/);
    expect(attempts()).toBe(2);

    expect(s.installHeldPart(PADS, CTX.lifted, when).message).toMatch(/não está segurando/);
    const padsLot = buyAndReceive(s, PADS_PART);
    s.takePart(inheritedLot(s, 'bateria-60ah-brasaco').lotId);
    expect(s.takePart(padsLot.lotId).ok).toBe(false); // mãos ocupadas
    expect(s.installHeldPart(PADS, CTX.lifted, when).message).toMatch(/Peça errada/);
    expect(attempts()).toBe(3);
    expect(s.returnHeldPart().ok).toBe(true);

    s.takePart(padsLot.lotId);
    s.installHeldPart(PADS, CTX.lifted, when);
    expect(s.runFinalTest(CTX.lifted, when).message).toMatch(/carro no chão/);
    s.runFinalTest(CTX.floor, when);
    expect(s.runFinalTest(CTX.floor, when).message).toMatch(/já foi feito/);
    s.completeOrder(when);
    // 4 erros de execução, mas no máximo 3 contam: 100 − 30.
    expect(s.getOrder(c.id).completion).toMatchObject({ qualityScore: 70, qualityLabel: 'boa' });
  });

  it('não conclui com tarefas pendentes nem antes de aprovado', () => {
    const fresh = newSession();
    expect(fresh.removeOldPart(PADS, CTX.lifted, when).message).toMatch(/aprova o orçamento/);
    const { s, c } = approved();
    expect(s.completeOrder(when).message).toMatch(/Ainda falta: Pastilhas de freio dianteiras: remover a peça antiga; Fazer o teste final/);
    s.removeOldPart(PADS, CTX.lifted, when);
    expect(s.runFinalTest(CTX.floor, when).message).toMatch(/Termine todos os itens/);
    expect(s.getOrder(c.id).status).toBe('em-reparo');
  });

  it('diagnóstico errado: troca a peça orçada, mas o defeito continua → retrabalho', () => {
    const { s, c } = approved(DISCS);
    s.removeOldPart(DISCS, CTX.lifted, when);
    s.takePart(buyAndReceive(s, 'disco-freio-diant-brasaco-brisa').lotId);
    s.installHeldPart(DISCS, CTX.lifted, when);
    expect(s.runFinalTest(CTX.floor, when).message).toMatch(/continua/);
    expect(s.completeOrder(when).message).toMatch(/o cliente vai voltar/);
    expect(s.getOrder(c.id).completion).toMatchObject({ qualityLabel: 'retrabalho', symptomResolved: false });
  });

  it('peça compatível mas diferente da orçada é aceita com penalidade fixa', () => {
    const r = { ...startRepair(approved().s.getOrder('os-001-freio').approved!) };
    const planned = { ...r, items: r.items.map((i) => ({ ...i, plannedPartId: 'outra-peca', removed: true })) };
    const s = newSession();
    const v0 = s.getVehicle('demo-brisa-001');
    const empty = { ...v0, parts: { ...v0.parts, [PADS]: null } };
    const result = installHeldPart(planned, empty, PADS, PADS_PART, CTX.lifted, catalogs);
    expect(result.ok && result.value.repair.substitutions).toBe(1);
    expect(computeQuality({ ...planned, substitutions: 1, finalTest: { resolved: true, text: '' } })).toMatchObject({ score: 85, label: 'boa' });
  });
});

describe('visões para a interface', () => {
  it('orçamento: linhas e total da tela são os da fórmula; recusado continua visível', async () => {
    const { buildQuoteView } = await import('../../src/orders/views');
    const s = newSession();
    const c = s.activeCase!;
    diagnose(s, PADS, `visual:${PADS}`);
    const view = buildQuoteView(s, c.id, 1)!;
    const calc = s.previewQuote(c.id)!;
    expect(calc.ok).toBe(true);
    if (!calc.ok) return;
    const fmt = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n / 100);
    expect(view.preview!.totalText).toBe(fmt(calc.value.total));
    expect(view.preview!.lines.map((l) => l.amountText)).toEqual(calc.value.lines.map((l) => fmt(l.amount)));
    expect(JSON.stringify(view)).not.toMatch(/maxBudget|45000|counterRatio/); // limites do cliente não vazam

    expect(s.sendQuote(when).tone).toBe('warn'); // contraproposta de prazo
    s.updateDraft(c.id, { markupPct: 0.5 });
    // Marcão já fez 1 contraproposta; com paciência 2, ainda contrapropõe.
    expect(s.sendQuote(when).tone).toBe('warn');
    expect(s.sendQuote(when).tone).toBe('blocked'); // cansou
    const closed = buildQuoteView(s, c.id, 1)!;
    expect(closed.status).toBe('recusada');
    expect(closed.preview).not.toBeNull();
    expect(closed.editable).toBe(false);
    expect(closed.hasNextCase).toBe(true);
  });
});
