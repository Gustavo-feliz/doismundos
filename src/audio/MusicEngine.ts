import type { SynthToneSpec } from './FoleyLibrary';

/**
 * Motivos musicais originais procedurais (Prompt 25 — Parte de Áudio).
 * Evita arquivos pesados e problemas de direitos autorais, mantendo identidade
 * brasileira acolhedora (acordes com 7ª e 9ª suaves).
 */

export type MusicCueId = 'menu' | 'oficina' | 'evento' | 'entrega';

export const MUSIC_CUES: Readonly<Record<MusicCueId, readonly SynthToneSpec[]>> = {
  // Acorde solar de São Cristóvão (Fmaj7 -> G6)
  menu: [
    { freq: 349.23, at: 0.0, dur: 0.45, type: 'triangle', gain: 0.18 },
    { freq: 440.0, at: 0.12, dur: 0.42, type: 'sine', gain: 0.16 },
    { freq: 523.25, at: 0.24, dur: 0.4, type: 'triangle', gain: 0.16 },
    { freq: 659.25, at: 0.36, dur: 0.55, type: 'sine', gain: 0.18 },
  ],
  // Cadência calma de oficina (Am7 -> D9)
  oficina: [
    { freq: 220.0, at: 0.0, dur: 0.38, type: 'sine', gain: 0.14 },
    { freq: 329.63, at: 0.18, dur: 0.36, type: 'triangle', gain: 0.12 },
    { freq: 392.0, at: 0.36, dur: 0.44, type: 'sine', gain: 0.13 },
  ],
  // Tensão sutil para evento / fiscalização
  evento: [
    { freq: 196.0, at: 0.0, dur: 0.26, type: 'triangle', gain: 0.2 },
    { freq: 233.08, at: 0.2, dur: 0.28, type: 'sine', gain: 0.18 },
    { freq: 293.66, at: 0.4, dur: 0.38, type: 'triangle', gain: 0.18 },
  ],
  // Fanfarra curta de entrega concluída com qualidade
  entrega: [
    { freq: 523.25, at: 0.0, dur: 0.12, type: 'triangle', gain: 0.26 },
    { freq: 659.25, at: 0.1, dur: 0.12, type: 'triangle', gain: 0.26 },
    { freq: 783.99, at: 0.2, dur: 0.14, type: 'triangle', gain: 0.28 },
    { freq: 1046.5, at: 0.32, dur: 0.36, type: 'sine', gain: 0.3 },
  ],
};

