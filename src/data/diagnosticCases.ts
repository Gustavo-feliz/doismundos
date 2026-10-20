import type { DiagnosticCaseDef } from '../diagnostics/types';
import type { InstalledPart } from '../vehicles/state';
import { DEMO_VEHICLES } from './demoVehicles';
import { PARTS } from './parts';

/**
 * Os 3 problemas de demonstração do Prompt 4. Sempre os mesmos (determinísticos).
 * Cada um tem uma causa real escondida e "pistas falsas" naturais: outras
 * peças gastas que o jogador pode confundir com o defeito.
 */

/** Peça padrão do Brisa em cada posição (o catálogo tem uma por posição). */
const BRISA_PART: Readonly<Record<string, string>> = Object.fromEntries(
  PARTS.filter((p) => p.compatibility.some((r) => r.modelId === 'ventura-brisa-16')).map((p) => [p.slot, p.id]),
);

/**
 * Peças de um Brisa com desgaste coerente com os km rodados desde cada troca.
 * `faults` sobrescreve o desgaste de peças que quebraram antes da hora.
 */
function brisaParts(mileageKm: number, installedAtKm: Readonly<Record<string, number>>, faults: Readonly<Record<string, number>> = {}) {
  const parts: Record<string, InstalledPart> = {};
  for (const [slot, at] of Object.entries(installedAtKm)) {
    const partId = BRISA_PART[slot]!;
    const lifespan = PARTS.find((p) => p.id === partId)!.lifespanKm;
    const wear = faults[slot] ?? Math.min(100, Math.round(((mileageKm - at) / lifespan) * 1000) / 10);
    parts[slot] = { partId, condition: 'nova', wear, installedAtKm: at };
  }
  return parts;
}

const PADS = 'freios.pastilhas-dianteiras';
const DISCS = 'freios.discos-dianteiros';
const SHOCKS = 'suspensao.amortecedores-dianteiros';
const THERMOSTAT = 'arrefecimento.valvula-termostatica';
const RADIATOR = 'arrefecimento.radiador';
const OIL = 'fluidos.oleo-motor';
const BATTERY = 'eletrica.bateria';
const ALTERNATOR = 'eletrica.alternador';
const PLUGS = 'motor.velas';

export const DIAGNOSTIC_CASES: readonly DiagnosticCaseDef[] = [
  {
    id: 'os-001-freio',
    orderNumber: '001',
    customerName: 'Marcão',
    complaint: 'Ô, chefe, tá fazendo um barulho feio quando eu freio. Um chiado fino, sabe?',
    summary: 'Barulho ao frear',
    // O carro de demonstração do Prompt 3: pastilhas críticas, discos e amortecedores gastos.
    vehicle: DEMO_VEHICLES[0]!,
    hypotheses: [
      { slot: PADS, prior: 2 },
      { slot: DISCS, prior: 2 },
      { slot: SHOCKS, prior: 1 },
    ],
    trueCause: PADS,
    functionalTests: ['teste-frenagem'],
    customerId: 'marcao',
    finalTest: { resolved: 'Freio silencioso e firme: o chiado sumiu.', persists: 'O chiado metálico continua ao frear.' },
    hints: [
      { testId: `visual:${PADS}`, text: 'Seu Zé: “Chiado fino ao frear? Eu começaria olhando as pastilhas. Dá pra ver pela roda.”' },
      { testId: 'teste-frenagem', text: 'Seu Zé: “Dá umas freadas com ele no pátio e presta atenção no tipo de barulho.”' },
    ],
  },
  {
    id: 'os-002-temperatura',
    orderNumber: '002',
    customerName: 'Seu Jorge',
    complaint: 'O ponteiro da temperatura sobe no trânsito e ele já ferveu duas vezes. Na estrada até que vai.',
    summary: 'Esquentando no trânsito',
    vehicle: {
      id: 'os002-brisa-jorge',
      modelId: 'ventura-brisa-16',
      year: 2011,
      plate: 'TMP1B22',
      color: '#2b4a5e',
      colorName: 'Azul petróleo',
      mileageKm: 96_400,
      parts: brisaParts(
        96_400,
        {
          'motor.velas': 60_000,
          'motor.correia-dentada': 60_000,
          'motor.filtro-ar': 90_000,
          'motor.filtro-oleo': 95_000,
          [OIL]: 95_000,
          [RADIATOR]: 0,
          [THERMOSTAT]: 0,
          'combustivel.bomba': 0,
          [PADS]: 80_000,
          [DISCS]: 50_000,
          [SHOCKS]: 50_000,
          [BATTERY]: 70_000,
          [ALTERNATOR]: 0,
          'transmissao.kit-embreagem': 0,
          'rodas.pneus': 70_000,
        },
        { [THERMOSTAT]: 100 }, // travou fechada
      ),
      known: {
        'motor.filtro-oleo': { status: 'avaliado', band: 'boa', source: 'historico', atKm: 95_000, partId: 'filtro-oleo-ventura' },
        [OIL]: { status: 'avaliado', band: 'boa', source: 'historico', atKm: 95_000, partId: 'oleo-5w30-sintetico-4l' },
      },
      history: [{ kind: 'manutencao', atKm: 95_000, day: null, text: 'Troca de óleo e filtro num posto de gasolina', disclosed: true }],
    },
    hypotheses: [
      { slot: THERMOSTAT, prior: 2 },
      { slot: RADIATOR, prior: 2 },
      { slot: OIL, prior: 1 },
    ],
    trueCause: THERMOSTAT,
    functionalTests: ['teste-temperatura'],
    customerId: 'jorge',
    finalTest: {
      resolved: 'A temperatura estabiliza no meio da escala e as mangueiras aquecem por igual.',
      persists: 'O ponteiro continua subindo em marcha lenta e a mangueira de cima segue fria.',
    },
    hints: [
      { testId: 'teste-temperatura', text: 'Seu Zé: “Esquenta parado? Abre o capô, deixa ele em marcha lenta e sente as mangueiras.”' },
      { testId: 'scanner', text: 'Seu Zé: “Pluga o scanner. Às vezes a central já guardou alguma coisa.”' },
    ],
  },
  {
    id: 'os-003-partida',
    orderNumber: '003',
    customerName: 'Dona Cida',
    complaint: 'Toda manhã é a mesma novela: ele não quer pegar. Já dei carga na bateria duas vezes!',
    summary: 'Não pega de manhã',
    vehicle: {
      id: 'os003-brisa-cida',
      modelId: 'ventura-brisa-16',
      year: 2010,
      plate: 'TMP2C33',
      color: '#b9bcc0',
      colorName: 'Prata',
      mileageKm: 121_800,
      parts: brisaParts(
        121_800,
        {
          [PLUGS]: 100_000,
          'motor.correia-dentada': 80_000,
          'motor.filtro-ar': 115_000,
          'motor.filtro-oleo': 118_000,
          [OIL]: 118_000,
          [RADIATOR]: 0,
          [THERMOSTAT]: 60_000,
          'combustivel.bomba': 50_000,
          [PADS]: 100_000,
          [DISCS]: 60_000,
          [SHOCKS]: 60_000,
          [BATTERY]: 95_000,
          [ALTERNATOR]: 0,
          'transmissao.kit-embreagem': 40_000,
          'rodas.pneus': 100_000,
        },
        { [ALTERNATOR]: 92 }, // diodos queimados
      ),
      known: {
        [BATTERY]: { status: 'avaliado', band: 'boa', source: 'historico', atKm: 95_000, partId: 'bateria-60ah-brasaco' },
      },
      history: [
        { kind: 'manutencao', atKm: 95_000, day: null, text: 'Bateria nova instalada (nota da loja de baterias)', disclosed: true },
        { kind: 'manutencao', atKm: 118_000, day: null, text: 'Troca de óleo e filtro', disclosed: true },
      ],
    },
    hypotheses: [
      { slot: BATTERY, prior: 3 },
      { slot: ALTERNATOR, prior: 2 },
      { slot: PLUGS, prior: 1 },
    ],
    trueCause: ALTERNATOR,
    functionalTests: ['teste-carga'],
    customerId: 'cida',
    finalTest: { resolved: 'Com o motor ligado: 14,1 V. O sistema está carregando.', persists: 'A tensão continua caindo com o motor ligado.' },
    hints: [
      { testId: 'teste-carga', text: 'Seu Zé: “Bateria que descarrega toda hora nem sempre é culpa dela. Mede a tensão com o motor ligado.”' },
      { testId: 'scanner', text: 'Seu Zé: “Vê se a central acusou alguma coisa no elétrico.”' },
    ],
  },
];
