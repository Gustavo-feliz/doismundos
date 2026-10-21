import type { PartAccess } from '../parts/types';
import { reduceMinutes } from '../upgrades/rules';
import type { Catalogs } from '../vehicles/catalogs';
import { WEAR_BAND_LABEL, wearBand, type VehicleState, type WearBand } from '../vehicles/state';
import type {
  BandCondition,
  CaseProgress,
  ConfidenceLabel,
  DiagnosisRecord,
  DiagnosticCaseDef,
  Effects,
  EquipmentContext,
  EvidenceEntry,
  FunctionalTestDef,
  HypothesisScore,
  Requirement,
  ScannerDef,
  TestDescriptor,
} from './types';

/** Regras do diagnóstico em funções puras e determinísticas (mesma entrada = mesmo resultado). */

export type DiagnosisErrorCode = 'exame-inexistente' | 'exame-repetido' | 'requisito' | 'ja-concluido' | 'sem-evidencia' | 'hipotese-invalida';
export type DiagnosisResult<T> = { ok: true; value: T } | { ok: false; error: { code: DiagnosisErrorCode; message: string } };
const fail = <T>(code: DiagnosisErrorCode, message: string): DiagnosisResult<T> => ({ ok: false, error: { code, message } });

export interface DiagnosticData {
  scanner: ScannerDef;
  functional: ReadonlyMap<string, FunctionalTestDef>;
}

export const SCANNER_ID = 'scanner';
export const visualTestId = (slot: string) => `visual:${slot}`;

const VISUAL_MINUTES: Readonly<Record<PartAccess, number>> = { externo: 10, capo: 8, elevador: 12 };
const VISUAL_REQUIRES: Readonly<Record<PartAccess, readonly Requirement[]>> = {
  externo: [],
  capo: ['capo-aberto'],
  elevador: ['elevador-no-alto'],
};

/** Quanto cada faixa observada na inspeção visual pesa a favor (ou contra) a hipótese. */
export const VISUAL_BAND_EFFECT: Readonly<Record<WearBand, number>> = { boa: -2, gasta: 1, critica: 3, falhou: 4 };

const VISUAL_BAND_TEXT: Readonly<Record<WearBand, string>> = {
  boa: 'aparência boa, sem desgaste importante.',
  gasta: 'desgaste visível, mas ainda dentro do limite.',
  critica: 'desgaste severo, perto do fim da vida útil.',
  falhou: 'danificada, sem condição de uso.',
};

export const REQUIREMENT_TEXT: Readonly<Record<Requirement, string>> = {
  'capo-aberto': 'Requer o capô aberto',
  'capo-fechado': 'Requer o capô fechado',
  'elevador-no-alto': 'Requer o carro no alto do elevador',
  'elevador-embaixo': 'Requer o carro no chão (elevador abaixado)',
};

const BAND_RANK: Readonly<Record<WearBand, number>> = { boa: 0, gasta: 1, critica: 2, falhou: 3 };

/** A peça está na faixa pedida ou pior? Peça ausente conta como "falhou". */
export function meetsBand(v: VehicleState, cond: BandCondition): boolean {
  const installed = v.parts[cond.slot];
  const band: WearBand = installed ? wearBand(installed.wear) : 'falhou';
  return BAND_RANK[band] >= BAND_RANK[cond.minBand];
}

/** Redução de tempo dos exames (%), vinda de ferramentas e upgrades (Prompt 11). */
export interface ExamSpeed {
  visualPct: number;
  scannerPct: number;
}
export const NO_EXAM_SPEED: ExamSpeed = { visualPct: 0, scannerPct: 0 };

/** Lista os exames do caso: visual de cada hipótese, scanner e os testes funcionais. */
export function testsForCase(c: DiagnosticCaseDef, catalogs: Catalogs, data: DiagnosticData, speed: ExamSpeed = NO_EXAM_SPEED): TestDescriptor[] {
  const tests: TestDescriptor[] = [];
  for (const h of c.hypotheses) {
    const slot = catalogs.slots.get(h.slot);
    if (!slot) continue;
    tests.push({
      id: visualTestId(slot.id),
      kind: 'visual',
      name: `Inspeção visual: ${slot.name}`,
      description: 'Olhar a peça de perto, com lanterna.',
      minutes: reduceMinutes(VISUAL_MINUTES[slot.access], speed.visualPct),
      requires: VISUAL_REQUIRES[slot.access],
      slot: slot.id,
    });
  }
  tests.push({ id: SCANNER_ID, kind: 'scanner', name: data.scanner.name, description: data.scanner.description, minutes: reduceMinutes(data.scanner.minutes, speed.scannerPct), requires: data.scanner.requires });
  for (const id of c.functionalTests) {
    const t = data.functional.get(id);
    if (t) tests.push({ id: t.id, kind: 'funcional', name: t.name, description: t.description, minutes: t.minutes, requires: t.requires });
  }
  return tests;
}

/** Primeira condição de equipamento não atendida (ou null se pode fazer). */
export function unmetRequirement(requires: readonly Requirement[], ctx: EquipmentContext): Requirement | null {
  for (const r of requires) {
    if (r === 'capo-aberto' && !ctx.hoodOpen) return r;
    if (r === 'capo-fechado' && ctx.hoodOpen) return r;
    if (r === 'elevador-no-alto' && !ctx.liftUp) return r;
    if (r === 'elevador-embaixo' && !ctx.liftDown) return r;
  }
  return null;
}

export interface TestOutcome {
  text: string;
  effects: Effects;
  /** Inspeção visual que conseguiu avaliar a peça: atualiza o que o jogador sabe dela. */
  revealSlot?: string;
}

/** Executa um exame contra o estado REAL do carro. Não muda nada: só calcula o resultado. */
export function runTest(
  testId: string,
  c: DiagnosticCaseDef,
  v: VehicleState,
  catalogs: Catalogs,
  data: DiagnosticData,
): DiagnosisResult<TestOutcome> {
  const test = testsForCase(c, catalogs, data).find((t) => t.id === testId);
  if (!test) return fail('exame-inexistente', `Exame indisponível neste caso: ${testId}`);

  if (test.kind === 'visual') {
    const slot = catalogs.slots.get(test.slot!)!;
    if (!slot.visual) {
      return { ok: true, value: { text: `${slot.name}: nada de errado por fora. Se houver defeito, é interno — a inspeção visual não conclui.`, effects: {} } };
    }
    const installed = v.parts[slot.id];
    if (!installed) return { ok: true, value: { text: `${slot.name}: peça ausente.`, effects: { [slot.id]: VISUAL_BAND_EFFECT.falhou }, revealSlot: slot.id } };
    const band = wearBand(installed.wear);
    return {
      ok: true,
      value: {
        text: `${slot.name}: ${WEAR_BAND_LABEL[band].toLowerCase()} — ${VISUAL_BAND_TEXT[band]}`,
        effects: { [slot.id]: VISUAL_BAND_EFFECT[band] },
        revealSlot: slot.id,
      },
    };
  }

  if (test.kind === 'scanner') {
    const found = data.scanner.codes.filter((rule) => meetsBand(v, rule.when));
    if (found.length === 0) return { ok: true, value: { text: data.scanner.noCodesText, effects: data.scanner.noCodesEffects } };
    return {
      ok: true,
      value: {
        text: found.map((r) => `Código ${r.code}: ${r.text}`).join(' · '),
        effects: sumEffects(found.map((r) => r.effects)),
      },
    };
  }

  const def = data.functional.get(test.id)!;
  const outcome = def.outcomes.find((o) => !o.when || meetsBand(v, o.when))!;
  return { ok: true, value: { text: outcome.text, effects: outcome.effects } };
}

export function sumEffects(list: readonly Effects[]): Effects {
  const total: Record<string, number> = {};
  for (const e of list) for (const [slot, w] of Object.entries(e)) total[slot] = (total[slot] ?? 0) + w;
  return total;
}

/** Peso mínimo de uma hipótese: nada vira 0% (o jogador ainda pode escolher). */
const MIN_WEIGHT = 0.25;

export function confidenceLabel(confidence: number): ConfidenceLabel {
  if (confidence >= 0.6) return 'alta';
  if (confidence >= 0.35) return 'media';
  return 'baixa';
}

/**
 * Pontuação de cada hipótese = peso inicial + soma dos efeitos das evidências.
 * Confiança = pontuação ÷ soma das pontuações (pontuações baixas contam o mínimo).
 * Efeitos sobre peças que não são hipóteses deste caso são ignorados.
 */
export function computeHypotheses(c: DiagnosticCaseDef, evidence: readonly EvidenceEntry[]): HypothesisScore[] {
  const totals = sumEffects(evidence.map((e) => e.effects));
  const scored = c.hypotheses.map((h) => ({ slot: h.slot, score: h.prior + (totals[h.slot] ?? 0) }));
  const weights = scored.map((s) => Math.max(s.score, MIN_WEIGHT));
  const sum = weights.reduce((a, b) => a + b, 0);
  return scored
    .map((s, i) => {
      const confidence = weights[i]! / sum;
      return { slot: s.slot, score: s.score, confidence, label: confidenceLabel(confidence) };
    })
    .sort((a, b) => b.confidence - a.confidence);
}

/** Próxima dica ainda útil (exame não feito e dica não mostrada), ou null. */
export function nextHint(c: DiagnosticCaseDef, progress: CaseProgress): string | null {
  const done = new Set(progress.evidence.map((e) => e.testId));
  const hint = c.hints.find((h) => !done.has(h.testId) && !progress.hintsShown.includes(h.text));
  return hint?.text ?? null;
}

/** Concluir exige pelo menos uma evidência e uma hipótese do caso. */
export function concludeDiagnosis(
  c: DiagnosticCaseDef,
  progress: CaseProgress,
  chosenSlot: string,
  when: { day: number; time: string },
): DiagnosisResult<DiagnosisRecord> {
  if (progress.conclusion) return fail('ja-concluido', 'Este diagnóstico já foi concluído.');
  if (progress.evidence.length === 0) return fail('sem-evidencia', 'Faça pelo menos um exame antes de concluir.');
  const hypothesis = computeHypotheses(c, progress.evidence).find((h) => h.slot === chosenSlot);
  if (!hypothesis) return fail('hipotese-invalida', 'Escolha uma das hipóteses do caso.');
  return {
    ok: true,
    value: {
      caseId: c.id,
      vehicleId: c.vehicle.id,
      chosenSlot,
      correct: chosenSlot === c.trueCause,
      confidence: hypothesis.confidence,
      evidenceCount: progress.evidence.length,
      minutesSpent: progress.evidence.reduce((sum, e) => sum + e.minutes, 0),
      day: when.day,
      time: when.time,
    },
  };
}
