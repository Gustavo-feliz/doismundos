import type { Cents } from '../economy/money';

/** Sistemas do carro (GDD §10.1). Só os usados pelas peças iniciais. */
export type PartSystem =
  | 'motor'
  | 'fluidos'
  | 'arrefecimento'
  | 'combustivel'
  | 'freios'
  | 'suspensao'
  | 'eletrica'
  | 'transmissao'
  | 'rodas';

/** Qualidade da peça (GDD §10.2). */
export type PartQuality = 'generica' | 'original' | 'performance';

/** Procedência da peça instalada — o que o GDD §10.2 chama de "condição". */
export type PartCondition = 'nova' | 'usada' | 'recondicionada';

/** Onde é preciso mexer para alcançar a peça (usado por diagnóstico e reparo). */
export type PartAccess = 'capo' | 'elevador' | 'externo';

/**
 * Posição no carro onde uma peça é instalada (ex.: "freios.pastilhas-dianteiras").
 * Um modelo de carro declara quais posições tem; uma peça declara em qual encaixa.
 */
export interface SlotDefinition {
  id: string;
  name: string;
  system: PartSystem;
  access: PartAccess;
  /** A inspeção visual revela o desgaste? (false = peça interna: só outros exames) */
  visual: boolean;
}

export interface CompatibilityRule {
  modelId: string;
  /** Anos-modelo aceitos, inclusive. */
  years: readonly [number, number];
}

/** Item do catálogo de peças. */
export interface PartDefinition {
  /** ID estável: nunca muda depois de publicado (saves e pedidos dependem dele). */
  id: string;
  name: string;
  /** Fabricante fictício (GDD §1.6). */
  brand: string;
  slot: string;
  system: PartSystem;
  quality: PartQuality;
  compatibility: readonly CompatibilityRule[];
  baseCost: Cents;
  scrapValue: Cents;
  /** Tempo de substituição, em minutos de jogo. */
  replaceMinutes: number;
  /** Vida útil média em km: define o desgaste por quilômetro rodado. */
  lifespanKm: number;
}

export const SYSTEM_LABEL: Readonly<Record<PartSystem, string>> = {
  motor: 'Motor',
  fluidos: 'Fluidos',
  arrefecimento: 'Arrefecimento',
  combustivel: 'Combustível',
  freios: 'Freios',
  suspensao: 'Suspensão',
  eletrica: 'Elétrica',
  transmissao: 'Transmissão',
  rodas: 'Rodas e pneus',
};

export const QUALITY_LABEL: Readonly<Record<PartQuality, string>> = {
  generica: 'Genérica',
  original: 'Original',
  performance: 'Performance',
};

export const CONDITION_LABEL: Readonly<Record<PartCondition, string>> = {
  nova: 'Nova',
  usada: 'Usada',
  recondicionada: 'Recondicionada',
};

export const ACCESS_LABEL: Readonly<Record<PartAccess, string>> = {
  capo: 'Pelo capô',
  elevador: 'Por baixo (elevador)',
  externo: 'Por fora',
};
