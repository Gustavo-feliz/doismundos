import { describe, expect, it } from 'vitest';
import { GAME_EVENTS } from '../../src/data/events';
import {
  canTriggerEvent,
  eventStateProblems,
  initialEventState,
  validateGameEvents,
} from '../../src/events/rules';
import type { GameEventDef } from '../../src/events/types';
import { GameSession } from '../../src/game/GameSession';
import { buildComputerView } from '../../src/orders/views';
import { DataValidationError } from '../../src/vehicles/types';
import { CTX, buyAndReceive, catalogs, content, later, newSession, when } from './fixtures';

const PADS = 'freios.pastilhas-dianteiras';
const PADS_PART = 'pastilha-freio-diant-ventura-brisa';

/** Entrega a primeira OS para habilitar os gatilhos que exigem `minDeliveredOrders: 1`. */
function deliverFirstOrder(s: GameSession): void {
  const c = s.activeCase!;
  s.runDiagnosticTest(`visual:${PADS}`, CTX.floor, when);
  s.concludeActiveCase(PADS, when);
  s.updateDraft(c.id, { urgent: true });
  s.sendQuote(when);
  const lot = buyAndReceive(s, PADS_PART);
  s.removeOldPart(PADS, CTX.lifted, when);
  s.takePart(lot.lotId);
  s.installHeldPart(PADS, CTX.lifted, when);
  s.runFinalTest(CTX.floor, when);
  s.completeOrder(when);
  s.deliverVehicle(later(60));
}

describe('Prompt 16 — Eventos, fiscalização e pressão local (regras puras e domínio)', () => {
  it('valida o catálogo de eventos (fiscalização + pressão local) e exige alternativa sem caixa imediato', () => {
    expect(() => validateGameEvents(GAME_EVENTS)).not.toThrow();
    const categories = new Set(GAME_EVENTS.map((e) => e.category));
    expect(categories.has('fiscalizacao')).toBe(true);
    expect(categories.has('pressao-local')).toBe(true);

    // Evento punitivo sem opção gratuita/recuperável é recusado na validação
    const unavoidablePunishment: GameEventDef = {
      ...GAME_EVENTS[0]!,
      id: 'evento-injusto',
      options: [
        {
          id: 'pagar-caro',
          label: 'Pagar multa',
          description: 'Custa R$ 500',
          cost: 500_00,
          requireCash: true,
          reputationDelta: 0,
          timeMinutes: 10,
          outcomeText: 'Pagou.',
        },
        {
          id: 'pagar-mais-caro',
          label: 'Pagar taxa extra',
          description: 'Custa R$ 800',
          cost: 800_00,
          requireCash: true,
          reputationDelta: -5,
          timeMinutes: 10,
          outcomeText: 'Pagou mais.',
        },
      ],
    };
    expect(() => validateGameEvents([unavoidablePunishment, GAME_EVENTS[1]!])).toThrow(DataValidationError);
  });

  it('controla gatilhos (dia mínimo, OS entregues) e frequência (cooldownDays)', () => {
    const s = newSession();
    // Dia 1 e 0 OS entregues: nada dispara
    expect(s.checkEventTriggers(1)).toBeNull();
    expect(s.checkEventTriggers(3)).toBeNull();

    // Entrega 1 OS e avança para o dia 2: dispara o 1º evento elegível (fiscalização)
    deliverFirstOrder(s);
    const ev1 = s.checkEventTriggers(2);
    expect(ev1?.id).toBe('fiscalizacao-alvara-seguranca');
    expect(s.events.activeEventId).toBe('fiscalizacao-alvara-seguranca');

    // Resolve o evento no dia 2
    const res1 = s.resolveActiveEvent('mutirao-adequacao-patio', { day: 2, time: '10:00', at: 2040 });
    expect(res1.ok).toBe(true);
    expect(s.events.activeEventId).toBeNull();

    // Cooldown: no dia 3 ou 4 ainda não passaram os 4 dias de intervalo do próximo evento
    expect(s.checkEventTriggers(3)).toBeNull();
    expect(s.checkEventTriggers(4)).toBeNull();

    // No dia 6 (2 + 4 dias de cooldown), dispara o evento inédito de pressão local
    const ev2 = s.checkEventTriggers(6);
    expect(ev2?.id).toBe('pressao-vigilancia-rua');
    expect(ev2?.category).toBe('pressao-local');
  });

  it('aplica efeitos financeiros (livro-caixa) e reputacionais na fiscalização e na pressão local', () => {
    const s = newSession();
    const cash0 = s.cash;
    const rep0 = s.reputation.general.score;

    // 1) Fiscalização: opção paga (+3 reputação, -R$ 160,00, +15 min)
    expect(s.triggerEvent('fiscalizacao-alvara-seguranca', 2).ok).toBe(true);
    const out1 = s.resolveActiveEvent('regularizar-na-hora', { day: 2, time: '09:00', at: 1980 });
    expect(out1.ok).toBe(true);
    expect(out1.minutes).toBe(15);
    expect(s.cash).toBe(cash0 - 160_00);
    expect(s.recomputeCash()).toBe(s.cash);
    expect(s.transactions.at(-1)).toMatchObject({
      kind: 'despesa',
      category: 'evento-oficina',
      amount: 160_00,
    });
    expect(s.reputation.general.score).toBe(rep0 + 3);

    // 2) Pressão local: opção de mobilização comunitária sem custo (+2 reputação, R$ 0,00, +35 min)
    expect(s.triggerEvent('pressao-vigilancia-rua', 6).ok).toBe(true);
    const out2 = s.resolveActiveEvent('mobilizar-comerciantes-seu-ze', { day: 6, time: '11:00', at: 7860 });
    expect(out2.ok).toBe(true);
    expect(out2.minutes).toBe(35);
    expect(s.cash).toBe(cash0 - 160_00);
    expect(s.reputation.general.score).toBe(rep0 + 5);
    expect(s.events.history).toHaveLength(2);
  });

  it('oferece alternativa recuperável quando o jogador está sem caixa para a opção paga', () => {
    const broke = newSession({ economy: { startingCash: 20_00, creditLimit: 0 } });
    broke.triggerEvent('fiscalizacao-alvara-seguranca', 2);

    const view = buildComputerView(broke, when.at, broke.activeCase!.vehicle.id);
    const paidOpt = view.events.active!.options.find((o) => o.id === 'regularizar-na-hora')!;
    const freeOpt = view.events.active!.options.find((o) => o.id === 'mutirao-adequacao-patio')!;
    expect(paidOpt.affordable).toBe(false);
    expect(freeOpt.affordable).toBe(true);

    // Tentar escolher a opção paga sem caixa falha de forma legível
    const failPaid = broke.resolveActiveEvent('regularizar-na-hora', when);
    expect(failPaid.ok).toBe(false);
    expect(failPaid.message).toMatch(/Caixa insuficiente/);

    // Escolher a alternativa gratuita resolve o evento e ainda melhora +1 na reputação
    const okFree = broke.resolveActiveEvent('mutirao-adequacao-patio', when);
    expect(okFree.ok).toBe(true);
    expect(broke.events.activeEventId).toBeNull();
    expect(broke.reputation.general.score).toBe(51);
  });

  it('persiste evento ativo e histórico no save e valida integridade do snapshot', () => {
    const s = newSession();
    s.triggerEvent('fiscalizacao-alvara-seguranca', 2);
    s.resolveActiveEvent('assinar-termo-prazo', { day: 2, time: '14:00', at: 2280 });
    s.triggerEvent('pressao-vigilancia-rua', 6);

    const snap = JSON.parse(JSON.stringify(s.toSnapshot()));
    const restored = GameSession.fromSnapshot(catalogs, content, snap);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.session.events).toEqual(s.events);
    expect(restored.session.activeEvent?.id).toBe('pressao-vigilancia-rua');

    const badState = { ...initialEventState(), activeEventId: 'evento-fantasma' };
    expect(eventStateProblems(badState, GAME_EVENTS).join(' | ')).toMatch(/evento ativo desconhecido/);

    // Evento não repetível nunca dispara duas vezes
    const oneShot: GameEventDef = {
      ...GAME_EVENTS[0]!,
      id: 'unico',
      trigger: { minDay: 1, minDeliveredOrders: 0, cooldownDays: 1, repeatable: false },
    };
    const stateWithHistory = {
      ...initialEventState(),
      history: [
        {
          id: 'EVT-0001',
          eventId: 'unico',
          category: 'fiscalizacao' as const,
          title: 'T',
          optionId: 'regularizar-na-hora',
          optionLabel: 'L',
          cost: 0,
          reputationDelta: 0,
          timeMinutes: 0,
          outcomeText: 'Ok',
          day: 1,
          time: '09:00',
          at: 540,
        },
      ],
    };
    expect(canTriggerEvent(oneShot, stateWithHistory, { day: 10, deliveredCount: 5 })).toBe(false);
  });
});

