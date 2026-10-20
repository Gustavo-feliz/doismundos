import { REQUIREMENT_TEXT, unmetRequirement } from '../diagnostics/rules';
import type { EquipmentContext, Requirement } from '../diagnostics/types';
import type { PartAccess } from '../parts/types';
import type { QuoteBreakdown } from '../economy/quote';
import type { Catalogs } from '../vehicles/catalogs';
import { installPart, removePart } from '../vehicles/domain';
import type { VehicleState } from '../vehicles/state';
import type { QualityLabel, RepairItemState, RepairState } from '../orders/types';

/**
 * Reparo abstrato do protótipo (GDD §12.1, Prompt 6): sem parafusos
 * individuais. Cada item segue: acesso → remover a antiga → instalar a nova.
 * Depois de todos os itens, o teste final. Tudo puro e determinístico.
 */
export type RepairErrorCode = 'requisito' | 'fora-de-ordem' | 'repetida' | 'peca-errada' | 'sem-peca' | 'item-inexistente' | 'pendente';

export interface RepairError {
  code: RepairErrorCode;
  message: string;
  /** Erro de execução (conta contra a qualidade). Falta de equipamento não conta. */
  countsAgainstQuality: boolean;
}

export type RepairResult<T> = { ok: true; value: T } | { ok: false; error: RepairError };

const fail = <T>(code: RepairErrorCode, message: string, countsAgainstQuality: boolean): RepairResult<T> => ({
  ok: false,
  error: { code, message, countsAgainstQuality },
});

/** Para mexer na peça: cofre com capô aberto; embaixo ou nas rodas, carro no alto. */
export const REPAIR_ACCESS: Readonly<Record<PartAccess, readonly Requirement[]>> = {
  capo: ['capo-aberto'],
  elevador: ['elevador-no-alto'],
  externo: ['elevador-no-alto'], // tirar a roda
};

/** Teste final: carro no chão e fechado. */
export const FINAL_TEST_REQUIRES: readonly Requirement[] = ['elevador-embaixo', 'capo-fechado'];
export const FINAL_TEST_MINUTES = 10;

export function startRepair(approved: QuoteBreakdown): RepairState {
  return {
    items: approved.input.items.map((i) => ({ slot: i.slot, plannedPartId: i.partId, removed: false, installedPartId: null, installedUnitCost: null })),
    finalTest: null,
    invalidAttempts: 0,
    substitutions: 0,
    minutes: 0,
    log: [],
  };
}

/** Tempo de remover e de instalar: metade do tempo de troca cada (remoção arredonda para cima). */
export function stepMinutes(replaceMinutes: number): { remove: number; install: number } {
  const remove = Math.ceil(replaceMinutes / 2);
  return { remove, install: replaceMinutes - remove };
}

function findItem(r: RepairState, slot: string): RepairItemState | undefined {
  return r.items.find((i) => i.slot === slot);
}

function replaceItem(r: RepairState, next: RepairItemState): readonly RepairItemState[] {
  return r.items.map((i) => (i.slot === next.slot ? next : i));
}

function accessCheck(slot: string, ctx: EquipmentContext, catalogs: Catalogs): RepairError | null {
  const def = catalogs.slots.get(slot);
  if (!def) return { code: 'item-inexistente', message: `Posição desconhecida: ${slot}`, countsAgainstQuality: false };
  const unmet = unmetRequirement(REPAIR_ACCESS[def.access], ctx);
  return unmet ? { code: 'requisito', message: `${def.name}: ${REQUIREMENT_TEXT[unmet].toLowerCase()}.`, countsAgainstQuality: false } : null;
}

export interface StepOutcome {
  repair: RepairState;
  vehicle: VehicleState;
  minutes: number;
  message: string;
}

export function removeOldPart(r: RepairState, v: VehicleState, slot: string, ctx: EquipmentContext, catalogs: Catalogs): RepairResult<StepOutcome & { removedPartId: string }> {
  const item = findItem(r, slot);
  if (!item) return fail('item-inexistente', 'Esse item não faz parte da ordem de serviço.', true);
  const name = catalogs.slots.get(slot)?.name ?? slot;
  if (item.removed) return fail('repetida', `${name}: a peça antiga já foi removida.`, true);
  const access = accessCheck(slot, ctx, catalogs);
  if (access) return { ok: false, error: access };
  const removal = removePart(v, slot, catalogs);
  if (!removal.ok) return fail('fora-de-ordem', removal.error.message, true);
  const part = catalogs.parts.get(removal.value.removed.partId);
  const minutes = stepMinutes(part?.replaceMinutes ?? 30).remove;
  return {
    ok: true,
    value: {
      repair: { ...r, items: replaceItem(r, { ...item, removed: true }), minutes: r.minutes + minutes },
      vehicle: removal.value.vehicle,
      minutes,
      removedPartId: removal.value.removed.partId,
      message: `${name}: peça antiga removida (+${minutes} min).`,
    },
  };
}

export function installHeldPart(
  r: RepairState,
  v: VehicleState,
  slot: string,
  heldPartId: string | null,
  ctx: EquipmentContext,
  catalogs: Catalogs,
): RepairResult<StepOutcome> {
  const item = findItem(r, slot);
  if (!item) return fail('item-inexistente', 'Esse item não faz parte da ordem de serviço.', true);
  const name = catalogs.slots.get(slot)?.name ?? slot;
  if (item.installedPartId) return fail('repetida', `${name}: a peça nova já foi instalada.`, true);
  if (!item.removed) return fail('fora-de-ordem', `${name}: remova a peça antiga antes de instalar a nova.`, true);
  if (!heldPartId) return fail('sem-peca', 'Você não está segurando nenhuma peça. Pegue a peça no estoque (estantes).', false);
  const access = accessCheck(slot, ctx, catalogs);
  if (access) return { ok: false, error: access };
  const install = installPart(v, slot, heldPartId, { condition: 'nova' }, catalogs);
  if (!install.ok) return fail('peca-errada', `Peça errada: ${install.error.message}`, true);
  const part = catalogs.parts.get(heldPartId)!;
  const minutes = stepMinutes(part.replaceMinutes).install;
  const substituted = heldPartId !== item.plannedPartId;
  return {
    ok: true,
    value: {
      repair: {
        ...r,
        items: replaceItem(r, { ...item, installedPartId: heldPartId }),
        minutes: r.minutes + minutes,
        substitutions: r.substitutions + (substituted ? 1 : 0),
      },
      vehicle: install.value,
      minutes,
      message: `${name}: ${part.name} instalada (+${minutes} min)${substituted ? ' — diferente da peça orçada' : ''}.`,
    },
  };
}

export interface FinalTestText {
  resolved: string;
  persists: string;
}

/** Teste final: o defeito some se a causa real foi trocada. */
export function runFinalTest(r: RepairState, ctx: EquipmentContext, trueCause: string, texts: FinalTestText): RepairResult<{ repair: RepairState; minutes: number; resolved: boolean; message: string }> {
  if (r.finalTest) return fail('repetida', 'O teste final já foi feito.', true);
  const pending = r.items.filter((i) => !i.installedPartId);
  if (pending.length) return fail('fora-de-ordem', 'Termine todos os itens antes do teste final.', true);
  const unmet = unmetRequirement(FINAL_TEST_REQUIRES, ctx);
  if (unmet) return fail('requisito', `Teste final: ${REQUIREMENT_TEXT[unmet].toLowerCase()}.`, false);
  const resolved = r.items.some((i) => i.slot === trueCause && i.installedPartId);
  const text = resolved ? texts.resolved : texts.persists;
  return {
    ok: true,
    value: {
      repair: { ...r, finalTest: { resolved, text }, minutes: r.minutes + FINAL_TEST_MINUTES },
      minutes: FINAL_TEST_MINUTES,
      resolved,
      message: `Teste final: ${text}`,
    },
  };
}

/** O que falta para concluir (vazio = pode concluir). */
export function pendingTasks(r: RepairState, catalogs: Catalogs): string[] {
  const out: string[] = [];
  for (const i of r.items) {
    const name = catalogs.slots.get(i.slot)?.name ?? i.slot;
    if (!i.removed) out.push(`${name}: remover a peça antiga`);
    else if (!i.installedPartId) out.push(`${name}: instalar a peça nova`);
  }
  if (!r.finalTest) out.push('Fazer o teste final');
  return out;
}

/** Penalidades fixas: nada de sorteio. */
export const QUALITY_PENALTY = { invalidAttempt: 10, maxInvalidCounted: 3, substitution: 15 } as const;

export function computeQuality(r: RepairState): { score: number; label: QualityLabel; resolved: boolean } {
  const resolved = Boolean(r.finalTest?.resolved);
  const score = Math.max(
    0,
    100 - Math.min(r.invalidAttempts, QUALITY_PENALTY.maxInvalidCounted) * QUALITY_PENALTY.invalidAttempt - r.substitutions * QUALITY_PENALTY.substitution,
  );
  const label: QualityLabel = !resolved ? 'retrabalho' : score >= 90 ? 'excelente' : score >= 70 ? 'boa' : 'regular';
  return { score, label, resolved };
}
