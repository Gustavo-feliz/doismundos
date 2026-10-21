/**
 * Parâmetros e textos dos equipamentos interativos da oficina (dados, não
 * lógica). Mudar um nome, uma mensagem ou um tempo não exige mexer no código.
 */
/** Ids que ligam os objetos 3D da oficina às regras de interação. */
export const EQUIPMENT_IDS = {
  lift: 'elevador',
  car: 'carro',
  hood: 'capo',
  drawer: 'armario',
  benchLamp: 'luminaria',
  lightSwitch: 'interruptor',
  gate: 'portao',
  computer: 'computador',
  stock: 'estoque',
} as const;

export const EQUIPMENT = {
  /** Distância máxima (m) entre a câmera e o objeto para interagir. */
  interactionRange: 2.4,

  lift: {
    name: 'Elevador de 2 colunas',
    /** Altura máxima de elevação do carro (m). Acima de ~1,6 m dá para passar por baixo. */
    maxHeight: 1.75,
    travelSeconds: 4.5,
    actionRaise: 'Subir elevador',
    actionLower: 'Descer elevador',
    busy: 'Elevador em movimento',
    blockedHoodOpen: 'Feche o capô antes de subir o elevador',
    blockedHoodMoving: 'Aguarde o capô terminar de se mover',
    blockedPlayerUnder: 'Saia de baixo do carro antes de descer o elevador',
    states: { retracted: 'Abaixado', extending: 'Subindo…', extended: 'No alto', retracting: 'Descendo…' },
    started: { extending: 'Elevador subindo', retracting: 'Elevador descendo' },
  },

  hood: {
    name: 'Capô',
    travelSeconds: 0.9,
    /** Abertura máxima (radianos). */
    openAngle: 1.05,
    actionOpen: 'Abrir capô',
    actionClose: 'Fechar capô',
    busy: 'Capô em movimento',
    blockedLiftUp: 'Abaixe o elevador para alcançar o capô',
    blockedLiftMoving: 'Aguarde o elevador parar',
    states: { retracted: 'Fechado', extending: 'Abrindo…', extended: 'Aberto', retracting: 'Fechando…' },
    started: { extending: 'Capô aberto', retracting: 'Capô fechado' },
  },

  vehicle: {
    actionInspect: 'Inspecionar veículo',
    onLift: 'no alto do elevador',
    onFloor: 'no box 1',
  },

  drawer: {
    name: 'Armário de ferramentas',
    travelSeconds: 0.45,
    /** Quanto a gaveta sai (m). */
    travel: 0.38,
    actionOpen: 'Abrir gaveta',
    actionClose: 'Fechar gaveta',
    busy: 'Gaveta em movimento',
    states: { retracted: 'Gaveta fechada', extending: 'Abrindo…', extended: 'Gaveta aberta', retracting: 'Fechando…' },
    started: { extending: 'Gaveta aberta', retracting: 'Gaveta fechada' },
  },

  benchLamp: {
    name: 'Bancada de trabalho',
    actionOn: 'Acender luminária',
    actionOff: 'Apagar luminária',
    stateOn: 'Luminária acesa',
    stateOff: 'Luminária apagada',
  },

  lightSwitch: {
    name: 'Interruptor do galpão',
    actionOn: 'Acender luzes do galpão',
    actionOff: 'Apagar luzes do galpão',
    stateOn: 'Luzes acesas',
    stateOff: 'Luzes apagadas',
    doneOn: 'Luzes do galpão acesas',
    doneOff: 'Luzes do galpão apagadas',
  },

  gate: {
    name: 'Portão',
    action: 'Fazer test drive',
    detail: 'Pátio de teste nos fundos (até 60 km/h)',
    needsFloor: 'Desça o carro do elevador antes do test drive',
    needsHoodClosed: 'Feche o capô antes do test drive',
  },

  stock: {
    name: 'Estoque de peças',
    action: 'Ver estoque',
  },

  computer: {
    name: 'Computador do escritório',
    action: 'Abrir computador de gestão',
    detail: 'Loja de peças, pedidos, caixa e reputação',
  },
} as const;
