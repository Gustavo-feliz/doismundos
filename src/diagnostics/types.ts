import type { VehicleSpec } from '../vehicles/factory';
import type { WearBand } from '../vehicles/state';

/**
 * Diagnóstico (GDD §11 e Prompt 4).
 * Sintoma ≠ diagnóstico: o jogador faz exames, cada exame vira uma evidência,
 * e as evidências mudam a confiança em cada hipótese, por regras fixas.
 */

/** Condição de equipamento para poder fazer um exame. */
export type Requirement = 'capo-aberto' | 'capo-fechado' | 'elevador-no-alto' | 'elevador-embaixo';

/** Estado dos equipamentos que importa para os exames. */
export interface EquipmentContext {
  hoodOpen: boolean;
  liftUp: boolean;
  liftDown: boolean;
}

/** Peso que uma evidência soma (ou tira) de cada hipótese, por posição de peça. */
export type Effects = Readonly<Record<string, number>>;

/** Condição sobre o estado REAL de uma peça: desgaste na faixa `minBand` ou pior. */
export interface BandCondition {
  slot: string;
  minBand: WearBand;
}

export interface FunctionalOutcome {
  /** Sem `when` = resultado padrão (precisa ser o último da lista). */
  when?: BandCondition;
  text: string;
  effects: Effects;
}

/** Teste funcional (rodar, medir, ouvir). Os resultados são avaliados em ordem; vale o primeiro que bater. */
export interface FunctionalTestDef {
  id: string;
  name: string;
  description: string;
  minutes: number;
  requires: readonly Requirement[];
  outcomes: readonly FunctionalOutcome[];
}

/** Código de falha que o scanner mostra quando a condição é verdadeira. Fictício. */
export interface FaultCodeRule {
  code: string;
  text: string;
  when: BandCondition;
  effects: Effects;
}

export interface ScannerDef {
  name: string;
  description: string;
  minutes: number;
  requires: readonly Requirement[];
  codes: readonly FaultCodeRule[];
  noCodesText: string;
  noCodesEffects: Effects;
}

export interface HypothesisPrior {
  slot: string;
  /** Peso inicial: o quanto essa causa é comum para o sintoma. */
  prior: number;
}

export interface CaseHint {
  /** A dica só aparece enquanto este exame não foi feito. */
  testId: string;
  text: string;
}

/** Um problema de demonstração: cliente, queixa, carro e a causa verdadeira (escondida). */
export interface DiagnosticCaseDef {
  id: string;
  orderNumber: string;
  customerName: string;
  /** Fala do cliente (o sintoma, não o diagnóstico). */
  complaint: string;
  /** Resumo curto para o HUD. */
  summary: string;
  vehicle: VehicleSpec;
  hypotheses: readonly HypothesisPrior[];
  /** Causa real. NUNCA vai para a interface. */
  trueCause: string;
  functionalTests: readonly string[];
  hints: readonly CaseHint[];
  /** Cliente dono do carro (id em data/customers.ts). */
  customerId: string;
  /** Teste final do reparo: o que o mecânico percebe com e sem o defeito resolvido. */
  finalTest: { resolved: string; persists: string };
}

export type TestKind = 'visual' | 'scanner' | 'funcional';

/** Um exame disponível num caso (visual por peça, scanner, funcionais). */
export interface TestDescriptor {
  id: string;
  kind: TestKind;
  name: string;
  description: string;
  minutes: number;
  requires: readonly Requirement[];
  /** Só para inspeção visual. */
  slot?: string;
}

export interface EvidenceEntry {
  testId: string;
  testName: string;
  kind: TestKind;
  text: string;
  effects: Effects;
  minutes: number;
  day: number;
  time: string;
}

export interface DiagnosisRecord {
  caseId: string;
  vehicleId: string;
  chosenSlot: string;
  /** Guardado para o reparo (Prompt 6) gerar retrabalho. A UI não mostra. */
  correct: boolean;
  confidence: number;
  evidenceCount: number;
  minutesSpent: number;
  day: number;
  time: string;
}

export interface CaseProgress {
  caseId: string;
  vehicleId: string;
  evidence: readonly EvidenceEntry[];
  hintsShown: readonly string[];
  conclusion: DiagnosisRecord | null;
}

export type ConfidenceLabel = 'baixa' | 'media' | 'alta';

export interface HypothesisScore {
  slot: string;
  score: number;
  /** 0–1 */
  confidence: number;
  label: ConfidenceLabel;
}
