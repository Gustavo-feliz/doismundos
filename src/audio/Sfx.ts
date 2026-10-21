import type { EventBus } from '../core/EventBus';
import type { GameEvents, SpeakerId } from '../core/events';
import { AudioMixer, type AudioBusId } from './AudioMixer';
import {
  buildEngineConditionTones,
  buildVariedFoleyTones,
  type EngineSoundCondition,
  type FoleyActionId,
  type SynthToneSpec,
} from './FoleyLibrary';
import { MUSIC_CUES, type MusicCueId } from './MusicEngine';

/**
 * Síntese sonora procedural via Web Audio API (GDD §20.1 e Prompt 25).
 * Inclui mixer multi-barramento (`master`, `music`, `sfx`, `voice`, `ambient`, `ui`)
 * com limiter, ducking automático em diálogos, foley com variação de pitch e
 * assinatura sonora do motor por condição mecânica.
 */
export type SfxName = 'ok' | 'erro' | 'ferramenta' | 'pegar' | 'concluido';

type Tone = SynthToneSpec;

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

const UPGRADE_CHIME: readonly Tone[] = [
  { freq: 440, at: 0, dur: 0.09, type: 'triangle', gain: 0.34 },
  { freq: 554.37, at: 0.08, dur: 0.1, type: 'triangle', gain: 0.34 },
  { freq: 659.25, at: 0.16, dur: 0.12, type: 'triangle', gain: 0.36 },
  { freq: 880, at: 0.25, dur: 0.22, type: 'sine', gain: 0.32 },
];

const DRIVE_START_TONES: readonly Tone[] = [
  { freq: 95, at: 0, dur: 0.09, type: 'sawtooth', gain: 0.22, slideTo: 135 },
  { freq: 115, at: 0.08, dur: 0.18, type: 'triangle', gain: 0.28, slideTo: 165 },
];

const DRIVE_END_TONES: readonly Tone[] = [
  { freq: 160, at: 0, dur: 0.12, type: 'triangle', gain: 0.22, slideTo: 92 },
];

type UpgradeAudioEvents = GameEvents & {
  'upgrade:changed': { upgradeId: string; level: number };
};

export class Sfx {
  private ctx: AudioContext | null = null;
  private volume = 0.6;
  private lastConcluidoAt = -Infinity;
  private ambientGain: GainNode | null = null;
  private ambientOsc: OscillatorNode | null = null;
  private inPlayingState = false;
  private inDrivingState = false;
  private foleyCounter = 0;
  private hasImpactWrench = false;
  readonly mixer = new AudioMixer();

  /** 0–1 */
  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    this.mixer.setBusVolume('sfx', this.volume);
    this.mixer.setBusVolume('ui', this.volume);
    this.mixer.setBusVolume('voice', this.volume);
    this.mixer.setBusVolume('ambient', this.volume * 0.75);
    this.syncAmbientGain();
  }

  setBusVolume(bus: AudioBusId, volume: number): void {
    this.mixer.setBusVolume(bus, volume);
    if (bus === 'sfx') this.volume = this.mixer.getBusVolume('sfx');
    this.syncAmbientGain();
  }

  /**
   * Conecta os eventos do barramento (`dialogue:line`, `mission:step`,
   * `mission:completed`, `upgrade:changed`, `state:changed` e `settings:changed`)
   * aos efeitos sonoros, ducking de música e ambiência da oficina.
   * Retorna função de limpeza para remover os ouvintes.
   */
  bindEvents(bus: EventBus<GameEvents>): () => void {
    const offDialogue = bus.on('dialogue:line', ({ speaker }) => {
      this.mixer.triggerDialogueDucking(1800);
      this.playTones(DIALOGUE_CUES[speaker] ?? DIALOGUE_CUES.narrador, 'voice');
    });
    const offStep = bus.on('mission:step', ({ status }) => {
      this.playTones(status === 'concluido' ? STEP_COMPLETED_TONES : STEP_STARTED_TONES, 'ui');
    });
    const offMission = bus.on('mission:completed', () => {
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (nowMs - this.lastConcluidoAt < 100) {
        // `Game.ts` já tocou 'concluido' no mesmo quadro: acrescenta só o harmônico agudo.
        this.playTones(MISSION_HARMONIC_TAIL, 'ui');
      } else {
        this.play('concluido');
      }
    });
    const offUpgrade = (bus as EventBus<UpgradeAudioEvents>).on('upgrade:changed', ({ upgradeId, level }) => {
      if (upgradeId === 'chave-impacto') this.hasImpactWrench = level > 0;
      if (level > 0) this.playTones(UPGRADE_CHIME, 'ui');
    });
    const offAction = bus.on('feedback:action', ({ kind }) => {
      switch (kind) {
        case 'remover':
        case 'instalar':
          this.playFoley(this.hasImpactWrench ? 'chave-impacto' : 'catraca');
          break;
        case 'exame':
          this.playFoley('scanner-bip');
          break;
        case 'compra':
          this.playFoley('caixa-registradora');
          break;
        case 'entrega':
          this.playMusicCue('entrega');
          break;
        case 'erro':
          this.play('erro');
          break;
      }
    });
    const offReward = bus.on('feedback:reward', ({ kind, amount }) => {
      if (kind === 'pagamento') {
        this.playFoley('caixa-registradora');
      } else if (kind === 'missao') {
        this.playFoley('carimbo-os');
      } else if (kind === 'reputacao') {
        if ((amount ?? 0) >= 0) {
          this.playTones(STEP_COMPLETED_TONES, 'ui');
        } else {
          this.playTones(SOUNDS.erro, 'ui');
        }
      }
    });
    const offState = bus.on('state:changed', ({ from, to }) => {
      this.inPlayingState = to === 'playing';
      this.inDrivingState = to === 'driving';
      if (to === 'driving' && from !== 'paused') {
        this.playTones(DRIVE_START_TONES, 'sfx');
      } else if (from === 'driving' && to === 'playing') {
        this.playTones(DRIVE_END_TONES, 'sfx');
      } else if (to === 'menu') {
        this.playMusicCue('menu');
      }
      this.syncAmbientGain();
    });
    const offSettings = bus.on('settings:changed', ({ settings }) => {
      this.setVolume(settings.sfxVolume);
    });
    return () => {
      offDialogue();
      offStep();
      offMission();
      offUpgrade();
      offAction();
      offReward();
      offState();
      offSettings();
    };
  }

  play(name: SfxName): void {
    if (name === 'concluido') {
      this.lastConcluidoAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    }
    if (name === 'ferramenta') {
      this.playFoley('catraca');
      return;
    }
    const bus: AudioBusId = name === 'ok' || name === 'erro' || name === 'concluido' ? 'ui' : 'sfx';
    this.playTones(SOUNDS[name], bus);
  }

  /** Toca um efeito de foley mecânico com variação de pitch para nunca soar repetitivo. */
  playFoley(action: FoleyActionId): Tone[] {
    const tones = buildVariedFoleyTones(action, this.foleyCounter++);
    this.playTones(tones, 'sfx');
    return tones;
  }

  /** Toca o som do motor modulado pelo estado mecânico real (ex.: falha de ignição, correia chiando). */
  playEngineCondition(condition: EngineSoundCondition): Tone[] {
    const tones = buildEngineConditionTones(condition);
    this.playTones(tones, 'sfx');
    return tones;
  }

  /** Toca um motivo musical original no barramento `music` (sujeito a ducking nos diálogos). */
  playMusicCue(cue: MusicCueId): Tone[] {
    const tones = [...MUSIC_CUES[cue]];
    this.playTones(tones, 'music');
    return tones;
  }

  private playTones(tones: readonly Tone[], bus: AudioBusId = 'sfx'): void {
    if (this.volume <= 0 || tones.length === 0) return;
    const ctx = this.context();
    if (!ctx) return;
    const now = ctx.currentTime;
    const busNode = this.mixer.getBusNode(ctx, bus);
    const out = ctx.createGain();
    out.gain.value = busNode ? 1.0 : this.volume * 0.35;
    out.connect(busNode ?? ctx.destination);
    for (const t of tones) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = t.type;
      osc.frequency.setValueAtTime(t.freq, now + t.at);
      if (t.slideTo) osc.frequency.linearRampToValueAtTime(t.slideTo, now + t.at + t.dur);
      env.gain.setValueAtTime(0, now + t.at);
      env.gain.linearRampToValueAtTime(t.gain, now + t.at + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, now + t.at + t.dur);
      osc.connect(env).connect(out);
      osc.start(now + t.at);
      osc.stop(now + t.at + t.dur + 0.02);
    }
  }

  private syncAmbientGain(): void {
    const active = (this.inPlayingState || this.inDrivingState) && this.volume > 0;
    if (!active) {
      if (this.ambientGain && this.ctx) {
        this.ambientGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      }
      return;
    }
    const ctx = this.context();
    if (!ctx) return;
    if (!this.ambientGain) {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 110; // Ressonância suave de oficina/transformador distante
        gain.gain.value = 0;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        this.ambientOsc = osc;
        this.ambientGain = gain;
      } catch {
        return;
      }
    }
    if (this.ambientOsc) {
      this.ambientOsc.frequency.setTargetAtTime(this.inDrivingState ? 72 : 110, ctx.currentTime, 0.12);
    }
    const targetGain = this.volume * (this.inDrivingState ? 0.02 : 0.012);
    this.ambientGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.15);
  }

  dispose(): void {
    try {
      this.ambientOsc?.stop();
    } catch {
      // ignora se já parado
    }
    this.ambientOsc = null;
    this.ambientGain = null;
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
      const w = typeof window !== 'undefined' ? window : undefined;
      const Ctor = w ? (w.AudioContext ?? (w as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
      this.ctx = Ctor ? new Ctor() : null;
    } catch {
      this.ctx = null; // sem áudio: o jogo segue em silêncio
    }
    return this.ctx;
  }
}
