import type { UpgradeDef } from '../upgrades/rules';

/**
 * Ferramentas e upgrades da carreira inicial (Prompt 11): 2 ferramentas e 3
 * melhorias da oficina, 3 níveis cada. A segunda vaga/elevador fica para depois.
 * PROVISÓRIO: valores de balanceamento (tabela em docs/balanceamento.md).
 */
export const UPGRADES: readonly UpgradeDef[] = [
  {
    id: 'chave-impacto',
    kind: 'ferramenta',
    name: 'Chave de impacto',
    description: 'Solta parafuso emperrado em segundos. Acelera a remoção das peças velhas.',
    effect: 'remocao',
    exampleMinutes: 30,
    levels: [
      { cost: 280_00, reductionPct: 20, minReputation: 0 },
      { cost: 750_00, reductionPct: 35, minReputation: 0 },
      { cost: 1_800_00, reductionPct: 50, minReputation: 60 },
    ],
  },
  {
    id: 'scanner',
    kind: 'ferramenta',
    name: 'Scanner automotivo',
    description: 'Lê a central do carro mais rápido e sem ficar caçando cabo.',
    effect: 'exame-scanner',
    exampleMinutes: 15,
    levels: [
      { cost: 350_00, reductionPct: 20, minReputation: 0 },
      { cost: 900_00, reductionPct: 40, minReputation: 0 },
      { cost: 2_000_00, reductionPct: 60, minReputation: 60 },
    ],
  },
  {
    id: 'iluminacao',
    kind: 'oficina',
    name: 'Iluminação',
    description: 'Lâmpadas fortes no box e luz de inspeção: dá para ver peça gasta de primeira.',
    effect: 'exame-visual',
    exampleMinutes: 10,
    levels: [
      { cost: 220_00, reductionPct: 20, minReputation: 0 },
      { cost: 600_00, reductionPct: 35, minReputation: 0 },
      { cost: 1_400_00, reductionPct: 50, minReputation: 55 },
    ],
  },
  {
    id: 'armario-ferramentas',
    kind: 'oficina',
    name: 'Armário de ferramentas',
    description: 'Cada ferramenta no seu lugar. Montar a peça nova vira rotina.',
    effect: 'instalacao',
    exampleMinutes: 30,
    levels: [
      { cost: 300_00, reductionPct: 15, minReputation: 0 },
      { cost: 800_00, reductionPct: 30, minReputation: 0 },
      { cost: 1_700_00, reductionPct: 45, minReputation: 60 },
    ],
  },
  {
    id: 'organizacao-estoque',
    kind: 'oficina',
    name: 'Organização do estoque',
    description: 'Estante etiquetada por tipo de peça: acabou a caça ao tesouro.',
    effect: 'pegar-peca',
    exampleMinutes: 6,
    levels: [
      { cost: 150_00, reductionPct: 35, minReputation: 0 },
      { cost: 450_00, reductionPct: 65, minReputation: 0 },
      { cost: 1_000_00, reductionPct: 85, minReputation: 55 },
    ],
  },
];

/** Tempo para achar e pegar uma peça na estante sem organização (min). */
export const TAKE_PART_MINUTES = 6;
