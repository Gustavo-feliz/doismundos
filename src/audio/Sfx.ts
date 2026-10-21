import type { EventBus } from '../core/EventBus';
import type { GameEvents, SpeakerId } from '../core/events';

/**
 * Síntese sonora procedural via Web Audio API (GDD §20.1).
 * Sem arquivos externos pesados nem risco de licença.
 */
export type SfxName = 'ok' | 'erro' | 'ferramenta' | 'pegar' | 'concluido';

type Tone = {
  freq: number;
  at: number;
  dur: number;
  type: OscillatorType;
  gain: number;
  slideTo?: number;
};

const SOUNDS: Readonly<Record<SfxName, readonly Tone[]>> = {
  ok: [
    { freq: 660, at: 0, dur: 0.09, type: 'triangle', gain: 0.5 },
    { freq: 990, at: 0.08, dur: 0.12, type: 'triangle', gain: 0.45 },
  ],
  erro: [
    { freq: 180, at: 0, dur: 0.16, type: 'square', gain: 0.25 },
    { freq: 140, at: 0.14, dur: 0.2, type: 'square', gain: 0.25 },
  ],
  // Catraca mecânica: sequência rápida de cliques metálicos.
  ferramenta: [0, 0.065, 0.13, 0.195, 0.26].flatMap((at) => [
    { freq: 1450, at, dur: 0.022, type: 'square' as const, gain: 0.18, slideTo: 920 },
    { freq: 2600, at: at + 0.004, dur: 0.014, type: 'triangle' as const, gain: 0.12 },
  ]),
  pegar: [
    { freq: 380, at: 0, dur: 0.09, type: 'sine', gain: 0.45, slideTo: 580 },
    { freq: 620, at: 0.05, dur: 0.08, type: 'triangle', gain: 0.25 },
  ],
  concluido: [
    { freq: 523.25, at: 0, dur: 0.12, type: 'triangle', gain: 0.45 },
    { freq: 659.25, at: 0.11, dur: 0.12, type: 'triangle', gain: 0.45 },
    { freq: 783.99, at: 0.22, dur: 0.24, type: 'triangle', gain: 0.45 },
  ],
};

const DIALOGUE_CUES: Readonly<Record<SpeakerId, readonly Tone[]>> = {
  'seu-ze': [
    { freq: 275, at: 0, dur: 0.06, type: 'triangle', gain: 0.28, slideTo: 310 },
    { freq: 330, at: 0.065, dur: 0.075, type: 'triangle', gain: 0.26, slideTo: 295 },
  ],
  cliente: [
    { freq: 392, at: 0, dur: 0.055, type: 'sine', gain: 0.25, slideTo: 440 },
    { freq: 466, at: 0.06, dur: 0.065, type: 'sine', gain: 0.22 },
  ],
  'gerente-banco': [
    { freq: 440, at: 0, dur: 0.07, type: 'square', gain: 0.14 },
    { freq: 480, at: 0, dur: 0.07, type: 'sine', gain: 0.18 },
    { freq: 440, at: 0.09, dur: 0.07, type: 'square', gain: 0.14 },
  ],
  narrador: [
    { freq: 528, at: 0, dur: 0.08, type: 'sine', gain: 0.2, slideTo: 587 },
  ],
};

const STEP_STARTED_TONES: readonly Tone[] = [
  { freq: 493.88, at: 0, dur: 0.06, type: 'sine', gain: 0.2, slideTo: 587.33 },
];

const STEP_COMPLETED_TONES: readonly Tone[] = [
  { freq: 587.33, at: 0, dur: 0.08, type: 'triangle', gain: 0.32 },
  { freq: 880, at: 0.07, dur: 0.12, type: 'triangle', gain: 0.3 },
];

const MISSION_HARMONIC_TAIL: readonly Tone[] = [
  { freq: 1046.5, at: 0.22, dur: 0.3, type: 'sine', gain: 0.28 },
];

export class Sfx {
  private ctx: AudioContext | null = null;
  private volume = 0.6;
  private lastConcluidoAt = -Infinity;

  /** 0–1 */
  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
  }

  /**
   * Conecta os eventos do barramento (`dialogue:line`, `mission:step`,
   * `mission:completed` e `settings:changed`) aos efeitos sonoros.
   * Retorna função de limpeza para remover os ouvintes.
   */
  bindEvents(bus: EventBus<GameEvents>): () => void {
    const offDialogue = bus.on('dialogue:line', ({ speaker }) => {
      this.playTones(DIALOGUE_CUES[speaker] ?? DIALOGUE_CUES.narrador);
    });
    const offStep = bus.on('mission:step', ({ status }) => {
      this.playTones(status === 'concluido' ? STEP_COMPLETED_TONES : STEP_STARTED_TONES);
    });
    const offMission = bus.on('mission:completed', () => {
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (nowMs - this.lastConcluidoAt < 100) {
        // `Game.ts` já tocou 'concluido' no mesmo quadro: acrescenta só o harmônico agudo.
        this.playTones(MISSION_HARMONIC_TAIL);
      } else {
        this.play('concluido');
      }
    });
    const offSettings = bus.on('settings:changed', ({ settings }) => {
      this.setVolume(settings.sfxVolume);
    });
    return () => {
      offDialogue();
      offStep();
      offMission();
      offSettings();
    };
  }

  play(name: SfxName): void {
    if (name === 'concluido') {
      this.lastConcluidoAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    }
    this.playTones(SOUNDS[name]);
  }

  private playTones(tones: readonly Tone[]): void {
    if (this.volume <= 0 || tones.length === 0) return;
    const ctx = this.context();
    if (!ctx) return;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = this.volume * 0.35;
    master.connect(ctx.destination);
    for (const t of tones) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = t.type;
      osc.frequency.setValueAtTime(t.freq, now + t.at);
      if (t.slideTo) osc.frequency.linearRampToValueAtTime(t.slideTo, now + t.at + t.dur);
      env.gain.setValueAtTime(0, now + t.at);
      env.gain.linearRampToValueAtTime(t.gain, now + t.at + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, now + t.at + t.dur);
      osc.connect(env).connect(master);
      osc.start(now + t.at);
      osc.stop(now + t.at + t.dur + 0.02);
    }
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }

  /** Cria o contexto só no primeiro som (depois de um clique do jogador, como o navegador exige). */
  private context(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      this.ctx = Ctor ? new Ctor() : null;
    } catch {
      this.ctx = null; // sem áudio: o jogo segue em silêncio
    }
    return this.ctx;
  }
}
