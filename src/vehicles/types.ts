/**
 * Definição de um MODELO de veículo (dados de catálogo, não lógica — GDD §21.3).
 * O estado de um carro específico (placa, km, peças, histórico) fica em
 * vehicles/state.ts.
 */
export type VehicleCategory = 'popular' | 'hatch' | 'sedan' | 'suv' | 'picape' | 'van';

export const CATEGORY_LABEL: Readonly<Record<VehicleCategory, string>> = {
  popular: 'Popular',
  hatch: 'Hatch',
  sedan: 'Sedã',
  suv: 'SUV',
  picape: 'Picape',
  van: 'Van',
};

export interface VehicleDimensions {
  /** metros */
  length: number;
  width: number;
  height: number;
  wheelbase: number;
  wheelRadius: number;
  /** distância entre as rodas de um mesmo eixo */
  track: number;
}

export interface VehicleDefinition {
  id: string;
  /** Fabricante fictício (GDD §1.6: sem marcas reais sem licença). */
  manufacturer: string;
  model: string;
  category: VehicleCategory;
  /** Anos-modelo em que foi fabricado, inclusive. */
  years: readonly [number, number];
  dimensions: VehicleDimensions;
  /** Cor de fábrica mais comum, "#rrggbb". Cada carro pode ter a sua. */
  paintColor: string;
  /** Posições de peça que este modelo tem (ids de data/partSlots.ts). */
  slots: readonly string[];
  /** Valor de mercado de um exemplar novo, em centavos (enciclopédia e futuras compras). */
  baseValue: number;
  /** Texto curto da enciclopédia. */
  blurb: string;
}

export class DataValidationError extends Error {
  constructor(source: string, problems: readonly string[]) {
    super(`Dados inválidos em ${source}:\n- ${problems.join('\n- ')}`);
    this.name = 'DataValidationError';
  }
}

const CATEGORIES = Object.keys(CATEGORY_LABEL);
export const ID_PATTERN = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function validYearRange(years: unknown): years is readonly [number, number] {
  if (!Array.isArray(years) || years.length !== 2) return false;
  const [a, b] = years as unknown[];
  return Number.isInteger(a) && Number.isInteger(b) && (a as number) >= 1950 && (b as number) <= 2100 && (a as number) <= (b as number);
}

/** Lista os problemas de uma definição (vazia = válida). */
export function findVehicleProblems(def: VehicleDefinition, knownSlots: ReadonlySet<string>): string[] {
  const p: string[] = [];
  const where = def.id ? `veículo "${def.id}"` : 'veículo sem id';
  if (!def.id || !ID_PATTERN.test(def.id)) p.push(`${where}: id deve usar só a-z, 0-9 e hífen`);
  if (!def.manufacturer?.trim()) p.push(`${where}: fabricante vazio`);
  if (!def.model?.trim()) p.push(`${where}: modelo vazio`);
  if (!CATEGORIES.includes(def.category)) p.push(`${where}: categoria desconhecida (${String(def.category)})`);
  if (!validYearRange(def.years)) p.push(`${where}: anos inválidos (use [inicial, final] entre 1950 e 2100)`);
  if (!HEX_COLOR.test(def.paintColor ?? '')) p.push(`${where}: paintColor deve ser "#rrggbb"`);
  if (!Number.isSafeInteger(def.baseValue) || def.baseValue <= 0) p.push(`${where}: valor-base deve ser inteiro em centavos > 0`);
  if (!def.blurb?.trim()) p.push(`${where}: texto da enciclopédia vazio`);

  if (!Array.isArray(def.slots) || def.slots.length === 0) p.push(`${where}: lista de posições de peça vazia`);
  else {
    const seen = new Set<string>();
    for (const slot of def.slots) {
      if (!knownSlots.has(slot)) p.push(`${where}: posição de peça desconhecida "${slot}"`);
      if (seen.has(slot)) p.push(`${where}: posição repetida "${slot}"`);
      seen.add(slot);
    }
  }

  const d = def.dimensions;
  if (!d) {
    p.push(`${where}: dimensions ausente`);
    return p;
  }
  const before = p.length;
  for (const key of ['length', 'width', 'height', 'wheelbase', 'wheelRadius', 'track'] as const) {
    if (!positive(d[key])) p.push(`${where}: dimensions.${key} deve ser um número positivo`);
  }
  if (p.length > before) return p;
  if (d.wheelbase >= d.length) p.push(`${where}: entre-eixos (${d.wheelbase}) precisa ser menor que o comprimento (${d.length})`);
  if (d.track >= d.width) p.push(`${where}: bitola (${d.track}) precisa ser menor que a largura (${d.width})`);
  if (d.wheelRadius * 2 >= d.height) p.push(`${where}: rodas maiores que a altura do carro`);
  return p;
}

/** Valida o catálogo inteiro e falha com uma mensagem útil (GDD §21.3). */
export function validateVehicleCatalog(
  defs: readonly VehicleDefinition[],
  knownSlots: ReadonlySet<string>,
  source = 'data/vehicles.ts',
): void {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const def of defs) {
    problems.push(...findVehicleProblems(def, knownSlots));
    if (seen.has(def.id)) problems.push(`id duplicado: "${def.id}"`);
    seen.add(def.id);
  }
  if (defs.length === 0) problems.push('catálogo vazio');
  if (problems.length) throw new DataValidationError(source, problems);
}
