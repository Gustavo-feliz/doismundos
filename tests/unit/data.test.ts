import { describe, expect, it, vi } from 'vitest';
import { PART_SLOTS } from '../../src/data/partSlots';
import { VEHICLES } from '../../src/data/vehicles';
import { ECONOMY } from '../../src/data/economy';
import { NEW_GAME } from '../../src/data/newGame';
import { assertCents, formatBRL, reaisToCents } from '../../src/economy/money';
import {
  DEFAULT_SETTINGS,
  parseSettings,
  qualityProfile,
  SETTINGS_SCHEMA_VERSION,
  SettingsStore,
  type StorageLike,
} from '../../src/save/settings';
import { DataValidationError, findVehicleProblems, validateVehicleCatalog, type VehicleDefinition } from '../../src/vehicles/types';

/** Espaço não separável que o Intl usa depois de "R$". */
const nbsp = ' ';

describe('dinheiro', () => {
  it('formata centavos em reais', () => {
    expect(formatBRL(0)).toBe(`R$${nbsp}0,00`);
    expect(formatBRL(123456)).toBe(`R$${nbsp}1.234,56`);
    expect(formatBRL(-500)).toBe(`-R$${nbsp}5,00`);
  });

  it('converte reais para centavos sem erro de ponto flutuante', () => {
    expect(reaisToCents(0.1 + 0.2)).toBe(30);
    expect(reaisToCents(19.99)).toBe(1999);
  });

  it('rejeita valores que não são centavos inteiros', () => {
    expect(() => formatBRL(1.5)).toThrow(TypeError);
    expect(() => assertCents(Number.NaN)).toThrow(TypeError);
    expect(() => reaisToCents(Infinity)).toThrow(TypeError);
  });

  it('caixa inicial é um valor em centavos válido', () => {
    expect(() => assertCents(ECONOMY.startingCash)).not.toThrow();
    expect(NEW_GAME.firstObjective.length).toBeGreaterThan(0);
  });
});

describe('configurações', () => {
  it('lixo no storage volta ao padrão', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('texto')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ schemaVersion: 999, fov: 90 })).toEqual(DEFAULT_SETTINGS);
  });

  it('limita valores fora da faixa e completa campos ausentes', () => {
    const s = parseSettings({ schemaVersion: SETTINGS_SCHEMA_VERSION, mouseSensitivity: 50, fov: 10, quality: 'ultra' });
    expect(s.mouseSensitivity).toBe(3);
    expect(s.fov).toBe(60);
    expect(s.quality).toBe(DEFAULT_SETTINGS.quality);
    expect(s.invertY).toBe(false);
  });

  it('salva e carrega (ida e volta)', () => {
    const memory = new Map<string, string>();
    const storage: StorageLike = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) };
    const store = new SettingsStore(storage);
    const custom = { ...DEFAULT_SETTINGS, fov: 90, invertY: true, quality: 'baixa' as const };
    expect(store.save(custom)).toBe(true);
    expect(store.load()).toEqual(custom);
  });

  it('JSON corrompido e storage que lança erro não quebram o jogo', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = new SettingsStore({ getItem: () => '{não é json', setItem: () => {} });
    expect(broken.load()).toEqual(DEFAULT_SETTINGS);
    const full = new SettingsStore({
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(full.save(DEFAULT_SETTINGS)).toBe(false);
    expect(new SettingsStore(null).load()).toEqual(DEFAULT_SETTINGS);
    warn.mockRestore();
  });

  it('qualidade baixa desliga sombras', () => {
    expect(qualityProfile('baixa').shadows).toBe(false);
    expect(qualityProfile('alta').shadows).toBe(true);
  });
});

describe('catálogo de veículos', () => {
  const slots = new Set(PART_SLOTS.map((x) => x.id));

  it('o catálogo do jogo é válido', () => {
    expect(() => validateVehicleCatalog(VEHICLES, slots)).not.toThrow();
  });

  const base: VehicleDefinition = VEHICLES[0]!;

  it('aponta dimensões impossíveis com mensagem útil', () => {
    const bad: VehicleDefinition = { ...base, dimensions: { ...base.dimensions, wheelbase: 9 } };
    expect(findVehicleProblems(bad, slots).join()).toMatch(/entre-eixos/);
  });

  it('aponta campos inválidos', () => {
    const bad = { ...base, id: 'Com Espaço', paintColor: 'vermelho', years: [2015, 2010] as const };
    const text = findVehicleProblems(bad, slots).join(" | ");
    expect(text).toMatch(/id/);
    expect(text).toMatch(/paintColor/);
    expect(text).toMatch(/anos/);
  });

  it('aponta posições de peça desconhecidas ou repetidas', () => {
    const bad = { ...base, slots: ['motor.velas', 'motor.velas', 'motor.turbo'] };
    const text = findVehicleProblems(bad, slots).join(" | ");
    expect(text).toMatch(/repetida/);
    expect(text).toMatch(/desconhecida "motor.turbo"/);
  });

  it('rejeita ids duplicados e catálogo vazio', () => {
    expect(() => validateVehicleCatalog([base, base], slots)).toThrow(DataValidationError);
    expect(() => validateVehicleCatalog([], slots)).toThrow(/vazio/);
  });
});
