/** Maior delta aceito por quadro: evita saltos após a aba ficar em segundo plano. */
export const MAX_DELTA_SECONDS = 0.05;

export class Loop {
  private frameId = 0;
  private lastTime = 0;
  private running = false;
  /** Limite de FPS (0 = sem limite). */
  private minFrameMs = 0;
  private lastFrame = 0;

  constructor(
    private readonly update: (deltaSeconds: number) => void,
    private readonly render: () => void,
    private readonly onError: (error: unknown) => void,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.frameId = requestAnimationFrame(this.tick);
  }

  /** Limita os quadros por segundo (0 = segue o monitor). */
  setFpsLimit(fps: number): void {
    this.minFrameMs = fps > 0 ? 1000 / fps : 0;
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameId);
  }

  private readonly tick = (time: number): void => {
    if (!this.running) return;
    // Limite de FPS: pula este quadro do monitor se ainda não deu o tempo (folga de 1 ms).
    if (this.minFrameMs > 0 && time - this.lastFrame < this.minFrameMs - 1) {
      this.frameId = requestAnimationFrame(this.tick);
      return;
    }
    this.lastFrame = time;
    const deltaSeconds = Math.min(Math.max((time - this.lastTime) / 1000, 0), MAX_DELTA_SECONDS);
    this.lastTime = time;
    try {
      this.update(deltaSeconds);
      this.render();
    } catch (error) {
      // Um erro no quadro para o loop e é exibido; não deixamos o jogo
      // repetindo o mesmo erro 60 vezes por segundo.
      this.stop();
      this.onError(error);
      return;
    }
    this.frameId = requestAnimationFrame(this.tick);
  };
}
