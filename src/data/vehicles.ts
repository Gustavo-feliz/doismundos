import type { VehicleDefinition } from '../vehicles/types';
import { PART_SLOTS } from './partSlots';

/** Os carros do protótipo usam todas as posições de peça iniciais. */
const ALL_SLOTS = PART_SLOTS.map((s) => s.id);

/**
 * Catálogo de MODELOS. Fabricantes e modelos são fictícios (GDD §1.6).
 * O Brisa é o carro da oficina no protótipo (GDD §2.2: "um carro").
 * O Faísca existe só em dados, para provar que a lógica atende modelos
 * diferentes sem duplicação (GDD Prompt 3); ainda não aparece na cena.
 */
export const VEHICLES: readonly VehicleDefinition[] = [
  {
    id: 'ventura-brisa-16',
    manufacturer: 'Ventura',
    model: 'Brisa 1.6',
    category: 'sedan',
    years: [2006, 2012],
    paintColor: '#7d1d1d',
    slots: ALL_SLOTS,
    dimensions: {
      length: 4.3,
      width: 1.72,
      height: 1.44,
      wheelbase: 2.55,
      wheelRadius: 0.31,
      track: 1.46,
    },
  },
  {
    id: 'lumen-faisca-10',
    manufacturer: 'Lumen',
    model: 'Faísca 1.0',
    category: 'popular',
    years: [2012, 2019],
    paintColor: '#c9c9c4',
    slots: ALL_SLOTS,
    dimensions: {
      length: 3.82,
      width: 1.64,
      height: 1.48,
      wheelbase: 2.43,
      wheelRadius: 0.29,
      track: 1.4,
    },
  },
];
