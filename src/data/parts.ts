import type { CompatibilityRule, PartDefinition } from '../parts/types';

/**
 * Catálogo inicial: 15 peças fictícias (GDD Prompt 3), uma para cada posição
 * do Ventura Brisa. Valores em centavos; tempos em minutos de jogo.
 * Marcas fictícias: Ventura Genuína (original), Brasaço (genérica), Corisco (performance).
 *
 * PROVISÓRIO: preços e vidas úteis são estimativas para o protótipo.
 * O balanceamento da economia é feito no Prompt 7.
 */
const BRISA: CompatibilityRule = { modelId: 'ventura-brisa-16', years: [2006, 2012] };
const FAISCA: CompatibilityRule = { modelId: 'lumen-faisca-10', years: [2012, 2019] };

/** Peças do Ventura Brisa (algumas também servem no Faísca). Vêm primeiro: o orçamento usa a primeira peça compatível. */
const BRISA_PARTS: readonly PartDefinition[] = [
  {
    id: 'vela-ignicao-brasaco-jogo4',
    name: 'Jogo de velas de ignição (4 un.)',
    brand: 'Brasaço',
    slot: 'motor.velas',
    system: 'motor',
    quality: 'generica',
    compatibility: [BRISA, FAISCA],
    baseCost: 89_90,
    scrapValue: 2_00,
    replaceMinutes: 30,
    lifespanKm: 40_000,
  },
  {
    id: 'correia-dentada-ventura-brisa',
    name: 'Correia dentada',
    brand: 'Ventura Genuína',
    slot: 'motor.correia-dentada',
    system: 'motor',
    quality: 'original',
    compatibility: [BRISA],
    baseCost: 189_00,
    scrapValue: 0,
    replaceMinutes: 150,
    lifespanKm: 60_000,
  },
  {
    id: 'filtro-ar-brasaco-brisa',
    name: 'Filtro de ar',
    brand: 'Brasaço',
    slot: 'motor.filtro-ar',
    system: 'motor',
    quality: 'generica',
    compatibility: [BRISA],
    baseCost: 39_90,
    scrapValue: 0,
    replaceMinutes: 10,
    lifespanKm: 15_000,
  },
  {
    id: 'filtro-oleo-ventura',
    name: 'Filtro de óleo',
    brand: 'Ventura Genuína',
    slot: 'motor.filtro-oleo',
    system: 'motor',
    quality: 'original',
    compatibility: [BRISA, FAISCA],
    baseCost: 32_00,
    scrapValue: 0,
    replaceMinutes: 15,
    lifespanKm: 10_000,
  },
  {
    id: 'oleo-5w30-sintetico-4l',
    name: 'Óleo 5W-30 sintético (4 L)',
    brand: 'Brasaço',
    slot: 'fluidos.oleo-motor',
    system: 'fluidos',
    quality: 'generica',
    compatibility: [BRISA, FAISCA],
    baseCost: 159_60,
    scrapValue: 0,
    replaceMinutes: 20,
    lifespanKm: 10_000,
  },
  {
    id: 'radiador-ventura-brisa',
    name: 'Radiador',
    brand: 'Ventura Genuína',
    slot: 'arrefecimento.radiador',
    system: 'arrefecimento',
    quality: 'original',
    compatibility: [BRISA],
    baseCost: 520_00,
    scrapValue: 60_00,
    replaceMinutes: 120,
    lifespanKm: 200_000,
  },
  {
    id: 'valvula-termostatica-brasaco-brisa',
    name: 'Válvula termostática',
    brand: 'Brasaço',
    slot: 'arrefecimento.valvula-termostatica',
    system: 'arrefecimento',
    quality: 'generica',
    compatibility: [BRISA],
    baseCost: 74_90,
    scrapValue: 0,
    replaceMinutes: 60,
    lifespanKm: 120_000,
  },
  {
    id: 'bomba-combustivel-ventura',
    name: 'Bomba de combustível',
    brand: 'Ventura Genuína',
    slot: 'combustivel.bomba',
    system: 'combustivel',
    quality: 'original',
    compatibility: [BRISA, FAISCA],
    baseCost: 289_00,
    scrapValue: 15_00,
    replaceMinutes: 90,
    lifespanKm: 150_000,
  },
  {
    id: 'pastilha-freio-diant-ventura-brisa',
    name: 'Pastilhas de freio dianteiras',
    brand: 'Ventura Genuína',
    slot: 'freios.pastilhas-dianteiras',
    system: 'freios',
    quality: 'original',
    compatibility: [BRISA],
    baseCost: 129_00,
    scrapValue: 0,
    replaceMinutes: 45,
    lifespanKm: 35_000,
  },
  {
    id: 'disco-freio-diant-brasaco-brisa',
    name: 'Discos de freio dianteiros (par)',
    brand: 'Brasaço',
    slot: 'freios.discos-dianteiros',
    system: 'freios',
    quality: 'generica',
    compatibility: [BRISA],
    baseCost: 239_80,
    scrapValue: 18_00,
    replaceMinutes: 60,
    lifespanKm: 70_000,
  },
  {
    id: 'amortecedor-diant-corisco-brisa',
    name: 'Amortecedores dianteiros esportivos (par)',
    brand: 'Corisco',
    slot: 'suspensao.amortecedores-dianteiros',
    system: 'suspensao',
    quality: 'performance',
    // Só serve na suspensão revisada a partir de 2008.
    compatibility: [{ modelId: 'ventura-brisa-16', years: [2008, 2012] }],
    baseCost: 698_00,
    scrapValue: 20_00,
    replaceMinutes: 120,
    lifespanKm: 80_000,
  },
  {
    id: 'bateria-60ah-brasaco',
    name: 'Bateria 60 Ah',
    brand: 'Brasaço',
    slot: 'eletrica.bateria',
    system: 'eletrica',
    quality: 'generica',
    compatibility: [BRISA, FAISCA],
    baseCost: 449_00,
    scrapValue: 45_00,
    replaceMinutes: 15,
    lifespanKm: 60_000,
  },
  {
    id: 'alternador-ventura-brisa',
    name: 'Alternador',
    brand: 'Ventura Genuína',
    slot: 'eletrica.alternador',
    system: 'eletrica',
    quality: 'original',
    compatibility: [BRISA],
    baseCost: 790_00,
    scrapValue: 80_00,
    replaceMinutes: 90,
    lifespanKm: 180_000,
  },
  {
    id: 'kit-embreagem-ventura-brisa',
    name: 'Kit de embreagem',
    brand: 'Ventura Genuína',
    slot: 'transmissao.kit-embreagem',
    system: 'transmissao',
    quality: 'original',
    compatibility: [BRISA],
    baseCost: 680_00,
    scrapValue: 25_00,
    replaceMinutes: 240,
    lifespanKm: 120_000,
  },
  {
    id: 'pneu-185-65-r15-brasaco-jogo4',
    name: 'Pneus 185/65 R15 (jogo com 4)',
    brand: 'Brasaço',
    slot: 'rodas.pneus',
    system: 'rodas',
    quality: 'generica',
    compatibility: [BRISA],
    baseCost: 1_196_00,
    scrapValue: 20_00,
    replaceMinutes: 40,
    lifespanKm: 50_000,
  },
  {
    // Prompt 12: a checagem de cobertura achou o Brisa 2006–2007 sem amortecedor no catálogo.
    id: 'amortecedor-diant-brasaco-brisa',
    name: 'Amortecedores dianteiros (par)',
    brand: 'Brasaço',
    slot: 'suspensao.amortecedores-dianteiros',
    system: 'suspensao',
    quality: 'generica',
    compatibility: [BRISA],
    baseCost: 420_00,
    scrapValue: 20_00,
    replaceMinutes: 120,
    lifespanKm: 80_000,
  },
];

// --- Linhas de peças (Prompt 12) ------------------------------------------------
// Em vez de uma peça por modelo copiada à mão, cada posição tem uma TABELA-base
// e três linhas (leve, média, pesada). Cada linha serve num grupo de modelos,
// com os anos de fabricação de cada um. A linha muda preço, tempo e vida útil.

type Line = 'leve' | 'media' | 'pesada';

const LINE_MODELS: Readonly<Record<Line, readonly CompatibilityRule[]>> = {
  leve: [FAISCA, { modelId: 'lumen-pingo-10', years: [1998, 2008] }, { modelId: 'ventura-ripa-14', years: [2010, 2017] }, { modelId: 'tupa-cometa-16', years: [2016, 2023] }],
  media: [{ modelId: 'atlantica-vento-20', years: [2014, 2021] }, { modelId: 'ventura-tropa-16', years: [2013, 2020] }],
  pesada: [{ modelId: 'tupa-jaguara-20', years: [2015, 2022] }, { modelId: 'more-sertao-28', years: [2008, 2016] }, { modelId: 'atlantica-carioca-van-20', years: [2010, 2018] }],
};

const LINE: Readonly<Record<Line, { label: string; cost: number; minutes: number; life: number; originalFirst: boolean }>> = {
  leve: { label: 'linha leve', cost: 0.8, minutes: 0.9, life: 1, originalFirst: false },
  media: { label: 'linha média', cost: 1, minutes: 1, life: 1, originalFirst: true },
  pesada: { label: 'linha pesada', cost: 1.6, minutes: 1.35, life: 1.15, originalFirst: true },
};

interface SlotBase {
  key: string;
  slot: string;
  system: PartDefinition['system'];
  name: string;
  /** Custo-base da genérica na linha média; a original custa 35% a mais. */
  cost: number;
  scrap: number;
  minutes: number;
  lifespanKm: number;
}

const SLOT_BASES: readonly SlotBase[] = [
  { key: 'vela-ignicao', slot: 'motor.velas', system: 'motor', name: 'Jogo de velas de ignição', cost: 89_90, scrap: 2_00, minutes: 30, lifespanKm: 40_000 },
  { key: 'correia-dentada', slot: 'motor.correia-dentada', system: 'motor', name: 'Correia dentada', cost: 150_00, scrap: 0, minutes: 150, lifespanKm: 60_000 },
  { key: 'filtro-ar', slot: 'motor.filtro-ar', system: 'motor', name: 'Filtro de ar', cost: 39_90, scrap: 0, minutes: 10, lifespanKm: 15_000 },
  { key: 'filtro-oleo', slot: 'motor.filtro-oleo', system: 'motor', name: 'Filtro de óleo', cost: 28_00, scrap: 0, minutes: 15, lifespanKm: 10_000 },
  { key: 'oleo-motor', slot: 'fluidos.oleo-motor', system: 'fluidos', name: 'Óleo do motor (troca completa)', cost: 159_60, scrap: 0, minutes: 20, lifespanKm: 10_000 },
  { key: 'radiador', slot: 'arrefecimento.radiador', system: 'arrefecimento', name: 'Radiador', cost: 420_00, scrap: 60_00, minutes: 120, lifespanKm: 200_000 },
  { key: 'valvula-termostatica', slot: 'arrefecimento.valvula-termostatica', system: 'arrefecimento', name: 'Válvula termostática', cost: 74_90, scrap: 0, minutes: 60, lifespanKm: 120_000 },
  { key: 'bomba-combustivel', slot: 'combustivel.bomba', system: 'combustivel', name: 'Bomba de combustível', cost: 230_00, scrap: 15_00, minutes: 90, lifespanKm: 150_000 },
  { key: 'pastilha-freio-diant', slot: 'freios.pastilhas-dianteiras', system: 'freios', name: 'Pastilhas de freio dianteiras', cost: 99_00, scrap: 0, minutes: 45, lifespanKm: 35_000 },
  { key: 'disco-freio-diant', slot: 'freios.discos-dianteiros', system: 'freios', name: 'Discos de freio dianteiros (par)', cost: 239_80, scrap: 18_00, minutes: 60, lifespanKm: 70_000 },
  { key: 'amortecedor-diant', slot: 'suspensao.amortecedores-dianteiros', system: 'suspensao', name: 'Amortecedores dianteiros (par)', cost: 420_00, scrap: 20_00, minutes: 120, lifespanKm: 80_000 },
  { key: 'bateria', slot: 'eletrica.bateria', system: 'eletrica', name: 'Bateria', cost: 449_00, scrap: 45_00, minutes: 15, lifespanKm: 60_000 },
  { key: 'alternador', slot: 'eletrica.alternador', system: 'eletrica', name: 'Alternador', cost: 600_00, scrap: 80_00, minutes: 90, lifespanKm: 180_000 },
  { key: 'kit-embreagem', slot: 'transmissao.kit-embreagem', system: 'transmissao', name: 'Kit de embreagem', cost: 520_00, scrap: 25_00, minutes: 240, lifespanKm: 120_000 },
  { key: 'pneus', slot: 'rodas.pneus', system: 'rodas', name: 'Pneus (jogo com 4)', cost: 1_000_00, scrap: 20_00, minutes: 40, lifespanKm: 50_000 },
];

/** O Jaguara trocou a suspensão dianteira em 2019: a peça da linha pesada só serve até 2018. */
const JAGUARA_OLD = { modelId: 'tupa-jaguara-20', years: [2015, 2018] } as const;
const JAGUARA_NEW = { modelId: 'tupa-jaguara-20', years: [2019, 2022] } as const;

function rulesFor(line: Line, slot: string): readonly CompatibilityRule[] {
  const rules = LINE_MODELS[line];
  if (line !== 'pesada' || slot !== 'suspensao.amortecedores-dianteiros') return rules;
  return rules.map((r) => (r.modelId === JAGUARA_OLD.modelId ? JAGUARA_OLD : r));
}

function linePart(b: SlotBase, line: Line, quality: 'generica' | 'original'): PartDefinition {
  const l = LINE[line];
  const factor = l.cost * (quality === 'original' ? 1.35 : 1);
  return {
    id: `${b.key}-${quality === 'original' ? 'original' : 'brasaco'}-${line}`,
    name: `${b.name} (${l.label})`,
    brand: quality === 'original' ? 'Genuína de fábrica' : 'Brasaço',
    slot: b.slot,
    system: b.system,
    quality,
    compatibility: rulesFor(line, b.slot),
    baseCost: Math.round((b.cost * factor) / 10) * 10,
    scrapValue: Math.round(b.scrap * l.cost),
    replaceMinutes: Math.round(b.minutes * l.minutes),
    lifespanKm: Math.round(b.lifespanKm * l.life),
  };
}

const LINE_PARTS: PartDefinition[] = SLOT_BASES.flatMap((b) =>
  (Object.keys(LINE) as Line[]).flatMap((line) => {
    const pair = [linePart(b, line, 'original'), linePart(b, line, 'generica')];
    return LINE[line].originalFirst ? pair : pair.reverse();
  }),
);

/** Amortecedor do Jaguara 2019+ (só original). */
const JAGUARA_SHOCKS: PartDefinition = {
  id: 'amortecedor-diant-original-jaguara-19',
  name: 'Amortecedores dianteiros Jaguara 2019+ (par)',
  brand: 'Genuína de fábrica',
  slot: 'suspensao.amortecedores-dianteiros',
  system: 'suspensao',
  quality: 'original',
  compatibility: [JAGUARA_NEW],
  baseCost: 980_00,
  scrapValue: 30_00,
  replaceMinutes: 150,
  lifespanKm: 90_000,
};

export const PARTS: readonly PartDefinition[] = [...BRISA_PARTS, ...LINE_PARTS, JAGUARA_SHOCKS];
