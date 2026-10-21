import { lineSeconds } from '../missions/DialogueRunner';
import type { DialogueLine } from '../missions/types';
import type { CinematicDef, CinematicShot, Vec3 } from './types';

/** O que a tela mostra agora. */
export interface CinematicFrame {
  shot: CinematicShot;
  shotIndex: number;
  /** 0–1 dentro da tomada (para a câmera em trilho). */
  progress: number;
  line: DialogueLine | null;
  /** Opções numeradas quando é hora de escolher. */
  options: ReadonlyArray<{ id: string; label: string }> | null;
  done: boolean;
}

type Phase = 'lines' | 'choice' | 'reply' | 'hold' | 'done';

/**
 * Toca uma cena de cinema (Prompt 23). Puro: avança no tempo, Enter pula a
 * fala, a escolha espera o jogador, e "pular tudo" termina na hora. Não toca
 * em câmera nem DOM: o jogo lê `frame()` e desenha.
 */
export class CinematicPlayer {
  private shotIndex = 0;
  private lineIndex = 0;
  private phase: Phase = 'lines';
  private shotElapsed = 0;
  private lineElapsed = 0;
  private reply: DialogueLine | null = null;
  private chosen: string | null = null;

  constructor(private readonly def: CinematicDef) {
    this.startShot(0);
  }

  get choice(): string | null {
    return this.chosen;
  }

  get done(): boolean {
    return this.phase === 'done';
  }

  /** Avança o tempo (s). A escolha pausa o relógio da tomada. */
  update(dt: number): void {
    if (this.phase === 'done' || this.phase === 'choice') return;
    this.shotElapsed += dt;
    this.lineElapsed += dt;
    const line = this.currentLine();
    if (line && this.lineElapsed >= lineSeconds(line.text)) this.nextLine();
    else if (!line && this.phase === 'hold' && this.shotElapsed >= this.shot.minSeconds) this.nextShot();
  }

  /** Enter/Espaço: pula a fala atual (nunca pula uma escolha). */
  skipLine(): void {
    if (this.phase === 'lines' || this.phase === 'reply') this.nextLine();
    else if (this.phase === 'hold') this.nextShot();
  }

  /** Escolhe pelo número mostrado (1, 2…). Retorna o id escolhido ou null. */
  choose(number: number): string | null {
    const option = this.shot.choice?.options[number - 1];
    if (this.phase !== 'choice' || !option) return null;
    this.chosen = option.id;
    this.reply = option.reply;
    this.phase = 'reply';
    this.lineElapsed = 0;
    return option.id;
  }

  /** Pular a cena inteira (segurar Esc). */
  skipAll(): void {
    this.phase = 'done';
  }

  frame(): CinematicFrame {
    const shot = this.shot;
    const total = Math.max(shot.minSeconds, shot.lines.reduce((s, l) => s + lineSeconds(l.text), 0), 0.001);
    const line = this.phase === 'choice' ? (shot.choice?.prompt ?? null) : this.currentLine();
    return {
      shot,
      shotIndex: this.shotIndex,
      progress: this.phase === 'done' ? 1 : Math.min(1, this.shotElapsed / total),
      line,
      options: this.phase === 'choice' ? shot.choice!.options.map((o) => ({ id: o.id, label: o.label })) : null,
      done: this.phase === 'done',
    };
  }

  private get shot(): CinematicShot {
    return this.def.shots[Math.min(this.shotIndex, this.def.shots.length - 1)]!;
  }

  private currentLine(): DialogueLine | null {
    if (this.phase === 'reply') return this.reply;
    if (this.phase === 'lines') return this.shot.lines[this.lineIndex] ?? null;
    return null;
  }

  private startShot(index: number): void {
    this.shotIndex = index;
    this.lineIndex = 0;
    this.shotElapsed = 0;
    this.lineElapsed = 0;
    this.reply = null;
    this.phase = this.shot.lines.length ? 'lines' : this.shot.choice ? 'choice' : 'hold';
  }

  private nextLine(): void {
    this.lineElapsed = 0;
    if (this.phase === 'reply') {
      this.nextShot();
      return;
    }
    if (this.lineIndex < this.shot.lines.length - 1) {
      this.lineIndex++;
      return;
    }
    if (this.shot.choice) {
      this.phase = 'choice';
      return;
    }
    // Falas acabaram: segura a tomada até o tempo mínimo (para o movimento da câmera respirar).
    this.phase = 'hold';
    if (this.shotElapsed >= this.shot.minSeconds) this.nextShot();
  }

  private nextShot(): void {
    if (this.shotIndex >= this.def.shots.length - 1) {
      this.phase = 'done';
      return;
    }
    this.startShot(this.shotIndex + 1);
  }
}

/** Interpolação suave da câmera (sem movimento: vai direto ao fim, para "reduzir movimento"). */
export function cameraAt(shot: CinematicShot, progress: number, reduceMotion: boolean): { position: Vec3; target: Vec3 } | null {
  const c = shot.camera;
  if (!c) return null;
  const t = reduceMotion ? 1 : progress * progress * (3 - 2 * progress);
  const mix = (a: Vec3, b: Vec3): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  return { position: mix(c.from, c.to), target: mix(c.lookFrom, c.lookTo) };
}
