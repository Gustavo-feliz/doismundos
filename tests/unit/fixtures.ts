import { CUSTOMERS } from '../../src/data/customers';
import { DIAGNOSTIC_CASES } from '../../src/data/diagnosticCases';
import { FUNCTIONAL_TESTS, SCANNER } from '../../src/data/diagnostics';
import { PART_SLOTS } from '../../src/data/partSlots';
import { PARTS } from '../../src/data/parts';
import { DEFAULT_QUOTE_SETTINGS, PRICING } from '../../src/data/pricing';
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
};
export const newSession = () => new GameSession(catalogs, [], content);
export const when = { day: 1, time: '09:00' };

/** Estados de equipamento prontos. */
export const CTX = {
  /** carro no chão, capô fechado */
  floor: { hoodOpen: false, liftUp: false, liftDown: true },
  /** carro no chão, capô aberto */
  hood: { hoodOpen: true, liftUp: false, liftDown: true },
  /** carro no alto do elevador */
  lifted: { hoodOpen: false, liftUp: true, liftDown: false },
} satisfies Record<string, EquipmentContext>;
