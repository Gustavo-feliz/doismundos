import { buildFacts, checkCondition, type MissionWorld } from './conditions';
import type { MissionLibrary } from './validate';
import type { DialogueOption, MissionDef, MissionStepDef } from './types';

/** Estado das missões que vai para o save. Só dados puros (JSON). */
export interface MissionState {
  completed: string[];
  active: { id: string; step: number } | null;
  flags: string[];
  /** Consequências registradas: id do diálogo → id da opção escolhida. */
  choices: Record<string, string>;
  /** Diálogos ainda não terminados (o primeiro é o que está na tela). */
  dialogueQueue: string[];
  /** Dicas contextuais e destaques ligados (o jogador pode dispensar). */
  tipsEnabled: boolean;
}

export type MissionEvent =
  | { type: 'mission-started'; missionId: string }
  | { type: 'step-started'; missionId: string; stepId: string }
  | { type: 'step-completed'; missionId: string; stepId: string }
  | { type: 'mission-completed'; mission: MissionDef };

export interface CurrentObjective {
  missionId: string;
  missionTitle: string;
  stepId: string;
  stepNumber: number;
  stepCount: number;
  objective: string;
  tip: string;
  highlight: string | null;
  /** O passo saiu do roteiro e o texto é de recuperação. */
  recovering: boolean;
}

export function initialMissionState(): MissionState {
  return { completed: [], active: null, flags: [], choices: {}, dialogueQueue: [], tipsEnabled: true };
}

/** Limite de passos por avaliação: protege contra dados que se autocompletam em laço. */
const MAX_TRANSITIONS = 64;

/**
 * Acompanha a campanha: começa missões quando os pré-requisitos estão
 * cumpridos, avança passos quando as condições batem e registra escolhas.
 * Puro (sem DOM nem cena): o jogo traduz os eventos em HUD, som e destaque.
 */
export class MissionTracker {
  private s: MissionState;
  private rev = 0;

  constructor(
    private readonly lib: MissionLibrary,
    state: MissionState = initialMissionState(),
  ) {
    this.s = structuredClone(state);
  }

  /** Muda a cada alteração (usado pelo autosave e para reavaliar). */
  get revision(): number {
    return this.rev;
  }

  get tipsEnabled(): boolean {
    return this.s.tipsEnabled;
  }

  get dialogueQueue(): readonly string[] {
    return this.s.dialogueQueue;
  }

  get completed(): readonly string[] {
    return this.s.completed;
  }

  choiceFor(dialogueId: string): string | null {
    return this.s.choices[dialogueId] ?? null;
  }

  hasFlag(flag: string): boolean {
    return this.s.flags.includes(flag);
  }

  toSnapshot(): MissionState {
    return structuredClone(this.s);
  }

  /** Registra algo que o jogador fez. Retorna true se era novidade. */
  setFlag(flag: string): boolean {
    if (this.s.flags.includes(flag)) return false;
    this.s.flags = [...this.s.flags, flag];
    this.rev++;
    return true;
  }

  setTips(on: boolean): void {
    if (this.s.tipsEnabled === on) return;
    this.s.tipsEnabled = on;
    this.rev++;
  }

  /** Avalia a campanha contra o estado do jogo e devolve o que aconteceu. */
  evaluate(world: MissionWorld): MissionEvent[] {
    const events: MissionEvent[] = [];
    const facts = buildFacts(world, new Set(this.s.flags));
    for (let i = 0; i < MAX_TRANSITIONS; i++) {
      if (!this.s.active) {
        const next = this.nextAvailable();
        if (!next) break;
        this.s.active = { id: next.id, step: 0 };
        events.push({ type: 'mission-started', missionId: next.id });
        if (next.startDialogue) this.enqueue(next.startDialogue);
        events.push({ type: 'step-started', missionId: next.id, stepId: next.steps[0]!.id });
        this.pendingStepDialogue = next.steps[0]!.dialogue ?? null;
        this.rev++;
        continue;
      }
      const mission = this.mission(this.s.active.id);
      const step = mission.steps[this.s.active.step];
      if (!step || !checkCondition(step.done, facts)) break;

      // Passo concluído: o diálogo dele só toca se o jogador chegou a vê-lo ativo.
      this.pendingStepDialogue = null;
      events.push({ type: 'step-completed', missionId: mission.id, stepId: step.id });
      this.rev++;
      const nextIndex = this.s.active.step + 1;
      const nextStep = mission.steps[nextIndex];
      if (nextStep) {
        this.s.active = { id: mission.id, step: nextIndex };
        events.push({ type: 'step-started', missionId: mission.id, stepId: nextStep.id });
        this.pendingStepDialogue = nextStep.dialogue ?? null;
      } else {
        this.s.active = null;
        this.s.completed = [...this.s.completed, mission.id];
        events.push({ type: 'mission-completed', mission });
        if (mission.endDialogue) this.enqueue(mission.endDialogue);
      }
    }
    if (this.pendingStepDialogue) {
      this.enqueue(this.pendingStepDialogue);
      this.pendingStepDialogue = null;
    }
    return events;
  }

  /** Objetivo atual (com texto de recuperação se algo saiu do roteiro). */
  current(world: MissionWorld): CurrentObjective | null {
    if (!this.s.active) return null;
    const mission = this.mission(this.s.active.id);
    const step: MissionStepDef | undefined = mission.steps[this.s.active.step];
    if (!step) return null;
    const facts = buildFacts(world, new Set(this.s.flags));
    const recovery = step.recovery?.find((r) => checkCondition(r.when, facts));
    return {
      missionId: mission.id,
      missionTitle: mission.title,
      stepId: step.id,
      stepNumber: this.s.active.step + 1,
      stepCount: mission.steps.length,
      objective: recovery?.objective ?? step.objective,
      tip: recovery?.tip ?? step.tip,
      highlight: step.highlight,
      recovering: Boolean(recovery),
    };
  }

  /** Diálogo da frente da fila terminou. */
  finishDialogue(id: string): void {
    if (this.s.dialogueQueue[0] !== id) return;
    this.s.dialogueQueue = this.s.dialogueQueue.slice(1);
    this.rev++;
  }

  /** Registra a escolha (uma vez por diálogo) e devolve a opção para aplicar os efeitos. */
  choose(dialogueId: string, optionId: string): DialogueOption | null {
    if (this.s.choices[dialogueId]) return null;
    const option = this.lib.dialogues.get(dialogueId)?.choice?.options.find((o) => o.id === optionId);
    if (!option) return null;
    this.s.choices = { ...this.s.choices, [dialogueId]: optionId };
    for (const e of option.effects) if (e.kind === 'tips') this.s.tipsEnabled = e.on;
    this.rev++;
    return option;
  }

  private pendingStepDialogue: string | null = null;

  private enqueue(id: string): void {
    if (this.s.dialogueQueue.includes(id)) return;
    this.s.dialogueQueue = [...this.s.dialogueQueue, id];
  }

  private nextAvailable(): MissionDef | null {
    const done = new Set(this.s.completed);
    return this.lib.missions.find((m) => !done.has(m.id) && m.prerequisites.every((p) => done.has(p))) ?? null;
  }

  private mission(id: string): MissionDef {
    const m = this.lib.byId.get(id);
    if (!m) throw new Error(`Missão desconhecida: "${id}"`);
    return m;
  }
}

/** Confere um estado de missões vindo de um save. Lista vazia = válido. */
export function missionStateProblems(raw: unknown, lib: MissionLibrary): string[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return ['estado das missões ausente'];
  const s = raw as Partial<MissionState>;
  const p: string[] = [];
  const strings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
  if (!strings(s.completed) || !strings(s.flags) || !strings(s.dialogueQueue)) return ['estado das missões com listas inválidas'];
  if (typeof s.tipsEnabled !== 'boolean') p.push('preferência de dicas inválida');
  if (typeof s.choices !== 'object' || s.choices === null || Array.isArray(s.choices)) p.push('escolhas de diálogo inválidas');
  for (const id of s.completed!) if (!lib.byId.has(id)) p.push(`missão concluída desconhecida "${id}"`);
  for (const id of s.dialogueQueue!) if (!lib.dialogues.has(id)) p.push(`diálogo desconhecido "${id}"`);
  if (s.active !== null) {
    const a = s.active as { id?: unknown; step?: unknown } | undefined;
    const m = typeof a?.id === 'string' ? lib.byId.get(a.id) : undefined;
    if (!m) p.push('missão ativa desconhecida');
    else if (!Number.isInteger(a!.step) || (a!.step as number) < 0 || (a!.step as number) >= m.steps.length) p.push(`passo inválido na missão "${m.id}"`);
    else if (s.completed!.includes(m.id)) p.push(`missão "${m.id}" ativa e concluída ao mesmo tempo`);
  }
  return p;
}
