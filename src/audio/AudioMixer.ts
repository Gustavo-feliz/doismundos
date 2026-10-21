/**
 * Mixer de áudio por barramentos com limiter (DynamicsCompressor) e ducking automático
 * durante diálogos (Prompt 25 — Parte de Áudio).
 * Funciona de forma segura mesmo quando `AudioContext` está suspenso ou indisponível (Node/testes).
 */

export type AudioBusId = 'master' | 'music' | 'sfx' | 'voice' | 'ambient' | 'ui';

export const AUDIO_BUS_IDS: readonly AudioBusId[] = [
  'master',
  'music',
  'sfx',
  'voice',
  'ambient',
  'ui',
] as const;

export interface AudioMixerSnapshot {
  volumes: Readonly<Record<AudioBusId, number>>;
  musicDuckFactor: number;
  effectiveMusicGain: number;
  limiterActive: boolean;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export class AudioMixer {
  private readonly volumes: Record<AudioBusId, number> = {
    master: 0.85,
    music: 0.45,
    sfx: 0.6,
    voice: 0.75,
    ambient: 0.4,
    ui: 0.6,
  };

  private musicDuckFactor = 1.0;
  private duckRestoreAtMs = 0;

  private boundCtx: AudioContext | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private busGains = new Map<AudioBusId, GainNode>();

  setBusVolume(bus: AudioBusId, volume: number): void {
    this.volumes[bus] = clamp01(volume);
    this.syncNodes();
  }

  getBusVolume(bus: AudioBusId): number {
    return this.volumes[bus];
  }

  /**
   * Reduz temporariamente o volume da música (`music`) quando entra uma fala (`voice`)
   * para manter a leitura do diálogo clara sem cortar a trilha abruptamente.
   */
  triggerDialogueDucking(durationMs = 1800, nowMs = Date.now()): void {
    this.musicDuckFactor = 0.35;
    this.duckRestoreAtMs = Math.max(this.duckRestoreAtMs, nowMs + Math.max(100, durationMs));
    this.syncNodes();
  }

  /** Atualiza o estado do ducking pelo relógio atual. */
  tickDucking(nowMs = Date.now()): void {
    if (this.musicDuckFactor < 1 && nowMs >= this.duckRestoreAtMs) {
      this.musicDuckFactor = 1.0;
      this.syncNodes();
    }
  }

  /** Conecta os barramentos reais a um `AudioContext` ativo, criando um limiter no `master`. */
  attachContext(ctx: AudioContext): GainNode | null {
    if (this.boundCtx === ctx && this.busGains.has('master')) {
      return this.busGains.get('master')!;
    }
    try {
      this.boundCtx = ctx;
      this.busGains.clear();

      const masterGain = ctx.createGain();
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 12;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;

      masterGain.connect(limiter);
      limiter.connect(ctx.destination);
      this.compressor = limiter;
      this.busGains.set('master', masterGain);

      for (const id of AUDIO_BUS_IDS) {
        if (id === 'master') continue;
        const g = ctx.createGain();
        g.connect(masterGain);
        this.busGains.set(id, g);
      }
      this.syncNodes();
      return masterGain;
    } catch {
      return null;
    }
  }

  getBusNode(ctx: AudioContext, bus: AudioBusId): GainNode | null {
    this.attachContext(ctx);
    return this.busGains.get(bus) ?? null;
  }

  snapshot(): AudioMixerSnapshot {
    const effectiveMusicGain = Number(
      (this.volumes.master * this.volumes.music * this.musicDuckFactor).toFixed(4),
    );
    return {
      volumes: { ...this.volumes },
      musicDuckFactor: this.musicDuckFactor,
      effectiveMusicGain,
      limiterActive: this.compressor !== null,
    };
  }

  private syncNodes(): void {
    if (!this.boundCtx) return;
    const now = this.boundCtx.currentTime;
    const masterNode = this.busGains.get('master');
    if (masterNode) {
      masterNode.gain.setTargetAtTime(this.volumes.master * 0.45, now, 0.03);
    }
    for (const id of AUDIO_BUS_IDS) {
      if (id === 'master') continue;
      const node = this.busGains.get(id);
      if (!node) continue;
      const duck = id === 'music' ? this.musicDuckFactor : 1.0;
      node.gain.setTargetAtTime(this.volumes[id] * duck, now, 0.05);
    }
  }
}

