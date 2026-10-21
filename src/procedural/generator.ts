import { counterIsPriceOnly, decideOnQuote } from '../customers/decision';
import type { CustomerProfile } from '../customers/types';
import { computeHypotheses, runTest, testsForCase, type DiagnosticData } from '../diagnostics/rules';
import type { DiagnosticCaseDef, EvidenceEntry, ToolRequirement } from '../diagnostics/types';
import { validateDiagnosticData } from '../diagnostics/validate';
import { computeQuote, type PricingRules } from '../economy/quote';
import type { PartDefinition } from '../parts/types';
import { levelOf, type UpgradeDef, type UpgradeLevels } from '../upgrades/rules';
import { createSeededRandom, type Rng } from '../utils/random';
import type { Catalogs } from '../vehicles/catalogs';
import { createVehicleState, type VehicleSpec } from '../vehicles/factory';
import { wearBand, type HistoryEntry, type InstalledPart, type PartKnowledge } from '../vehicles/state';
import { DataValidationError, ID_PATTERN } from '../vehicles/types';
import type { ServiceTemplate } from './types';

/**
 * Gerador procedural de ordens de serviço (GDD §9.3, Prompt 12).
 *
 * - Reproduzível: a mesma semente, o mesmo número da OS e as mesmas
 *   ferramentas geram SEMPRE a mesma OS. Por isso o save guarda só o ID
 *   ("gen-<semente>-<n>-t<níveis>") e a OS é recriada a partir dele.
 * - Nunca impossível: cada candidata passa por `caseProblems` (peça existe e
 *   serve, exames apontam a causa real, algum cliente aceita um orçamento,
 *   ferramentas exigidas já foram compradas). Se falhar, tenta de novo com
 *   outra sub-semente; o resultado continua determinístico.
 */
export interface GeneratorContent {
  catalogs: Catalogs;
  diagnostics: DiagnosticData;
  customers: readonly CustomerProfile[];
  pricing: PricingRules;
  upgrades: readonly UpgradeDef[];
  templates: readonly ServiceTemplate[];
  names: readonly string[];
  colors: ReadonlyArray<readonly [string, string]>;
}

/** Ano "atual" do jogo para calcular idade e quilometragem. PROVISÓRIO. */
export const CURRENT_YEAR = 2026;
/** Número da primeira OS gerada (as de demonstração vão de 001 a 004). */
const FIRST_ORDER_NUMBER = 100;
const MAX_ATTEMPTS = 40;
/** Desgaste máximo das pistas falsas, para não imitarem o defeito real. */
const DECOY_MAX_WEAR = 70;
const ID_RE = /^gen-(\d+)-(\d+)-t(\d*)$/;

function mix(...values: number[]): number {
  let h = 0x811c9dc5;
  for (const v of values) {
    h = Math.imul(h ^ (v >>> 0), 0x01000193);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)]!;
const int = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

/** Embaralha (Fisher-Yates) com o gerador da semente: mesmo resultado em qualquer navegador. */
function shuffle<T>(rng: Rng, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function generatedCaseId(seed: number, n: number, levels: UpgradeLevels, upgrades: readonly UpgradeDef[]): string {
  return `gen-${seed}-${n}-t${upgrades.map((u) => Math.min(9, levelOf(levels, u.id))).join('')}`;
}

export function parseGeneratedId(id: string, upgrades: readonly UpgradeDef[]): { seed: number; n: number; levels: UpgradeLevels } | null {
  const m = ID_RE.exec(id);
  if (!m || m[3]!.length !== upgrades.length) return null;
  const seed = Number(m[1]);
  const n = Number(m[2]);
  if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(n) || n < 1) return null;
  const levels: Record<string, number> = {};
  upgrades.forEach((u, i) => {
    const level = Number(m[3]![i]);
    if (level > 0) levels[u.id] = level;
  });
  return { seed, n, levels };
}

export function toolsMet(required: readonly ToolRequirement[] | undefined, levels: UpgradeLevels): boolean {
  return (required ?? []).every((t) => levelOf(levels, t.upgradeId) >= t.level);
}

/** Peças que servem num modelo/ano, na ordem do catálogo (a 1ª é a do orçamento). */
export function partsFor(catalogs: Catalogs, modelId: string, year: number, slot: string): PartDefinition[] {
  return [...catalogs.parts.values()].filter((p) => p.slot === slot && p.compatibility.some((r) => r.modelId === modelId && year >= r.years[0] && year <= r.years[1]));
}

/** Gera a OS número `n` da semente. Lança erro só se os DADOS não permitirem nenhuma OS viável. */
export function generateCase(seed: number, n: number, levels: UpgradeLevels, content: GeneratorContent): DiagnosticCaseDef {
  const id = generatedCaseId(seed, n, levels, content.upgrades);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = buildCandidate(id, n, createSeededRandom(mix(seed, n, attempt)), levels, content);
    if (candidate && caseProblems(candidate, content, levels).length === 0) return candidate;
  }
  throw new Error(`Não foi possível gerar uma OS viável (semente ${seed}, OS ${n}). Revise os dados de serviços.`);
}

function buildCandidate(id: string, n: number, rng: Rng, levels: UpgradeLevels, content: GeneratorContent): DiagnosticCaseDef | null {
  const { catalogs } = content;
  const templates = content.templates.filter((t) => toolsMet(t.requiredTools, levels));
  if (templates.length === 0) return null;
  const t = pick(rng, templates);
  const models = [...catalogs.models.values()].filter((m) => (t.categories ? t.categories.includes(m.category) : true) && m.slots.includes(t.cause));
  if (models.length === 0) return null;
  const model = pick(rng, models);
  const year = int(rng, model.years[0], model.years[1]);
  const age = Math.max(1, CURRENT_YEAR - year);
  const perYear = int(rng, 8, 19) * 1000 * (model.category === 'van' ? 1.6 : 1);
  const mileageKm = Math.round((age * perYear) / 100) * 100;

  // Peças instaladas: em geral a primeira compatível, às vezes outra; desgaste coerente com os km.
  const parts: Record<string, InstalledPart> = {};
  for (const slot of model.slots) {
    const options = partsFor(catalogs, model.id, year, slot);
    if (options.length === 0) return null;
    const part = rng() < 0.7 ? options[0]! : pick(rng, options);
    const installedAtKm = Math.max(0, Math.round((mileageKm - rng() * part.lifespanKm * 1.1) / 100) * 100);
    const wear = Math.min(100, Math.round(((mileageKm - installedAtKm) / part.lifespanKm) * 1000) / 10);
    parts[slot] = { partId: part.id, condition: age > 12 && rng() < 0.15 ? 'usada' : 'nova', wear, installedAtKm };
  }

  // Histórico (GDD §9.2): leilão, colisão, enchente, manutenção ruim. Nem tudo é contado ao mecânico.
  const history: HistoryEntry[] = [];
  const known: Record<string, PartKnowledge> = {};
  const at = (min: number, max: number) => Math.round((mileageKm * (min + rng() * (max - min))) / 100) * 100;
  if (rng() < 0.15) history.push({ kind: 'leilao', atKm: at(0.3, 0.8), day: null, text: 'Comprado em leilão de seguradora', disclosed: false });
  if (rng() < 0.12) history.push({ kind: 'colisao', atKm: at(0.2, 0.9), day: null, text: 'Batida leve na dianteira (para-choque trocado)', disclosed: rng() < 0.5 });
  if (rng() < 0.1) {
    history.push({ kind: 'enchente', atKm: at(0.2, 0.9), day: null, text: 'Pegou enchente na Praça da Bandeira', disclosed: false });
    for (const slot of ['eletrica.bateria', 'eletrica.alternador']) {
      const p = parts[slot];
      if (p) parts[slot] = { ...p, wear: Math.min(99, p.wear + 12) };
    }
  }
  if (rng() < 0.15) history.push({ kind: 'manutencao', atKm: at(0.5, 0.95), day: null, text: 'Revisão num posto de beira de estrada, sem nota fiscal', disclosed: true });
  const oil = parts['fluidos.oleo-motor'];
  if (oil && rng() < 0.6) {
    history.push({ kind: 'manutencao', atKm: oil.installedAtKm, day: null, text: 'Troca de óleo (etiqueta no para-brisa)', disclosed: true });
    known['fluidos.oleo-motor'] = { status: 'avaliado', band: 'boa', source: 'historico', atKm: oil.installedAtKm, partId: oil.partId };
  }
  history.sort((a, b) => a.atKm - b.atKm);

  // O defeito real e as pistas falsas sob controle.
  const cause = parts[t.cause]!;
  parts[t.cause] = { ...cause, wear: int(rng, t.causeWear[0], t.causeWear[1]) };
  const decoys = new Set(t.hypotheses.map((h) => h.slot));
  for (const testId of t.functionalTests) for (const o of content.diagnostics.functional.get(testId)?.outcomes ?? []) if (o.when) decoys.add(o.when.slot);
  decoys.delete(t.cause);
  for (const slot of decoys) {
    const p = parts[slot];
    if (p && p.wear > DECOY_MAX_WEAR) parts[slot] = { ...p, wear: DECOY_MAX_WEAR - int(rng, 0, 20) };
  }

  const [color, colorName] = pick(rng, content.colors);
  const letters = 'ABCDEFGHJKLMNPRSUVWXYZ';
  const plate = `${pick(rng, [...letters])}${pick(rng, [...letters])}${pick(rng, [...letters])}${int(rng, 0, 9)}${pick(rng, [...letters])}${int(rng, 10, 99)}`;
  const vehicle: VehicleSpec = { id: `${id}-carro`, modelId: model.id, year, plate, color, colorName, mileageKm, parts, known, history };

  const customers = shuffle(rng, content.customers);
  const profile = customers.find((c) => quoteFeasible(t.cause, vehicle, c, content)) ?? null;
  if (!profile) return null;

  return {
    id,
    orderNumber: String(FIRST_ORDER_NUMBER + n),
    customerName: pick(rng, content.names),
    complaint: pick(rng, t.complaints),
    summary: t.title,
    vehicle,
    hypotheses: t.hypotheses,
    trueCause: t.cause,
    functionalTests: t.functionalTests,
    hints: t.hints,
    customerId: profile.id,
    finalTest: t.finalTest,
    requiredTools: t.requiredTools,
  };
}

/** Existe um orçamento (sem margem, com ou sem urgência) que esse cliente aceite? */
function quoteFeasible(slot: string, vehicle: VehicleSpec, profile: CustomerProfile, content: GeneratorContent): boolean {
  const model = content.catalogs.models.get(vehicle.modelId);
  const part = partsFor(content.catalogs, vehicle.modelId, vehicle.year, slot)[0];
  if (!model || !part) return false;
  const warrantyDays = content.pricing.warrantyOptions.find((d) => d >= profile.minWarrantyDays) ?? content.pricing.warrantyOptions.at(-1)!;
  return [false, true].some((urgent) => {
    const q = computeQuote(
      { items: [{ slot, partId: part.id, mandatory: true }], markupPct: 0, discountPct: 0, urgent, warrantyDays },
      { catalogs: content.catalogs, category: model.category, rules: content.pricing },
    );
    if (!q.ok) return false;
    const d = decideOnQuote(q.value, profile, 0);
    return d.kind === 'aceita' || counterIsPriceOnly(d);
  });
}

/**
 * Tudo o que torna uma OS impossível. Lista vazia = dá para resolver do começo ao fim.
 * Usado pelo gerador e pelos testes com muitas sementes.
 */
export function caseProblems(c: DiagnosticCaseDef, content: GeneratorContent, levels: UpgradeLevels): string[] {
  const p: string[] = [];
  const { catalogs, diagnostics } = content;
  try {
    validateDiagnosticData([c], diagnostics, catalogs);
  } catch (e) {
    return [(e as Error).message];
  }
  let v;
  try {
    v = createVehicleState(c.vehicle, catalogs, `carro gerado "${c.vehicle.id}"`);
  } catch (e) {
    return [(e as Error).message];
  }
  const cause = v.parts[c.trueCause];
  if (!cause || (wearBand(cause.wear) !== 'critica' && wearBand(cause.wear) !== 'falhou')) p.push('a peça com defeito não está crítica');
  if (partsFor(catalogs, v.modelId, v.year, c.trueCause).length === 0) p.push('não existe peça de reposição para este carro');
  if (!toolsMet(c.requiredTools, levels)) p.push('exige uma ferramenta que a oficina não tem');

  // Fazendo todos os exames, a causa real precisa ficar na frente, com folga.
  const evidence: EvidenceEntry[] = [];
  for (const t of testsForCase(c, catalogs, diagnostics)) {
    const r = runTest(t.id, c, v, catalogs, diagnostics);
    if (r.ok) evidence.push({ testId: t.id, testName: t.name, kind: t.kind, text: r.value.text, effects: r.value.effects, minutes: t.minutes, day: 1, time: '00:00' });
  }
  const ranked = [...computeHypotheses(c, evidence)].sort((a, b) => b.score - a.score);
  if (ranked[0]?.slot !== c.trueCause || ranked[0].score - (ranked[1]?.score ?? 0) < 1) p.push('os exames não apontam a causa real com clareza');

  const profile = content.customers.find((x) => x.id === c.customerId);
  if (!profile) p.push(`cliente desconhecido "${c.customerId}"`);
  else if (!quoteFeasible(c.trueCause, c.vehicle, profile, content)) p.push('nenhum orçamento possível seria aceito pelo cliente');
  return p;
}

/** Valida os moldes de serviço ao abrir o jogo (GDD §21.3). */
export function validateServiceTemplates(content: GeneratorContent): void {
  const p: string[] = [];
  const ids = new Set<string>();
  const { catalogs, diagnostics } = content;
  for (const t of content.templates) {
    const at = `serviço "${t.id}"`;
    if (!ID_PATTERN.test(t.id)) p.push(`${at}: ID inválido`);
    if (ids.has(t.id)) p.push(`${at}: ID repetido`);
    ids.add(t.id);
    if (!t.title.trim() || t.complaints.length === 0 || t.complaints.some((x) => !x.trim())) p.push(`${at}: título ou falas vazios`);
    if (!catalogs.slots.has(t.cause)) p.push(`${at}: causa em posição desconhecida "${t.cause}"`);
    if (!t.hypotheses.some((h) => h.slot === t.cause)) p.push(`${at}: a causa precisa estar entre as hipóteses`);
    if (t.hypotheses.length < 2) p.push(`${at}: precisa de pelo menos 2 hipóteses`);
    for (const h of t.hypotheses) if (!catalogs.slots.has(h.slot)) p.push(`${at}: hipótese em posição desconhecida "${h.slot}"`);
    for (const f of t.functionalTests) if (!diagnostics.functional.has(f)) p.push(`${at}: teste funcional desconhecido "${f}"`);
    const [a, b] = t.causeWear;
    if (!(a >= 75 && b <= 100 && a <= b)) p.push(`${at}: desgaste da causa precisa ficar entre 75 e 100`);
    for (const tool of t.requiredTools) {
      const u = content.upgrades.find((x) => x.id === tool.upgradeId);
      if (!u) p.push(`${at}: ferramenta desconhecida "${tool.upgradeId}"`);
      else if (!Number.isInteger(tool.level) || tool.level < 1 || tool.level > u.levels.length) p.push(`${at}: nível de ferramenta inválido`);
    }
    const validTests = new Set(['scanner', ...t.functionalTests, ...t.hypotheses.map((h) => `visual:${h.slot}`)]);
    for (const h of t.hints) if (!validTests.has(h.testId)) p.push(`${at}: dica aponta para exame inexistente "${h.testId}"`);
  }
  if (!content.templates.some((t) => t.requiredTools.length === 0)) p.push('é preciso pelo menos um serviço sem ferramenta exigida (senão uma oficina nova não teria OS)');
  if (content.names.length === 0 || content.colors.length === 0) p.push('faltam nomes de clientes ou cores');
  if (p.length) throw new DataValidationError('serviços (data/services.ts)', p);
}
