import type { Catalogs } from './catalogs';
import { assertValidVehicleState, type HistoryEntry, type InstalledPart, type PartKnowledge, type VehicleState } from './state';

/** Descrição compacta de um carro (dados de demonstração, futuros clientes). */
export interface VehicleSpec {
  id: string;
  modelId: string;
  year: number;
  plate: string;
  /** Se omitida, usa a cor de fábrica do modelo. */
  color?: string;
  colorName?: string;
  mileageKm: number;
  parts: Readonly<Record<string, InstalledPart | null>>;
  /** O que o jogador já sabe ao receber o carro. O resto começa "desconhecido". */
  known?: Readonly<Record<string, PartKnowledge>>;
  history?: readonly HistoryEntry[];
}

/** Monta e valida um VehicleState. Lança DataValidationError com todos os problemas. */
export function createVehicleState(spec: VehicleSpec, catalogs: Catalogs, source = 'dados do veículo'): VehicleState {
  const model = catalogs.models.get(spec.modelId);
  const knowledge: Record<string, PartKnowledge> = {};
  for (const slot of model?.slots ?? []) knowledge[slot] = spec.known?.[slot] ?? { status: 'desconhecido' };
  for (const [slot, k] of Object.entries(spec.known ?? {})) knowledge[slot] = k; // posições inválidas aparecem na validação

  const state: VehicleState = {
    id: spec.id,
    modelId: spec.modelId,
    year: spec.year,
    plate: spec.plate,
    color: spec.color ?? model?.paintColor ?? '#808080',
    colorName: spec.colorName ?? 'Não informada',
    mileageKm: spec.mileageKm,
    parts: { ...spec.parts },
    knowledge,
    history: [...(spec.history ?? [])],
  };
  assertValidVehicleState(state, catalogs, source);
  return state;
}
