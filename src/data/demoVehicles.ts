import type { VehicleSpec } from '../vehicles/factory';

/**
 * Dados de demonstração PREVISÍVEIS (GDD Prompt 3): sempre o mesmo carro,
 * com o mesmo estado, para testes e para o protótipo.
 *
 * Os desgastes batem com os km rodados desde cada troca
 * (desgaste = km desde a instalação ÷ vida útil × 100). Algumas peças estão
 * gastas ou críticas de propósito: são a matéria-prima do diagnóstico (Prompt 4).
 */
export const DEMO_VEHICLE_ID = 'demo-brisa-001';

export const DEMO_VEHICLES: readonly VehicleSpec[] = [
  {
    id: DEMO_VEHICLE_ID,
    modelId: 'ventura-brisa-16',
    year: 2009,
    plate: 'TMP0A01',
    color: '#7d1d1d',
    colorName: 'Vinho',
    mileageKm: 148_320,
    parts: {
      'motor.velas': { partId: 'vela-ignicao-brasaco-jogo4', condition: 'nova', wear: 65.8, installedAtKm: 122_000 },
      'motor.correia-dentada': { partId: 'correia-dentada-ventura-brisa', condition: 'nova', wear: 85.9, installedAtKm: 96_800 },
      'motor.filtro-ar': { partId: 'filtro-ar-brasaco-brisa', condition: 'nova', wear: 72.1, installedAtKm: 137_500 },
      'motor.filtro-oleo': { partId: 'filtro-oleo-ventura', condition: 'nova', wear: 34, installedAtKm: 144_920 },
      'fluidos.oleo-motor': { partId: 'oleo-5w30-sintetico-4l', condition: 'nova', wear: 34, installedAtKm: 144_920 },
      'arrefecimento.radiador': { partId: 'radiador-ventura-brisa', condition: 'nova', wear: 74.2, installedAtKm: 0 },
      'arrefecimento.valvula-termostatica': { partId: 'valvula-termostatica-brasaco-brisa', condition: 'nova', wear: 81.9, installedAtKm: 50_000 },
      'combustivel.bomba': { partId: 'bomba-combustivel-ventura', condition: 'nova', wear: 52.2, installedAtKm: 70_000 },
      'freios.pastilhas-dianteiras': { partId: 'pastilha-freio-diant-ventura-brisa', condition: 'nova', wear: 80.9, installedAtKm: 120_000 },
      'freios.discos-dianteiros': { partId: 'disco-freio-diant-brasaco-brisa', condition: 'nova', wear: 74.7, installedAtKm: 96_000 },
      'suspensao.amortecedores-dianteiros': { partId: 'amortecedor-diant-corisco-brisa', condition: 'nova', wear: 72.9, installedAtKm: 90_000 },
      'eletrica.bateria': { partId: 'bateria-60ah-brasaco', condition: 'recondicionada', wear: 50.5, installedAtKm: 118_000 },
      'eletrica.alternador': { partId: 'alternador-ventura-brisa', condition: 'nova', wear: 82.4, installedAtKm: 0 },
      'transmissao.kit-embreagem': { partId: 'kit-embreagem-ventura-brisa', condition: 'nova', wear: 65.3, installedAtKm: 70_000 },
      'rodas.pneus': { partId: 'pneu-185-65-r15-brasaco-jogo4', condition: 'nova', wear: 42, installedAtKm: 127_300 },
    },
    // O que consta nas notas de serviço: avaliação da época, que pode estar desatualizada.
    known: {
      'motor.filtro-oleo': { status: 'avaliado', band: 'boa', source: 'historico', atKm: 144_920, partId: 'filtro-oleo-ventura' },
      'fluidos.oleo-motor': { status: 'avaliado', band: 'boa', source: 'historico', atKm: 144_920, partId: 'oleo-5w30-sintetico-4l' },
      'rodas.pneus': { status: 'avaliado', band: 'boa', source: 'historico', atKm: 127_300, partId: 'pneu-185-65-r15-brasaco-jogo4' },
    },
    history: [
      { kind: 'manutencao', atKm: 127_300, day: null, text: 'Troca dos 4 pneus (nota fiscal no porta-luvas)', disclosed: true },
      { kind: 'leilao', atKm: 131_000, day: null, text: 'Comprado em leilão de seguradora', disclosed: false },
      { kind: 'manutencao', atKm: 144_920, day: null, text: 'Revisão na oficina do tio: óleo e filtro de óleo trocados', disclosed: true },
    ],
  },
];
