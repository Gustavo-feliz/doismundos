import { describe, expect, it } from 'vitest';
import { SERVICE_TEMPLATES } from '../../src/data/services';
import { PARTS } from '../../src/data/parts';
import { VEHICLES } from '../../src/data/vehicles';
import { GameSession } from '../../src/game/GameSession';
import { findCoverageGaps } from '../../src/parts/validate';
import { caseProblems, generateCase, generatedCaseId, parseGeneratedId, partsFor, validateServiceTemplates } from '../../src/procedural/generator';
import { DataValidationError } from '../../src/vehicles/types';
import { CTX, catalogs, content, later, newSession, when } from './fixtures';

const gen = GameSession.generatorContent(content, catalogs);
const NO_TOOLS = {};
const ALL_TOOLS = { 'chave-impacto': 3, scanner: 3, iluminacao: 3, 'armario-ferramentas': 3, 'organizacao-estoque': 3 };
const SEEDS = Array.from({ length: 150 }, (_, i) => i * 7919 + 1);

describe('catálogo ampliado (10 carros)', () => {
  it('10 modelos de pelo menos 5 categorias, todos fictícios e com dados da enciclopédia', () => {
    expect(VEHICLES).toHaveLength(10);
    expect(new Set(VEHICLES.map((m) => m.category)).size).toBeGreaterThanOrEqual(5);
    for (const m of VEHICLES) expect(m.baseValue).toBeGreaterThan(0);
  });

  it('cobertura: todo modelo, em todo ano, tem peça para cada posição', () => {
    expect(findCoverageGaps(VEHICLES, PARTS)).toEqual([]);
    // Sem a peça genérica do Brisa, a checagem acha o buraco de 2006–2007.
    const gaps = findCoverageGaps(VEHICLES, PARTS.filter((p) => p.id !== 'amortecedor-diant-brasaco-brisa'));
    expect(gaps).toEqual(['Ventura Brisa 1.6: nenhuma peça para "suspensao.amortecedores-dianteiros" em 2006–2007']);
  });

  it('compatibilidade por ano: o Jaguara mudou de amortecedor em 2019', () => {
    const old = partsFor(catalogs, 'tupa-jaguara-20', 2018, 'suspensao.amortecedores-dianteiros').map((p) => p.id);
    const neu = partsFor(catalogs, 'tupa-jaguara-20', 2019, 'suspensao.amortecedores-dianteiros').map((p) => p.id);
    expect(old).toContain('amortecedor-diant-original-pesada');
    expect(neu).toEqual(['amortecedor-diant-original-jaguara-19']);
  });

  it('linhas de peça: carro pesado paga mais caro e demora mais que o leve', () => {
    const leve = partsFor(catalogs, 'lumen-pingo-10', 2005, 'freios.pastilhas-dianteiras').find((p) => p.quality === 'generica')!;
    const pesada = partsFor(catalogs, 'more-sertao-28', 2012, 'freios.pastilhas-dianteiras').find((p) => p.quality === 'generica')!;
    expect(pesada.baseCost).toBeGreaterThan(leve.baseCost);
    expect(pesada.replaceMinutes).toBeGreaterThan(leve.replaceMinutes);
  });
});

describe('gerador de OS', () => {
  it('reproduzível: mesma semente, mesmo número e mesmas ferramentas → mesma OS', () => {
    const a = generateCase(42, 3, NO_TOOLS, gen);
    const b = generateCase(42, 3, NO_TOOLS, gen);
    expect(a).toEqual(b);
    expect(generateCase(43, 3, NO_TOOLS, gen)).not.toEqual(a);
  });

  it('o ID guarda semente, número e ferramentas, e volta igual', () => {
    const id = generatedCaseId(77, 5, { 'chave-impacto': 2 }, content.upgrades);
    expect(id).toBe('gen-77-5-t20000');
    expect(parseGeneratedId(id, content.upgrades)).toEqual({ seed: 77, n: 5, levels: { 'chave-impacto': 2 } });
    expect(parseGeneratedId('gen-77-5-t2', content.upgrades)).toBeNull();
    expect(parseGeneratedId('os-001-freio', content.upgrades)).toBeNull();
  });

  it(`nunca gera OS impossível (${SEEDS.length} sementes × 3 OS, sem e com ferramentas)`, () => {
    const templates = new Set<string>();
    const models = new Set<string>();
    const histories = new Set<string>();
    for (const tools of [NO_TOOLS, ALL_TOOLS]) {
      for (const seed of SEEDS) {
        for (let n = 1; n <= 3; n++) {
          const c = generateCase(seed, n, tools, gen);
          expect(caseProblems(c, gen, tools), `semente ${seed}, OS ${n}`).toEqual([]);
          if (tools === NO_TOOLS) expect(c.requiredTools ?? []).toEqual([]); // sem ferramenta, nada que a exija
          templates.add(c.summary);
          models.add(c.vehicle.modelId);
          for (const h of c.vehicle.history ?? []) histories.add(h.kind);
        }
      }
    }
    // Variedade: todos os serviços, todos os modelos e vários tipos de histórico aparecem.
    expect(templates.size).toBe(SERVICE_TEMPLATES.length);
    expect(models.size).toBe(VEHICLES.length);
    expect([...histories].sort()).toEqual(['colisao', 'enchente', 'leilao', 'manutencao']);
  });

  it('serviços que exigem ferramenta só aparecem para quem tem a ferramenta', () => {
    const needsTool = SERVICE_TEMPLATES.filter((t) => t.requiredTools.length).map((t) => t.title);
    const seen = new Set<string>();
    for (const seed of SEEDS) seen.add(generateCase(seed, 1, ALL_TOOLS, gen).summary);
    for (const title of needsTool) expect(seen).toContain(title);
  });

  it('caseProblems pega uma OS quebrada', () => {
    const c = generateCase(5, 1, NO_TOOLS, gen);
    const healthy = { ...c, vehicle: { ...c.vehicle, parts: { ...c.vehicle.parts, [c.trueCause]: { ...c.vehicle.parts[c.trueCause]!, wear: 10 } } } };
    expect(caseProblems(healthy, gen, NO_TOOLS)).toContain('a peça com defeito não está crítica');
    expect(caseProblems({ ...c, requiredTools: [{ upgradeId: 'chave-impacto', level: 1 }] }, gen, NO_TOOLS)).toContain('exige uma ferramenta que a oficina não tem');
  });

  it('moldes de serviço inválidos viram mensagens úteis', () => {
    const bad = { ...SERVICE_TEMPLATES[0]!, id: 'X', cause: 'motor.velas', causeWear: [10, 50] as const, requiredTools: [{ upgradeId: 'turbo', level: 1 }] };
    try {
      validateServiceTemplates({ ...gen, templates: [bad] });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DataValidationError);
      const msg = (e as Error).message;
      expect(msg).toContain('ID inválido');
      expect(msg).toContain('a causa precisa estar entre as hipóteses');
      expect(msg).toContain('entre 75 e 100');
      expect(msg).toContain('ferramenta desconhecida "turbo"');
      expect(msg).toContain('pelo menos um serviço sem ferramenta');
    }
  });
});

describe('OS geradas no jogo', () => {
  /** Encerra a OS ativa dispensando o cliente (o jeito mais curto). */
  function closeActive(s: GameSession) {
    const c = s.activeCase!;
    s.runDiagnosticTest(`visual:${c.hypotheses[0]!.slot}`, CTX.lifted, when);
    s.runDiagnosticTest('scanner', CTX.floor, when);
    s.concludeActiveCase(c.trueCause, when);
    s.dismissCustomer(when);
  }

  it('depois das OS de demonstração vêm OS geradas, numeradas a partir de 101', () => {
    const s = newSession({}, 1234);
    for (let i = 0; i < 3; i++) {
      closeActive(s);
      expect(s.advanceCase()).toBe(true);
    }
    expect(s.activeCase!.id).toBe(generatedCaseId(1234, 1, {}, content.upgrades));
    expect(s.activeCase!.orderNumber).toBe('101');
    closeActive(s);
    s.advanceCase();
    expect(s.activeCase!.orderNumber).toBe('102');
    expect(s.generatedCount).toBe(2);
  });

  it('salvar e carregar: a OS gerada é recriada pelo ID, igual, com a mesma semente', () => {
    const s = newSession({}, 99);
    for (let i = 0; i < 3; i++) {
      closeActive(s);
      s.advanceCase();
    }
    const snap = JSON.parse(JSON.stringify(s.toSnapshot()));
    expect(snap.seed).toBe(99);
    const r = GameSession.fromSnapshot(catalogs, content, snap);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.session.activeCase).toEqual(s.activeCase);
    expect(r.session.toSnapshot()).toEqual(s.toSnapshot());
    // E a próxima OS gerada depois de carregar é a mesma que seria sem carregar.
    closeActive(s);
    closeActive(r.session);
    s.advanceCase();
    r.session.advanceCase();
    expect(r.session.activeCase!.id).toBe(s.activeCase!.id);
  });

  it('reparo exige a ferramenta do serviço (regra do domínio, não só aviso)', () => {
    const s = newSession({ economy: { startingCash: 20_000_00, creditLimit: 0 } }, 7);
    // Força a regra: uma OS que exige chave de impacto, sem a ferramenta comprada.
    const c = s.activeCase!;
    (c as { requiredTools?: unknown }).requiredTools = [{ upgradeId: 'chave-impacto', level: 1 }];
    s.runDiagnosticTest('visual:freios.pastilhas-dianteiras', CTX.floor, when);
    s.concludeActiveCase('freios.pastilhas-dianteiras', when);
    s.updateDraft(c.id, { urgent: true });
    s.sendQuote(later(1));
    const blocked = s.removeOldPart('freios.pastilhas-dianteiras', CTX.lifted, when);
    expect(blocked).toMatchObject({ ok: false, message: 'Este serviço exige: Chave de impacto nível 1.' });
    s.buyUpgrade('chave-impacto', when);
    expect(s.removeOldPart('freios.pastilhas-dianteiras', CTX.lifted, when).ok).toBe(true);
    delete (c as { requiredTools?: unknown }).requiredTools;
  });
});
