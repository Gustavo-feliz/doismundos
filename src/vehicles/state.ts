import { CONDITION_LABEL, type PartCondition } from '../parts/types';
import type { Catalogs } from './catalogs';
import { DataValidationError, HEX_COLOR } from './types';

/**
 * Estado de UM carro (o "documento" do veículo). Fica fora dos objetos
 * three.js: a cena só lê daqui (GDD Prompt 3).
 *
 * Separação importante:
 * - `parts` é a CONDIÇÃO REAL — o jogador nunca vê isso direto;
 * - `knowledge` é o que o jogador DESCOBRIU, de onde e quando.
 * A interface só recebe a visão montada em inspectionView.ts.
 */

/** Faixa de desgaste, que é o que uma avaliação revela (não o número exato). */
export type WearBand = 'boa' | 'gasta' | 'critica' | 'falhou';

export const WEAR_BAND_LABEL: Readonly<Record<WearBand, string>> = {
  boa: 'Boa',
  gasta: 'Gasta',
  critica: 'Crítica',
  falhou: 'Falhou',
};

/** 0 = perfeita, 100 = falhou. */
export function wearBand(wear: number): WearBand {
  if (wear >= 100) return 'falhou';
  if (wear >= 75) return 'critica';
  if (wear >= 40) return 'gasta';
  return 'boa';
}

export interface InstalledPart {
  partId: string;
  condition: PartCondition;
  /** Desgaste real, 0–100. */
  wear: number;
  installedAtKm: number;
}

export type KnowledgeSource = 'historico' | 'instalacao' | 'inspecao';

export const KNOWLEDGE_SOURCE_LABEL: Readonly<Record<KnowledgeSource, string>> = {
  historico: 'registro de serviço',
  instalacao: 'instalada nesta oficina',
  inspecao: 'avaliada nesta oficina',
};

export type PartKnowledge =
  | { status: 'desconhecido' }
  | { status: 'avaliado'; band: WearBand; source: KnowledgeSource; atKm: number; partId: string }
  | { status: 'removida'; atKm: number };

export type HistoryKind = 'manutencao' | 'colisao' | 'enchente' | 'leilao' | 'instalacao' | 'remocao' | 'ajuste';

export interface HistoryEntry {
  kind: HistoryKind;
  atKm: number;
  /** Dia do jogo em que aconteceu; null se foi antes do jogo começar. */
  day: number | null;
  text: string;
  /** false = o jogador não sabe (ex.: carro de leilão). */
  disclosed: boolean;
}

export interface VehicleState {
  id: string;
  modelId: string;
  year: number;
  plate: string;
  color: string;
  /** Nome da cor para o jogador (ex.: "Vinho"). */
  colorName: string;
  mileageKm: number;
  /** Uma entrada por posição do modelo; null = sem peça instalada. */
  parts: Readonly<Record<string, InstalledPart | null>>;
  knowledge: Readonly<Record<string, PartKnowledge>>;
  history: readonly HistoryEntry[];
}

/** Placa no padrão Mercosul (fictícia nos dados de demonstração). */
export const PLATE_PATTERN = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
const CONDITIONS = Object.keys(CONDITION_LABEL);
const HISTORY_KINDS: readonly HistoryKind[] = ['manutencao', 'colisao', 'enchente', 'leilao', 'instalacao', 'remocao', 'ajuste'];

export function isValidWear(wear: unknown): wear is number {
  return typeof wear === 'number' && Number.isFinite(wear) && wear >= 0 && wear <= 100;
}

/** Confere um estado inteiro contra os catálogos. Lista vazia = válido. */
export function findVehicleStateProblems(v: VehicleState, catalogs: Catalogs): string[] {
  const p: string[] = [];
  const where = `carro "${v.id}"`;
  const model = catalogs.models.get(v.modelId);
  if (!model) return [`${where}: modelo desconhecido "${v.modelId}"`];
  if (!Number.isInteger(v.year) || v.year < model.years[0] || v.year > model.years[1]) {
    p.push(`${where}: ano ${v.year} fora da fabricação do ${model.model} (${model.years[0]}–${model.years[1]})`);
  }
  if (!PLATE_PATTERN.test(v.plate)) p.push(`${where}: placa "${v.plate}" fora do padrão (ex.: ABC1D23)`);
  if (!HEX_COLOR.test(v.color)) p.push(`${where}: cor deve ser "#rrggbb"`);
  if (!v.colorName?.trim()) p.push(`${where}: nome da cor vazio`);
  if (!Number.isFinite(v.mileageKm) || v.mileageKm < 0) p.push(`${where}: quilometragem inválida`);

  const slots = new Set(model.slots);
  for (const key of Object.keys(v.parts)) if (!slots.has(key)) p.push(`${where}: posição "${key}" não existe no ${model.model}`);
  for (const key of Object.keys(v.knowledge)) if (!slots.has(key)) p.push(`${where}: conhecimento sobre posição inexistente "${key}"`);

  for (const slot of model.slots) {
    if (!(slot in v.parts)) p.push(`${where}: falta a posição "${slot}" (use null se estiver sem peça)`);
    if (!(slot in v.knowledge)) p.push(`${where}: falta o conhecimento da posição "${slot}"`);
    const installed = v.parts[slot];
    if (!installed) continue;
    const part = catalogs.parts.get(installed.partId);
    if (!part) {
      p.push(`${where}: peça desconhecida "${installed.partId}" em "${slot}"`);
      continue;
    }
    if (part.slot !== slot) p.push(`${where}: "${installed.partId}" não encaixa em "${slot}"`);
    const fits = part.compatibility.some((r) => r.modelId === v.modelId && v.year >= r.years[0] && v.year <= r.years[1]);
    if (!fits) p.push(`${where}: "${installed.partId}" é incompatível com ${model.model} ${v.year}`);
    if (!isValidWear(installed.wear)) p.push(`${where}: desgaste de "${slot}" fora de 0–100`);
    if (!CONDITIONS.includes(installed.condition)) p.push(`${where}: condição desconhecida em "${slot}"`);
    if (!(installed.installedAtKm >= 0 && installed.installedAtKm <= v.mileageKm)) p.push(`${where}: "${slot}" instalada em km impossível`);
  }

  for (const [i, entry] of v.history.entries()) {
    if (!HISTORY_KINDS.includes(entry.kind)) p.push(`${where}: histórico #${i} com tipo desconhecido`);
    if (!(entry.atKm >= 0 && entry.atKm <= v.mileageKm)) p.push(`${where}: histórico #${i} com km impossível`);
    if (!entry.text?.trim()) p.push(`${where}: histórico #${i} sem descrição`);
  }
  return p;
}

export function assertValidVehicleState(v: VehicleState, catalogs: Catalogs, source: string): void {
  const problems = findVehicleStateProblems(v, catalogs);
  if (problems.length) throw new DataValidationError(source, problems);
}
