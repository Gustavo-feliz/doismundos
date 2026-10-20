import type { SlotDefinition } from '../parts/types';

/**
 * Posições de peça usadas pelos carros do protótipo (15, uma por peça inicial).
 * IDs estáveis no formato "sistema.nome".
 * `visual`: se uma inspeção visual consegue avaliar o desgaste (peças internas não).
 */
export const PART_SLOTS: readonly SlotDefinition[] = [
  { id: 'motor.velas', name: 'Velas de ignição', system: 'motor', access: 'capo', visual: true },
  { id: 'motor.correia-dentada', name: 'Correia dentada', system: 'motor', access: 'capo', visual: true },
  { id: 'motor.filtro-ar', name: 'Filtro de ar', system: 'motor', access: 'capo', visual: true },
  { id: 'motor.filtro-oleo', name: 'Filtro de óleo', system: 'motor', access: 'elevador', visual: false },
  { id: 'fluidos.oleo-motor', name: 'Óleo do motor', system: 'fluidos', access: 'capo', visual: true },
  { id: 'arrefecimento.radiador', name: 'Radiador', system: 'arrefecimento', access: 'capo', visual: true },
  { id: 'arrefecimento.valvula-termostatica', name: 'Válvula termostática', system: 'arrefecimento', access: 'capo', visual: false },
  { id: 'combustivel.bomba', name: 'Bomba de combustível', system: 'combustivel', access: 'elevador', visual: false },
  { id: 'freios.pastilhas-dianteiras', name: 'Pastilhas de freio dianteiras', system: 'freios', access: 'externo', visual: true },
  { id: 'freios.discos-dianteiros', name: 'Discos de freio dianteiros', system: 'freios', access: 'externo', visual: true },
  { id: 'suspensao.amortecedores-dianteiros', name: 'Amortecedores dianteiros', system: 'suspensao', access: 'elevador', visual: true },
  { id: 'eletrica.bateria', name: 'Bateria', system: 'eletrica', access: 'capo', visual: true },
  { id: 'eletrica.alternador', name: 'Alternador', system: 'eletrica', access: 'capo', visual: false },
  { id: 'transmissao.kit-embreagem', name: 'Kit de embreagem', system: 'transmissao', access: 'elevador', visual: false },
  { id: 'rodas.pneus', name: 'Pneus', system: 'rodas', access: 'externo', visual: true },
];
