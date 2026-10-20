import type { FunctionalTestDef, ScannerDef } from '../diagnostics/types';

/**
 * Exames de diagnóstico (GDD §11.2, subconjunto do Prompt 4).
 * Sem simulação física nem OBD real: cada resultado é uma regra simples sobre
 * o estado REAL das peças. Códigos de falha são fictícios.
 *
 * `effects` = quanto o resultado soma (ou tira) de cada hipótese, por posição.
 */
const S = {
  velas: 'motor.velas',
  oleo: 'fluidos.oleo-motor',
  radiador: 'arrefecimento.radiador',
  termostatica: 'arrefecimento.valvula-termostatica',
  pastilhas: 'freios.pastilhas-dianteiras',
  discos: 'freios.discos-dianteiros',
  amortecedores: 'suspensao.amortecedores-dianteiros',
  bateria: 'eletrica.bateria',
  alternador: 'eletrica.alternador',
} as const;

export const SCANNER: ScannerDef = {
  name: 'Scanner de diagnóstico',
  description: 'Ler os códigos de falha guardados na central do motor.',
  minutes: 15,
  requires: [],
  codes: [
    {
      code: 'T-128',
      text: 'temperatura do motor fora do padrão',
      when: { slot: S.termostatica, minBand: 'critica' },
      effects: { [S.termostatica]: 3, [S.radiador]: 1 },
    },
    {
      code: 'E-562',
      text: 'tensão do sistema elétrico baixa com o motor ligado',
      when: { slot: S.alternador, minBand: 'critica' },
      effects: { [S.alternador]: 3, [S.bateria]: 1 },
    },
    {
      code: 'I-301',
      text: 'falha de ignição intermitente',
      when: { slot: S.velas, minBand: 'critica' },
      effects: { [S.velas]: 3 },
    },
  ],
  noCodesText: 'Nenhum código de falha guardado na central.',
  // Sem código, ficam menos prováveis as peças que a central monitora.
  noCodesEffects: { [S.termostatica]: -1, [S.alternador]: -1, [S.velas]: -1 },
};

export const FUNCTIONAL_TESTS: readonly FunctionalTestDef[] = [
  {
    id: 'teste-frenagem',
    name: 'Teste de frenagem',
    description: 'Andar devagar pelo pátio e frear algumas vezes, prestando atenção no barulho.',
    minutes: 15,
    requires: ['elevador-embaixo'],
    outcomes: [
      { when: { slot: S.pastilhas, minBand: 'critica' }, text: 'Chiado metálico agudo ao frear, mais forte no começo da frenagem.', effects: { [S.pastilhas]: 4 } },
      { when: { slot: S.discos, minBand: 'critica' }, text: 'O pedal trepida e o volante vibra nas frenagens mais fortes.', effects: { [S.discos]: 3, [S.pastilhas]: -1 } },
      { when: { slot: S.amortecedores, minBand: 'critica' }, text: 'A frente mergulha muito ao frear, mas sem barulho de atrito.', effects: { [S.amortecedores]: 2, [S.pastilhas]: -1, [S.discos]: -1 } },
      { text: 'Freio silencioso e firme.', effects: { [S.pastilhas]: -2, [S.discos]: -2 } },
    ],
  },
  {
    id: 'teste-temperatura',
    name: 'Teste de temperatura em marcha lenta',
    description: 'Deixar o motor ligado, acompanhar o ponteiro e sentir as mangueiras do radiador.',
    minutes: 20,
    requires: ['capo-aberto'],
    outcomes: [
      {
        when: { slot: S.termostatica, minBand: 'critica' },
        text: 'O ponteiro sobe rápido, mas a mangueira de cima do radiador continua fria: o líquido não está circulando.',
        effects: { [S.termostatica]: 4, [S.radiador]: -1 },
      },
      {
        when: { slot: S.radiador, minBand: 'critica' },
        text: 'Mangueiras quentes, mas a temperatura só baixa com a ventoinha forçada: o radiador troca pouco calor.',
        effects: { [S.radiador]: 3, [S.termostatica]: -1 },
      },
      { when: { slot: S.oleo, minBand: 'critica' }, text: 'Temperatura no limite e cheiro de óleo queimado.', effects: { [S.oleo]: 3 } },
      { text: 'A temperatura estabiliza no meio da escala.', effects: { [S.termostatica]: -1, [S.radiador]: -1 } },
    ],
  },
  {
    id: 'teste-carga',
    name: 'Teste de carga (multímetro)',
    description: 'Medir a tensão da bateria com o carro desligado e com o motor ligado.',
    minutes: 10,
    requires: ['capo-aberto'],
    outcomes: [
      {
        when: { slot: S.alternador, minBand: 'critica' },
        text: 'Desligado: 12,4 V. Com o motor ligado, cai para 12,1 V: o alternador não está carregando.',
        effects: { [S.alternador]: 4, [S.bateria]: -2 },
      },
      {
        when: { slot: S.bateria, minBand: 'critica' },
        text: 'Desligado: 11,9 V. Com o motor ligado: 14,2 V. O alternador carrega, mas a bateria não segura carga.',
        effects: { [S.bateria]: 4, [S.alternador]: -2 },
      },
      {
        when: { slot: S.velas, minBand: 'critica' },
        text: 'Tensões normais (12,6 V → 14,1 V), mas a partida engasga.',
        effects: { [S.velas]: 2, [S.bateria]: -1, [S.alternador]: -1 },
      },
      { text: 'Tensões normais: 12,6 V desligado, 14,1 V com o motor ligado.', effects: { [S.bateria]: -1, [S.alternador]: -1 } },
    ],
  },
];
