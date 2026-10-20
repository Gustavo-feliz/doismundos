import { CONDITION_LABEL, type PartCondition, type PartDefinition } from '../parts/types';
import type { Catalogs } from './catalogs';
import {
  isValidWear,
  wearBand,
  type HistoryEntry,
  type InstalledPart,
  type KnowledgeSource,
  type PartKnowledge,
  type VehicleState,
} from './state';

/**
 * Funções de domínio do veículo: a ÚNICA forma de mudar um VehicleState.
 * Todas são puras: validam, e devolvem um estado novo ou um erro explicado.
 * Nenhuma muda o estado recebido.
 */
export type DomainErrorCode =
  | 'modelo-desconhecido'
  | 'peca-desconhecida'
  | 'posicao-inexistente'
  | 'posicao-errada'
  | 'modelo-incompativel'
  | 'ano-incompativel'
  | 'posicao-ocupada'
  | 'posicao-vazia'
  | 'desgaste-invalido'
  | 'km-invalido';

export interface DomainError {
  code: DomainErrorCode;
  message: string;
}

export type DomainResult<T> = { ok: true; value: T } | { ok: false; error: DomainError };

const ok = <T>(value: T): DomainResult<T> => ({ ok: true, value });
const fail = <T>(code: DomainErrorCode, message: string): DomainResult<T> => ({ ok: false, error: { code, message } });

/** Contexto opcional: dia do jogo, para o histórico. */
export interface DomainContext {
  day?: number | null;
}

function slotName(catalogs: Catalogs, slotId: string): string {
  return catalogs.slots.get(slotId)?.name ?? slotId;
}

function hasSlot(v: VehicleState, slotId: string): boolean {
  return Object.prototype.hasOwnProperty.call(v.parts, slotId);
}

/** Confere se uma peça do catálogo pode ir naquela posição daquele carro. */
export function checkCompatibility(v: VehicleState, slotId: string, partId: string, catalogs: Catalogs): DomainResult<PartDefinition> {
  const model = catalogs.models.get(v.modelId);
  if (!model) return fail('modelo-desconhecido', `Modelo desconhecido: ${v.modelId}`);
  if (!model.slots.includes(slotId) || !hasSlot(v, slotId)) {
    return fail('posicao-inexistente', `O ${model.model} não tem a posição "${slotName(catalogs, slotId)}".`);
  }
  const part = catalogs.parts.get(partId);
  if (!part) return fail('peca-desconhecida', `Peça desconhecida: ${partId}`);
  if (part.slot !== slotId) {
    return fail('posicao-errada', `${part.name} não encaixa em "${slotName(catalogs, slotId)}" (é para "${slotName(catalogs, part.slot)}").`);
  }
  const rules = part.compatibility.filter((r) => r.modelId === v.modelId);
  if (rules.length === 0) {
    return fail('modelo-incompativel', `${part.name} (${part.brand}) não serve no ${model.manufacturer} ${model.model}.`);
  }
  if (!rules.some((r) => v.year >= r.years[0] && v.year <= r.years[1])) {
    const ranges = rules.map((r) => `${r.years[0]}–${r.years[1]}`).join(', ');
    return fail('ano-incompativel', `${part.name} serve no ${model.model} ${ranges}; este carro é ${v.year}.`);
  }
  return ok(part);
}

/** Peças do catálogo que servem em uma posição deste carro. */
export function compatiblePartsFor(v: VehicleState, slotId: string, catalogs: Catalogs): PartDefinition[] {
  const result: PartDefinition[] = [];
  for (const part of catalogs.parts.values()) {
    if (part.slot === slotId && checkCompatibility(v, slotId, part.id, catalogs).ok) result.push(part);
  }
  return result;
}

export interface InstallOptions extends DomainContext {
  condition: PartCondition;
  /** Desgaste da peça ao instalar. Peça nova é sempre 0. */
  wear?: number;
}

/** Instala uma peça numa posição vazia. O mecânico sabe o estado do que instalou. */
export function installPart(
  v: VehicleState,
  slotId: string,
  partId: string,
  options: InstallOptions,
  catalogs: Catalogs,
): DomainResult<VehicleState> {
  const check = checkCompatibility(v, slotId, partId, catalogs);
  if (!check.ok) return check;
  const part = check.value;
  if (v.parts[slotId]) return fail('posicao-ocupada', `Já há uma peça em "${slotName(catalogs, slotId)}". Remova antes de instalar outra.`);
  const wear = options.condition === 'nova' ? 0 : (options.wear ?? 0);
  if (options.condition === 'nova' && options.wear !== undefined && options.wear !== 0) {
    return fail('desgaste-invalido', 'Peça nova não pode ter desgaste.');
  }
  if (!isValidWear(wear)) return fail('desgaste-invalido', `Desgaste deve estar entre 0 e 100 (recebido ${String(options.wear)}).`);

  const installed: InstalledPart = { partId, condition: options.condition, wear, installedAtKm: v.mileageKm };
  const knowledge: PartKnowledge = { status: 'avaliado', band: wearBand(wear), source: 'instalacao', atKm: v.mileageKm, partId };
  const entry: HistoryEntry = {
    kind: 'instalacao',
    atKm: v.mileageKm,
    day: options.day ?? null,
    text: `Instalada: ${part.name} — ${part.brand} (${CONDITION_LABEL[options.condition].toLowerCase()})`,
    disclosed: true,
  };
  return ok({
    ...v,
    parts: { ...v.parts, [slotId]: installed },
    knowledge: { ...v.knowledge, [slotId]: knowledge },
    history: [...v.history, entry],
  });
}

/** Remove a peça de uma posição. Devolve o carro e a peça retirada. */
export function removePart(
  v: VehicleState,
  slotId: string,
  catalogs: Catalogs,
  context: DomainContext = {},
): DomainResult<{ vehicle: VehicleState; removed: InstalledPart }> {
  if (!hasSlot(v, slotId)) return fail('posicao-inexistente', `Posição inexistente: "${slotName(catalogs, slotId)}".`);
  const removed = v.parts[slotId];
  if (!removed) return fail('posicao-vazia', `Não há peça em "${slotName(catalogs, slotId)}".`);
  const partName = catalogs.parts.get(removed.partId)?.name ?? removed.partId;
  return ok({
    removed,
    vehicle: {
      ...v,
      parts: { ...v.parts, [slotId]: null },
      knowledge: { ...v.knowledge, [slotId]: { status: 'removida', atKm: v.mileageKm } },
      history: [...v.history, { kind: 'remocao', atKm: v.mileageKm, day: context.day ?? null, text: `Removida: ${partName}`, disclosed: true }],
    },
  });
}

/** Troca atômica: se a nova peça não puder entrar, nada muda. */
export function replacePart(
  v: VehicleState,
  slotId: string,
  partId: string,
  options: InstallOptions,
  catalogs: Catalogs,
): DomainResult<{ vehicle: VehicleState; removed: InstalledPart }> {
  const check = checkCompatibility(v, slotId, partId, catalogs);
  if (!check.ok) return check;
  const removal = removePart(v, slotId, catalogs, options);
  if (!removal.ok) return removal;
  const install = installPart(removal.value.vehicle, slotId, partId, options, catalogs);
  if (!install.ok) return install;
  return ok({ vehicle: install.value, removed: removal.value.removed });
}

/**
 * Ajusta o desgaste REAL de uma peça (eventos do jogo, dados de teste).
 * O jogador não fica sabendo: o conhecimento não muda e o registro é oculto.
 */
export function setPartWear(v: VehicleState, slotId: string, wear: number, reason: string, catalogs: Catalogs): DomainResult<VehicleState> {
  if (!hasSlot(v, slotId)) return fail('posicao-inexistente', `Posição inexistente: "${slotName(catalogs, slotId)}".`);
  const installed = v.parts[slotId];
  if (!installed) return fail('posicao-vazia', `Não há peça em "${slotName(catalogs, slotId)}".`);
  if (!isValidWear(wear)) return fail('desgaste-invalido', `Desgaste deve estar entre 0 e 100 (recebido ${wear}).`);
  return ok({
    ...v,
    parts: { ...v.parts, [slotId]: { ...installed, wear } },
    history: [...v.history, { kind: 'ajuste', atKm: v.mileageKm, day: null, text: `${slotName(catalogs, slotId)}: ${reason}`, disclosed: false }],
  });
}

/** Roda X km: soma quilometragem e desgasta cada peça conforme a vida útil dela. */
export function driveKm(v: VehicleState, km: number, catalogs: Catalogs): DomainResult<VehicleState> {
  if (!Number.isFinite(km) || km <= 0) return fail('km-invalido', `Distância inválida: ${km}`);
  const parts: Record<string, InstalledPart | null> = {};
  for (const [slot, installed] of Object.entries(v.parts)) {
    if (!installed) {
      parts[slot] = null;
      continue;
    }
    const lifespan = catalogs.parts.get(installed.partId)?.lifespanKm ?? Infinity;
    const wear = Math.min(100, Math.round((installed.wear + (km / lifespan) * 100) * 100) / 100);
    parts[slot] = { ...installed, wear };
  }
  return ok({ ...v, mileageKm: v.mileageKm + km, parts });
}

/** Revela o estado atual de uma peça (usado pelo diagnóstico, no Prompt 4). */
export function revealPartCondition(v: VehicleState, slotId: string, source: KnowledgeSource, catalogs: Catalogs): DomainResult<VehicleState> {
  if (!hasSlot(v, slotId)) return fail('posicao-inexistente', `Posição inexistente: "${slotName(catalogs, slotId)}".`);
  const installed = v.parts[slotId];
  const knowledge: PartKnowledge = installed
    ? { status: 'avaliado', band: wearBand(installed.wear), source, atKm: v.mileageKm, partId: installed.partId }
    : { status: 'removida', atKm: v.mileageKm };
  return ok({ ...v, knowledge: { ...v.knowledge, [slotId]: knowledge } });
}
