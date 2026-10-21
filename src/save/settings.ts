/**
 * Preferências do jogador (não é o save do jogo). Ficam no localStorage,
 * que o GDD §21.4 aceita para preferências. Versionadas e validadas:
 * um valor estranho no storage nunca quebra o jogo, só volta ao padrão.
 */
export const SETTINGS_SCHEMA_VERSION = 1;
export const SETTINGS_STORAGE_KEY = 'simulador-mecanico:settings';

import { sanitizeOverrides, type BindingOverrides } from '../core/bindings';

export type GraphicsQuality = 'baixa' | 'media' | 'alta';
/** Modo para daltonismo (GDD §20.4): troca as cores de estado por paletas seguras. */
export type ColorVision = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia';
export const COLOR_VISIONS: readonly ColorVision[] = ['normal', 'protanopia', 'deuteranopia', 'tritanopia'];
/** Limite de quadros por segundo (0 = sem limite, segue o monitor). */
export const FPS_LIMITS = [0, 30, 60, 120] as const;
/** Velocidade do relógio do jogo (GDD §20.4: velocidade do tempo). */
export const TIME_SPEEDS = [0.5, 1, 2] as const;

export interface Settings {
  schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
  mouseSensitivity: number;
  invertY: boolean;
  fov: number;
  reduceMotion: boolean;
  quality: GraphicsQuality;
  /** Balanço ao andar e inclinação ao virar (Prompt 25). "Reduzir movimento" desliga de qualquer jeito. */
  cameraSway: boolean;
  /** Mira assistida: o mouse fica mais lento sobre algo interativo (Prompt 25). */
  aimAssist: boolean;
  /** Dicas do Seu Zé no diagnóstico (GDD §20.4: assistência de diagnóstico). */
  diagnosisAssist: boolean;
  /** Volume dos efeitos sonoros, 0–1. */
  sfxVolume: number;
  /** Escala do texto da interface (Prompt 24). */
  textScale: number;
  colorVision: ColorVision;
  fpsLimit: (typeof FPS_LIMITS)[number];
  timeSpeed: (typeof TIME_SPEEDS)[number];
  /** Teclas trocadas pelo jogador (só as diferentes do padrão). */
  keyBindings: BindingOverrides;
}

export const SETTINGS_LIMITS = {
  mouseSensitivity: { min: 0.2, max: 3, step: 0.05 },
  fov: { min: 60, max: 100, step: 1 },
  sfxVolume: { min: 0, max: 1, step: 0.05 },
  textScale: { min: 0.85, max: 1.5, step: 0.05 },
} as const;

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  mouseSensitivity: 1,
  invertY: false,
  fov: 75,
  reduceMotion: false,
  quality: 'alta',
  cameraSway: true,
  aimAssist: true,
  diagnosisAssist: true,
  sfxVolume: 0.6,
  textScale: 1,
  colorVision: 'normal',
  fpsLimit: 0,
  timeSpeed: 1,
  keyBindings: {},
};

const QUALITIES: readonly GraphicsQuality[] = ['baixa', 'media', 'alta'];

/** O que cada nível de qualidade liga ou desliga. */
export function qualityProfile(quality: GraphicsQuality): { maxDpr: number; shadows: boolean; shadowMapSize: number } {
  switch (quality) {
    case 'baixa':
      return { maxDpr: 1, shadows: false, shadowMapSize: 512 };
    case 'media':
      return { maxDpr: 1.5, shadows: true, shadowMapSize: 1024 };
    case 'alta':
      return { maxDpr: 2, shadows: true, shadowMapSize: 2048 };
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Converte qualquer coisa vinda do storage em Settings válidas. */
export function parseSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const r = raw as Record<string, unknown>;
  // Versão futura ou desconhecida: não tentamos adivinhar, voltamos ao padrão.
  if (r.schemaVersion !== SETTINGS_SCHEMA_VERSION) return { ...DEFAULT_SETTINGS };
  const { mouseSensitivity: ms, fov } = SETTINGS_LIMITS;
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    mouseSensitivity: clampNumber(r.mouseSensitivity, ms.min, ms.max, DEFAULT_SETTINGS.mouseSensitivity),
    invertY: typeof r.invertY === 'boolean' ? r.invertY : DEFAULT_SETTINGS.invertY,
    fov: Math.round(clampNumber(r.fov, fov.min, fov.max, DEFAULT_SETTINGS.fov)),
    reduceMotion: typeof r.reduceMotion === 'boolean' ? r.reduceMotion : DEFAULT_SETTINGS.reduceMotion,
    quality: QUALITIES.includes(r.quality as GraphicsQuality) ? (r.quality as GraphicsQuality) : DEFAULT_SETTINGS.quality,
    // Campo novo na mesma versão: quem já tinha preferências salvas recebe o padrão.
    cameraSway: typeof r.cameraSway === 'boolean' ? r.cameraSway : DEFAULT_SETTINGS.cameraSway,
    aimAssist: typeof r.aimAssist === 'boolean' ? r.aimAssist : DEFAULT_SETTINGS.aimAssist,
    diagnosisAssist: typeof r.diagnosisAssist === 'boolean' ? r.diagnosisAssist : DEFAULT_SETTINGS.diagnosisAssist,
    sfxVolume: clampNumber(r.sfxVolume, 0, 1, DEFAULT_SETTINGS.sfxVolume),
    // Campos do Prompt 24 (mesma versão: quem já tinha preferências recebe o padrão).
    textScale: Math.round(clampNumber(r.textScale, SETTINGS_LIMITS.textScale.min, SETTINGS_LIMITS.textScale.max, DEFAULT_SETTINGS.textScale) * 100) / 100,
    colorVision: COLOR_VISIONS.includes(r.colorVision as ColorVision) ? (r.colorVision as ColorVision) : DEFAULT_SETTINGS.colorVision,
    fpsLimit: (FPS_LIMITS as readonly number[]).includes(r.fpsLimit as number) ? (r.fpsLimit as Settings['fpsLimit']) : DEFAULT_SETTINGS.fpsLimit,
    timeSpeed: (TIME_SPEEDS as readonly number[]).includes(r.timeSpeed as number) ? (r.timeSpeed as Settings['timeSpeed']) : DEFAULT_SETTINGS.timeSpeed,
    keyBindings: sanitizeOverrides(r.keyBindings),
  };
}

/** Subconjunto do Storage que usamos (facilita testar com um objeto em memória). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class SettingsStore {
  constructor(
    private readonly storage: StorageLike | null,
    private readonly key = SETTINGS_STORAGE_KEY,
  ) {}

  load(): Settings {
    if (!this.storage) return { ...DEFAULT_SETTINGS };
    try {
      const text = this.storage.getItem(this.key);
      return text ? parseSettings(JSON.parse(text)) : { ...DEFAULT_SETTINGS };
    } catch (error) {
      console.warn('[settings] Preferências ilegíveis; usando o padrão.', error);
      return { ...DEFAULT_SETTINGS };
    }
  }

  /** Retorna false se não deu para salvar (ex.: navegação privada, cota cheia). */
  save(settings: Settings): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(this.key, JSON.stringify(parseSettings(settings)));
      return true;
    } catch (error) {
      console.warn('[settings] Não foi possível salvar as preferências.', error);
      return false;
    }
  }
}

/** localStorage pode lançar erro só de ser acessado (cookies bloqueados). */
export function getBrowserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
