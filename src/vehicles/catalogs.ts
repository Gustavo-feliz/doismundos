import type { PartDefinition, SlotDefinition } from '../parts/types';
import { validatePartCatalog, validateSlots } from '../parts/validate';
import { validateVehicleCatalog, type VehicleDefinition } from './types';

/** Todos os catálogos de dados, já validados e indexados por id. */
export interface Catalogs {
  readonly models: ReadonlyMap<string, VehicleDefinition>;
  readonly parts: ReadonlyMap<string, PartDefinition>;
  readonly slots: ReadonlyMap<string, SlotDefinition>;
}

/** Valida tudo (na ordem das dependências) e indexa. Lança DataValidationError com a lista de problemas. */
export function buildCatalogs(
  models: readonly VehicleDefinition[],
  parts: readonly PartDefinition[],
  slots: readonly SlotDefinition[],
): Catalogs {
  validateSlots(slots);
  validateVehicleCatalog(models, new Set(slots.map((s) => s.id)));
  validatePartCatalog(parts, slots, models);
  return {
    models: new Map(models.map((m) => [m.id, m])),
    parts: new Map(parts.map((p) => [p.id, p])),
    slots: new Map(slots.map((s) => [s.id, s])),
  };
}
