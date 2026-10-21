import { describe, expect, it } from 'vitest';
import { UPGRADES } from '../../src/data/upgrades';
import { testsForCase } from '../../src/diagnostics/rules';
import { GameSession } from '../../src/game/GameSession';
import { buildComputerView, buildServiceView } from '../../src/orders/views';
import { checkPurchase, reduceMinutes, timeModifiers, upgradeLevelsProblems, validateUpgrades, type UpgradeDef } from '../../src/upgrades/rules';
import { DataValidationError } from '../../src/vehicles/types';
import { formatBRL } from '../../src/economy/money';
import { CTX, buyAndReceive, catalogs, content, diagnosticData, newSession, when } from './fixtures';

const PADS = 'freios.pastilhas-dianteiras';
const PADS_PART = 'pastilha-freio-diant-ventura-brisa';
const def = (id: string) => UPGRADES.find((u) => u.id === id)!;

/** Sessão rica o bastante para comprar tudo (caixa alto) e com reputação ajustável. */
function richSession(reputation = 50): GameSession {
  const s = newSession({ economy: { startingCash: 20_000_00, creditLimit: 0 } });
  (s as unknown as { rep: { general: { score: number } } }).rep.general.score = reputation;
  return s;
}

/** Leva a OS 001 até o reparo, com a peça certa já em estoque. */
function readyToRepair(s: GameSession) {
  const c = s.activeCase!;
  s.runDiagnosticTest(`visual:${PADS}`, CTX.floor, when);
  s.concludeActiveCase(PADS, when);
  s.updateDraft(c.id, { urgent: true });
  s.sendQuote(when);
  return buyAndReceive(s, PADS_PART);
}

describe('dados de ferramentas e upgrades', () => {
  it('o catálogo é válido: 3 níveis, cada um custa e rende mais que o anterior', () => {
    expect(() => validateUpgrades(UPGRADES)).not.toThrow();
    expect(UPGRADES.map((u) => u.id)).toEqual(['chave-impacto', 'scanner', 'iluminacao', 'armario-ferramentas', 'organizacao-estoque']);
  });

  it('erros de balanceamento viram mensagens úteis', () => {
    const bad: UpgradeDef = { ...def('scanner'), id: 'Scanner X', levels: [{ cost: 100, reductionPct: 30, minReputation: 0 }, { cost: 50, reductionPct: 20, minReputation: 0 }] };
    expect(() => validateUpgrades([bad])).toThrow(DataValidationError);
    try {
      validateUpgrades([bad]);
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('ID inválido');
      expect(msg).toContain('exatamente 3 níveis');
      expect(msg).toContain('custar e render mais');
    }
  });

  it('redução de tempo arredonda e nunca zera um passo', () => {
    expect(reduceMinutes(23, 20)).toBe(18);
    expect(reduceMinutes(1, 85)).toBe(1);
    expect(reduceMinutes(0, 50)).toBe(0);
    expect(reduceMinutes(10, 0)).toBe(10);
  });
});

describe('compra', () => {
  it('nível a nível, debitando o caixa no livro como investimento', () => {
    const s = richSession();
    const cash = s.cash;
    expect(s.buyUpgrade('iluminacao', when)).toMatchObject({ ok: true });
    expect(s.upgradeLevel('iluminacao')).toBe(1);
    expect(s.cash).toBe(cash - 220_00);
    expect(s.transactions.at(-1)).toMatchObject({ kind: 'despesa', category: 'investimento', amount: 220_00, description: 'Iluminação: nível 1' });
    expect(s.recomputeCash()).toBe(s.cash);
    s.buyUpgrade('iluminacao', when);
    expect(s.upgradeLevel('iluminacao')).toBe(2);
  });

  it('bloqueios: caixa insuficiente, reputação baixa, nível máximo e item desconhecido', () => {
    const poor = newSession({ economy: { startingCash: 100_00, creditLimit: 0 } });
    expect(poor.buyUpgrade('scanner', when)).toMatchObject({ ok: false, message: 'Caixa insuficiente.' });
    expect(poor.upgradeLevel('scanner')).toBe(0);
    expect(poor.cash).toBe(100_00);

    const s = richSession(50);
    s.buyUpgrade('scanner', when);
    s.buyUpgrade('scanner', when);
    const blocked = s.buyUpgrade('scanner', when);
    expect(blocked.ok).toBe(false);
    expect(blocked.message).toMatch(/reputação 60/);
    expect(s.upgradeLevel('scanner')).toBe(2);

    const famous = richSession(80);
    for (let i = 0; i < 3; i++) expect(famous.buyUpgrade('scanner', when).ok).toBe(true);
    expect(famous.buyUpgrade('scanner', when)).toMatchObject({ ok: false, message: 'Scanner automotivo já está no nível máximo.' });
    expect(famous.buyUpgrade('helicoptero', when).ok).toBe(false);
  });

  it('crédito com fornecedor também vale para investir (mesma regra de gasto)', () => {
    expect(checkPurchase(def('iluminacao'), {}, 100_00, 200_00, 50)).toMatchObject({ ok: true, level: 1 });
    expect(checkPurchase(def('iluminacao'), {}, 100_00, 0, 50)).toMatchObject({ ok: false });
  });
});

describe('efeitos aplicados pelas regras', () => {
  it('iluminação e scanner encurtam os exames (e a evidência registra o tempo novo)', () => {
    const s = richSession();
    const c = s.activeCase!;
    const minutesOf = (id: string) => testsForCase(c, catalogs, diagnosticData, s.examSpeed).find((t) => t.id === id)!.minutes;
    const visualBefore = minutesOf(`visual:${PADS}`);
    const scannerBefore = minutesOf('scanner');
    s.buyUpgrade('iluminacao', when);
    s.buyUpgrade('scanner', when);
    expect(minutesOf(`visual:${PADS}`)).toBe(reduceMinutes(visualBefore, 20));
    expect(minutesOf('scanner')).toBe(reduceMinutes(scannerBefore, 20));
    const run = s.runDiagnosticTest(`visual:${PADS}`, CTX.floor, when);
    expect(run.ok && run.value.minutes).toBe(reduceMinutes(visualBefore, 20));
  });

  it('chave de impacto e armário encurtam remover e instalar; a aba Serviço mostra o mesmo tempo', () => {
    const base = newSession();
    const lot0 = readyToRepair(base);
    const removeBase = base.removeOldPart(PADS, CTX.lifted, when).minutes;
    base.takePart(lot0.lotId);
    const installBase = base.installHeldPart(PADS, CTX.lifted, when).minutes;

    const s = richSession();
    s.buyUpgrade('chave-impacto', when); // −20%
    s.buyUpgrade('armario-ferramentas', when); // −15%
    const lot = readyToRepair(s);
    const view = buildServiceView(s, s.activeCase!.id, CTX.lifted, when.at)!;
    const item = view.items.find((i) => i.slot === PADS)!;
    expect(item.removeMinutes).toBe(reduceMinutes(removeBase, 20));
    expect(s.removeOldPart(PADS, CTX.lifted, when).minutes).toBe(reduceMinutes(removeBase, 20));
    s.takePart(lot.lotId);
    expect(s.installHeldPart(PADS, CTX.lifted, when).minutes).toBe(reduceMinutes(installBase, 15));
  });

  it('organização do estoque encurta pegar peça na estante', () => {
    const s = richSession();
    const lot = s.stock[0]!;
    expect(s.takePart(lot.lotId).minutes).toBe(6);
    s.returnHeldPart();
    s.buyUpgrade('organizacao-estoque', when);
    s.buyUpgrade('organizacao-estoque', when);
    expect(s.takePart(s.stock[0]!.lotId).minutes).toBe(reduceMinutes(6, 65));
  });

  it('a tela mostra o antes/depois do próximo nível e o motivo do bloqueio', () => {
    const s = richSession(50);
    const view = buildComputerView(s, when.at, s.activeCase!.vehicle.id);
    const light = view.upgrades.find((u) => u.id === 'iluminacao')!;
    expect(light).toMatchObject({ level: 0, maxLevel: 3, currentText: 'sem redução (10 → 10 min)' });
    expect(light.next).toMatchObject({ level: 1, costText: formatBRL(220_00), beforeText: '10 min', afterText: '8 min (−20%)', blockedReason: null });
    s.buyUpgrade('iluminacao', when);
    s.buyUpgrade('iluminacao', when);
    const after = buildComputerView(s, when.at, null).upgrades.find((u) => u.id === 'iluminacao')!;
    expect(after.currentText).toBe('−35% (10 → 7 min)');
    expect(after.next!.blockedReason).toMatch(/reputação 55/);
  });

  it('modificadores: item no nível 0 não muda nada', () => {
    expect(Object.values(timeModifiers(UPGRADES, {})).every((v) => v === 0)).toBe(true);
    expect(timeModifiers(UPGRADES, { scanner: 3 })['exame-scanner']).toBe(60);
  });
});

describe('persistência', () => {
  it('níveis voltam iguais do save, com os efeitos valendo', () => {
    const s = richSession();
    s.buyUpgrade('chave-impacto', when);
    s.buyUpgrade('organizacao-estoque', when);
    const snap = JSON.parse(JSON.stringify(s.toSnapshot()));
    expect(snap.upgrades).toEqual({ 'chave-impacto': 1, 'organizacao-estoque': 1 });
    const restored = GameSession.fromSnapshot(catalogs, { ...content, economy: { startingCash: 20_000_00, creditLimit: 0 } }, snap);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.session.upgrades).toEqual(s.upgrades);
    expect(restored.session.modifiers).toEqual(s.modifiers);
    expect(restored.session.cash).toBe(s.cash);
  });

  it('níveis inválidos no save são recusados', () => {
    expect(upgradeLevelsProblems({ scanner: 4 }, UPGRADES)).toEqual(['upgrade "scanner": nível inválido']);
    expect(upgradeLevelsProblems({ turbo: 1 }, UPGRADES)).toEqual(['upgrade desconhecido "turbo"']);
    expect(upgradeLevelsProblems(null, UPGRADES)).toEqual(['upgrades ausentes']);
    const snap = { ...newSession().toSnapshot(), upgrades: { scanner: -1 } };
    const r = GameSession.fromSnapshot(catalogs, content, snap);
    expect(r.ok).toBe(false);
  });
});
