import { canSpend } from '../economy/ledger';
import type { Cents } from '../economy/money';
import { DataValidationError, ID_PATTERN } from '../vehicles/types';

/**
 * Ferramentas e upgrades da oficina (GDD §12, §15.3, Prompt 11). Regras puras.
 * Cada nível tem custo e um efeito MEDIDO em tempo de jogo, aplicado pelas
 * regras de diagnóstico, reparo e estoque (não só texto na tela).
 */

/** O que o item acelera. */
export type UpgradeEffect = 'exame-visual' | 'exame-scanner' | 'remocao' | 'instalacao' | 'pegar-peca';
export const UPGRADE_EFFECTS: readonly UpgradeEffect[] = ['exame-visual', 'exame-scanner', 'remocao', 'instalacao', 'pegar-peca'];

export const EFFECT_LABEL: Readonly<Record<UpgradeEffect, string>> = {
  'exame-visual': 'Inspeção visual',
  'exame-scanner': 'Exame com scanner',
  remocao: 'Remover peça',
  instalacao: 'Instalar peça',
  'pegar-peca': 'Pegar peça na estante',
};

export type UpgradeKind = 'ferramenta' | 'oficina';

export interface UpgradeLevelDef {
  cost: Cents;
  /** Redução de tempo do efeito, em % (acumulado do nível, não somado aos anteriores). */
  reductionPct: number;
  /** Reputação geral mínima para comprar este nível (0 = sem exigência). */
  minReputation: number;
}

export interface UpgradeDef {
  id: string;
  kind: UpgradeKind;
  name: string;
  description: string;
  effect: UpgradeEffect;
  /** Tempo típico (min) usado só para mostrar o antes/depois na tela. */
  exampleMinutes: number;
  /** Níveis 1, 2 e 3 (o nível 0 é não ter o item). */
  levels: readonly UpgradeLevelDef[];
}

/** Nível comprado de cada item (ausente = 0). */
export type UpgradeLevels = Readonly<Record<string, number>>;

/** Redução de tempo atual, em %, por efeito. */
export type TimeModifiers = Readonly<Record<UpgradeEffect, number>>;

export const NO_MODIFIERS: TimeModifiers = Object.fromEntries(UPGRADE_EFFECTS.map((e) => [e, 0])) as Record<UpgradeEffect, number>;

export function validateUpgrades(defs: readonly UpgradeDef[]): void {
  const p: string[] = [];
  const ids = new Set<string>();
  for (const d of defs) {
    const at = `upgrade "${d.id}"`;
    if (!ID_PATTERN.test(d.id)) p.push(`${at}: ID inválido`);
    if (ids.has(d.id)) p.push(`${at}: ID repetido`);
    ids.add(d.id);
    if (!d.name.trim() || !d.description.trim()) p.push(`${at}: nome ou descrição vazios`);
    if (!UPGRADE_EFFECTS.includes(d.effect)) p.push(`${at}: efeito desconhecido "${d.effect}"`);
    if (!Number.isInteger(d.exampleMinutes) || d.exampleMinutes < 1) p.push(`${at}: tempo de exemplo inválido`);
    if (d.levels.length !== 3) p.push(`${at}: precisa de exatamente 3 níveis`);
    d.levels.forEach((l, i) => {
      const prev = d.levels[i - 1];
      if (!Number.isInteger(l.cost) || l.cost <= 0) p.push(`${at}, nível ${i + 1}: custo inválido`);
      if (!Number.isInteger(l.reductionPct) || l.reductionPct <= 0 || l.reductionPct >= 100) p.push(`${at}, nível ${i + 1}: redução deve ficar entre 1 e 99%`);
      if (!Number.isInteger(l.minReputation) || l.minReputation < 0 || l.minReputation > 100) p.push(`${at}, nível ${i + 1}: reputação mínima inválida`);
      if (prev && (l.reductionPct <= prev.reductionPct || l.cost <= prev.cost)) p.push(`${at}, nível ${i + 1}: precisa custar e render mais que o anterior`);
    });
  }
  if (p.length) throw new DataValidationError('ferramentas e upgrades', p);
}

export function levelOf(levels: UpgradeLevels, id: string): number {
  return levels[id] ?? 0;
}

/** Redução (%) que o item dá no nível informado. */
export function reductionAt(def: UpgradeDef, level: number): number {
  return level <= 0 ? 0 : (def.levels[Math.min(level, def.levels.length) - 1]?.reductionPct ?? 0);
}

/** Aplica a redução a um tempo: arredonda, e nunca zera um passo que tinha tempo. */
export function reduceMinutes(minutes: number, pct: number): number {
  if (minutes <= 0 || pct <= 0) return minutes;
  return Math.max(1, Math.round((minutes * (100 - pct)) / 100));
}

/** Efeitos de tudo o que foi comprado. Se dois itens acelerarem a mesma coisa, vale o maior. */
export function timeModifiers(defs: readonly UpgradeDef[], levels: UpgradeLevels): TimeModifiers {
  const m: Record<UpgradeEffect, number> = { ...NO_MODIFIERS };
  for (const d of defs) m[d.effect] = Math.max(m[d.effect], reductionAt(d, levelOf(levels, d.id)));
  return m;
}

export type PurchaseCheck = { ok: true; level: number; cost: Cents } | { ok: false; reason: string };

/** Pode comprar o próximo nível? Confere nível máximo, reputação e caixa. */
export function checkPurchase(def: UpgradeDef, levels: UpgradeLevels, cash: Cents, creditLimit: Cents, reputation: number): PurchaseCheck {
  const current = levelOf(levels, def.id);
  const next = def.levels[current];
  if (!next) return { ok: false, reason: `${def.name} já está no nível máximo.` };
  if (reputation < next.minReputation) return { ok: false, reason: `Precisa de reputação ${next.minReputation} (atual: ${Math.floor(reputation)}).` };
  if (!canSpend(cash, next.cost, creditLimit)) return { ok: false, reason: 'Caixa insuficiente.' };
  return { ok: true, level: current + 1, cost: next.cost };
}

/** Confere os níveis vindos de um save. Lista vazia = válido. */
export function upgradeLevelsProblems(raw: unknown, defs: readonly UpgradeDef[]): string[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return ['upgrades ausentes'];
  const p: string[] = [];
  for (const [id, level] of Object.entries(raw)) {
    const def = defs.find((d) => d.id === id);
    if (!def) p.push(`upgrade desconhecido "${id}"`);
    else if (!Number.isInteger(level) || (level as number) < 0 || (level as number) > def.levels.length) p.push(`upgrade "${id}": nível inválido`);
  }
  return p;
}
