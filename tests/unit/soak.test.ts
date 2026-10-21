import { describe, expect, it } from 'vitest';
import type { EquipmentContext } from '../../src/diagnostics/types';
import { GameSession } from '../../src/game/GameSession';
import { catalogs, content, newSession } from './fixtures';

/**
 * QA (Prompt 18), GDD §25 teste C: jogar muitas OS seguidas (de demonstração,
 * geradas, retornos e garantias) e conferir os invariantes a cada uma:
 * caixa = livro-caixa, save válido e idêntico na volta, sempre há próxima OS.
 */
const CONTEXTS: EquipmentContext[] = [
  { hoodOpen: false, liftUp: false, liftDown: true },
  { hoodOpen: true, liftUp: false, liftDown: true },
  { hoodOpen: false, liftUp: true, liftDown: false },
];

let minute = 9 * 60;
const tick = (add = 5) => {
  minute += add;
  const day = Math.floor(minute / 1440) + 1;
  const t = minute % 1440;
  return { day, time: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, at: minute };
};

/** Tenta uma ação em cada estado de equipamento até uma dar certo. */
function withAnyContext<T extends { ok: boolean }>(fn: (ctx: EquipmentContext) => T): T {
  let last: T | null = null;
  for (const ctx of CONTEXTS) {
    last = fn(ctx);
    if (last.ok) return last;
  }
  return last!;
}

/** Joga a OS ativa até fechar (entregue ou recusada). */
function playActive(s: GameSession): 'entregue' | 'recusada' {
  const c = s.activeCase!;
  if (s.getOrder(c.id).status === 'diagnostico') {
    withAnyContext((ctx) => s.runDiagnosticTest(`visual:${c.trueCause}`, ctx, tick()));
    withAnyContext((ctx) => s.runDiagnosticTest('scanner', ctx, tick()));
    s.concludeActiveCase(c.trueCause, tick());
  }
  // Orçamento: sem margem e com urgência; contraproposta só de preço é aceita.
  for (let round = 0; round < 4 && ['orcamento', 'contraproposta'].includes(s.getOrder(c.id).status); round++) {
    s.updateDraft(c.id, { markupPct: 0, urgent: true, warrantyDays: 180 });
    if (s.getOrder(c.id).status === 'contraproposta' && s.acceptCounter(tick()).ok) break;
    s.sendQuote(tick());
  }
  const status = s.getOrder(c.id).status;
  if (status === 'recusada') return 'recusada';
  if (status === 'orcamento' || status === 'contraproposta') {
    s.dismissCustomer(tick());
    return 'recusada';
  }
  // Reparo: compra o que falta, troca as peças e faz o teste final.
  const order = s.getOrder(c.id);
  for (const item of order.repair?.items ?? []) {
    if (s.availability(item.plannedPartId).inStock === 0) {
      expect(s.buyPart(item.plannedPartId, 'autopecas-bairro', 1, tick()).ok, `comprar ${item.plannedPartId}`).toBe(true);
      s.deliverDue(tick(240).at);
    }
    if (!item.removed) withAnyContext((ctx) => s.removeOldPart(item.slot, ctx, tick()));
    const lot = s.stock.find((l) => l.partId === item.plannedPartId)!;
    expect(s.takePart(lot.lotId).ok).toBe(true);
    withAnyContext((ctx) => s.installHeldPart(item.slot, ctx, tick()));
  }
  expect(s.runFinalTest(CONTEXTS[0]!, tick()).ok).toBe(true);
  expect(s.completeOrder(tick()).ok, 'concluir').toBe(true);
  expect(s.deliverVehicle(tick(60)).ok, 'entregar').toBe(true);
  return 'entregue';
}

describe('longo prazo (40 OS seguidas)', () => {
  it('caixa, save e próxima OS sempre consistentes', () => {
    const s = newSession({ economy: { startingCash: 50_000_00, creditLimit: 0 } }, 2026);
    // Com as ferramentas, os serviços que exigem ferramenta também aparecem.
    for (const id of ['chave-impacto', 'armario-ferramentas']) expect(s.buyUpgrade(id, tick()).ok).toBe(true);
    const outcomes = { entregue: 0, recusada: 0 };
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const id = s.activeCase!.id;
      expect(seen.has(id), `OS repetida: ${id}`).toBe(false);
      seen.add(id);
      outcomes[playActive(s)]++;
      expect(s.recomputeCash()).toBe(s.cash);
      const snap = JSON.parse(JSON.stringify(s.toSnapshot()));
      const back = GameSession.fromSnapshot(catalogs, { ...content, economy: { startingCash: 50_000_00, creditLimit: 0 } }, snap);
      expect(back.ok, `save inválido depois da OS ${id}: ${back.ok ? '' : back.problems.join('; ')}`).toBe(true);
      if (back.ok) expect(back.session.toSnapshot()).toEqual(s.toSnapshot());
      expect(s.advanceCase(), `sem próxima OS depois de ${id}`).toBe(true);
    }
    expect(outcomes.entregue).toBeGreaterThan(30);
    expect(s.generatedCount).toBeGreaterThan(30);
  });
});
