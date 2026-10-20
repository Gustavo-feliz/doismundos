/**
 * Sons de retorno PROVISÓRIOS (GDD Prompt 6: "feedback sonoro placeholder").
 * Gerados na hora com Web Audio — sem arquivos, sem licença envolvida.
 * Serão trocados por sons reais (GDD §20.1).
 */
export type SfxName = 'ok' | 'erro' | 'ferramenta' | 'pegar' | 'concluido';

type Tone = { freq: number; at: number; dur: number; type: OscillatorType; gain: number; slideTo?: number };

const SOUNDS: Readonly<Record<SfxName, readonly Tone[]>> = {
  ok: [
    { freq: 660, at: 0, dur: 0.09, type: 'triangle', gain: 0.5 },
    { freq: 990, at: 0.08, dur: 0.12, type: 'triangle', gain: 0.45 },
  ],
  erro: [
    { freq: 180, at: 0, dur: 0.16, type: 'square', gain: 0.25 },
    { freq: 140, at: 0.14, dur: 0.2, type: 'square', gain: 0.25 },
  ],
  // "Catraca": cliques curtos.
  ferramenta: [0, 0.07, 0.14, 0.21, 0.28].map((at) => ({ freq: 1400, at, dur: 0.025, type: 'square' as const, gain: 0.18 })),
  pegar: [{ freq: 420, at: 0, dur: 0.12, type: 'sine', gain: 0.5, slideTo: 620 }],
  concluido: [
    { freq: 523, at: 0, dur: 0.12, type: 'triangle', gain: 0.45 },
    { freq: 659, at: 0.11, dur: 0.12, type: 'triangle', gain: 0.45 },
    { freq: 784, at: 0.22, dur: 0.22, type: 'triangle', gain: 0.45 },
  ],
};

export class Sfx {
  private ctx: AudioContext | null = null;
  private volume = 0.6;

  /** 0–1 */
  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
  }

  play(name: SfxName): void {
    if (this.volume <= 0) return;
    const ctx = this.context();
    if (!ctx) return;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = this.volume * 0.35;
    master.connect(ctx.destination);
    for (const t of SOUNDS[name]) {
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
