import { DataValidationError, ID_PATTERN, validYearRange, type VehicleDefinition } from '../vehicles/types';
import { QUALITY_LABEL, SYSTEM_LABEL, type PartDefinition, type SlotDefinition } from './types';

const SYSTEMS = Object.keys(SYSTEM_LABEL);
const QUALITIES = Object.keys(QUALITY_LABEL);

function isCents(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}

export function validateSlots(slots: readonly SlotDefinition[], source = 'data/partSlots.ts'): void {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const s of slots) {
    if (!ID_PATTERN.test(s.id)) problems.push(`posição "${s.id}": id inválido`);
    if (seen.has(s.id)) problems.push(`posição duplicada: "${s.id}"`);
    seen.add(s.id);
    if (!SYSTEMS.includes(s.system)) problems.push(`posição "${s.id}": sistema desconhecido "${s.system}"`);
    else if (!s.id.startsWith(`${s.system}.`)) problems.push(`posição "${s.id}": o id deve começar com o sistema ("${s.system}.")`);
    if (!s.name?.trim()) problems.push(`posição "${s.id}": nome vazio`);
    if (typeof s.visual !== 'boolean') problems.push(`posição "${s.id}": informe visual (true/false)`);
  }
  if (problems.length) throw new DataValidationError(source, problems);
}

/** Lista os problemas de uma peça (vazia = válida). */
export function findPartProblems(
  part: PartDefinition,
  slots: ReadonlyMap<string, SlotDefinition>,
  models: ReadonlyMap<string, VehicleDefinition>,
): string[] {
  const p: string[] = [];
  const where = `peça "${part.id}"`;
  if (!ID_PATTERN.test(part.id ?? '')) p.push(`${where}: id deve usar só a-z, 0-9 e hífen`);
  if (!part.name?.trim()) p.push(`${where}: nome vazio`);
  if (!part.brand?.trim()) p.push(`${where}: fabricante vazio`);
  const slot = slots.get(part.slot);
  if (!slot) p.push(`${where}: posição desconhecida "${part.slot}"`);
  else if (slot.system !== part.system) p.push(`${where}: sistema "${part.system}" não bate com a posição "${part.slot}" (${slot.system})`);
  if (!QUALITIES.includes(part.quality)) p.push(`${where}: qualidade desconhecida "${String(part.quality)}"`);
  if (!isCents(part.baseCost) || part.baseCost === 0) p.push(`${where}: custo-base deve ser inteiro em centavos e maior que zero`);
  if (!isCents(part.scrapValue)) p.push(`${where}: valor de sucata deve ser inteiro em centavos (>= 0)`);
  else if (isCents(part.baseCost) && part.scrapValue > part.baseCost) p.push(`${where}: sucata não pode valer mais que a peça`);
  if (!Number.isInteger(part.replaceMinutes) || part.replaceMinutes <= 0) p.push(`${where}: tempo de troca deve ser um inteiro de minutos > 0`);
  if (!Number.isFinite(part.lifespanKm) || part.lifespanKm <= 0) p.push(`${where}: vida útil (km) deve ser > 0`);

  if (!Array.isArray(part.compatibility) || part.compatibility.length === 0) p.push(`${where}: sem regra de compatibilidade`);
  else {
    for (const rule of part.compatibility) {
      const model = models.get(rule.modelId);
      if (!model) {
        p.push(`${where}: compatibilidade com modelo desconhecido "${rule.modelId}"`);
        continue;
      }
      if (!validYearRange(rule.years)) p.push(`${where}: anos inválidos para "${rule.modelId}"`);
      else if (rule.years[0] < model.years[0] || rule.years[1] > model.years[1]) {
        p.push(`${where}: anos ${rule.years[0]}–${rule.years[1]} fora da fabricação do "${rule.modelId}" (${model.years[0]}–${model.years[1]})`);
      }
      if (!model.slots.includes(part.slot)) p.push(`${where}: o modelo "${rule.modelId}" não tem a posição "${part.slot}"`);
    }
  }
  return p;
}

export function validatePartCatalog(
  parts: readonly PartDefinition[],
  slots: readonly SlotDefinition[],
  models: readonly VehicleDefinition[],
  source = 'data/parts.ts',
): void {
  const slotMap = new Map(slots.map((s) => [s.id, s]));
  const modelMap = new Map(models.map((m) => [m.id, m]));
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    problems.push(...findPartProblems(part, slotMap, modelMap));
    if (seen.has(part.id)) problems.push(`id de peça duplicado: "${part.id}"`);
    seen.add(part.id);
  }
  if (parts.length === 0) problems.push('catálogo de peças vazio');
  if (problems.length) throw new DataValidationError(source, problems);
}

/**
 * Cobertura do catálogo (Prompt 12): todo modelo, em todo ano de fabricação,
 * precisa ter pelo menos uma peça para cada posição. Sem isso, um carro gerado
 * poderia ter um defeito impossível de consertar. Lista vazia = completo.
 */
export function findCoverageGaps(models: readonly VehicleDefinition[], parts: readonly PartDefinition[]): string[] {
  const gaps: string[] = [];
  for (const m of models) {
    for (const slot of m.slots) {
      const missing: number[] = [];
      for (let y = m.years[0]; y <= m.years[1]; y++) {
        const ok = parts.some((p) => p.slot === slot && p.compatibility.some((r) => r.modelId === m.id && y >= r.years[0] && y <= r.years[1]));
        if (!ok) missing.push(y);
      }
      if (missing.length) gaps.push(`${m.manufacturer} ${m.model}: nenhuma peça para "${slot}" em ${missing[0]}${missing.length > 1 ? `–${missing.at(-1)}` : ''}`);
    }
  }
  return gaps;
}
