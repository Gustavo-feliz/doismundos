import type { Cents } from '../economy/money';
import { ACCESS_LABEL, QUALITY_LABEL, SYSTEM_LABEL, type PartAccess, type PartSystem } from '../parts/types';
import type { Catalogs } from './catalogs';
import { compatiblePartsFor } from './domain';
import { KNOWLEDGE_SOURCE_LABEL, WEAR_BAND_LABEL, type VehicleState, type WearBand } from './state';
import { CATEGORY_LABEL } from './types';

/**
 * Visão de inspeção: o que a INTERFACE pode mostrar de um carro.
 * É montada só a partir do conhecimento do jogador; o desgaste real e o
 * histórico oculto nunca entram aqui. Assim a UI não tem como vazar segredo
 * (GDD Prompt 3 e 4).
 */
export type KnownState =
  | { kind: 'desconhecido' }
  | { kind: 'removida' }
  | { kind: 'avaliado'; band: WearBand; bandLabel: string; sourceLabel: string; kmSince: number; partName: string; partBrand: string; quality: string };

export interface CatalogOption {
  id: string;
  name: string;
  brand: string;
  quality: string;
  baseCost: Cents;
  replaceMinutes: number;
}

export interface InspectionRow {
  slotId: string;
  name: string;
  system: PartSystem;
  access: PartAccess;
  accessLabel: string;
  known: KnownState;
  /** Peças do catálogo que servem nesta posição deste carro. */
  compatible: CatalogOption[];
}

export interface InspectionGroup {
  system: PartSystem;
  label: string;
  rows: InspectionRow[];
}

export interface InspectionView {
  vehicleId: string;
  title: string;
  subtitle: string;
  plate: string;
  mileageKm: number;
  color: string;
  colorName: string;
  /** Só o histórico conhecido pelo jogador, do mais recente ao mais antigo. */
  history: Array<{ text: string; kmAgo: number }>;
  groups: InspectionGroup[];
  totals: { slots: number; evaluated: number };
}

export function buildInspectionView(v: VehicleState, catalogs: Catalogs): InspectionView {
  const model = catalogs.models.get(v.modelId);
  if (!model) throw new Error(`Modelo desconhecido: ${v.modelId}`);

  const groups = new Map<PartSystem, InspectionGroup>();
  let evaluated = 0;
  for (const slotId of model.slots) {
    const slot = catalogs.slots.get(slotId);
    if (!slot) continue;
    const k = v.knowledge[slotId] ?? { status: 'desconhecido' as const };
    let known: KnownState;
    if (k.status === 'avaliado') {
      evaluated++;
      const part = catalogs.parts.get(k.partId);
      known = {
        kind: 'avaliado',
        band: k.band,
        bandLabel: WEAR_BAND_LABEL[k.band],
        sourceLabel: KNOWLEDGE_SOURCE_LABEL[k.source],
        kmSince: Math.max(0, v.mileageKm - k.atKm),
        partName: part?.name ?? k.partId,
        partBrand: part?.brand ?? '—',
        quality: part ? QUALITY_LABEL[part.quality] : '—',
      };
    } else if (k.status === 'removida') {
      evaluated++;
      known = { kind: 'removida' };
    } else {
      known = { kind: 'desconhecido' };
    }

    const row: InspectionRow = {
      slotId,
      name: slot.name,
      system: slot.system,
      access: slot.access,
      accessLabel: ACCESS_LABEL[slot.access],
      known,
      compatible: compatiblePartsFor(v, slotId, catalogs).map((p) => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        quality: QUALITY_LABEL[p.quality],
        baseCost: p.baseCost,
        replaceMinutes: p.replaceMinutes,
      })),
    };
    let group = groups.get(slot.system);
    if (!group) {
      group = { system: slot.system, label: SYSTEM_LABEL[slot.system], rows: [] };
      groups.set(slot.system, group);
    }
    group.rows.push(row);
  }

  return {
    vehicleId: v.id,
    title: `${model.manufacturer} ${model.model}`,
    subtitle: `${CATEGORY_LABEL[model.category]} · ${v.year}`,
    plate: v.plate,
    mileageKm: v.mileageKm,
    color: v.color,
    colorName: v.colorName,
    history: v.history
      .filter((h) => h.disclosed)
      .map((h) => ({ text: h.text, kmAgo: Math.max(0, v.mileageKm - h.atKm) }))
      .reverse(),
    groups: [...groups.values()],
    totals: { slots: model.slots.length, evaluated },
  };
}
