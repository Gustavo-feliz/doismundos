import type { DialogueDef, DialogueLine, DialogueOption } from './types';

/** O que a legenda mostra agora. */
export interface DialogueView {
  dialogueId: string;
  line: DialogueLine;
  /** Opções numeradas (1, 2, 3) quando é hora de escolher. */
  options: ReadonlyArray<{ id: string; label: string }> | null;
}

/** Tempo de leitura de uma fala, em segundos. */
export function lineSeconds(text: string): number {
  return Math.min(9, Math.max(3, 1.6 + text.length * 0.045));
}

type Phase = 'line' | 'choice' | 'reply';

/**
 * Toca um diálogo por vez como legenda, sem pausar o jogo: cada fala fica o
 * tempo de leitura (Enter pula). Se houver escolha, espera a resposta (1, 2, 3).
 * Não guarda progresso: a fila e as escolhas ficam no MissionTracker.
 */
export class DialogueRunner {
  private def: DialogueDef | null = null;
  private index = 0;
  private phase: Phase = 'line';
  private reply: DialogueLine | null = null;
  private elapsed = 0;

  constructor(private readonly dialogues: ReadonlyMap<string, DialogueDef>) {}

  /**
   * Avança o tempo. `headId` é o diálogo da frente da fila.
   * Retorna a fala que acabou de aparecer e/ou o diálogo que terminou.
   */
  update(dt: number, headId: string | null): { started: DialogueLine | null; finished: string | null } {
    let started: DialogueLine | null = null;
    if (this.def && this.def.id !== headId) this.def = null;
    if (!this.def && headId) {
      const def = this.dialogues.get(headId);
      if (!def) return { started: null, finished: headId };
      this.def = def;
      this.index = 0;
      this.phase = 'line';
      this.reply = null;
      this.elapsed = 0;
      return { started: def.lines[0]!, finished: null };
    }
    if (!this.def) return { started, finished: null };

    this.elapsed += dt;
    if (this.phase === 'choice' || this.elapsed < lineSeconds(this.currentLine()!.text)) return { started, finished: null };
    return this.next();
  }

  /** Pula a fala atual (não pula uma escolha). */
  skip(): { started: DialogueLine | null; finished: string | null } {
    if (!this.def || this.phase === 'choice') return { started: null, finished: null };
    return this.next();
  }

  /** Escolhe a opção pelo número exibido (1, 2, 3). */
  choose(number: number): { option: DialogueOption; started: DialogueLine | null; finished: string | null } | null {
    if (!this.def || this.phase !== 'choice') return null;
    const option = this.def.choice?.options[number - 1];
    if (!option) return null;
    if (!option.reply) {
      const finished = this.def.id;
      this.def = null;
      return { option, started: null, finished };
    }
    this.phase = 'reply';
    this.reply = option.reply;
    this.elapsed = 0;
    return { option, started: option.reply, finished: null };
  }

  get awaitingChoice(): boolean {
    return this.def !== null && this.phase === 'choice';
  }

  view(): DialogueView | null {
    const line = this.currentLine();
    if (!this.def || !line) return null;
    const options = this.phase === 'choice' ? this.def.choice!.options.map((o) => ({ id: o.id, label: o.label })) : null;
    return { dialogueId: this.def.id, line, options };
  }

  private currentLine(): DialogueLine | null {
    if (!this.def) return null;
    return this.phase === 'reply' ? this.reply : (this.def.lines[this.index] ?? null);
  }

  private next(): { started: DialogueLine | null; finished: string | null } {
    const def = this.def!;
    this.elapsed = 0;
    if (this.phase === 'line' && this.index < def.lines.length - 1) {
      this.index++;
      return { started: def.lines[this.index]!, finished: null };
    }
    if (this.phase === 'line' && def.choice) {
      this.phase = 'choice';
      return { started: null, finished: null };
    }
    this.def = null;
    return { started: null, finished: def.id };
  }
}
