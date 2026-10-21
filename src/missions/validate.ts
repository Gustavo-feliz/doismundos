import { DataValidationError, ID_PATTERN } from '../vehicles/types';
import { ORDER_STATUS_LABEL } from '../orders/types';
import { SPEAKER_NAME, MISSION_FLAGS, ORDER_STAGES, type DialogueDef, type MissionCondition, type MissionDef } from './types';

/** Missões e diálogos já validados, com índices por ID. */
export interface MissionLibrary {
  missions: readonly MissionDef[];
  byId: ReadonlyMap<string, MissionDef>;
  dialogues: ReadonlyMap<string, DialogueDef>;
}

const count = (n: number) => Number.isInteger(n) && n >= 1;

function conditionProblems(c: MissionCondition, where: string): string[] {
  switch (c.kind) {
    case 'flag':
      return MISSION_FLAGS.includes(c.flag) ? [] : [`${where}: marcador desconhecido "${c.flag}"`];
    case 'orders-reached':
      return ORDER_STAGES.includes(c.stage) && count(c.count) ? [] : [`${where}: etapa de OS ou quantidade inválida`];
    case 'active-order':
      return c.status in ORDER_STATUS_LABEL ? [] : [`${where}: status de OS desconhecido "${c.status}"`];
    case 'purchases':
    case 'installments-paid':
      return count(c.count) ? [] : [`${where}: quantidade inválida`];
    case 'installment-overdue':
      return [];
    case 'any':
      return c.of.length === 0 ? [`${where}: "any" sem condições`] : c.of.flatMap((x, i) => conditionProblems(x, `${where}.any[${i}]`));
  }
}

/**
 * Valida missões e diálogos ao abrir o jogo (GDD §21.3), com mensagens úteis.
 * Pré-requisitos precisam vir ANTES na lista: assim não há ciclos.
 * `highlightIds` são os objetos da cena que podem ser destacados.
 */
export function buildMissionLibrary(missions: readonly MissionDef[], dialogues: readonly DialogueDef[], highlightIds: readonly string[]): MissionLibrary {
  const p: string[] = [];
  const dialogueMap = new Map<string, DialogueDef>();
  for (const d of dialogues) {
    const at = `diálogo "${d.id}"`;
    if (!ID_PATTERN.test(d.id)) p.push(`${at}: ID inválido`);
    if (dialogueMap.has(d.id)) p.push(`${at}: ID repetido`);
    dialogueMap.set(d.id, d);
    if (d.lines.length === 0) p.push(`${at}: sem falas`);
    for (const l of [...d.lines, ...(d.choice?.options.flatMap((o) => (o.reply ? [o.reply] : [])) ?? [])]) {
      if (!(l.speaker in SPEAKER_NAME)) p.push(`${at}: personagem desconhecido "${l.speaker}"`);
      if (!l.text.trim()) p.push(`${at}: fala vazia`);
    }
    if (d.choice) {
      const opts = d.choice.options;
      if (opts.length < 2 || opts.length > 3) p.push(`${at}: a escolha precisa de 2 ou 3 opções`);
      if (new Set(opts.map((o) => o.id)).size !== opts.length) p.push(`${at}: opções com ID repetido`);
      for (const o of opts) {
        if (!o.label.trim()) p.push(`${at}: opção "${o.id}" sem texto`);
        for (const e of o.effects) {
          if (e.kind === 'postpone-installment' && (!count(e.days) || !Number.isInteger(e.fee) || e.fee < 0)) p.push(`${at}: adiamento inválido na opção "${o.id}"`);
        }
      }
    }
  }

  const byId = new Map<string, MissionDef>();
  const usedDialogue = (id: string | undefined, where: string) => {
    if (id !== undefined && !dialogueMap.has(id)) p.push(`${where}: diálogo desconhecido "${id}"`);
  };
  for (const m of missions) {
    const at = `missão "${m.id}"`;
    if (!ID_PATTERN.test(m.id)) p.push(`${at}: ID inválido`);
    if (byId.has(m.id)) p.push(`${at}: ID repetido`);
    for (const pre of m.prerequisites) if (!byId.has(pre)) p.push(`${at}: pré-requisito "${pre}" não existe ou vem depois na lista`);
    if (!m.title.trim()) p.push(`${at}: sem título`);
    if (!Number.isInteger(m.act) || m.act < 1) p.push(`${at}: ato inválido`);
    if (!Number.isInteger(m.reward.cash) || m.reward.cash < 0) p.push(`${at}: recompensa inválida`);
    if (m.steps.length === 0) p.push(`${at}: sem passos`);
    if (new Set(m.steps.map((s) => s.id)).size !== m.steps.length) p.push(`${at}: passos com ID repetido`);
    usedDialogue(m.startDialogue, at);
    usedDialogue(m.endDialogue, at);
    for (const s of m.steps) {
      const where = `${at}, passo "${s.id}"`;
      if (!s.objective.trim() || !s.tip.trim()) p.push(`${where}: objetivo ou dica vazios`);
      if (s.highlight !== null && !highlightIds.includes(s.highlight)) p.push(`${where}: objeto de destaque desconhecido "${s.highlight}"`);
      p.push(...conditionProblems(s.done, where));
      for (const r of s.recovery ?? []) {
        p.push(...conditionProblems(r.when, `${where} (recuperação)`));
        if (!r.objective.trim() || !r.tip.trim()) p.push(`${where}: recuperação sem texto`);
      }
      usedDialogue(s.dialogue, where);
    }
    byId.set(m.id, m);
  }
  if (p.length) throw new DataValidationError('missões e diálogos', p);
  return { missions, byId, dialogues: dialogueMap };
}
