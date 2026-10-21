import type { Catalogs } from '../vehicles/catalogs';
import { computeHypotheses, NO_EXAM_SPEED, REQUIREMENT_TEXT, testsForCase, unmetRequirement, type DiagnosticData, type ExamSpeed } from './rules';
import type { CaseProgress, ConfidenceLabel, DiagnosticCaseDef, EquipmentContext, TestKind } from './types';

/**
 * Visão do diagnóstico para a interface. Contém só o que o jogador pode ver:
 * a queixa, os exames, as evidências que ele já colheu e as hipóteses.
 * NUNCA contém a causa real nem se o diagnóstico registrado acertou.
 */
export type TestStatus = 'disponivel' | 'feito' | 'bloqueado' | 'encerrado';

export interface DiagnosisTestView {
  id: string;
  name: string;
  description: string;
  kindLabel: string;
  minutes: number;
  status: TestStatus;
  reason?: string;
}

export interface DiagnosisView {
  caseId: string;
  orderLabel: string;
  customer: string;
  complaint: string;
  caseNumber: number;
  totalCases: number;
  tests: DiagnosisTestView[];
  hypotheses: Array<{ slot: string; name: string; confidencePct: number; label: ConfidenceLabel; labelText: string }>;
  evidence: Array<{ testName: string; text: string; when: string; minutes: number }>;
  hints: string[];
  hintAvailable: boolean;
  canConclude: boolean;
  concludeHelp: string;
  concluded: null | { chosenName: string; confidencePct: number; evidenceCount: number; minutesSpent: number };
}

const KIND_LABEL: Readonly<Record<TestKind, string>> = { visual: 'Inspeção', scanner: 'Scanner', funcional: 'Teste funcional' };
const LABEL_TEXT: Readonly<Record<ConfidenceLabel, string>> = { baixa: 'Confiança baixa', media: 'Confiança média', alta: 'Confiança alta' };

export function buildDiagnosisView(
  c: DiagnosticCaseDef,
  progress: CaseProgress,
  catalogs: Catalogs,
  data: DiagnosticData,
  ctx: EquipmentContext,
  options: { assist: boolean; hintAvailable: boolean; caseNumber: number; totalCases: number; examSpeed?: ExamSpeed },
): DiagnosisView {
  const done = new Set(progress.evidence.map((e) => e.testId));
  const closed = progress.conclusion !== null;
  const slotName = (slot: string) => catalogs.slots.get(slot)?.name ?? slot;

  const tests = testsForCase(c, catalogs, data, options.examSpeed ?? NO_EXAM_SPEED).map((t): DiagnosisTestView => {
    const base = { id: t.id, name: t.name, description: t.description, kindLabel: KIND_LABEL[t.kind], minutes: t.minutes };
    if (done.has(t.id)) return { ...base, status: 'feito' };
    if (closed) return { ...base, status: 'encerrado' };
    const unmet = unmetRequirement(t.requires, ctx);
    return unmet ? { ...base, status: 'bloqueado', reason: REQUIREMENT_TEXT[unmet] } : { ...base, status: 'disponivel' };
  });

  const canConclude = !closed && progress.evidence.length > 0;
  return {
    caseId: c.id,
    orderLabel: `OS #${c.orderNumber}`,
    customer: c.customerName,
    complaint: c.complaint,
    caseNumber: options.caseNumber,
    totalCases: options.totalCases,
    tests,
    hypotheses: computeHypotheses(c, progress.evidence).map((h) => ({
      slot: h.slot,
      name: slotName(h.slot),
      confidencePct: Math.round(h.confidence * 100),
      label: h.label,
      labelText: LABEL_TEXT[h.label],
    })),
    evidence: [...progress.evidence].reverse().map((e) => ({ testName: e.testName, text: e.text, when: `Dia ${e.day} · ${e.time}`, minutes: e.minutes })),
    hints: [...progress.hintsShown],
    hintAvailable: options.assist && !closed && options.hintAvailable,
    canConclude,
    concludeHelp: closed ? '' : canConclude ? 'Escolha a causa mais provável e registre.' : 'Faça pelo menos um exame antes de concluir.',
    concluded: progress.conclusion
      ? {
          chosenName: slotName(progress.conclusion.chosenSlot),
          confidencePct: Math.round(progress.conclusion.confidence * 100),
          evidenceCount: progress.conclusion.evidenceCount,
          minutesSpent: progress.conclusion.minutesSpent,
        }
      : null,
  };
}
