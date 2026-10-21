import { MINUTES_PER_DAY } from '../core/GameClock';
import { BANK_DEBT } from '../data/economy';
import { initialDebt } from '../economy/debt';
import { initialMissionState, type MissionState } from '../missions/MissionTracker';
import type { SessionSnapshot } from './sessionSnapshot';

/**
 * Formato do arquivo de save (GDD §21.4, Prompt 9): JSON versionado com
 * schemaVersion, data/hora, resumo (para listar slots sem carregar tudo) e
 * uma soma de verificação do conteúdo, que detecta arquivos corrompidos.
 */
export const SAVE_SCHEMA_VERSION = 4;

export type SlotId = 'auto' | 'slot1' | 'slot2' | 'slot3';
export const MANUAL_SLOTS: readonly SlotId[] = ['slot1', 'slot2', 'slot3'];
export const ALL_SLOTS: readonly SlotId[] = ['auto', ...MANUAL_SLOTS];

export interface EquipmentSave {
  liftUp: boolean;
  hoodOpen: boolean;
  drawerOpen: boolean;
  hallLightsOn: boolean;
  benchLampOn: boolean;
}

export interface SaveGame {
  /** Minuto absoluto do relógio do jogo. */
  clockMinutes: number;
  player: { x: number; z: number; yaw: number; pitch: number };
  equipment: EquipmentSave;
  session: SessionSnapshot;
  /** Campanha: missões, escolhas e diálogos pendentes (desde a versão 2). */
  missions: MissionState;
}

export interface SaveSummary {
  day: number;
  time: string;
  cashText: string;
  orderLabel: string;
  reputation: number;
}

export interface SaveEnvelope {
  schemaVersion: number;
  savedAt: string;
  slot: SlotId;
  summary: SaveSummary;
  checksum: string;
  game: SaveGame;
}

/** Soma de verificação FNV-1a (32 bits) em hexadecimal. Rápida e suficiente para detectar corrupção. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function buildEnvelope(slot: SlotId, game: SaveGame, summary: SaveSummary, savedAt: Date): SaveEnvelope {
  return { schemaVersion: SAVE_SCHEMA_VERSION, savedAt: savedAt.toISOString(), slot, summary, checksum: checksum(JSON.stringify(game)), game };
}

/**
 * Migrações: de cada versão para a seguinte. Ao mudar o formato do save,
 * aumente SAVE_SCHEMA_VERSION e registre aqui `versãoAntiga: (envelope) => envelope da versão seguinte`.
 * Saves antigos são atualizados passo a passo ao carregar; nunca no lugar do arquivo original.
 */
export type Migration = (envelope: Record<string, unknown>) => Record<string, unknown>;
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  /**
   * 1 → 2 (Prompt 10): entram a dívida do banco e as missões. A primeira
   * parcela vence pelo menos 2 dias depois do dia do save, para não nascer
   * atrasada. Quem já jogava pula os passos de andar e abrir a ficha.
   */
  1: (env) => {
    const game = env.game as { clockMinutes: number; session: Record<string, unknown>; missions?: unknown };
    const day = Math.floor(game.clockMinutes / MINUTES_PER_DAY) + 1;
    game.session.debt = initialDebt(BANK_DEBT, Math.max(BANK_DEBT.firstDueDay, day + 2));
    game.missions = { ...initialMissionState(), flags: ['andou', 'abriu-painel-carro'] };
    return env;
  },
  /** 2 → 3 (Prompt 11): entram as ferramentas e upgrades, todos no nível 0. */
  2: (env) => {
    (env.game as { session: Record<string, unknown> }).session.upgrades = {};
    return env;
  },
  /** 3 → 4 (Prompt 12): entra a semente das OS geradas. Saves antigos usam a semente 1. */
  3: (env) => {
    (env.game as { session: Record<string, unknown> }).session.seed = 1;
    return env;
  },
};

export type ParseFailure = { ok: false; reason: 'json' | 'formato' | 'versao' | 'checksum' | 'dados'; problems: string[] };
export type ParseResult = { ok: true; envelope: SaveEnvelope; migratedFrom: number | null } | ParseFailure;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/** Confere a parte do jogo que não é a sessão (relógio, jogador, equipamentos). */
export function validateGameShell(game: unknown): string[] {
  if (!isObj(game)) return ['conteúdo do jogo ausente'];
  const p: string[] = [];
  if (!Number.isSafeInteger(game.clockMinutes) || (game.clockMinutes as number) < 0) p.push('relógio inválido');
  const pl = game.player;
  if (!isObj(pl) || !finite(pl.x) || !finite(pl.z) || !finite(pl.yaw) || !finite(pl.pitch)) p.push('posição do jogador inválida');
  const eq = game.equipment;
  if (!isObj(eq) || !['liftUp', 'hoodOpen', 'drawerOpen', 'hallLightsOn', 'benchLampOn'].every((k) => typeof eq[k] === 'boolean')) p.push('estado dos equipamentos inválido');
  else if (eq.liftUp && eq.hoodOpen) p.push('estado impossível: capô aberto com o carro no alto');
  return p;
}

/**
 * Lê um save: JSON → versão → soma de verificação → migração → validação.
 * `validateGame` confere a sessão e as missões contra os dados do jogo.
 */
export function parseSave(
  text: string,
  validateGame: (game: Record<string, unknown>) => string[],
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  currentVersion = SAVE_SCHEMA_VERSION,
): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'json', problems: ['o arquivo não é um JSON válido'] };
  }
  if (!isObj(raw) || !Number.isInteger(raw.schemaVersion) || !isObj(raw.game) || typeof raw.checksum !== 'string') {
    return { ok: false, reason: 'formato', problems: ['formato de save desconhecido'] };
  }
  const version = raw.schemaVersion as number;
  if (version > currentVersion) {
    return { ok: false, reason: 'versao', problems: [`save da versão ${version}, mais nova que a deste jogo (${currentVersion})`] };
  }
  if (checksum(JSON.stringify(raw.game)) !== raw.checksum) {
    return { ok: false, reason: 'checksum', problems: ['o conteúdo não bate com a soma de verificação (arquivo corrompido ou editado)'] };
  }

  let env: Record<string, unknown> = raw;
  for (let v = version; v < currentVersion; v++) {
    const step = migrations[v];
    if (!step) return { ok: false, reason: 'versao', problems: [`não há migração da versão ${v} para ${v + 1}`] };
    env = { ...step(structuredClone(env)), schemaVersion: v + 1 };
  }

  const problems = [...validateGameShell(env.game), ...validateGame(env.game as Record<string, unknown>)];
  if (!isObj(env.summary) || typeof env.savedAt !== 'string' || Number.isNaN(Date.parse(env.savedAt))) problems.push('resumo ou data do save inválidos');
  if (problems.length) return { ok: false, reason: 'dados', problems };
  return { ok: true, envelope: env as unknown as SaveEnvelope, migratedFrom: version < currentVersion ? version : null };
}
