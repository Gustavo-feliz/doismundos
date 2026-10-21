import type { Cents } from '../economy/money';

/** Os 5 locais do bairro necessários à carreira inicial (GDD §7.1, Prompt 14). */
export type CityLocationId = 'oficina' | 'loja-pecas' | 'ferro-velho' | 'banco' | 'lanchonete';

/** O que acontece ao entrar ou interagir com um local do bairro. */
export type CityLocationActionKind = 'return-workshop' | 'open-shop' | 'open-scrapyard' | 'open-bank' | 'open-snack';

/** Definição de um estabelecimento do bairro (dados puros). */
export interface CityLocationDef {
  id: CityLocationId;
  name: string;
  subtitle: string;
  description: string;
  actionLabel: string;
  actionKind: CityLocationActionKind;
  /** Cor principal da fachada e do marcador no mapa (#RRGGBB). */
  accentColor: string;
  /** Cor secundária da fachada (#RRGGBB). */
  wallColor: string;
  /** Caixa do prédio no plano XZ (vira colisor sólido). */
  building: { x: number; z: number; width: number; depth: number; height: number };
  /** Ponto da porta/entrada onde o jogador interage e onde o marcador 3D flutua. */
  entrance: { x: number; z: number; yaw: number };
}

/** Faixa de trânsito controlado (1 carro por faixa, movimento determinístico). */
export interface CityTrafficLaneDef {
  id: string;
  /** Posição Z constante da faixa (rua corre no eixo X). */
  z: number;
  /** Sentido no eixo X: 1 (leste, +X) ou -1 (oeste, -X). */
  direction: 1 | -1;
  /** Posição X inicial. */
  startX: number;
  /** Velocidade de cruzeiro em m/s. */
  speedMs: number;
  /** Cor da carroceria provisória (#RRGGBB). */
  color: string;
  label: string;
}

/** Rota de pedestre controlado na calçada (movimento vai-e-vem determinístico). */
export interface CityPedestrianDef {
  id: string;
  name: string;
  /** Posição Z da calçada. */
  z: number;
  /** Extremos X da caminhada na calçada (`minX < maxX`). */
  minX: number;
  maxX: number;
  startX: number;
  direction: 1 | -1;
  speedMs: number;
  shirtColor: string;
}

/** Item vendido na Lanchonete da Tia Léa (dinheiro em centavos, tempo em minutos). */
export interface CitySnackDef {
  id: string;
  name: string;
  description: string;
  price: Cents;
  minutes: number;
  /** Comentário/fofoca do bairro que a Tia Léa conta ao servir. */
  gossip: string;
}

/** Definição completa do bairro (GDD Prompt 14). */
export interface CityNeighborhoodDef {
  id: string;
  name: string;
  halfX: number;
  halfZ: number;
  /** Onde o jogador aparece ao sair da oficina para a calçada. */
  spawn: { x: number; z: number; yaw: number };
  /** Faixa de pedestres central: o trânsito para se o jogador estiver atravessando. */
  crosswalk: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Distância máxima (m) para interagir com a entrada de um local. */
  interactRadius: number;
  locations: readonly CityLocationDef[];
  trafficLanes: readonly CityTrafficLaneDef[];
  pedestrians: readonly CityPedestrianDef[];
  snacks: readonly CitySnackDef[];
  /** Fração do custo base paga pelo Ferro-Velho ao comprar sucata da oficina (0–1). */
  scrapRecoveryFactor: number;
  /** Fração do custo base cobrada pelo Ferro-Velho nas peças garimpadas do dia (0–1). */
  salvagePriceFactor: number;
}

/** Estado em tempo real de um veículo do trânsito controlado. */
export interface CityTrafficCarState {
  id: string;
  x: number;
  z: number;
  direction: 1 | -1;
  speedMs: number;
  stoppedForPlayer: boolean;
}

/** Estado em tempo real de um pedestre controlado na calçada. */
export interface CityPedestrianState {
  id: string;
  x: number;
  z: number;
  direction: 1 | -1;
  pausedForPlayer: boolean;
}

/** Estado puro da simulação do bairro (trânsito + pedestres + tempo). */
export interface CityWorldState {
  time: number;
  traffic: readonly CityTrafficCarState[];
  pedestrians: readonly CityPedestrianState[];
}

/** Oferta diária determinística de peça usada/recondicionada no Ferro-Velho do Tião. */
export interface SalvageOffer {
  partId: string;
  partName: string;
  slotId: string;
  unitPrice: Cents;
  originalCost: Cents;
}
