import { CUSTOMERS } from '../../src/data/customers';
import { DIAGNOSTIC_CASES } from '../../src/data/diagnosticCases';
import { FUNCTIONAL_TESTS, SCANNER } from '../../src/data/diagnostics';
import { PART_SLOTS } from '../../src/data/partSlots';
import { PARTS } from '../../src/data/parts';
import { BANK_DEBT, ECONOMY } from '../../src/data/economy';
import { TAKE_PART_MINUTES, UPGRADES } from '../../src/data/upgrades';
import { DEFAULT_QUOTE_SETTINGS, PRICING } from '../../src/data/pricing';
import { SUPPLIERS } from '../../src/data/suppliers';
import { INITIAL_STOCK } from '../../src/data/stock';
import { VEHICLES } from '../../src/data/vehicles';
import type { DiagnosticData } from '../../src/diagnostics/rules';
import type { EquipmentContext } from '../../src/diagnostics/types';
import { GameSession, type SessionContent } from '../../src/game/GameSession';
import { buildCatalogs } from '../../src/vehicles/catalogs';

/** Dados reais do jogo, prontos para os testes. */
export const catalogs = buildCatalogs(VEHICLES, PARTS, PART_SLOTS);
export const diagnosticData: DiagnosticData = { scanner: SCANNER, functional: new Map(FUNCTIONAL_TESTS.map((t) => [t.id, t])) };
export const content: SessionContent = {
  cases: DIAGNOSTIC_CASES,
  diagnostics: diagnosticData,
  customers: CUSTOMERS,
  pricing: PRICING,
  initialStock: INITIAL_STOCK,
  defaultDraft: DEFAULT_QUOTE_SETTINGS,
  suppliers: SUPPLIERS,
  economy: ECONOMY,
  debt: BANK_DEBT,
  upgrades: UPGRADES,
  takePartMinutes: TAKE_PART_MINUTES,
};
export const newSession = (patch: Partial<SessionContent> = {}) => new GameSession(catalogs, [], { ...content, ...patch });
/** Dia 1, 09:00 (minuto absoluto 540). */
export const when = { day: 1, time: '09:00', at: 540 };
/** Momento `minutes` minutos depois de `when`. */
export const later = (minutes: number) => {
  const at = when.at + minutes;
  const hh = String(Math.floor((at % 1440) / 60)).padStart(2, '0');
  const mm = String(at % 60).padStart(2, '0');
  return { day: Math.floor(at / 1440) + 1, time: `${hh}:${mm}`, at };
};

/** Compra 1 unidade no fornecedor do bairro, espera chegar e devolve o lote recebido. */
export function buyAndReceive(s: GameSession, partId: string, at = when) {
  const bought = s.buyPart(partId, 'autopecas-bairro', 1, at);
  if (!bought.ok) throw new Error(bought.message);
  s.deliverDue(at.at + 30);
  const lot = s.stock.find((l) => l.partId === partId && l.unitCost > 0);
  if (!lot) throw new Error('peça não chegou');
  return lot;
}

/** Lote herdado do tio (custo zero). */
export const inheritedLot = (s: GameSession, partId: string) => s.stock.find((l) => l.partId === partId && l.unitCost === 0)!;

/** Estados de equipamento prontos. */
export const CTX = {
  /** carro no chão, capô fechado */
  floor: { hoodOpen: false, liftUp: false, liftDown: true },
  /** carro no chão, capô aberto */
  hood: { hoodOpen: true, liftUp: false, liftDown: true },
  /** carro no alto do elevador */
  lifted: { hoodOpen: false, liftUp: true, liftDown: false },
} satisfies Record<string, EquipmentContext>;
