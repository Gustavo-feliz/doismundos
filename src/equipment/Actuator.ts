/**
 * Peça móvel genérica que vai de 0 (recolhida) a 1 (estendida) em um tempo
 * fixo: elevador, capô, gaveta. Lógica pura, sem three.js.
 */
export type ActuatorPhase = 'retracted' | 'extending' | 'extended' | 'retracting';

export class Actuator {
  private pos: number;
  private target: number;

  constructor(
    readonly travelSeconds: number,
    initial: 0 | 1 = 0,
  ) {
    if (!(travelSeconds > 0)) throw new RangeError(`travelSeconds precisa ser > 0 (recebido ${travelSeconds})`);
    this.pos = initial;
    this.target = initial;
  }

  /** 0..1 */
  get position(): number {
    return this.pos;
  }

  get moving(): boolean {
    return this.pos !== this.target;
  }

  get phase(): ActuatorPhase {
    if (this.target === 1) return this.pos === 1 ? 'extended' : 'extending';
    return this.pos === 0 ? 'retracted' : 'retracting';
  }

  /** Começa a estender. Retorna false se já está estendida ou indo para lá. */
  extend(): boolean {
    if (this.target === 1) return false;
    this.target = 1;
    return true;
  }

  retract(): boolean {
    if (this.target === 0) return false;
    this.target = 0;
    return true;
  }

  /** Coloca direto numa posição, sem animar (ex.: novo jogo). */
  reset(position: 0 | 1 = 0): void {
    this.pos = position;
    this.target = position;
  }

  /** Alterna o sentido (usado por ações de abrir/fechar). */
  toggle(): void {
    if (this.target === 1) this.retract();
    else this.extend();
  }

  update(dt: number): void {
    if (!this.moving || !(dt > 0)) return;
    const step = dt / this.travelSeconds;
    this.pos = this.target > this.pos ? Math.min(this.pos + step, this.target) : Math.max(this.pos - step, this.target);
  }
}

/** Suaviza o movimento (começa e termina devagar). */
export function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}
