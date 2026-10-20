import { REQUIREMENT_TEXT, unmetRequirement } from '../diagnostics/rules';
import type { EquipmentContext } from '../diagnostics/types';
import { formatBRL } from '../economy/money';
import { formatHours } from '../economy/quote';
import type { GameSession } from '../game/GameSession';
import { QUALITY_LABEL as PART_QUALITY_LABEL } from '../parts/types';
import { FINAL_TEST_REQUIRES, REPAIR_ACCESS, stepMinutes } from '../repairs/rules';
import { WEAR_BAND_LABEL } from '../vehicles/state';
import { isOrderClosed, ORDER_STATUS_LABEL, QUALITY_LABEL_TEXT, type OrderStatus } from './types';

/**
 * Visões das abas Orçamento e Serviço e do painel de Estoque.
 * Valores de dinheiro vêm SEMPRE da fórmula central (economy/quote.ts):
 * a interface só formata. Nada aqui expõe causa real ou acerto do diagnóstico,
 * exceto o teste final do reparo, que é justamente quando o jogador descobre.
 */
export interface Option<T> {
  value: T;
  label: string;
  selected: boolean;
}

export interface QuoteView {
  caseId: string;
  status: OrderStatus;
  statusLabel: string;
  customer: { name: string; typeLabel: string; persona: string };
  editable: boolean;
  mandatory: { slotName: string; partName: string; quality: string } | null;
  extras: Array<{ slot: string; name: string; bandLabel: string; partName: string; checked: boolean }>;
  markup: Option<number>[];
  discount: Option<number>[];
  warranty: Option<number>[];
  urgent: boolean;
  preview: null | {
    lines: Array<{ kind: string; label: string; detail: string; amountText: string }>;
    totalText: string;
    deadlineText: string;
    warrantyText: string;
    depositText: string | null;
    validityText: string;
  };
  previewError: string | null;
  proposals: Array<{ round: number; totalText: string; decision: string; decisionLabel: string; message: string; when: string }>;
  canSend: boolean;
  canAcceptCounter: boolean;
  counterTargetText: string | null;
  canDismiss: boolean;
  closedReason: string | null;
  hasNextCase: boolean;
}

const DECISION_LABEL = { aceita: 'Aceitou', contraproposta: 'Contraproposta', recusa: 'Recusou' } as const;
const pctLabel = (n: number) => `${Math.round(n * 100)}%`;

export function buildQuoteView(session: GameSession, caseId: string, day: number): QuoteView | null {
  const c = session.activeCase;
  if (!c || c.id !== caseId) return null;
  const order = session.getOrder(caseId);
  const customer = session.getCustomer(c.customerId);
  const editable = order.status === 'orcamento' || order.status === 'contraproposta';
  const catalogs = session.catalogs;
  const vehicle = session.getVehicle(c.vehicle.id);
  const input = session.quoteInput(caseId);
  const rules = session.pricingRules;

  // Aprovado: o orçamento fechado. Em negociação: a prévia do rascunho. Recusado: a última proposta.
  const lastSent = order.proposals.at(-1)?.breakdown;
  const result = order.approved
    ? { ok: true as const, value: order.approved }
    : editable
      ? session.previewQuote(caseId)
      : lastSent
        ? { ok: true as const, value: lastSent }
        : null;
  const breakdown = result && result.ok ? result.value : null;

  const mandatoryItem = input?.items.find((i) => i.mandatory);
  const mandatoryPart = mandatoryItem ? catalogs.parts.get(mandatoryItem.partId) : undefined;
  const last = order.proposals.at(-1);
  const counter = order.status === 'contraproposta' && last?.decision.kind === 'contraproposta' ? last.decision : null;
  const priceOnly = Boolean(counter && counter.targetTotal !== null && counter.demands.every((d) => d.kind === 'preco'));

  return {
    caseId,
    status: order.status,
    statusLabel: ORDER_STATUS_LABEL[order.status],
    customer: { name: customer.name, typeLabel: customer.typeLabel, persona: customer.persona },
    editable,
    mandatory: mandatoryItem
      ? {
          slotName: catalogs.slots.get(mandatoryItem.slot)?.name ?? mandatoryItem.slot,
          partName: mandatoryPart ? `${mandatoryPart.name} — ${mandatoryPart.brand}` : 'Sem peça compatível',
          quality: mandatoryPart ? PART_QUALITY_LABEL[mandatoryPart.quality] : '—',
        }
      : null,
    extras: (order.status === 'diagnostico' ? [] : session.eligibleExtras(caseId)).map((slot) => {
      const k = vehicle.knowledge[slot];
      const part = input?.items.find((i) => i.slot === slot) ?? null;
      const partDef = catalogs.parts.get(part?.partId ?? '') ?? [...catalogs.parts.values()].find((p) => p.slot === slot);
      return {
        slot,
        name: catalogs.slots.get(slot)?.name ?? slot,
        bandLabel: k?.status === 'avaliado' ? WEAR_BAND_LABEL[k.band] : '—',
        partName: partDef ? `${partDef.name} (${PART_QUALITY_LABEL[partDef.quality]})` : '—',
        checked: order.draft.extras.includes(slot),
      };
    }),
    markup: rules.markupOptions.map((v) => ({ value: v, label: pctLabel(v), selected: v === order.draft.markupPct })),
    discount: rules.discountOptions.map((v) => ({ value: v, label: pctLabel(v), selected: v === order.draft.discountPct })),
    warranty: rules.warrantyOptions.map((v) => ({ value: v, label: `${v} dias`, selected: v === order.draft.warrantyDays })),
    urgent: order.draft.urgent,
    preview: breakdown
      ? {
          lines: breakdown.lines.map((l) => ({ kind: l.kind, label: l.label, detail: l.detail, amountText: formatBRL(l.amount) })),
          totalText: formatBRL(breakdown.total),
          deadlineText: `Pronto em até ${breakdown.deadlineHours} h (${formatHours(breakdown.laborHours)} de serviço)`,
          warrantyText: `${breakdown.warrantyDays} dias`,
          depositText: breakdown.deposit ? `${formatBRL(breakdown.deposit)} de sinal na aprovação` : null,
          validityText: `Válido até o fim do dia ${day}`,
        }
      : null,
    previewError: result && !result.ok ? result.error.message : null,
    proposals: [...order.proposals].reverse().map((p) => ({
      round: p.round,
      totalText: formatBRL(p.breakdown.total),
      decision: p.decision.kind,
      decisionLabel: DECISION_LABEL[p.decision.kind],
      message: p.decision.message,
      when: `Dia ${p.day} · ${p.time}`,
    })),
    canSend: editable && Boolean(breakdown),
    canAcceptCounter: priceOnly,
    counterTargetText: priceOnly && counter?.targetTotal != null ? formatBRL(counter.targetTotal) : null,
    canDismiss: editable,
    closedReason: order.status === 'recusada' ? order.closedReason : null,
    hasNextCase: isOrderClosed(order.status) && session.caseNumber < session.caseCount,
  };
}

export interface ServiceItemView {
  slot: string;
  name: string;
  plannedPart: string;
  accessText: string;
  accessOk: boolean;
  removed: boolean;
  installedName: string | null;
  removeMinutes: number;
  installMinutes: number;
}

export interface ServiceView {
  status: OrderStatus;
  statusLabel: string;
  active: boolean;
  inactiveText: string | null;
  heldName: string | null;
  items: ServiceItemView[];
  finalTest: { done: boolean; text: string | null; resolved: boolean | null; requirementText: string; requirementOk: boolean; ready: boolean };
  log: Array<{ kind: 'ok' | 'erro'; text: string; when: string }>;
  pending: string[];
  canComplete: boolean;
  completion: null | { qualityText: string; qualityLabel: string; score: number; resolved: boolean; minutesText: string };
  hasNextCase: boolean;
}

export function buildServiceView(session: GameSession, caseId: string, ctx: EquipmentContext): ServiceView | null {
  const c = session.activeCase;
  if (!c || c.id !== caseId) return null;
  const order = session.getOrder(caseId);
  const catalogs = session.catalogs;
  const repair = order.repair;
  const held = session.heldPartId;
  const active = order.status === 'aprovada' || order.status === 'em-reparo';

  const items: ServiceItemView[] = (repair?.items ?? []).map((i) => {
    const slot = catalogs.slots.get(i.slot)!;
    const unmet = unmetRequirement(REPAIR_ACCESS[slot.access], ctx);
    const planned = catalogs.parts.get(i.plannedPartId);
    const minutes = stepMinutes(planned?.replaceMinutes ?? 30);
    return {
      slot: i.slot,
      name: slot.name,
      plannedPart: planned ? `${planned.name} — ${planned.brand}` : i.plannedPartId,
      accessText: unmet ? REQUIREMENT_TEXT[unmet] : 'Acesso liberado',
      accessOk: !unmet,
      removed: i.removed,
      installedName: i.installedPartId ? (catalogs.parts.get(i.installedPartId)?.name ?? i.installedPartId) : null,
      removeMinutes: minutes.remove,
      installMinutes: minutes.install,
    };
  });

  const testUnmet = unmetRequirement(FINAL_TEST_REQUIRES, ctx);
  const allInstalled = items.length > 0 && items.every((i) => i.installedName);
  const pending = repair ? pendingTasksText(items, Boolean(repair.finalTest)) : [];
  const completion = order.completion;

  return {
    status: order.status,
    statusLabel: ORDER_STATUS_LABEL[order.status],
    active,
    inactiveText:
      order.status === 'diagnostico' || order.status === 'orcamento' || order.status === 'contraproposta'
        ? 'O reparo começa depois que o cliente aprova o orçamento.'
        : order.status === 'recusada'
          ? 'OS encerrada sem serviço.'
          : null,
    heldName: held ? (catalogs.parts.get(held)?.name ?? held) : null,
    items,
    finalTest: {
      done: Boolean(repair?.finalTest),
      text: repair?.finalTest?.text ?? null,
      resolved: repair?.finalTest?.resolved ?? null,
      requirementText: testUnmet ? REQUIREMENT_TEXT[testUnmet] : 'Carro no chão e capô fechado',
      requirementOk: !testUnmet,
      ready: allInstalled,
    },
    log: [...(repair?.log ?? [])].reverse().map((l) => ({ kind: l.kind, text: l.text, when: `Dia ${l.day} · ${l.time}` })),
    pending,
    canComplete: active && pending.length === 0,
    completion: completion
      ? {
          qualityText: QUALITY_LABEL_TEXT[completion.qualityLabel],
          qualityLabel: completion.qualityLabel,
          score: completion.qualityScore,
          resolved: completion.symptomResolved,
          minutesText: `${completion.repairMinutes} min de serviço`,
        }
      : null,
    hasNextCase: isOrderClosed(order.status) && session.caseNumber < session.caseCount,
  };
}

function pendingTasksText(items: ServiceItemView[], testDone: boolean): string[] {
  const out: string[] = [];
  for (const i of items) {
    if (!i.removed) out.push(`${i.name}: remover a peça antiga`);
    else if (!i.installedName) out.push(`${i.name}: instalar a peça nova`);
  }
  if (!testDone) out.push('Fazer o teste final');
  return out;
}

export interface StockView {
  entries: Array<{ partId: string; orderNumber: string | null; name: string; brand: string; quality: string; slotName: string; qty: number; tag: string }>;
  heldName: string | null;
  canTake: boolean;
}

export function buildStockView(session: GameSession): StockView {
  const catalogs = session.catalogs;
  const held = session.heldPartId;
  return {
    entries: [...session.stock]
      .sort((a, b) => (a.orderNumber === b.orderNumber ? 0 : a.orderNumber ? -1 : 1))
      .map((e) => {
        const p = catalogs.parts.get(e.partId);
        return {
          partId: e.partId,
          orderNumber: e.orderNumber,
          name: p?.name ?? e.partId,
          brand: p?.brand ?? '—',
          quality: p ? PART_QUALITY_LABEL[p.quality] : '—',
          slotName: p ? (catalogs.slots.get(p.slot)?.name ?? p.slot) : '—',
          qty: e.qty,
          tag: e.orderNumber ? `Comprada para a OS #${e.orderNumber}` : 'Estoque da oficina',
        };
      }),
    heldName: held ? (catalogs.parts.get(held)?.name ?? held) : null,
    canTake: held === null,
  };
}
