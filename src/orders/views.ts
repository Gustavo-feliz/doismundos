import { REQUIREMENT_TEXT, unmetRequirement } from '../diagnostics/rules';
import type { EquipmentContext } from '../diagnostics/types';
import { formatBRL } from '../economy/money';
import { formatHours } from '../economy/quote';
import type { GameSession } from '../game/GameSession';
import { QUALITY_LABEL as PART_QUALITY_LABEL } from '../parts/types';
import { FINAL_TEST_REQUIRES, REPAIR_ACCESS, stepMinutes } from '../repairs/rules';
import { averageStars, SPECIALTY_LABEL, type Specialty } from '../customers/reputation';
import { CATEGORY_LABEL } from '../economy/ledger';
import { compatiblePartsFor } from '../vehicles/domain';
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
    const minutes = stepMinutes(planned?.replaceMinutes ?? 30);
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
  nextDeliveryText: string | null;
  canWait: boolean;
  ledger: Array<{ id: string; when: string; category: string; description: string; ref: string; amountText: string; kind: string }>;
  summary: { revenueText: string; purchasesText: string; refundsText: string; netPurchasesText: string; deliveredRevenueText: string; deliveredCostText: string; grossProfitText: string };
  reputation: {
    generalScore: number;
    generalStars: string;
    specialties: Array<{ label: string; score: number; stars: string; reviews: number }>;
    reviews: Array<{ orderNumber: string; customer: string; stars: number; reasons: Array<{ effect: string; text: string }>; complaint: string | null }>;
    events: Array<{ text: string; delta: number; when: string }>;
    warranties: Array<{ id: string; orderNumber: string; covered: string; validity: string; active: boolean }>;
  };
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
