import { REQUIREMENT_TEXT, unmetRequirement } from '../diagnostics/rules';
import type { EquipmentContext } from '../diagnostics/types';
import { formatBRL } from '../economy/money';
import { formatHours } from '../economy/quote';
import type { GameSession } from '../game/GameSession';
import { QUALITY_LABEL as PART_QUALITY_LABEL } from '../parts/types';
import { FINAL_TEST_REQUIRES, REPAIR_ACCESS, stepMinutes } from '../repairs/rules';
import { averageStars, SPECIALTY_LABEL, type Specialty } from '../customers/reputation';
import { MINUTES_PER_DAY } from '../core/GameClock';
import { canSpend, CATEGORY_LABEL } from '../economy/ledger';
import { compatiblePartsFor } from '../vehicles/domain';
import { checkPurchase, EFFECT_LABEL, reduceMinutes, reductionAt } from '../upgrades/rules';
import { toolsMet } from '../procedural/generator';
import { canTriggerEvent } from '../events/rules';
import { CATEGORY_LABEL as VEHICLE_CATEGORY_LABEL } from '../vehicles/types';
import { WEAR_BAND_LABEL } from '../vehicles/state';
import { isOrderClosed, ORDER_STATUS_LABEL, QUALITY_LABEL_TEXT, type OrderStatus } from './types';
import { STANDARD_STAFF_TASKS } from '../data/staff';
import { TASK_ALLOWED_ROLES } from '../staff/rules';
import { STAFF_ROLE_LABEL, STAFF_STATE_LABEL, STAFF_TASK_STATUS_LABEL } from '../staff/types';
import { GAME_EVENT_CATEGORY_LABEL } from '../events/types';

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
  /** Aviso de garantia (coberta ou fora da garantia), quando o carro já passou pela oficina. */
  warrantyNote: { covered: boolean; text: string } | null;
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
    warrantyNote: order.warranty ? { covered: order.warranty.covered, text: order.warranty.reason } : null,
  };
}

export interface ServiceItemView {
  slot: string;
  name: string;
  plannedPart: string;
  /** Situação da peça orçada: no estoque, a caminho ou falta comprar. */
  availability: string;
  availabilityOk: boolean;
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
  canDeliver: boolean;
  /** Valor a receber na entrega (total − sinal). */
  toReceiveText: string | null;
  delivery: null | {
    stars: number;
    reasons: Array<{ effect: string; text: string }>;
    complaint: string | null;
    willReturn: boolean;
    revenueText: string;
    partsCostText: string;
    profitText: string;
    profitNegative: boolean;
    warrantyText: string | null;
  };
  promisedText: string | null;
  /** Ferramentas exigidas pelo serviço (Prompt 12), ex.: "Chave de impacto nível 1". */
  toolsText: string | null;
  toolsOk: boolean;
  hasNextCase: boolean;
}

export function buildServiceView(session: GameSession, caseId: string, ctx: EquipmentContext, now: number): ServiceView | null {
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
    const minutes = stepMinutes(planned?.replaceMinutes ?? 30, session.repairSpeed);
    const stock = session.availability(i.plannedPartId);
    const availability = i.installedPartId
      ? 'Instalada'
      : stock.inStock > 0
        ? `No estoque (${stock.inStock})`
        : stock.onTheWay > 0
          ? `A caminho: chega em ${Math.max(0, (stock.nextAt ?? now) - now)} min`
          : 'Falta comprar (computador do escritório)';
    return {
      slot: i.slot,
      name: slot.name,
      plannedPart: planned ? `${planned.name} — ${planned.brand}` : i.plannedPartId,
      availability,
      availabilityOk: Boolean(i.installedPartId) || stock.inStock > 0,
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
    canDeliver: order.status === 'concluida',
    toReceiveText: order.approved && order.status === 'concluida' ? formatBRL(Math.max(0, order.approved.total - order.depositPaid)) : null,
    delivery: order.delivery
      ? {
          stars: order.delivery.review.stars,
          reasons: order.delivery.review.reasons.map((r) => ({ effect: r.effect, text: r.text })),
          complaint: order.delivery.review.complaint,
          willReturn: order.delivery.review.willReturn,
          revenueText: formatBRL(order.delivery.revenue),
          partsCostText: formatBRL(order.delivery.partsCost),
          profitText: formatBRL(order.delivery.grossProfit),
          profitNegative: order.delivery.grossProfit < 0,
          warrantyText: order.delivery.warrantyId ? warrantyText(session, order.delivery.warrantyId) : null,
        }
      : null,
    promisedText: order.approvedAt !== null && order.approved ? promisedLabel(order.approvedAt + order.approved.deadlineHours * 60, now) : null,
    toolsText: c.requiredTools?.length ? session.toolsText(c) : null,
    toolsOk: toolsMet(c.requiredTools, session.upgrades),
    hasNextCase: isOrderClosed(order.status) && session.caseNumber < session.caseCount,
  };
}

function promisedLabel(promisedAt: number, now: number): string {
  const left = promisedAt - now;
  const clock = `${String(Math.floor((promisedAt % 1440) / 60)).padStart(2, '0')}:${String(promisedAt % 60).padStart(2, '0')}`;
  return left >= 0 ? `Prometido para as ${clock} (faltam ${left} min)` : `Prometido para as ${clock} — atrasado ${-left} min`;
}

function warrantyText(session: GameSession, id: string): string {
  const w = session.warranties.find((x) => x.id === id);
  return w ? `Garantia ${w.id}: ${w.days} dias (até o dia ${w.startDay + w.days}), cobre: ${w.coveredSlots.map((s) => session.catalogs.slots.get(s)?.name ?? s).join(', ')}` : `Garantia ${id}`;
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
  entries: Array<{ lotId: string; partId: string; name: string; brand: string; quality: string; slotName: string; qty: number; costText: string; source: string }>;
  heldName: string | null;
  canTake: boolean;
  onTheWay: number;
}

export function buildStockView(session: GameSession): StockView {
  const catalogs = session.catalogs;
  const held = session.heldPartId;
  return {
    entries: session.stock.map((l) => {
      const p = catalogs.parts.get(l.partId);
      return {
        lotId: l.lotId,
        partId: l.partId,
        name: p?.name ?? l.partId,
        brand: p?.brand ?? '—',
        quality: p ? PART_QUALITY_LABEL[p.quality] : '—',
        slotName: p ? (catalogs.slots.get(p.slot)?.name ?? p.slot) : '—',
        qty: l.qty,
        costText: l.unitCost ? `custou ${formatBRL(l.unitCost)}` : 'sem custo',
        source: l.source,
      };
    }),
    heldName: held ? (catalogs.parts.get(held)?.name ?? held) : null,
    canTake: held === null,
    onTheWay: session.purchases.filter((p) => p.status === 'a-caminho').reduce((n, p) => n + p.qty, 0),
  };
}

// --- Computador de gestão: loja, pedidos, caixa e reputação ------------------

export interface ComputerView {
  cashText: string;
  creditText: string | null;
  shop: Array<{
    partId: string;
    name: string;
    brand: string;
    quality: string;
    slotName: string;
    fitsActiveCar: boolean;
    /** Peça orçada na OS ativa que ainda não está no estoque nem a caminho. */
    neededFor: string | null;
    inStock: number;
    offers: Array<{ supplierId: string; supplierName: string; priceText: string; minutes: number; affordable: boolean }>;
  }>;
  purchases: Array<{ id: string; partName: string; qty: number; totalText: string; supplierName: string; status: string; statusLabel: string; etaText: string; canCancel: boolean }>;
  /** "Comprar o que falta" para a OS ativa (null = nada faltando). Uma opção por fornecedor. */
  missing: null | {
    orderLabel: string;
    count: number;
    names: string;
    options: Array<{ supplierId: string; supplierName: string; totalText: string; minutes: number; affordable: boolean; label: string }>;
  };
  nextDeliveryText: string | null;
  canWait: boolean;
  ledger: Array<{ id: string; when: string; category: string; description: string; ref: string; amountText: string; kind: string }>;
  summary: { revenueText: string; purchasesText: string; refundsText: string; netPurchasesText: string; deliveredRevenueText: string; deliveredCostText: string; grossProfitText: string };
  /** Enciclopédia: modelos, peças por modelo e serviços conhecidos (Prompt 12). */
  catalog: CatalogView;
  /** Ferramentas e melhorias da oficina, com o antes/depois do próximo nível. */
  upgrades: Array<{
    id: string;
    name: string;
    kindLabel: string;
    description: string;
    level: number;
    maxLevel: number;
    effectLabel: string;
    /** Efeito atual, ex.: "−20% (30 → 24 min)". */
    currentText: string;
    next: { level: number; costText: string; beforeText: string; afterText: string; blockedReason: string | null } | null;
  }>;
  /** Empréstimo bancário herdado. */
  debt: {
    balanceText: string;
    paidCount: number;
    /** null = quitada. */
    next: { totalText: string; detail: string; dueDay: number; overdue: boolean; affordable: boolean } | null;
  };
  reputation: {
    generalScore: number;
    generalStars: string;
    specialties: Array<{ label: string; score: number; stars: string; reviews: number }>;
    reviews: Array<{ orderNumber: string; customer: string; stars: number; reasons: Array<{ effect: string; text: string }>; complaint: string | null }>;
    events: Array<{ text: string; delta: number; when: string }>;
    warranties: Array<{ id: string; orderNumber: string; covered: string; validity: string; active: boolean }>;
  };
  /** Gestão da equipe e fila de tarefas (Prompt 15). */
  staff: StaffView;
  /** Eventos, fiscalização e pressão local (Prompt 16). */
  events: EventsView;
}

export interface EventsView {
  active: null | {
    id: string;
    category: string;
    categoryLabel: string;
    title: string;
    speaker: string;
    message: string;
    options: Array<{
      id: string;
      label: string;
      description: string;
      costText: string;
      reputationText: string;
      timeText: string;
      affordable: boolean;
      blockedReason: string | null;
    }>;
  };
  catalog: Array<{
    id: string;
    categoryLabel: string;
    title: string;
    speaker: string;
    triggerText: string;
    canTriggerNow: boolean;
  }>;
  history: Array<{
    id: string;
    title: string;
    categoryLabel: string;
    optionLabel: string;
    costText: string;
    reputationText: string;
    outcomeText: string;
    when: string;
  }>;
}

export interface StaffView {
  payroll: {
    totalText: string;
    employeeCount: number;
    paidToday: boolean;
    canPay: boolean;
    blockedReason: string | null;
  };
  employees: Array<{
    id: string;
    name: string;
    role: string;
    roleLabel: string;
    skill: number;
    speedText: string;
    salaryText: string;
    state: string;
    stateLabel: string;
    paused: boolean;
    currentTaskText: string | null;
    completedTasks: number;
  }>;
  candidates: Array<{
    id: string;
    name: string;
    role: string;
    roleLabel: string;
    skill: number;
    speedText: string;
    salaryText: string;
    blurb: string;
    affordable: boolean;
    blockedReason: string | null;
  }>;
  standardTasks: Array<{
    id: string;
    title: string;
    roleText: string;
    minSkill: number;
    minutes: number;
    description: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    statusLabel: string;
    assignedName: string | null;
    progressText: string;
    resultText: string | null;
  }>;
  hasActiveTasks: boolean;
}

const PURCHASE_LABEL = { 'a-caminho': 'A caminho', recebido: 'Recebido', cancelado: 'Cancelado' } as const;

function clockOf(at: number): string {
  return `Dia ${Math.floor(at / 1440) + 1} ${String(Math.floor((at % 1440) / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`;
}

export function buildComputerView(session: GameSession, now: number, activeVehicleId: string | null): ComputerView {
  const catalogs = session.catalogs;
  const vehicle = activeVehicleId ? session.getVehicle(activeVehicleId) : null;
  const fits = new Set(vehicle ? Object.keys(vehicle.parts).flatMap((slot) => compatiblePartsFor(vehicle, slot, catalogs).map((p) => p.id)) : []);
  const cash = session.cash;
  const credit = session.creditLimit;

  const delivered = [...session.allOrders()].filter((o) => o.delivery);
  const deliveredRevenue = delivered.reduce((s, o) => s + o.delivery!.revenue, 0);
  const deliveredCost = delivered.reduce((s, o) => s + o.delivery!.partsCost, 0);
  const sum = session.ledgerSummary;
  const rep = session.reputation;
  const starsText = (n: number | null) => (n === null ? 'sem avaliações' : `${String(n).replace('.', ',')}★`);
  const nextAt = session.nextDeliveryAt();
  const active = session.activeCase;
  const activeOrder = active ? session.getOrder(active.id) : null;
  const needed = new Set(
    (activeOrder?.repair?.items ?? [])
      .filter((i) => !i.installedPartId)
      .map((i) => i.plannedPartId)
      .filter((id) => {
        const a = session.availability(id);
        return a.inStock === 0 && a.onTheWay === 0;
      }),
  );

  return {
    cashText: formatBRL(cash),
    creditText: credit > 0 ? `Crédito com fornecedor: até ${formatBRL(credit)} negativo` : null,
    shop: [...catalogs.parts.values()]
      .map((p) => ({
        partId: p.id,
        name: p.name,
        brand: p.brand,
        quality: PART_QUALITY_LABEL[p.quality],
        slotName: catalogs.slots.get(p.slot)?.name ?? p.slot,
        fitsActiveCar: fits.has(p.id),
        neededFor: needed.has(p.id) && active ? `OS #${active.orderNumber}` : null,
        inStock: session.availability(p.id).inStock,
        offers: session.supplierList.map((sup) => {
          const price = session.priceOf(p.id, sup.id)!;
          return { supplierId: sup.id, supplierName: sup.name, priceText: formatBRL(price), minutes: sup.deliveryMinutes, affordable: cash - price >= -credit };
        }),
      }))
      .sort((a, b) => Number(Boolean(b.neededFor)) - Number(Boolean(a.neededFor)) || Number(b.fitsActiveCar) - Number(a.fitsActiveCar) || a.slotName.localeCompare(b.slotName)),
    purchases: [...session.purchases].reverse().map((o) => ({
      id: o.id,
      partName: catalogs.parts.get(o.partId)?.name ?? o.partId,
      qty: o.qty,
      totalText: formatBRL(o.total),
      supplierName: session.supplierList.find((s) => s.id === o.supplierId)?.name ?? o.supplierId,
      status: o.status,
      statusLabel: PURCHASE_LABEL[o.status],
      etaText: o.status === 'a-caminho' ? `chega ${clockOf(o.etaAt)} (em ${Math.max(0, o.etaAt - now)} min)` : o.status === 'recebido' ? `chegou ${clockOf(o.etaAt)}` : '—',
      canCancel: o.status === 'a-caminho',
    })),
    nextDeliveryText: nextAt !== null ? `Próxima entrega: ${clockOf(nextAt)} (em ${Math.max(0, nextAt - now)} min)` : null,
    canWait: nextAt !== null,
    ledger: [...session.transactions].reverse().map((t) => ({
      id: t.id,
      when: `Dia ${t.day} ${t.time}`,
      category: CATEGORY_LABEL[t.category],
      description: t.description,
      ref: t.ref,
      amountText: `${t.kind === 'receita' ? '+' : '−'} ${formatBRL(t.amount)}`,
      kind: t.kind,
    })),
    summary: {
      revenueText: formatBRL(sum.serviceRevenue),
      purchasesText: formatBRL(sum.purchases),
      refundsText: formatBRL(sum.refunds),
      netPurchasesText: formatBRL(sum.netPurchases),
      deliveredRevenueText: formatBRL(deliveredRevenue),
      deliveredCostText: formatBRL(deliveredCost),
      grossProfitText: formatBRL(deliveredRevenue - deliveredCost),
    },
    debt: debtView(session, Math.floor(now / MINUTES_PER_DAY) + 1),
    missing: missingView(session),
    upgrades: upgradesView(session),
    catalog: buildCatalogView(session),
    staff: buildStaffView(session, Math.floor(now / MINUTES_PER_DAY) + 1),
    events: buildEventsView(session, Math.floor(now / MINUTES_PER_DAY) + 1),
    reputation: {
      generalScore: rep.general.score,
      generalStars: starsText(averageStars(rep.general)),
      specialties: (Object.keys(SPECIALTY_LABEL) as Specialty[]).map((k) => ({
        label: SPECIALTY_LABEL[k],
        score: rep.bySpecialty[k].score,
        stars: starsText(averageStars(rep.bySpecialty[k])),
        reviews: rep.bySpecialty[k].reviews,
      })),
      reviews: session.deliveredOrders().map(({ c, order }) => ({
        orderNumber: c.orderNumber,
        customer: c.customerName,
        stars: order.delivery!.review.stars,
        reasons: order.delivery!.review.reasons.map((r) => ({ effect: r.effect, text: r.text })),
        complaint: order.delivery!.review.complaint,
      })).reverse(),
      events: [...rep.events].reverse().map((e) => ({ text: e.text, delta: e.delta, when: `Dia ${e.day} ${e.time}` })),
      warranties: [...session.warranties].reverse().map((w) => ({
        id: w.id,
        orderNumber: w.orderNumber,
        covered: w.coveredSlots.map((s) => catalogs.slots.get(s)?.name ?? s).join(', '),
        validity: `${w.days} dias, até ${clockOf(w.expiresAt)}`,
        active: now <= w.expiresAt,
      })),
    },
  };
}

function debtView(session: GameSession, day: number): ComputerView['debt'] {
  const d = session.debt;
  if (d.balance <= 0) return { balanceText: formatBRL(0), paidCount: d.paidCount, next: null };
  const due = session.debtDue(day);
  const parts = [`parcela ${formatBRL(due.base)}`, due.fee > 0 ? `tarifa ${formatBRL(due.fee)}` : '', due.lateFee > 0 ? `multa por atraso ${formatBRL(due.lateFee)}` : ''].filter(Boolean);
  return {
    balanceText: formatBRL(d.balance),
    paidCount: d.paidCount,
    next: { totalText: formatBRL(due.total), detail: parts.length > 1 ? parts.join(' + ') : '', dueDay: d.nextDueDay, overdue: due.overdue, affordable: canSpend(session.cash, due.total, session.creditLimit) },
  };
}

function upgradesView(session: GameSession): ComputerView['upgrades'] {
  const effectText = (example: number, pct: number) => `${pct > 0 ? `−${pct}%` : 'sem redução'} (${example} → ${reduceMinutes(example, pct)} min)`;
  return session.upgradeDefs.map((d) => {
    const level = session.upgradeLevel(d.id);
    const nextDef = d.levels[level];
    const check = checkPurchase(d, session.upgrades, session.cash, session.creditLimit, session.reputation.general.score);
    return {
      id: d.id,
      name: d.name,
      kindLabel: d.kind === 'ferramenta' ? 'Ferramenta' : 'Oficina',
      description: d.description,
      level,
      maxLevel: d.levels.length,
      effectLabel: EFFECT_LABEL[d.effect],
      currentText: effectText(d.exampleMinutes, reductionAt(d, level)),
      next: nextDef
        ? {
            level: level + 1,
            costText: formatBRL(nextDef.cost),
            beforeText: `${reduceMinutes(d.exampleMinutes, reductionAt(d, level))} min`,
            afterText: `${reduceMinutes(d.exampleMinutes, nextDef.reductionPct)} min (−${nextDef.reductionPct}%)`,
            blockedReason: check.ok ? null : check.reason,
          }
        : null,
    };
  });
}

export interface CatalogView {
  models: Array<{
    id: string;
    name: string;
    categoryLabel: string;
    yearsText: string;
    valueText: string;
    blurb: string;
    slots: Array<{ slotName: string; parts: Array<{ name: string; qualityLabel: string; yearsText: string; costText: string }> }>;
  }>;
  services: Array<{ title: string; causeName: string; toolsText: string | null }>;
}

/** Enciclopédia: só dados públicos do catálogo (nada do estado real de nenhum carro). */
export function buildCatalogView(session: GameSession): CatalogView {
  const catalogs = session.catalogs;
  const parts = [...catalogs.parts.values()];
  return {
    models: [...catalogs.models.values()].map((m) => ({
      id: m.id,
      name: `${m.manufacturer} ${m.model}`,
      categoryLabel: VEHICLE_CATEGORY_LABEL[m.category],
      yearsText: `${m.years[0]}–${m.years[1]}`,
      valueText: formatBRL(m.baseValue),
      blurb: m.blurb,
      slots: m.slots.map((slotId) => ({
        slotName: catalogs.slots.get(slotId)?.name ?? slotId,
        parts: parts.flatMap((p) => {
          if (p.slot !== slotId) return [];
          const rules = p.compatibility.filter((r) => r.modelId === m.id);
          if (rules.length === 0) return [];
          return [{ name: p.name, qualityLabel: PART_QUALITY_LABEL[p.quality], yearsText: rules.map((r) => `${r.years[0]}–${r.years[1]}`).join(', '), costText: formatBRL(p.baseCost) }];
        }),
      })),
    })),
    services: session.serviceTemplates.map((t) => ({
      title: t.title,
      causeName: catalogs.slots.get(t.cause)?.name ?? t.cause,
      toolsText: t.requiredTools.length ? t.requiredTools.map((r) => `${session.upgradeDefs.find((u) => u.id === r.upgradeId)?.name ?? r.upgradeId} nível ${r.level}`).join(', ') : null,
    })),
  };
}

/** Visão da aba Equipe (Prompt 15): funcionários, candidatos, folha salarial e fila de tarefas. */
export function buildStaffView(session: GameSession, day: number): StaffView {
  const s = session.staff;
  const hiredIds = new Set(s.employees.map((e) => e.id));
  const taskMap = new Map(s.tasks.map((t) => [t.id, t]));
  const empMap = new Map(s.employees.map((e) => [e.id, e]));
  const due = session.payrollDueOn(day);
  const totalPayroll = due > 0 ? due : session.dailyPayroll;
  const paidToday = s.employees.length > 0 && due === 0;
  const payrollAffordable = canSpend(session.cash, due, session.creditLimit);
  let payrollBlocked: string | null = null;
  if (s.employees.length === 0) payrollBlocked = 'Contrate ao menos 1 funcionário.';
  else if (paidToday) payrollBlocked = `Folha do dia ${day} já quitada.`;
  else if (!payrollAffordable) payrollBlocked = 'Caixa insuficiente para a folha salarial.';

  return {
    payroll: {
      totalText: formatBRL(totalPayroll),
      employeeCount: s.employees.length,
      paidToday,
      canPay: s.employees.length > 0 && !paidToday && payrollAffordable,
      blockedReason: payrollBlocked,
    },
    employees: s.employees.map((e) => {
      const current = e.currentTaskId ? taskMap.get(e.currentTaskId) : null;
      return {
        id: e.id,
        name: e.name,
        role: e.role,
        roleLabel: STAFF_ROLE_LABEL[e.role],
        skill: e.skill,
        speedText: `${Math.round(e.speed * 100)}%`,
        salaryText: `${formatBRL(e.salary)}/dia`,
        state: e.state,
        stateLabel: e.paidDay < day && e.state !== 'pausado' ? `${STAFF_STATE_LABEL[e.state]} · parado: salário do dia ${day} não pago` : STAFF_STATE_LABEL[e.state],
        paused: e.state === 'pausado',
        currentTaskText: current ? `${current.title} (${current.progressMinutes}/${current.totalMinutes} min)` : null,
        completedTasks: e.completedTasks,
      };
    }),
    candidates: session.staffCandidates
      .filter((c) => !hiredIds.has(c.id))
      .map((c) => {
        const affordable = canSpend(session.cash, c.salary, session.creditLimit);
        return {
          id: c.id,
          name: c.name,
          role: c.role,
          roleLabel: STAFF_ROLE_LABEL[c.role],
          skill: c.skill,
          speedText: `${Math.round(c.speed * 100)}%`,
          salaryText: `${formatBRL(c.salary)}/dia`,
          blurb: c.blurb,
          affordable,
          blockedReason: affordable ? null : `Exige ${formatBRL(c.salary)} no caixa para o 1º dia.`,
        };
      }),
    standardTasks: STANDARD_STAFF_TASKS.map((std) => ({
      id: std.id,
      title: std.title,
      roleText: TASK_ALLOWED_ROLES[std.kind].map((r) => STAFF_ROLE_LABEL[r]).join(' ou '),
      minSkill: std.minSkill,
      minutes: std.baseMinutes,
      description: std.description,
    })),
    tasks: [...s.tasks].reverse().map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      statusLabel: STAFF_TASK_STATUS_LABEL[t.status],
      assignedName: t.assignedTo ? (empMap.get(t.assignedTo)?.name ?? t.assignedTo) : null,
      progressText: `${t.progressMinutes}/${t.totalMinutes} min`,
      resultText: t.resultText,
    })),
    hasActiveTasks: s.tasks.some((t) => t.status === 'em-andamento'),
  };
}

/** Visão do sistema de eventos, fiscalização e pressão local (Prompt 16). */
export function buildEventsView(session: GameSession, day: number): EventsView {
  const active = session.activeEvent;
  const cash = session.cash;
  const credit = session.creditLimit;
  const repFmt = (d: number) => (d > 0 ? `+${d} rep` : d < 0 ? `${d} rep` : '0 rep');

  return {
    active: active
      ? {
          id: active.id,
          category: active.category,
          categoryLabel: GAME_EVENT_CATEGORY_LABEL[active.category],
          title: active.title,
          speaker: active.speaker,
          message: active.message,
          options: active.options.map((o) => {
            const affordable = !o.requireCash || o.cost === 0 || canSpend(cash, o.cost, credit);
            return {
              id: o.id,
              label: o.label,
              description: o.description,
              costText: o.cost > 0 ? formatBRL(o.cost) : 'Sem custo',
              reputationText: repFmt(o.reputationDelta),
              timeText: o.timeMinutes > 0 ? `+${o.timeMinutes} min` : 'Imediato',
              affordable,
              blockedReason: affordable ? null : `Exige ${formatBRL(o.cost)} no caixa`,
            };
          }),
        }
      : null,
    catalog: session.gameEvents.map((ev) => ({
      id: ev.id,
      categoryLabel: GAME_EVENT_CATEGORY_LABEL[ev.category],
      title: ev.title,
      speaker: ev.speaker,
      triggerText: `Gatilho automático: a partir do dia ${ev.trigger.minDay} (${ev.trigger.minDeliveredOrders} OS entregue(s), intervalo de ${ev.trigger.cooldownDays} dia(s))`,
      canTriggerNow: canTriggerEvent(ev, session.events, { day, deliveredCount: session.deliveredOrders().length }),
    })),
    history: [...session.events.history].reverse().map((h) => ({
      id: h.id,
      title: h.title,
      categoryLabel: GAME_EVENT_CATEGORY_LABEL[h.category],
      optionLabel: h.optionLabel,
      costText: h.cost > 0 ? `− ${formatBRL(h.cost)}` : 'R$ 0,00',
      reputationText: repFmt(h.reputationDelta),
      outcomeText: h.outcomeText,
      when: `Dia ${h.day} · ${h.time}`,
    })),
  };
}

function missingView(session: GameSession): ComputerView['missing'] {
  const missing = session.missingPartsForActive();
  const c = session.activeCase;
  if (!c || missing.length === 0) return null;
  const suppliers = [...session.supplierList];
  const fastest = Math.min(...suppliers.map((s) => s.deliveryMinutes));
  const cheapest = Math.min(...suppliers.map((s) => s.priceFactor));
  return {
    orderLabel: `OS #${c.orderNumber}`,
    count: missing.reduce((n, m) => n + m.qty, 0),
    names: missing.map((m) => `${m.qty > 1 ? `${m.qty}× ` : ''}${session.catalogs.parts.get(m.partId)?.name ?? m.partId}`).join(', '),
    options: suppliers.map((s) => {
      const total = session.missingPartsCost(s.id) ?? 0;
      return {
        supplierId: s.id,
        supplierName: s.name,
        totalText: formatBRL(total),
        minutes: s.deliveryMinutes,
        affordable: canSpend(session.cash, total, session.creditLimit),
        label: s.deliveryMinutes === fastest ? 'Rápido' : s.priceFactor === cheapest ? 'Econômico' : 'Comprar',
      };
    }),
  };
}
