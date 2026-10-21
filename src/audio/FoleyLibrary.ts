/**
 * Biblioteca de Foley de oficina e síntese de som de motor por estado real das peças
 * (Prompt 25 — Parte de Áudio).
 *
 * Cada ação mecânica aplica micro-variações determinísticas de pitch (±6%) e duração
 * a cada execução para que nenhum efeito soe repetitivo ou mecânico demais.
 */

export type FoleyActionId =
  | 'catraca'
  | 'chave-impacto'
  | 'elevador-hidraulico'
  | 'capo-metal'
  | 'gaveta-trilho'
  | 'interruptor-clique'
  | 'scanner-bip'
  | 'multimetro-bip'
  | 'caixa-estoque'
  | 'carimbo-os'
  | 'caixa-registradora';

export type EngineSoundCondition =
  | 'normal'
  | 'falha-ignicao'
  | 'correia-chiando'
  | 'bateria-fraca';

export interface SynthToneSpec {
  freq: number;
  at: number;
  dur: number;
  type: OscillatorType;
  gain: number;
  slideTo?: number;
}

const BASE_FOLEY: Readonly<Record<FoleyActionId, readonly SynthToneSpec[]>> = {
  catraca: [0, 0.06, 0.12, 0.18, 0.24].flatMap((at) => [
    { freq: 1480, at, dur: 0.022, type: 'square' as const, gain: 0.2, slideTo: 940 },
    { freq: 2650, at: at + 0.004, dur: 0.014, type: 'triangle' as const, gain: 0.12 },
  ]),
  'chave-impacto': [0, 0.045, 0.09, 0.135, 0.18].flatMap((at) => [
    { freq: 220, at, dur: 0.032, type: 'sawtooth' as const, gain: 0.28, slideTo: 140 },
    { freq: 1850, at: at + 0.005, dur: 0.018, type: 'square' as const, gain: 0.16 },
  ]),
  'elevador-hidraulico': [
    { freq: 92, at: 0, dur: 0.32, type: 'sawtooth', gain: 0.22, slideTo: 118 },
    { freq: 184, at: 0.04, dur: 0.28, type: 'triangle', gain: 0.16, slideTo: 220 },
  ],
  'capo-metal': [
    { freq: 145, at: 0, dur: 0.09, type: 'triangle', gain: 0.34, slideTo: 82 },
    { freq: 620, at: 0.01, dur: 0.04, type: 'square', gain: 0.14, slideTo: 310 },
  ],
  'gaveta-trilho': [
    { freq: 310, at: 0, dur: 0.11, type: 'triangle', gain: 0.22, slideTo: 480 },
    { freq: 890, at: 0.09, dur: 0.04, type: 'sine', gain: 0.15 },
  ],
  'interruptor-clique': [
    { freq: 1950, at: 0, dur: 0.018, type: 'square', gain: 0.24, slideTo: 1100 },
  ],
  'scanner-bip': [
    { freq: 1320, at: 0, dur: 0.055, type: 'sine', gain: 0.25 },
    { freq: 1760, at: 0.065, dur: 0.075, type: 'sine', gain: 0.25 },
  ],
  'multimetro-bip': [
    { freq: 2048, at: 0, dur: 0.09, type: 'square', gain: 0.18 },
  ],
  'caixa-estoque': [
    { freq: 190, at: 0, dur: 0.08, type: 'triangle', gain: 0.28, slideTo: 130 },
  ],
  'carimbo-os': [
    { freq: 160, at: 0, dur: 0.05, type: 'triangle', gain: 0.32, slideTo: 95 },
    { freq: 440, at: 0.04, dur: 0.06, type: 'sine', gain: 0.18 },
  ],
  'caixa-registradora': [
    { freq: 987.77, at: 0, dur: 0.08, type: 'triangle', gain: 0.32 },
    { freq: 1318.51, at: 0.075, dur: 0.22, type: 'sine', gain: 0.34 },
  ],
};

// Multiplicadores cíclicos determinísticos (±6%) para variar cada execução consecutiva
const PITCH_OFFSETS = [1.0, 1.045, 0.96, 1.028, 0.945, 1.058, 0.982] as const;

export function buildVariedFoleyTones(action: FoleyActionId, invocationCount: number): SynthToneSpec[] {
  const base = BASE_FOLEY[action];
  const factor = PITCH_OFFSETS[Math.abs(invocationCount) % PITCH_OFFSETS.length]!;
  return base.map((t) => ({
    ...t,
    freq: Number((t.freq * factor).toFixed(2)),
    slideTo: t.slideTo !== undefined ? Number((t.slideTo * factor).toFixed(2)) : undefined,
  }));
}

/**
 * Gera a assinatura sonora do motor conforme o estado real de diagnóstico/reparo:
 * - `normal`: pulsos regulares de combustão;
 * - `falha-ignicao`: cilindro falhando (misfire com queda de frequência no 3º pulso);
 * - `correia-chiando`: pulsos acompanhados de harmônico agudo de chiado de correia;
 * - `bateria-fraca`: rotação de partida lenta e pesada.
 */
export function buildEngineConditionTones(condition: EngineSoundCondition): SynthToneSpec[] {
  switch (condition) {
    case 'normal':
      return [0, 0.08, 0.16, 0.24].map((at, i) => ({
        freq: 112 + (i % 2) * 6,
        at,
        dur: 0.07,
        type: 'sawtooth',
        gain: 0.24,
        slideTo: 124,
      }));
    case 'falha-ignicao':
      return [
        { freq: 112, at: 0, dur: 0.07, type: 'sawtooth', gain: 0.24, slideTo: 120 },
        { freq: 115, at: 0.08, dur: 0.07, type: 'sawtooth', gain: 0.24, slideTo: 122 },
        // 3º cilindro falha (engasgo grave e atraso)
        { freq: 68, at: 0.18, dur: 0.09, type: 'square', gain: 0.18, slideTo: 54 },
        { freq: 110, at: 0.29, dur: 0.07, type: 'sawtooth', gain: 0.22, slideTo: 118 },
      ];
    case 'correia-chiando':
      return [
        ...buildEngineConditionTones('normal'),
        { freq: 2850, at: 0.02, dur: 0.12, type: 'sine', gain: 0.14, slideTo: 3120 },
        { freq: 2920, at: 0.16, dur: 0.12, type: 'sine', gain: 0.14, slideTo: 2740 },
      ];
    case 'bateria-fraca':
      return [
        { freq: 62, at: 0, dur: 0.18, type: 'sawtooth', gain: 0.22, slideTo: 48 },
        { freq: 58, at: 0.22, dur: 0.22, type: 'sawtooth', gain: 0.2, slideTo: 42 },
      ];
  }
}

