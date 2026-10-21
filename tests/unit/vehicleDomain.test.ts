import { describe, expect, it } from 'vitest';
import { DEMO_VEHICLE_ID, DEMO_VEHICLES } from '../../src/data/demoVehicles';
import { PART_SLOTS } from '../../src/data/partSlots';
import { PARTS } from '../../src/data/parts';
import { VEHICLES } from '../../src/data/vehicles';
import { GameSession } from '../../src/game/GameSession';
import type { PartDefinition } from '../../src/parts/types';
import { formatKm, formatKmAgo, formatMinutes } from '../../src/ui/format';
import { buildCatalogs } from '../../src/vehicles/catalogs';
import {
  checkCompatibility,
  compatiblePartsFor,
  driveKm,
  installPart,
  removePart,
  replacePart,
  revealPartCondition,
  setPartWear,
  type DomainResult,
} from '../../src/vehicles/domain';
import { createVehicleState } from '../../src/vehicles/factory';
import { buildInspectionView } from '../../src/vehicles/inspectionView';
import { wearBand, type VehicleState } from '../../src/vehicles/state';
import { DataValidationError } from '../../src/vehicles/types';

const catalogs = buildCatalogs(VEHICLES, PARTS, PART_SLOTS);
const demo = () => createVehicleState(DEMO_VEHICLES[0]!, catalogs);

/** Um Faísca 2015 sem nenhuma peça (para testar compatibilidade entre modelos). */
const emptyFaisca = (): VehicleState =>
  createVehicleState(
    {
      id: 'teste-faisca',
      modelId: 'lumen-faisca-10',
      year: 2015,
      plate: 'ABC1D23',
      mileageKm: 40_000,
      parts: Object.fromEntries(PART_SLOTS.map((s) => [s.id, null])),
    },
    catalogs,
  );

/** Congela o objeto inteiro: se alguma função tentar mutar, o teste quebra. */
function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

function unwrap<T>(r: DomainResult<T>): T {
  if (!r.ok) throw new Error(`esperava sucesso, veio ${r.error.code}: ${r.error.message}`);
  return r.value;
}

function errorCode<T>(r: DomainResult<T>): string | null {
  return r.ok ? null : r.error.code;
}

describe('catálogos', () => {
  it('os dados do jogo são válidos: 15 posições e o catálogo ampliado do Prompt 12', () => {
    expect(PART_SLOTS).toHaveLength(15);
    expect(PARTS.length).toBeGreaterThanOrEqual(100);
    expect(catalogs.parts.size).toBe(PARTS.length);
  });

  it('cada posição do Brisa 2009 tem peça compatível, e a primeira é a instalada no carro de demonstração', () => {
    const v = demo();
    for (const slot of PART_SLOTS) {
      const options = compatiblePartsFor(v, slot.id, catalogs).map((p) => p.id);
      expect(options.length).toBeGreaterThanOrEqual(1);
      expect(options[0]).toBe(v.parts[slot.id]!.partId);
    }
  });

  it('cobre vários sistemas do GDD §10.1', () => {
    expect(new Set(PARTS.map((p) => p.system)).size).toBeGreaterThanOrEqual(8);
  });

  const withPart = (patch: Partial<PartDefinition>) => [{ ...PARTS[0]!, ...patch }, ...PARTS.slice(1)];
  const problemsOf = (parts: readonly PartDefinition[]) => {
    try {
      buildCatalogs(VEHICLES, parts, PART_SLOTS);
      return '';
    } catch (e) {
      expect(e).toBeInstanceOf(DataValidationError);
      return (e as Error).message;
    }
  };

  it('rejeita dados de peça inválidos com mensagens úteis', () => {
    expect(problemsOf(withPart({ system: 'freios' }))).toMatch(/não bate com a posição/);
    expect(problemsOf(withPart({ scrapValue: 99_999_99 }))).toMatch(/sucata não pode valer mais/);
    expect(problemsOf(withPart({ baseCost: 10.5 }))).toMatch(/centavos/);
    expect(problemsOf(withPart({ compatibility: [{ modelId: 'carro-fantasma', years: [2000, 2001] }] }))).toMatch(/modelo desconhecido/);
    expect(problemsOf(withPart({ compatibility: [{ modelId: 'ventura-brisa-16', years: [2000, 2012] }] }))).toMatch(/fora da fabricação/);
    expect(problemsOf(withPart({ replaceMinutes: 0 }))).toMatch(/tempo de troca/);
    expect(problemsOf([...PARTS, PARTS[3]!])).toMatch(/duplicado/);
  });
});

describe('dados de demonstração', () => {
  it('são válidos e previsíveis (sempre iguais)', () => {
    expect(demo()).toEqual(demo());
    expect(demo().plate).toBe('TMP0A01');
  });

  it('o desgaste de cada peça bate com os km rodados desde a troca', () => {
    const v = demo();
    for (const [slot, installed] of Object.entries(v.parts)) {
      const part = catalogs.parts.get(installed!.partId)!;
      const expected = ((v.mileageKm - installed!.installedAtKm) / part.lifespanKm) * 100;
      expect(installed!.wear, slot).toBeCloseTo(Math.min(100, expected), 0);
    }
  });

  it('estado inválido falha com a lista de problemas', () => {
    const spec = DEMO_VEHICLES[0]!;
    expect(() => createVehicleState({ ...spec, year: 2015 }, catalogs)).toThrow(/fora da fabricação/);
    expect(() => createVehicleState({ ...spec, plate: 'xx-123' }, catalogs)).toThrow(/placa/);
    const wrongPart = { ...spec.parts, 'eletrica.bateria': { partId: 'radiador-ventura-brisa', condition: 'nova' as const, wear: 0, installedAtKm: 0 } };
    expect(() => createVehicleState({ ...spec, parts: wrongPart }, catalogs)).toThrow(/não encaixa/);
    const { ['rodas.pneus']: _omit, ...missing } = spec.parts;
    expect(() => createVehicleState({ ...spec, parts: missing }, catalogs)).toThrow(/falta a posição "rodas.pneus"/);
  });
});

describe('compatibilidade', () => {
  it('aceita a peça certa no carro certo', () => {
    expect(unwrap(checkCompatibility(demo(), 'freios.discos-dianteiros', 'disco-freio-diant-brasaco-brisa', catalogs)).id).toBe('disco-freio-diant-brasaco-brisa');
  });

  it('rejeita peça de outro modelo', () => {
    const r = checkCompatibility(emptyFaisca(), 'freios.discos-dianteiros', 'disco-freio-diant-brasaco-brisa', catalogs);
    expect(errorCode(r)).toBe('modelo-incompativel');
    expect(r.ok ? '' : r.error.message).toMatch(/não serve no Lumen Faísca 1.0/);
  });

  it('rejeita ano fora da faixa da peça', () => {
    // Um Brisa 2007 não pode nem nascer com o amortecedor 2008+ instalado: a posição começa vazia.
    const spec = DEMO_VEHICLES[0]!;
    const brisa2007 = createVehicleState({ ...spec, year: 2007, parts: { ...spec.parts, 'suspensao.amortecedores-dianteiros': null } }, catalogs);
    const r = checkCompatibility(brisa2007, 'suspensao.amortecedores-dianteiros', 'amortecedor-diant-corisco-brisa', catalogs);
    expect(errorCode(r)).toBe('ano-incompativel');
    expect(r.ok ? '' : r.error.message).toMatch(/2008–2012; este carro é 2007/);
  });

  it('rejeita peça na posição errada, peça desconhecida e posição inexistente', () => {
    const v = demo();
    expect(errorCode(checkCompatibility(v, 'eletrica.bateria', 'pastilha-freio-diant-ventura-brisa', catalogs))).toBe('posicao-errada');
    expect(errorCode(checkCompatibility(v, 'eletrica.bateria', 'bateria-de-brinquedo', catalogs))).toBe('peca-desconhecida');
    expect(errorCode(checkCompatibility(v, 'motor.turbo', 'bateria-60ah-brasaco', catalogs))).toBe('posicao-inexistente');
  });

  it('peças universais servem nos dois modelos', () => {
    expect(checkCompatibility(emptyFaisca(), 'eletrica.bateria', 'bateria-60ah-brasaco', catalogs).ok).toBe(true);
    expect(checkCompatibility(demo(), 'eletrica.bateria', 'bateria-60ah-brasaco', catalogs).ok).toBe(true);
  });
});

describe('transições de estado', () => {
  it('não instala por cima de outra peça', () => {
    const r = installPart(demo(), 'eletrica.bateria', 'bateria-60ah-brasaco', { condition: 'nova' }, catalogs);
    expect(errorCode(r)).toBe('posicao-ocupada');
  });

  it('remover e instalar: atualiza peça, conhecimento e histórico', () => {
    const v0 = deepFreeze(demo());
    const removed = unwrap(removePart(v0, 'eletrica.bateria', catalogs, { day: 1 }));
    expect(removed.removed.partId).toBe('bateria-60ah-brasaco');
    expect(removed.vehicle.parts['eletrica.bateria']).toBeNull();
    expect(removed.vehicle.knowledge['eletrica.bateria']).toEqual({ status: 'removida', atKm: v0.mileageKm });

    const v2 = unwrap(installPart(removed.vehicle, 'eletrica.bateria', 'bateria-60ah-brasaco', { condition: 'nova', day: 1 }, catalogs));
    expect(v2.parts['eletrica.bateria']).toMatchObject({ wear: 0, condition: 'nova', installedAtKm: v0.mileageKm });
    expect(v2.knowledge['eletrica.bateria']).toMatchObject({ status: 'avaliado', band: 'boa', source: 'instalacao' });
    expect(v2.history.slice(-2).map((h) => h.kind)).toEqual(['remocao', 'instalacao']);
    expect(v2.history.at(-1)).toMatchObject({ day: 1, disclosed: true });
    // O original continua intacto (funções puras).
    expect(v0.parts['eletrica.bateria']?.wear).toBe(50.5);
  });

  it('valida o desgaste ao instalar', () => {
    const empty = unwrap(removePart(demo(), 'eletrica.bateria', catalogs)).vehicle;
    expect(errorCode(installPart(empty, 'eletrica.bateria', 'bateria-60ah-brasaco', { condition: 'nova', wear: 30 }, catalogs))).toBe('desgaste-invalido');
    expect(errorCode(installPart(empty, 'eletrica.bateria', 'bateria-60ah-brasaco', { condition: 'usada', wear: 150 }, catalogs))).toBe('desgaste-invalido');
    const used = unwrap(installPart(empty, 'eletrica.bateria', 'bateria-60ah-brasaco', { condition: 'usada', wear: 55 }, catalogs));
    expect(used.knowledge['eletrica.bateria']).toMatchObject({ band: 'gasta' });
  });

  it('não remove de posição vazia', () => {
    const empty = unwrap(removePart(demo(), 'rodas.pneus', catalogs)).vehicle;
    expect(errorCode(removePart(empty, 'rodas.pneus', catalogs))).toBe('posicao-vazia');
  });

  it('troca é atômica: peça incompatível não deixa o carro sem peça', () => {
    const v = deepFreeze(demo());
    const r = replacePart(v, 'freios.pastilhas-dianteiras', 'disco-freio-diant-brasaco-brisa', { condition: 'nova' }, catalogs);
    expect(errorCode(r)).toBe('posicao-errada');
    expect(v.parts['freios.pastilhas-dianteiras']?.partId).toBe('pastilha-freio-diant-ventura-brisa');
    const ok = unwrap(replacePart(v, 'freios.pastilhas-dianteiras', 'pastilha-freio-diant-ventura-brisa', { condition: 'nova' }, catalogs));
    expect(ok.removed.wear).toBe(80.9);
    expect(ok.vehicle.parts['freios.pastilhas-dianteiras']?.wear).toBe(0);
  });

  it('ajuste de desgaste valida e não conta nada ao jogador', () => {
    const v = demo();
    expect(errorCode(setPartWear(v, 'eletrica.bateria', 101, 'teste', catalogs))).toBe('desgaste-invalido');
    expect(errorCode(setPartWear(v, 'eletrica.bateria', Number.NaN, 'teste', catalogs))).toBe('desgaste-invalido');
    const next = unwrap(setPartWear(v, 'eletrica.bateria', 99, 'curto-circuito', catalogs));
    expect(next.parts['eletrica.bateria']?.wear).toBe(99);
    expect(next.knowledge['eletrica.bateria']).toEqual(v.knowledge['eletrica.bateria']);
    expect(next.history.at(-1)).toMatchObject({ kind: 'ajuste', disclosed: false });
  });

  it('rodar km desgasta pela vida útil, limita em 100 e rejeita distância inválida', () => {
    const v = demo();
    const next = unwrap(driveKm(v, 3_500, catalogs));
    expect(next.mileageKm).toBe(v.mileageKm + 3_500);
    // Pastilhas: vida de 35.000 km → +10 pontos.
    expect(next.parts['freios.pastilhas-dianteiras']?.wear).toBeCloseTo(90.9, 5);
    const far = unwrap(driveKm(v, 500_000, catalogs));
    expect(Object.values(far.parts).every((p) => p!.wear === 100)).toBe(true);
    expect(errorCode(driveKm(v, 0, catalogs))).toBe('km-invalido');
    expect(errorCode(driveKm(v, -5, catalogs))).toBe('km-invalido');
    // Rodar não revela nada.
    expect(next.knowledge).toEqual(v.knowledge);
  });

  it('revelar estado mostra a faixa atual, não um número', () => {
    const v = unwrap(revealPartCondition(demo(), 'freios.pastilhas-dianteiras', 'inspecao', catalogs));
    expect(v.knowledge['freios.pastilhas-dianteiras']).toEqual({
      status: 'avaliado',
      band: 'critica',
      source: 'inspecao',
      atKm: 148_320,
      partId: 'pastilha-freio-diant-ventura-brisa',
    });
  });

  it('faixas de desgaste', () => {
    expect([0, 39.9, 40, 74.9, 75, 99.9, 100].map(wearBand)).toEqual(['boa', 'boa', 'gasta', 'gasta', 'critica', 'critica', 'falhou']);
  });
});

describe('visão de inspeção (o que a UI pode mostrar)', () => {
  it('lista as 15 peças agrupadas por sistema', () => {
    const view = buildInspectionView(demo(), catalogs);
    expect(view.groups.flatMap((g) => g.rows)).toHaveLength(15);
    expect(view.totals).toEqual({ slots: 15, evaluated: 3 });
    expect(view.title).toBe('Ventura Brisa 1.6');
  });

  it('não vaza estado real nem histórico oculto', () => {
    const v = demo();
    const json = JSON.stringify(buildInspectionView(v, catalogs));
    expect(json).not.toMatch(/leilão/i);
    expect(json).not.toMatch(/"wear"/);
    // Nenhum desgaste real aparece (ex.: correia 85.9, pastilhas 80.9). Inteiros como 34
    // colidiriam com km ("3.400"), então checamos os valores com casa decimal.
    const distinctive = Object.values(v.parts).map((p) => p!.wear).filter((w) => !Number.isInteger(w));
    expect(distinctive.length).toBeGreaterThan(5);
    for (const wear of distinctive) expect(json).not.toContain(String(wear));
    const pads = buildInspectionView(v, catalogs).groups.flatMap((g) => g.rows).find((r) => r.slotId === 'freios.pastilhas-dianteiras')!;
    expect(pads.known).toEqual({ kind: 'desconhecido' });
  });

  it('mostra o conhecimento da época, mesmo desatualizado', () => {
    // Pneus: nota de 21.020 km atrás dizia "boa"; hoje estão gastos, mas o jogador não sabe.
    const tires = buildInspectionView(demo(), catalogs).groups.flatMap((g) => g.rows).find((r) => r.slotId === 'rodas.pneus')!;
    expect(tires.known).toMatchObject({ kind: 'avaliado', band: 'boa', kmSince: 21_020, sourceLabel: 'registro de serviço' });
  });

  it('histórico conhecido vem do mais recente ao mais antigo', () => {
    const view = buildInspectionView(demo(), catalogs);
    expect(view.history.map((h) => h.kmAgo)).toEqual([3_400, 21_020]);
  });
});

describe('sessão de jogo', () => {
  it('guarda alterações e ignora operações que falham', () => {
    const session = new GameSession(catalogs, DEMO_VEHICLES);
    const before = session.getVehicle(DEMO_VEHICLE_ID);
    const failed = session.apply(DEMO_VEHICLE_ID, (v) => installPart(v, 'eletrica.bateria', 'bateria-60ah-brasaco', { condition: 'nova' }, catalogs));
    expect(failed.ok).toBe(false);
    expect(session.version).toBe(0);
    expect(session.getVehicle(DEMO_VEHICLE_ID)).toBe(before);

    session.apply(DEMO_VEHICLE_ID, (v) => removePart(v, 'eletrica.bateria', catalogs));
    expect(session.version).toBe(1);
    expect(session.getVehicle(DEMO_VEHICLE_ID).parts['eletrica.bateria']).toBeNull();
  });

  it('recusa carro inexistente e ids duplicados', () => {
    const session = new GameSession(catalogs, DEMO_VEHICLES);
    expect(() => session.getVehicle('nao-existe')).toThrow(/não encontrado/);
    expect(() => new GameSession(catalogs, [DEMO_VEHICLES[0]!, DEMO_VEHICLES[0]!])).toThrow(/duplicado/);
  });
});

describe('formatação', () => {
  it('km e tempo em pt-BR', () => {
    expect(formatKm(148_320)).toBe('148.320 km');
    expect(formatKmAgo(0)).toBe('agora');
    expect(formatKmAgo(3_400)).toBe('há 3.400 km');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(120)).toBe('2 h');
    expect(formatMinutes(150)).toBe('2 h 30 min');
  });
});
