import { canSpend } from '../economy/ledger';
import { formatBRL, type Cents } from '../economy/money';
import { DataValidationError } from '../vehicles/types';
import {
  GAME_EVENT_CATEGORY_LABEL,
  type EventHistoryEntry,
  type EventState,
  type GameEventCategory,
  type GameEventDef,
  type GameEventOptionDef,
} from './types';

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CATEGORIES = new Set<string>(Object.keys(GAME_EVENT_CATEGORY_LABEL));

/**
 * Valida o catálogo de eventos ao iniciar o jogo (GDD §21.3 e §24 Prompt 16).
 * Garante que haja eventos de fiscalização e de pressão local e que TODO evento
 * tenha pelo menos uma alternativa recuperável que não exija dinheiro em caixa.
 */
export function validateGameEvents(events: readonly GameEventDef[]): void {
  const problems: string[] = [];
  if (events.length < 2) problems.push('catálogo de eventos deve ter ao menos 2 eventos');
  const eventIds = new Set<string>();
  const categoriesSeen = new Set<GameEventCategory>();

  for (const ev of events) {
    if (!ID_PATTERN.test(ev.id)) problems.push(`evento "${ev.id}": ID inválido`);
    if (eventIds.has(ev.id)) problems.push(`evento duplicado "${ev.id}"`);
    eventIds.add(ev.id);
    if (!CATEGORIES.has(ev.category)) {
      problems.push(`evento "${ev.id}": categoria desconhecida "${String(ev.category)}"`);
    }
    categoriesSeen.add(ev.category);
    if (!ev.title.trim() || !ev.speaker.trim() || !ev.message.trim()) {
      problems.push(`evento "${ev.id}": título, interlocutor ou mensagem vazios`);
    }
    if (
      !Number.isInteger(ev.trigger.minDay) ||
      ev.trigger.minDay < 1 ||
      !Number.isInteger(ev.trigger.minDeliveredOrders) ||
      ev.trigger.minDeliveredOrders < 0 ||
      !Number.isInteger(ev.trigger.cooldownDays) ||
      ev.trigger.cooldownDays < 1
    ) {
      problems.push(`evento "${ev.id}": gatilho (minDay/minDeliveredOrders/cooldownDays) inválido`);
    }
    if (ev.options.length < 2) {
      problems.push(`evento "${ev.id}": deve oferecer ao menos 2 opções legíveis`);
    }

    const optIds = new Set<string>();
    let hasFreeOrRecoverableOption = false;
    for (const opt of ev.options) {
      if (!ID_PATTERN.test(opt.id)) problems.push(`evento "${ev.id}": opção "${opt.id}" com ID inválido`);
      if (optIds.has(opt.id)) problems.push(`evento "${ev.id}": opção duplicada "${opt.id}"`);
      optIds.add(opt.id);
      if (!opt.label.trim() || !opt.description.trim() || !opt.outcomeText.trim()) {
        problems.push(`evento "${ev.id}" / "${opt.id}": texto de opção ou desfecho vazio`);
      }
      if (!Number.isSafeInteger(opt.cost) || opt.cost < 0) {
        problems.push(`evento "${ev.id}" / "${opt.id}": custo deve ser centavos >= 0`);
      }
      if (!Number.isInteger(opt.reputationDelta) || Math.abs(opt.reputationDelta) > 25) {
        problems.push(`evento "${ev.id}" / "${opt.id}": impacto de reputação fora da faixa moderada (-25 a +25)`);
      }
      if (!Number.isInteger(opt.timeMinutes) || opt.timeMinutes < 0) {
        problems.push(`evento "${ev.id}" / "${opt.id}": tempo em minutos inválido`);
      }
      if (opt.cost === 0 || !opt.requireCash) {
        hasFreeOrRecoverableOption = true;
      }
    }
    if (!hasFreeOrRecoverableOption) {
      problems.push(
        `evento "${ev.id}": precisa ter ao menos 1 alternativa sem exigência de caixa imediato (evita punição inevitável)`,
      );
    }
  }

  if (!categoriesSeen.has('fiscalizacao') || !categoriesSeen.has('pressao-local')) {
    problems.push('catálogo de eventos deve incluir "fiscalizacao" e "pressao-local"');
  }

  if (problems.length > 0) throw new DataValidationError('eventos da oficina', problems);
}

/** Estado inicial sem evento ativo e com histórico vazio. */
export function initialEventState(): EventState {
  return {
    activeEventId: null,
    history: [],
    lastTriggeredDay: 0,
    nextEventSeq: 0,
  };
}

/**
 * Confere se um evento específico cumpre seus pré-requisitos de dia, OS entregues,
 * repetibilidade e intervalo mínimo (`cooldownDays`).
 */
export function canTriggerEvent(
  def: GameEventDef,
  state: EventState,
  ctx: { day: number; deliveredCount: number },
): boolean {
  if (state.activeEventId !== null) return false;
  if (ctx.day < def.trigger.minDay) return false;
  if (ctx.deliveredCount < def.trigger.minDeliveredOrders) return false;
  if (state.lastTriggeredDay > 0 && ctx.day - state.lastTriggeredDay < def.trigger.cooldownDays) {
    return false;
  }
  const previous = state.history.filter((h) => h.eventId === def.id);
  if (previous.length > 0) {
    if (!def.trigger.repeatable) return false;
    const lastSame = previous[previous.length - 1]!;
    if (ctx.day - lastSame.day < def.trigger.cooldownDays) return false;
  }
  return true;
}

/**
 * Avalia de forma determinística se algum evento deve ser disparado no momento atual.
 * Prioriza eventos inéditos que atingiram seu gatilho e usa a semente do jogo para desempate.
 */
export function evaluateEventTriggers(
  events: readonly GameEventDef[],
  state: EventState,
  ctx: { day: number; deliveredCount: number; seed: number },
): { triggered: GameEventDef | null; state: EventState } {
  if (state.activeEventId !== null) {
    return {
      triggered: events.find((e) => e.id === state.activeEventId) ?? null,
      state,
    };
  }
  const eligible = events.filter((e) => canTriggerEvent(e, state, ctx));
  if (eligible.length === 0) return { triggered: null, state };

  const occurredIds = new Set(state.history.map((h) => h.eventId));
  const unseen = eligible.filter((e) => !occurredIds.has(e.id));
  const pool = unseen.length > 0 ? unseen : eligible;
  const pickIndex = ((ctx.seed ^ (ctx.day * 2654435761) ^ (state.history.length * 40503)) >>> 0) % pool.length;
  const chosen = pool[pickIndex]!;

  return {
    triggered: chosen,
    state: {
      ...state,
      activeEventId: chosen.id,
      lastTriggeredDay: ctx.day,
    },
  };
}

/** Dispara um evento pelo ID (usado quando o jogador atende uma notificação ou em testes). */
export function triggerSpecificEvent(
  events: readonly GameEventDef[],
  state: EventState,
  eventId: string,
  day: number,
): { ok: true; state: EventState; event: GameEventDef } | { ok: false; message: string } {
  if (state.activeEventId !== null) {
    return { ok: false, message: 'Já existe um evento aguardando decisão na oficina.' };
  }
  const def = events.find((e) => e.id === eventId);
  if (!def) return { ok: false, message: 'Evento desconhecido.' };
  if (!def.trigger.repeatable && state.history.some((h) => h.eventId === def.id)) {
    return { ok: false, message: 'Este evento único já foi resolvido nesta campanha.' };
  }
  return {
    ok: true,
    event: def,
    state: {
      ...state,
      activeEventId: def.id,
      lastTriggeredDay: Math.max(state.lastTriggeredDay, day),
    },
  };
}

/**
 * Resolve o evento ativo aplicando a opção escolhida pelo jogador, validando caixa
 * quando a opção exigir pagamento imediato e registrando a decisão no histórico.
 */
export function resolveEventChoice(
  events: readonly GameEventDef[],
  state: EventState,
  optionId: string,
  cash: Cents,
  creditLimit: Cents,
  when: { day: number; time: string; at: number },
):
  | {
      ok: true;
      state: EventState;
      entry: EventHistoryEntry;
      option: GameEventOptionDef;
      event: GameEventDef;
    }
  | { ok: false; message: string } {
  if (!state.activeEventId) {
    return { ok: false, message: 'Não há nenhum evento ativo para responder.' };
  }
  const event = events.find((e) => e.id === state.activeEventId);
  if (!event) return { ok: false, message: 'Definição do evento ativo não encontrada.' };
  const option = event.options.find((o) => o.id === optionId);
  if (!option) return { ok: false, message: 'Opção de evento inválida.' };

  if (option.requireCash && option.cost > 0 && !canSpend(cash, option.cost, creditLimit)) {
    return {
      ok: false,
      message: `Caixa insuficiente para "${option.label}": exige ${formatBRL(option.cost)} e há ${formatBRL(cash)} no caixa. Escolha outra alternativa.`,
    };
  }

  const seq = state.nextEventSeq + 1;
  const entry: EventHistoryEntry = {
    id: `EVT-${String(seq).padStart(4, '0')}`,
    eventId: event.id,
    category: event.category,
    title: event.title,
    optionId: option.id,
    optionLabel: option.label,
    cost: option.cost,
    reputationDelta: option.reputationDelta,
    timeMinutes: option.timeMinutes,
    outcomeText: option.outcomeText,
    day: when.day,
    time: when.time,
    at: when.at,
  };

  return {
    ok: true,
    event,
    option,
    entry,
    state: {
      ...state,
      activeEventId: null,
      nextEventSeq: seq,
      history: [...state.history, entry],
    },
  };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);

/** Valida `EventState` vindo de um arquivo de save (GDD §21.4). */
export function eventStateProblems(
  raw: unknown,
  events: readonly GameEventDef[],
): string[] {
  if (!isObj(raw)) return ['estado de eventos ausente'];
  const p: string[] = [];
  const s = raw as Partial<EventState>;
  if (!Array.isArray(s.history)) return ['histórico de eventos ausente'];
  if (!isInt(s.lastTriggeredDay) || s.lastTriggeredDay < 0) p.push('último dia de evento inválido');
  if (!isInt(s.nextEventSeq) || s.nextEventSeq < 0) p.push('sequencial de eventos inválido');

  const knownEvents = new Map(events.map((e) => [e.id, e]));
  if (s.activeEventId !== null) {
    if (typeof s.activeEventId !== 'string' || !knownEvents.has(s.activeEventId)) {
      p.push(`evento ativo desconhecido: "${String(s.activeEventId)}"`);
    }
  }

  const entryIds = new Set<string>();
  for (const h of s.history) {
    if (!isObj(h) || typeof h.id !== 'string' || !h.id) {
      p.push('registro de evento sem id');
      continue;
    }
    if (entryIds.has(h.id)) p.push(`registro de evento duplicado: "${h.id}"`);
    entryIds.add(h.id);
    const ev = knownEvents.get(String(h.eventId));
    if (!ev) {
      p.push(`histórico referencia evento desconhecido "${String(h.eventId)}"`);
      continue;
    }
    if (!ev.options.some((o) => o.id === h.optionId)) {
      p.push(`evento "${ev.id}": opção desconhecida no histórico "${String(h.optionId)}"`);
    }
    if (!isInt(h.cost) || h.cost < 0 || !isInt(h.reputationDelta) || !isInt(h.day) || h.day < 1) {
      p.push(`registro de evento "${h.id}": valores inválidos`);
    }
  }

  return p;
}

