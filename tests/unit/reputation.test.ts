import { describe, expect, it } from 'vitest';
import { evaluateService } from '../../src/customers/evaluation';
import { averageStars } from '../../src/customers/reputation';
import { evaluateClaim, createWarranty } from '../../src/orders/warranty';
import type { GameSession } from '../../src/game/GameSession';
import { CTX, buyAndReceive, later, newSession, when } from './fixtures';

const PADS = 'freios.pastilhas-dianteiras';
const DISCS = 'freios.discos-dianteiros';
const base = { promisedAt: 1000, deliveredAt: 1000, paidTotal: 300_00, maxBudget: 450_00, quality: 'excelente' as const, counters: 0, warrantyCovered: false };

describe('avaliação do cliente', () => {
  it('serviço pontual, bem feito e sem enrolação: 5 estrelas e volta', () => {
    const r = evaluateService(base);
    expect(r.stars).toBe(5);
    expect(r.willReturn).toBe(true);
    expect(r.complaint).toBeNull();
    expect(r.reasons.map((x) => x.criterion)).toEqual(['prazo', 'orcamento', 'qualidade', 'comunicacao']);
  });

  it('atraso: tolera até 2 h; depois vira motivo negativo com as horas', () => {
    expect(evaluateService({ ...base, deliveredAt: 1090 }).reasons[0]).toMatchObject({ effect: 'neutro', text: 'Atrasou um pouco (90 min além do prometido).' });
    const late = evaluateService({ ...base, deliveredAt: 1000 + 180 });
    expect(late.reasons[0]).toMatchObject({ effect: 'negativo', text: 'Atrasou 3,0 h além do prometido.' });
    expect(late.stars).toBeLessThan(5);
  });

  it('reparo que não resolveu: nota baixa e reclamação com o motivo', () => {
    const r = evaluateService({ ...base, quality: 'retrabalho', counters: 2, deliveredAt: 1500 });
    expect(r.stars).toBeLessThanOrEqual(2);
    expect(r.complaint).toMatch(/O problema continua!/);
    expect(r.willReturn).toBe(false);
  });
});

describe('garantia', () => {
  const w = createWarranty(1, { caseId: 'os-1', orderNumber: '001', vehicleId: 'car', coveredSlots: [PADS], coveredComplaint: 'Barulho', days: 90, startAt: 0, startDay: 1 });

  it('registra validade', () => {
    expect(w).toMatchObject({ id: 'GAR-001', expiresAt: 90 * 1440 });
  });

  it('cobre a mesma queixa ou a peça trocada; não cobre defeito sem relação nem garantia vencida', () => {
    expect(evaluateClaim([w], { vehicleId: 'car', at: 100, sameComplaintOf: 'os-1', diagnosedSlot: null }).covered).toBe(true);
    expect(evaluateClaim([w], { vehicleId: 'car', at: 100, sameComplaintOf: null, diagnosedSlot: PADS }).covered).toBe(true);
    const unrelated = evaluateClaim([w], { vehicleId: 'car', at: 100, sameComplaintOf: null, diagnosedSlot: DISCS });
    expect(unrelated).toMatchObject({ covered: false, reason: expect.stringMatching(/não tem relação/) });
    expect(evaluateClaim([w], { vehicleId: 'car', at: 91 * 1440, sameComplaintOf: 'os-1', diagnosedSlot: null }).reason).toMatch(/vencida/);
    expect(evaluateClaim([w], { vehicleId: 'outro', at: 1, sameComplaintOf: null, diagnosedSlot: PADS }).covered).toBe(false);
  });
});

/** OS 001 com a escolha `chosen`, comprando e trocando a peça escolhida. Entrega em `deliverAfter` min. */
function runOs001(s: GameSession, chosen: string, partId: string, deliverAfter: number) {
  const c = s.activeCase!;
  s.runDiagnosticTest('visual:freios.pastilhas-dianteiras', CTX.floor, when);
  s.concludeActiveCase(chosen, when);
  s.updateDraft(c.id, { urgent: true });
  s.sendQuote(when);
  const lot = buyAndReceive(s, partId);
  s.removeOldPart(chosen, CTX.lifted, when);
  s.takePart(lot.lotId);
  s.installHeldPart(chosen, CTX.lifted, when);
  s.runFinalTest(CTX.floor, when);
  s.completeOrder(when);
  s.deliverVehicle(later(deliverAfter));
  return c;
}

describe('reputação e retorno no fluxo da oficina', () => {
  it('serviço pontual: sobe a reputação geral e a de mecânica; a de elétrica fica separada', () => {
    const s = newSession();
    const c = runOs001(s, PADS, 'pastilha-freio-diant-ventura-brisa', 60);
    const review = s.getOrder(c.id).delivery!.review;
    expect(review.reasons[0]!.effect).toBe('positivo');
    expect(review.stars).toBe(5);
    expect(s.reputation.general.score).toBe(58);
    expect(s.reputation.bySpecialty.mecanica.score).toBe(58);
    expect(s.reputation.bySpecialty.eletrica.score).toBe(50);
    expect(averageStars(s.reputation.general)).toBe(5);
    expect(s.warranties[0]).toMatchObject({ orderNumber: '001', coveredSlots: [PADS], days: 90 });
  });

  it('atraso: o prazo prometido (urgente: 2 h) estourado vira motivo na avaliação', () => {
    const s = newSession();
    const c = runOs001(s, PADS, 'pastilha-freio-diant-ventura-brisa', 2 * 60 + 200);
    const review = s.getOrder(c.id).delivery!.review;
    expect(review.reasons[0]).toMatchObject({ criterion: 'prazo', effect: 'negativo' });
    expect(review.stars).toBe(4);
  });

  it('reparo incorreto: volta em garantia, vinculado à OS original, sem custo para o cliente e com penalidade', () => {
    const s = newSession();
    const original = runOs001(s, DISCS, 'disco-freio-diant-brasaco-brisa', 60);
    expect(s.getOrder(original.id).delivery!.review.reasons.find((r) => r.criterion === 'qualidade')!.effect).toBe('negativo');
    expect(s.reputation.events.some((e) => e.delta === -10 && /Retorno em garantia da OS #001/.test(e.text))).toBe(true);

    expect(s.advanceCase()).toBe(true);
    const ret = s.activeCase!;
    expect(ret).toMatchObject({ id: 'os-001-freio-garantia', orderNumber: '001-G' });
    expect(s.getOrder(ret.id)).toMatchObject({ linkedTo: original.id, warranty: { covered: true, warrantyId: 'GAR-001' } });

    const cashBefore = s.cash;
    s.runDiagnosticTest('teste-frenagem', CTX.floor, when);
    s.concludeActiveCase(PADS, when);
    const order = s.getOrder(ret.id);
    expect(order.status).toBe('aprovada'); // sem orçamento: está na garantia
    expect(order.approved!.total).toBe(0);
    expect(order.approved!.lines.at(-1)!.label).toBe('Coberto pela garantia');

    const lot = buyAndReceive(s, 'pastilha-freio-diant-ventura-brisa');
    s.removeOldPart(PADS, CTX.lifted, when);
    s.takePart(lot.lotId);
    s.installHeldPart(PADS, CTX.lifted, when);
    s.runFinalTest(CTX.floor, when);
    s.completeOrder(when);
    s.deliverVehicle(later(60));
    const delivery = s.getOrder(ret.id).delivery!;
    expect(delivery).toMatchObject({ revenue: 0, partsCost: 129_00, grossProfit: -129_00 });
    expect(s.cash).toBe(cashBefore - 129_00); // a oficina pagou a peça; o cliente, nada
  });

  it('defeito não relacionado: cliente satisfeita volta, mas o novo problema é cobrado e não penaliza', () => {
    const s = newSession();
    for (let i = 0; i < 2; i++) {
      s.runDiagnosticTest('scanner', CTX.floor, when);
      s.concludeActiveCase(s.activeCase!.hypotheses[0]!.slot, when);
      s.dismissCustomer(when);
      s.advanceCase();
    }
    const cida = s.activeCase!;
    s.runDiagnosticTest('teste-carga', CTX.hood, when);
    s.concludeActiveCase('eletrica.alternador', when);
    s.updateDraft(cida.id, { warrantyDays: 180 });
    s.sendQuote(when);
    const lot = buyAndReceive(s, 'alternador-ventura-brisa');
    s.removeOldPart('eletrica.alternador', CTX.hood, when);
    s.takePart(lot.lotId);
    s.installHeldPart('eletrica.alternador', CTX.hood, when);
    s.runFinalTest(CTX.floor, when);
    s.completeOrder(when);
    s.deliverVehicle(later(60));
    expect(s.getOrder(cida.id).delivery!.review.willReturn).toBe(true);
    expect(s.reputation.bySpecialty.eletrica.score).toBeGreaterThan(50);
    const eventsBefore = s.reputation.events.length;

    expect(s.advanceCase()).toBe(true);
    const back = s.activeCase!;
    expect(back.id).toBe('os-004-cida-freio');
    s.runDiagnosticTest('teste-frenagem', CTX.floor, later(100));
    s.concludeActiveCase(DISCS, later(100));
    const order = s.getOrder(back.id);
    expect(order.warranty).toMatchObject({ covered: false, reason: expect.stringMatching(/Fora da garantia GAR-001/) });
    expect(order.status).toBe('orcamento'); // cobrança normal
    expect(s.reputation.events).toHaveLength(eventsBefore); // sem penalidade
  });
});
