export const MINUTES_PER_DAY = 24 * 60;

export interface GameClockOptions {
  /** Minuto do dia em que o jogo começa (ex.: 8 * 60 = 08:00). */
  startMinuteOfDay: number;
  /** Quantos minutos de jogo passam por segundo real. */
  minutesPerRealSecond: number;
}

/**
 * Relógio do jogo. Só avança quando chamado (o Game chama apenas no estado
 * 'playing'), então pausar o jogo pausa o tempo.
 */
export class GameClock {
  private totalMinutes: number;

  constructor(private readonly options: GameClockOptions) {
    if (!Number.isFinite(options.startMinuteOfDay) || options.startMinuteOfDay < 0 || options.startMinuteOfDay >= MINUTES_PER_DAY) {
      throw new RangeError(`startMinuteOfDay inválido: ${options.startMinuteOfDay}`);
    }
    if (!Number.isFinite(options.minutesPerRealSecond) || options.minutesPerRealSecond <= 0) {
      throw new RangeError(`minutesPerRealSecond inválido: ${options.minutesPerRealSecond}`);
    }
    this.totalMinutes = options.startMinuteOfDay;
  }

  advance(realSeconds: number): void {
    if (!Number.isFinite(realSeconds) || realSeconds <= 0) return;
    this.totalMinutes += realSeconds * this.options.minutesPerRealSecond;
  }

  /** Avança minutos de jogo de uma vez (ex.: um exame que leva 15 min). */
  addMinutes(minutes: number): void {
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    this.totalMinutes += minutes;
  }

  reset(): void {
    this.totalMinutes = this.options.startMinuteOfDay;
  }

  /** Dia atual, começando em 1. */
  get day(): number {
    return Math.floor(this.totalMinutes / MINUTES_PER_DAY) + 1;
  }

  get minuteOfDay(): number {
    return Math.floor(this.totalMinutes) % MINUTES_PER_DAY;
  }

  /** "08:05" */
  formatTime(): string {
    const m = this.minuteOfDay;
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }
}
