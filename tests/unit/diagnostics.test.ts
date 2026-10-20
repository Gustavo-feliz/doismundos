import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CASES } from '../../src/data/diagnosticCases';
import { catalogs, diagnosticData, newSession, when } from './fixtures';
import { FUNCTIONAL_TESTS } from '../../src/data/diagnostics';
import { computeHypotheses, testsForCase, type DiagnosticData } from '../../src/diagnostics/rules';
import type { DiagnosticCaseDef, EquipmentContext, TestDescriptor } from '../../src/diagnostics/types';
import { validateDiagnosticData } from '../../src/diagnostics/validate';
import { buildDiagnosisView } from '../../src/diagnostics/view';
import type { GameSession } from '../../src/game/GameSession';
import { buildInspectionView } from '../../src/vehicles/inspectionView';

const data: DiagnosticData = diagnosticData;

/** Estado de equipamento que atende o exame (capô aberto exige elevador embaixo, etc.). */
function ctxFor(test: TestDescriptor): EquipmentContext {
  if (test.requires.includes('elevador-no-alto')) return { hoodOpen: false, liftUp: true, liftDown: false };
  return { hoodOpen: true, liftUp: false, liftDown: true };
}

function goToCase(session: GameSession, index: number) {
  for (let i = 0; i < index; i++) {
    const c = session.activeCase!;
    const first = testsForCase(c, catalogs, data).find((t) => t.kind === 'scanner')!;
    expect(session.runDiagnosticTest(first.id, ctxFor(first), when).ok).toBe(true);
    expect(session.concludeActiveCase(c.hypotheses[0]!.slot, when).ok).toBe(true);
    expect(session.dismissCustomer(when).ok).toBe(true); // fecha a OS sem serviço
    expect(session.advanceCase()).toBe(true);
  }
  return session.activeCase!;
}

function runAll(session: GameSession, c: DiagnosticCaseDef) {
  for (const t of testsForCase(c, catalogs, data)) {
    const r = session.runDiagnosticTest(t.id, ctxFor(t), when);
    expect(r.ok, `${c.id} ${t.id}`).toBe(true);
  }
  return computeHypotheses(c, session.getProgress(c.id).evidence);
}

describe('dados de diagnóstico', () => {
  it('são válidos e há 3 casos com causas diferentes', () => {
    expect(() => validateDiagnosticData(DIAGNOSTIC_CASES, data, catalogs)).not.toThrow();
    expect(DIAGNOSTIC_CASES).toHaveLength(3);
    expect(new Set(DIAGNOSTIC_CASES.map((c) => c.trueCause)).size).toBe(3);
  });

  it('rejeita casos mal montados', () => {
    const base = DIAGNOSTIC_CASES[0]!;
    expect(() => validateDiagnosticData([{ ...base, trueCause: 'eletrica.bateria' }], data, catalogs)).toThrow(/causa real/);
    expect(() => validateDiagnosticData([{ ...base, hints: [{ testId: 'xyz', text: 'oi' }] }], data, catalogs)).toThrow(/dica/);
    expect(() => validateDiagnosticData([{ ...base, hypotheses: [base.hypotheses[0]!] }], data, catalogs)).toThrow(/2 hipóteses/);
    const badTest = { ...FUNCTIONAL_TESTS[0]!, outcomes: [...FUNCTIONAL_TESTS[0]!.outcomes].reverse() };
    expect(() => validateDiagnosticData([base], { ...data, functional: new Map([[badTest.id, badTest]]) }, catalogs)).toThrow(/padrão/);
  });
});

describe.each(DIAGNOSTIC_CASES.map((c, i) => [c.id, i] as const))('caso %s', (_id, index) => {
  it('começa sem nenhuma hipótese com confiança alta (precisa de evidência)', () => {
    const c = goToCase(newSession(), index);
    const start = computeHypotheses(c, []);
    expect(start.every((h) => h.label !== 'alta')).toBe(true);
  });

  it('com todos os exames, a causa real fica no topo com confiança alta', () => {
    const session = newSession();
    const c = goToCase(session, index);
    const result = runAll(session, c);
    expect(result[0]!.slot).toBe(c.trueCause);
    expect(result[0]!.label).toBe('alta');
  });

  it('é determinístico: duas sessões dão as mesmas evidências', () => {
    const a = newSession();
    const b = newSession();
    const ca = goToCase(a, index);
    goToCase(b, index);
    runAll(a, ca);
    runAll(b, ca);
    expect(a.getProgress(ca.id).evidence).toEqual(b.getProgress(ca.id).evidence);
  });
});

describe('resultados específicos (sintoma ≠ diagnóstico)', () => {
  it('OS 001: visual mostra pastilhas críticas; discos gastos são pista falsa', () => {
    const s = newSession();
    const r = s.runDiagnosticTest('visual:freios.pastilhas-dianteiras', { hoodOpen: false, liftUp: false, liftDown: true }, when);
    expect(r.ok && r.value.text).toMatch(/crítica/);
    const discs = s.runDiagnosticTest('visual:freios.discos-dianteiros', { hoodOpen: false, liftUp: false, liftDown: true }, when);
    expect(discs.ok && discs.value.text).toMatch(/gasta/);
  });

  it('OS 002: termostática não se vê por fora; o scanner acusa temperatura', () => {
    const s = newSession();
    const c = goToCase(s, 1);
    const open = { hoodOpen: true, liftUp: false, liftDown: true };
    const visual = s.runDiagnosticTest('visual:arrefecimento.valvula-termostatica', open, when);
    expect(visual.ok && visual.value.text).toMatch(/não conclui/);
    expect(visual.ok && visual.value.effects).toEqual({});
    const scan = s.runDiagnosticTest('scanner', open, when);
    expect(scan.ok && scan.value.text).toMatch(/T-128/);
    expect(c.id).toBe('os-002-temperatura');
  });

  it('OS 003: a bateria parece a culpada, mas o teste de carga aponta o alternador', () => {
    const s = newSession();
    const c = goToCase(s, 2);
    // Só olhando a bateria, o jogador ficaria com a bateria como mais provável — e erraria.
    s.runDiagnosticTest('visual:eletrica.bateria', { hoodOpen: true, liftUp: false, liftDown: true }, when);
    expect(computeHypotheses(c, s.getProgress(c.id).evidence)[0]!.slot).toBe('eletrica.bateria');
    const load = s.runDiagnosticTest('teste-carga', { hoodOpen: true, liftUp: false, liftDown: true }, when);
    expect(load.ok && load.value.text).toMatch(/não está carregando/);
    expect(computeHypotheses(c, s.getProgress(c.id).evidence)[0]!.slot).toBe('eletrica.alternador');
  });
});

describe('regras de execução', () => {
  it('exame bloqueado por equipamento não registra nada', () => {
    const s = newSession();
    const r = s.runDiagnosticTest('visual:suspensao.amortecedores-dianteiros', { hoodOpen: false, liftUp: false, liftDown: true }, when);
    expect(r).toMatchObject({ ok: false, error: { code: 'requisito', message: 'Requer o carro no alto do elevador' } });
    expect(s.getProgress(s.activeCase!.id).evidence).toHaveLength(0);
    expect(s.version).toBe(0);
  });

  it('não repete exame e não aceita exame de outro caso', () => {
    const s = newSession();
    const ctx = { hoodOpen: false, liftUp: false, liftDown: true };
    expect(s.runDiagnosticTest('scanner', ctx, when).ok).toBe(true);
    expect(s.runDiagnosticTest('scanner', ctx, when)).toMatchObject({ ok: false, error: { code: 'exame-repetido' } });
    expect(s.runDiagnosticTest('teste-carga', ctx, when)).toMatchObject({ ok: false, error: { code: 'exame-inexistente' } });
  });

  it('inspeção visual atualiza o que o jogador sabe da peça; scanner não', () => {
    const s = newSession();
    const c = s.activeCase!;
    const rowOf = (slot: string) => buildInspectionView(s.getVehicle(c.vehicle.id), catalogs).groups.flatMap((g) => g.rows).find((r) => r.slotId === slot)!;
    expect(rowOf('freios.pastilhas-dianteiras').known.kind).toBe('desconhecido');
    s.runDiagnosticTest('scanner', { hoodOpen: false, liftUp: false, liftDown: true }, when);
    expect(rowOf('arrefecimento.valvula-termostatica').known.kind).toBe('desconhecido');
    s.runDiagnosticTest('visual:freios.pastilhas-dianteiras', { hoodOpen: false, liftUp: false, liftDown: true }, when);
    expect(rowOf('freios.pastilhas-dianteiras').known).toMatchObject({ kind: 'avaliado', band: 'critica', sourceLabel: 'avaliada nesta oficina' });
  });

  it('concluir: exige evidência, aceita só hipóteses, registra erros também e trava o caso', () => {
    const s = newSession();
    const c = s.activeCase!;
    expect(s.concludeActiveCase('freios.discos-dianteiros', when)).toMatchObject({ ok: false, error: { code: 'sem-evidencia' } });
    s.runDiagnosticTest('scanner', { hoodOpen: false, liftUp: false, liftDown: true }, when);
    expect(s.concludeActiveCase('eletrica.bateria', when)).toMatchObject({ ok: false, error: { code: 'hipotese-invalida' } });
    expect(s.advanceCase()).toBe(false);

    const wrong = s.concludeActiveCase('freios.discos-dianteiros', { day: 1, time: '09:15' });
    expect(wrong.ok && wrong.value).toMatchObject({ caseId: c.id, chosenSlot: 'freios.discos-dianteiros', correct: false, evidenceCount: 1, minutesSpent: 15 });
    expect(s.diagnoses).toHaveLength(1);
    expect(s.runDiagnosticTest('teste-frenagem', { hoodOpen: false, liftUp: false, liftDown: true }, when)).toMatchObject({ ok: false, error: { code: 'ja-concluido' } });
    expect(s.concludeActiveCase('freios.pastilhas-dianteiras', when)).toMatchObject({ ok: false, error: { code: 'ja-concluido' } });
    expect(s.getVehicle(c.vehicle.id).history.at(-1)?.text).toMatch(/Diagnóstico registrado \(OS #001\): Discos/);

    // A OS segue para o orçamento; só avança depois de encerrada.
    expect(s.getOrder(c.id).status).toBe('orcamento');
    expect(s.advanceCase()).toBe(false);
    s.dismissCustomer(when);
    expect(s.advanceCase()).toBe(true);
    expect(s.activeCase!.id).toBe('os-002-temperatura');
    expect(s.caseNumber).toBe(2);
  });

  it('dicas apontam para exames ainda não feitos e acabam', () => {
    const s = newSession();
    expect(s.requestHint()).toMatch(/pastilhas/);
    s.runDiagnosticTest('teste-frenagem', { hoodOpen: false, liftUp: false, liftDown: true }, when);
    expect(s.hasHint()).toBe(false); // a dica 1 já foi mostrada; a 2 é de um exame já feito
    expect(s.requestHint()).toBeNull();
  });
});

describe('visão do diagnóstico (o que a UI pode mostrar)', () => {
  const ctx = { hoodOpen: false, liftUp: false, liftDown: true };
  const view = (s: GameSession) => {
    const c = s.activeCase!;
    return buildDiagnosisView(c, s.getProgress(c.id), catalogs, data, ctx, { assist: true, hintAvailable: s.hasHint(), caseNumber: s.caseNumber, totalCases: s.caseCount });
  };

  it('antes de qualquer exame: só queixa, exames e hipóteses — nenhum resultado', () => {
    const s = newSession();
    const json = JSON.stringify(view(s));
    expect(json).not.toMatch(/trueCause|correct/);
    expect(json).not.toMatch(/crítica|Chiado|T-128|E-562/);
    const v = view(s);
    expect(v.canConclude).toBe(false);
    expect(v.tests.find((t) => t.id === 'visual:suspensao.amortecedores-dianteiros')).toMatchObject({ status: 'bloqueado', reason: 'Requer o carro no alto do elevador' });
  });

  it('diagnóstico certo e errado aparecem iguais na interface', () => {
    const right = newSession();
    const wrong = newSession();
    for (const s of [right, wrong]) s.runDiagnosticTest('scanner', ctx, when);
    right.concludeActiveCase('freios.pastilhas-dianteiras', when);
    wrong.concludeActiveCase('freios.discos-dianteiros', when);
    const a = view(right).concluded!;
    const b = view(wrong).concluded!;
    expect(Object.keys(a)).toEqual(Object.keys(b));
    expect(JSON.stringify(view(right))).not.toMatch(/correct/);
    expect(view(right).concluded).not.toBeNull();
  });
});
