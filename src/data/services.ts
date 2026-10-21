import type { ServiceTemplate } from '../procedural/types';

/**
 * Serviços que o gerador de OS sabe montar (Prompt 12). Cada um é um defeito
 * com causa real, hipóteses (pistas falsas), exames que o revelam e,
 * às vezes, uma ferramenta exigida para o reparo. Reaproveita os exames de
 * data/diagnostics.ts: nada de lógica nova por serviço.
 * PROVISÓRIO: textos e faixas de desgaste.
 */
const PADS = 'freios.pastilhas-dianteiras';
const DISCS = 'freios.discos-dianteiros';
const SHOCKS = 'suspensao.amortecedores-dianteiros';
const THERMOSTAT = 'arrefecimento.valvula-termostatica';
const RADIATOR = 'arrefecimento.radiador';
const OIL = 'fluidos.oleo-motor';
const BATTERY = 'eletrica.bateria';
const ALTERNATOR = 'eletrica.alternador';
const PLUGS = 'motor.velas';

export const SERVICE_TEMPLATES: readonly ServiceTemplate[] = [
  {
    id: 'freio-chiando',
    title: 'Barulho ao frear',
    complaints: ['Tá chiando toda vez que eu freio. Um barulho fino, de ferro.', 'O freio começou a apitar. Na descida é pior.'],
    cause: PADS,
    hypotheses: [{ slot: PADS, prior: 2 }, { slot: DISCS, prior: 2 }, { slot: SHOCKS, prior: 1 }],
    functionalTests: ['teste-frenagem'],
    causeWear: [82, 97],
    requiredTools: [],
    categories: null,
    finalTest: { resolved: 'Freio silencioso e firme: o chiado sumiu.', persists: 'O chiado metálico continua ao frear.' },
    hints: [{ testId: 'teste-frenagem', text: 'Seu Zé: “Faz umas freadas no pátio e escuta o tipo de barulho.”' }],
  },
  {
    id: 'freio-trepidando',
    title: 'Freio trepidando',
    complaints: ['Quando eu freio forte, o volante treme todo.', 'O pedal do freio fica pulando na hora de parar.'],
    cause: DISCS,
    hypotheses: [{ slot: DISCS, prior: 2 }, { slot: PADS, prior: 2 }, { slot: SHOCKS, prior: 1 }],
    functionalTests: ['teste-frenagem'],
    causeWear: [80, 96],
    requiredTools: [],
    categories: null,
    finalTest: { resolved: 'Freada lisa: a trepidação sumiu.', persists: 'O pedal continua trepidando nas freadas.' },
    hints: [{ testId: 'teste-frenagem', text: 'Seu Zé: “Trepidação? Sente o pedal numas freadas mais fortes.”' }],
  },
  {
    id: 'suspensao-mergulhando',
    title: 'Frente afunda ao frear',
    complaints: ['Toda freada a frente do carro mergulha. Parece um barco.', 'Passo num buraco e o carro fica quicando.'],
    cause: SHOCKS,
    hypotheses: [{ slot: SHOCKS, prior: 2 }, { slot: PADS, prior: 1 }, { slot: DISCS, prior: 1 }],
    functionalTests: ['teste-frenagem'],
    causeWear: [80, 95],
    // Amortecedor preso por porca enferrujada: sem chave de impacto não sai.
    requiredTools: [{ upgradeId: 'chave-impacto', level: 1 }],
    categories: null,
    finalTest: { resolved: 'A frente fica firme nas freadas.', persists: 'A frente continua mergulhando ao frear.' },
    hints: [{ testId: 'teste-frenagem', text: 'Seu Zé: “Repara se tem barulho ou se é só a frente afundando.”' }],
  },
  {
    id: 'esquentando-termostato',
    title: 'Esquentando no trânsito',
    complaints: ['No engarrafamento o ponteiro sobe e eu tenho que encostar.', 'Esquentou de novo na Avenida Brasil. Na estrada vai normal.'],
    cause: THERMOSTAT,
    hypotheses: [{ slot: THERMOSTAT, prior: 2 }, { slot: RADIATOR, prior: 2 }, { slot: OIL, prior: 1 }],
    functionalTests: ['teste-temperatura'],
    causeWear: [90, 100],
    requiredTools: [],
    categories: null,
    finalTest: { resolved: 'A temperatura estabiliza no meio da escala.', persists: 'O ponteiro continua subindo em marcha lenta.' },
    hints: [{ testId: 'teste-temperatura', text: 'Seu Zé: “Deixa em marcha lenta com o capô aberto e sente as mangueiras.”' }],
  },
  {
    id: 'esquentando-radiador',
    title: 'Temperatura alta',
    complaints: ['A ventoinha não para de ligar e mesmo assim esquenta.', 'Tô completando água toda semana e o motor esquenta.'],
    cause: RADIATOR,
    hypotheses: [{ slot: RADIATOR, prior: 2 }, { slot: THERMOSTAT, prior: 2 }, { slot: OIL, prior: 1 }],
    functionalTests: ['teste-temperatura'],
    causeWear: [85, 98],
    // Radiador grande, cheio de conexão: sem as ferramentas organizadas é serviço perdido.
    requiredTools: [{ upgradeId: 'armario-ferramentas', level: 1 }],
    categories: null,
    finalTest: { resolved: 'A temperatura baixa normalmente com a ventoinha.', persists: 'A temperatura segue alta mesmo com a ventoinha ligada.' },
    hints: [{ testId: 'teste-temperatura', text: 'Seu Zé: “Mangueira quente e motor quente? Olha a troca de calor do radiador.”' }],
  },
  {
    id: 'oleo-vencido',
    title: 'Cheiro de queimado',
    complaints: ['Tá saindo um cheiro de óleo queimado do capô.', 'O motor tá mais barulhento e com cheiro de queimado.'],
    cause: OIL,
    hypotheses: [{ slot: OIL, prior: 2 }, { slot: THERMOSTAT, prior: 1 }, { slot: RADIATOR, prior: 1 }],
    functionalTests: ['teste-temperatura'],
    causeWear: [85, 100],
    requiredTools: [],
    categories: null,
    finalTest: { resolved: 'Óleo novo: sem cheiro e o motor mais macio.', persists: 'O cheiro de queimado continua.' },
    hints: [{ testId: `visual:${OIL}`, text: 'Seu Zé: “Puxa a vareta e olha a cor desse óleo.”' }],
  },
  {
    id: 'partida-alternador',
    title: 'Bateria arriando',
    complaints: ['Troquei a bateria e mesmo assim ela arria.', 'A luz da bateria acende no painel com o carro andando.'],
    cause: ALTERNATOR,
    hypotheses: [{ slot: BATTERY, prior: 3 }, { slot: ALTERNATOR, prior: 2 }, { slot: PLUGS, prior: 1 }],
    functionalTests: ['teste-carga'],
    causeWear: [85, 98],
    requiredTools: [],
    categories: null,
    finalTest: { resolved: 'Com o motor ligado: 14,1 V. Está carregando.', persists: 'A tensão continua caindo com o motor ligado.' },
    hints: [{ testId: 'teste-carga', text: 'Seu Zé: “Mede a tensão com o motor ligado antes de culpar a bateria.”' }],
  },
  {
    id: 'partida-bateria',
    title: 'Não pega de manhã',
    complaints: ['De manhã ele só faz tec-tec e não pega.', 'Precisei de chupeta três vezes essa semana.'],
    cause: BATTERY,
    hypotheses: [{ slot: BATTERY, prior: 2 }, { slot: ALTERNATOR, prior: 2 }, { slot: PLUGS, prior: 1 }],
    functionalTests: ['teste-carga'],
    causeWear: [85, 99],
    requiredTools: [],
    categories: null,
    finalTest: { resolved: 'Partida firme, mesmo depois de horas parado.', persists: 'A partida continua fraca.' },
    hints: [{ testId: 'teste-carga', text: 'Seu Zé: “Mede a bateria desligada e depois ligada.”' }],
  },
  {
    id: 'motor-falhando',
    title: 'Motor falhando',
    complaints: ['O motor tá engasgando quando acelero.', 'Ele treme parado no sinal e falha na subida.'],
    cause: PLUGS,
    hypotheses: [{ slot: PLUGS, prior: 2 }, { slot: BATTERY, prior: 1 }, { slot: ALTERNATOR, prior: 1 }],
    functionalTests: ['teste-carga'],
    causeWear: [85, 99],
    requiredTools: [],
    categories: null,
    finalTest: { resolved: 'Motor redondo, sem falhas na aceleração.', persists: 'O motor continua falhando.' },
    hints: [{ testId: 'scanner', text: 'Seu Zé: “Pluga o scanner: falha de ignição costuma ficar gravada.”' }],
  },
];

/** Nomes fictícios dos clientes das OS geradas. */
export const CUSTOMER_NAMES: readonly string[] = [
  'Seu Valdir',
  'Dona Neide',
  'Rafa do Mototáxi',
  'Tia Lurdes',
  'Pastor Ademir',
  'Jéssica',
  'Seu Tião',
  'Dona Glória',
  'Biel',
  'Professora Marta',
  'Seu Arlindo',
  'Kátia da Van',
  'Dudu Entregas',
  'Dona Zezé',
  'Seu Moacir',
  'Luana',
];

/** Cores com nome, para os carros gerados. */
export const CAR_COLORS: ReadonlyArray<readonly [string, string]> = [
  ['#b9bcc0', 'Prata'],
  ['#f2f2ee', 'Branco'],
  ['#1d1f22', 'Preto'],
  ['#7d1d1d', 'Vinho'],
  ['#2b4a5e', 'Azul petróleo'],
  ['#8a8478', 'Cinza grafite'],
  ['#c7a24a', 'Dourado'],
  ['#3d5a40', 'Verde musgo'],
  ['#b3402a', 'Vermelho'],
];
