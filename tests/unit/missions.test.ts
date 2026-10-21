import { describe, expect, it } from 'vitest';
import { EQUIPMENT_IDS } from '../../src/data/equipment';
import { BANK_DEBT } from '../../src/data/economy';
import { DIALOGUES, MISSIONS } from '../../src/data/missions';
import { initialDebt, installmentDue, isOverdue, payInstallment, postponeInstallment } from '../../src/economy/debt';
import type { GameSession } from '../../src/game/GameSession';
import type { MissionWorld } from '../../src/missions/conditions';
import { DialogueRunner, lineSeconds } from '../../src/missions/DialogueRunner';
import { MissionTracker, missionStateProblems, type MissionEvent } from '../../src/missions/MissionTracker';
import { fillText, type MissionDef } from '../../src/missions/types';
import { buildMissionLibrary } from '../../src/missions/validate';
import { DataValidationError } from '../../src/vehicles/types';
import { CTX, later, newSession, when } from './fixtures';

const HIGHLIGHTS = Object.values(EQUIPMENT_IDS);
const lib = buildMissionLibrary(MISSIONS, DIALOGUES, HIGHLIGHTS);
const PADS = 'freios.pastilhas-dianteiras';
const TUTORIAL = 'tutorial-primeiro-dia';
const ACT1 = 'ato1-primeira-parcela';

/** O que o jogo entrega ao rastreador (igual ao Game.missionWorld). */
function worldOf(s: GameSession, day = 1): MissionWorld {
  const c = s.activeCase;
  return {
    orderStatuses: s.allOrders().map((o) => o.status),
    activeOrderStatus: c ? s.getOrder(c.id).status : null,
    purchases: s.purchases.filter((p) => p.status !== 'cancelado').length,
    installmentsPaid: s.debt.paidCount,
    installmentOverdue: s.debtOverdue(day),
  };
}

const stepOf = (t: MissionTracker, s: GameSession) => t.current(worldOf(s))?.stepId ?? null;
const types = (events: MissionEvent[]) => events.map((e) => ('stepId' in e ? `${e.type}:${e.stepId}` : e.type));

describe('dados de missões e diálogos', () => {
  it('o conteúdo do jogo é válido e cada missão tem os campos do GDD', () => {
    expect(lib.missions.map((m) => m.id)).toEqual([TUTORIAL, ACT1]);
    for (const m of lib.missions) {
      expect(m.steps.length).toBeGreaterThan(0);
      expect(typeof m.repeatable).toBe('boolean');
      expect(m.reward.text.length).toBeGreaterThan(0);
    }
  });

  it('erros de dados viram mensagens úteis', () => {
    const bad: MissionDef = {
      ...MISSIONS[0]!,
      id: 'quebrada',
      prerequisites: ['nao-existe'],
      startDialogue: 'dialogo-fantasma',
      steps: [{ id: 'x', objective: 'a', tip: 'b', highlight: 'helicoptero', done: { kind: 'orders-reached', stage: 'entregue', count: 0 } }],
    };
    try {
      buildMissionLibrary([bad], DIALOGUES, HIGHLIGHTS);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DataValidationError);
      const msg = (e as Error).message;
      expect(msg).toContain('pré-requisito "nao-existe"');
      expect(msg).toContain('diálogo desconhecido "dialogo-fantasma"');
      expect(msg).toContain('destaque desconhecido "helicoptero"');
      expect(msg).toContain('quantidade inválida');
    }
  });

  it('marcadores de texto são trocados; desconhecidos ficam como estão', () => {
    expect(fillText('Carro de {cliente}, dia {vencimento} {outro}', { cliente: 'Marcão', vencimento: '3' })).toBe('Carro de Marcão, dia 3 {outro}');
  });
});

describe('tutorial com o Seu Zé', () => {
  it('começa com o prólogo, um passo por vez, sempre com objetivo e destaque', () => {
    const s = newSession();
    const t = new MissionTracker(lib);
    const events = t.evaluate(worldOf(s));
    expect(types(events)).toEqual(['mission-started', 'step-started:andar']);
    expect(t.dialogueQueue).toEqual(['prologo']);
    const cur = t.current(worldOf(s))!;
    expect(cur).toMatchObject({ missionId: TUTORIAL, stepNumber: 1, highlight: 'carro', recovering: false });
    expect(cur.objective).toContain('{cliente}');

    expect(t.evaluate(worldOf(s))).toEqual([]); // nada mudou
    t.setFlag('andou');
    expect(types(t.evaluate(worldOf(s)))).toEqual(['step-completed:andar', 'step-started:abrir-ficha']);
  });

  it('o arco inteiro: diagnóstico → orçamento → compra → reparo → entrega → caixa, com recompensa', () => {
    const s = newSession();
    const t = new MissionTracker(lib);
    t.evaluate(worldOf(s));
    t.setFlag('andou');
    t.setFlag('abriu-painel-carro');
    t.evaluate(worldOf(s));
    expect(stepOf(t, s)).toBe('diagnosticar');
    expect(t.dialogueQueue).toEqual(['prologo', 'ze-diagnostico']);

    const c = s.activeCase!;
    s.runDiagnosticTest(`visual:${PADS}`, CTX.floor, when);
    s.concludeActiveCase(PADS, when);
    t.evaluate(worldOf(s));
    expect(stepOf(t, s)).toBe('orcar');

    s.updateDraft(c.id, { urgent: true });
    expect(s.sendQuote(when).ok).toBe(true);
    t.evaluate(worldOf(s));
    expect(stepOf(t, s)).toBe('comprar');

    s.buyPart('pastilha-freio-diant-ventura-brisa', 'autopecas-bairro', 1, when);
    t.evaluate(worldOf(s));
    expect(stepOf(t, s)).toBe('reparar');

    s.deliverDue(when.at + 600);
    const lot = s.stock.find((l) => l.partId === 'pastilha-freio-diant-ventura-brisa')!;
    s.removeOldPart(PADS, CTX.lifted, when);
    s.takePart(lot.lotId);
    s.installHeldPart(PADS, CTX.lifted, when);
    s.runFinalTest(CTX.floor, when);
    expect(s.completeOrder(when).ok).toBe(true);
    t.evaluate(worldOf(s));
    expect(stepOf(t, s)).toBe('entregar');

    expect(s.deliverVehicle(later(60)).ok).toBe(true);
    t.evaluate(worldOf(s));
    expect(stepOf(t, s)).toBe('conferir-caixa');

    t.setFlag('viu-caixa');
    const events = t.evaluate(worldOf(s));
    const done = events.find((e) => e.type === 'mission-completed');
    expect(done && done.type === 'mission-completed' && done.mission.reward.cash).toBe(150_00);
    // A próxima missão do Ato 1 começa sozinha, com a ligação do banco.
    expect(types(events)).toContain('mission-started');
    expect(stepOf(t, s)).toBe('juntar');
    expect(t.completed).toEqual([TUTORIAL]);
    expect(t.dialogueQueue).toEqual(['prologo', 'ze-diagnostico', 'ze-loja', 'tutorial-fim', 'banco-liga']);
  });

  it('passos já cumpridos avançam juntos, e o diálogo de um passo pulado não toca', () => {
    const s = newSession();
    const t = new MissionTracker(lib);
    t.setFlag('andou');
    t.setFlag('abriu-painel-carro');
    s.runDiagnosticTest(`visual:${PADS}`, CTX.floor, when);
    s.concludeActiveCase(PADS, when);
    t.evaluate(worldOf(s));
    expect(stepOf(t, s)).toBe('orcar');
    expect(t.dialogueQueue).toEqual(['prologo']); // "ze-diagnostico" não entra: o passo nem apareceu
  });

  it('cliente recusou: o objetivo vira orientação e a campanha segue com a próxima OS', () => {
    const s = newSession();
    const t = new MissionTracker(lib);
    t.setFlag('andou');
    t.setFlag('abriu-painel-carro');
    const c = s.activeCase!;
    s.runDiagnosticTest(`visual:${PADS}`, CTX.floor, when);
    s.concludeActiveCase(PADS, when);
    s.dismissCustomer(when);
    t.evaluate(worldOf(s));
    expect(s.getOrder(c.id).status).toBe('recusada');
    const cur = t.current(worldOf(s))!;
    expect(cur).toMatchObject({ stepId: 'orcar', recovering: true });
    expect(cur.objective).toMatch(/próxima OS/);

    s.advanceCase();
    expect(t.current(worldOf(s))!.objective).toMatch(/Diagnostique/);
  });

  it('escolha de diálogo fica registrada uma vez só e liga/desliga as dicas', () => {
    const t = new MissionTracker(lib);
    expect(t.choose('prologo', 'sozinho')?.id).toBe('sozinho');
    expect(t.tipsEnabled).toBe(false);
    expect(t.choose('prologo', 'ensina')).toBeNull();
    expect(t.choiceFor('prologo')).toBe('sozinho');
    expect(t.choose('prologo-inexistente', 'x')).toBeNull();
  });

  it('salvar e carregar: o progresso volta igual e estados quebrados são recusados', () => {
    const s = newSession();
    const t = new MissionTracker(lib);
    t.evaluate(worldOf(s));
    t.setFlag('andou');
    t.choose('prologo', 'ensina');
    t.evaluate(worldOf(s));
    const snap = JSON.parse(JSON.stringify(t.toSnapshot()));
    expect(missionStateProblems(snap, lib)).toEqual([]);
    const back = new MissionTracker(lib, snap);
    expect(back.current(worldOf(s))).toEqual(t.current(worldOf(s)));
    expect(back.choiceFor('prologo')).toBe('ensina');
    expect(back.evaluate(worldOf(s))).toEqual([]); // não repete eventos nem recompensas

    expect(missionStateProblems({ ...snap, active: { id: TUTORIAL, step: 99 } }, lib)).toEqual([`passo inválido na missão "${TUTORIAL}"`]);
    expect(missionStateProblems({ ...snap, dialogueQueue: ['nao-existe'] }, lib)[0]).toContain('diálogo desconhecido');
    expect(missionStateProblems(null, lib)).toEqual(['estado das missões ausente']);
  });
});

describe('dívida do banco', () => {
  it('parcela em dia, atraso com multa, adiamento com tarifa e quitação', () => {
    let d = initialDebt(BANK_DEBT);
    expect(installmentDue(d, 3, BANK_DEBT)).toMatchObject({ base: 400_00, lateFee: 0, total: 400_00, overdue: false });
    expect(isOverdue(d, 3)).toBe(false);
    expect(installmentDue(d, 4, BANK_DEBT)).toMatchObject({ lateFee: 40_00, total: 440_00, overdue: true });

    d = postponeInstallment(d, 3, 40_00);
    expect(d.nextDueDay).toBe(6);
    expect(installmentDue(d, 5, BANK_DEBT)).toMatchObject({ fee: 40_00, total: 440_00, overdue: false });

    const paid = payInstallment(d, 5, BANK_DEBT);
    expect(paid.ok && paid.state).toMatchObject({ balance: 4_400_00, nextDueDay: 13, pendingFee: 0, paidCount: 1 });

    let state = initialDebt({ ...BANK_DEBT, total: 500_00 });
    for (let i = 0; i < 2; i++) {
      const r = payInstallment(state, 1, BANK_DEBT);
      if (!r.ok) throw new Error(r.message);
      state = r.state;
    }
    expect(state.balance).toBe(0);
    expect(payInstallment(state, 1, BANK_DEBT).ok).toBe(false);
  });

  it('pagar pela sessão: sai do caixa como "banco", e falta de caixa não paga', () => {
    const s = newSession();
    const before = s.cash;
    const r = s.payDebtInstallment(when);
    expect(r.ok).toBe(true);
    expect(s.cash).toBe(before - 400_00);
    expect(s.recomputeCash()).toBe(s.cash);
    expect(s.transactions.at(-1)).toMatchObject({ category: 'banco', kind: 'despesa', amount: 400_00 });

    const broke = newSession({ economy: { startingCash: 100_00, creditLimit: 0 } });
    expect(broke.payDebtInstallment(when)).toMatchObject({ ok: false });
    expect(broke.debt.paidCount).toBe(0);
  });

  it('missão da primeira parcela: atraso orienta, pagamento conclui o Ato 1 desta versão', () => {
    const s = newSession();
    const t = new MissionTracker(lib, {
      completed: [TUTORIAL],
      active: null,
      flags: [],
      choices: {},
      dialogueQueue: [],
      tipsEnabled: true,
    });
    t.evaluate(worldOf(s));
    expect(stepOf(t, s)).toBe('juntar');
    const late = t.current(worldOf(s, 5))!;
    expect(late).toMatchObject({ recovering: true });
    expect(late.objective).toMatch(/atrasada/);

    s.payDebtInstallment(later(5 * 1440));
    expect(s.transactions.at(-1)!.amount).toBe(440_00); // com multa
    const events = t.evaluate(worldOf(s, 5));
    expect(types(events)).toEqual(['step-completed:juntar', 'step-started:pagar', 'step-completed:pagar', 'mission-completed']);
    expect(t.completed).toEqual([TUTORIAL, ACT1]);
    expect(t.current(worldOf(s))).toBeNull();
    expect(t.dialogueQueue).toEqual(['banco-liga', 'parcela-paga']);
  });
});

describe('diálogos (legenda)', () => {
  it('cada fala fica o tempo de leitura, Enter pula, e a escolha espera o jogador', () => {
    const r = new DialogueRunner(lib.dialogues);
    const first = r.update(0, 'prologo');
    expect(first.started?.speaker).toBe('narrador');
    expect(r.update(1, 'prologo').started).toBeNull();
    const second = r.update(lineSeconds(first.started!.text), 'prologo');
    expect(second.started?.speaker).toBe('seu-ze');
    r.skip();
    expect(r.view()!.options).toBeNull();
    r.skip(); // fim das falas → hora de escolher
    expect(r.awaitingChoice).toBe(true);
    expect(r.view()!.options!.map((o) => o.id)).toEqual(['ensina', 'sozinho']);
    expect(r.update(999, 'prologo')).toEqual({ started: null, finished: null }); // espera
    expect(r.skip()).toEqual({ started: null, finished: null }); // Enter não pula escolha
    expect(r.choose(5)).toBeNull();

    const picked = r.choose(2)!;
    expect(picked.option.id).toBe('sozinho');
    expect(picked.started?.text).toMatch(/aperta H/);
    expect(r.update(lineSeconds(picked.started!.text), 'prologo').finished).toBe('prologo');
    expect(r.view()).toBeNull();
  });

  it('se a fila mudar (ex.: carregou um save), começa o diálogo novo do início', () => {
    const r = new DialogueRunner(lib.dialogues);
    r.update(0, 'prologo');
    expect(r.update(0, 'ze-loja').started?.text).toMatch(/computador/);
    expect(r.update(0, null)).toEqual({ started: null, finished: null });
    expect(r.view()).toBeNull();
  });
});
