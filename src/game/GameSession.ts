import { decideOnQuote, counterIsPriceOnly } from '../customers/decision';
import { evaluateService } from '../customers/evaluation';
import { applyReview, applyWarrantyPenalty, initialReputation, specialtyOf, type ReputationState } from '../customers/reputation';
import type { CustomerProfile } from '../customers/types';
import {
  concludeDiagnosis,
  nextHint,
  REQUIREMENT_TEXT,
  runTest,
  testsForCase,
  unmetRequirement,
  type DiagnosisResult,
  type DiagnosticData,
} from '../diagnostics/rules';
import type { CaseProgress, DiagnosisRecord, DiagnosticCaseDef, EquipmentContext, EvidenceEntry } from '../diagnostics/types';
import { validateDiagnosticData } from '../diagnostics/validate';
import { balance, canSpend, summarize, type LedgerSummary, type Transaction, type TransactionCategory } from '../economy/ledger';
import { formatBRL, type Cents } from '../economy/money';
import { computeQuote, type PricingRules, type QuoteBreakdown, type QuoteInput, type QuoteResult } from '../economy/quote';
import type { HeldPart, PurchaseOrder, StockLot, Supplier } from '../inventory/types';
import { canTransitionOrder, isOrderClosed, type OrderState, type OrderStatus, type QuoteDraft, type RepairState } from '../orders/types';
import { createWarranty, evaluateClaim, type WarrantyRecord } from '../orders/warranty';
import { computeQuality, installHeldPart, pendingTasks, removeOldPart, runFinalTest, startRepair, type RepairError } from '../repairs/rules';
import type { Catalogs } from '../vehicles/catalogs';
import { compatiblePartsFor, revealPartCondition, type DomainResult } from '../vehicles/domain';
import { createVehicleState, type VehicleSpec } from '../vehicles/factory';
import type { HistoryEntry, VehicleState } from '../vehicles/state';
import { DataValidationError } from '../vehicles/types';
import { validateSessionSnapshot, type SessionSnapshot } from '../save/sessionSnapshot';

/** Momento do jogo: dia, hora formatada e minuto absoluto (para prazos e entregas). */
export interface GameMoment {
  day: number;
  time: string;
  at: number;
}

/** Resultado de uma ação do jogador (para a UI mostrar e o relógio avançar). */
export interface ActionOutcome {
  ok: boolean;
  message: string;
  /** Minutos de jogo gastos (0 se nada aconteceu). */
  minutes: number;
  /** Tom do aviso: a ação funcionou, mas o resultado pode ser ruim (ex.: cliente recusou). */
  tone?: 'ok' | 'warn' | 'blocked';
}

/** Conteúdo do jogo usado pela sessão. */
export interface SessionContent {
  cases: readonly DiagnosticCaseDef[];
  diagnostics: DiagnosticData;
  customers: readonly CustomerProfile[];
  pricing: PricingRules;
  initialStock: ReadonlyArray<{ partId: string; qty: number }>;
  defaultDraft: Omit<QuoteDraft, 'extras'>;
  suppliers: readonly Supplier[];
  economy: { startingCash: Cents; creditLimit: Cents };
}

const KNOWN_BAD = new Set(['gasta', 'critica', 'falhou']);
const WARRANTY_SUFFIX = '-garantia';

/** OS de retorno em garantia, criada a partir da OS original (mesmo carro, mesma causa). */
export function warrantyReturnCase(c: DiagnosticCaseDef): DiagnosticCaseDef {
  return {
    ...c,
    id: `${c.id}${WARRANTY_SUFFIX}`,
    orderNumber: `${c.orderNumber}-G`,
    complaint: `Voltei! O problema continua igual. ${c.complaint}`,
    summary: `${c.summary} (retorno em garantia)`,
    followUp: undefined,
  };
}
const MAX_PURCHASE_QTY = 10;

/**
 * Estado de jogo da sessão (em memória): carros, ordens de serviço, estoque,
 * caixa, reputação e garantias. Fica fora da cena. Save em disco: Prompt 9.
 */
export class GameSession {
  private readonly vehicles = new Map<string, VehicleState>();
  private readonly cases: DiagnosticCaseDef[] = [];
  private readonly progress = new Map<string, CaseProgress>();
  private readonly orders = new Map<string, OrderState>();
  private readonly customers = new Map<string, CustomerProfile>();
  private readonly suppliers = new Map<string, Supplier>();
  private readonly records: DiagnosisRecord[] = [];
  private lots: StockLot[] = [];
  private purchaseOrders: PurchaseOrder[] = [];
  private ledger: Transaction[] = [];
  /** Saldo guardado (o HUD lê todo quadro; não precisa somar o livro-caixa sempre). */
  private cashValue = 0;
  private held: HeldPart | null = null;
  private readonly scrapped: string[] = [];
  private rep: ReputationState = initialReputation();
  private warrantyRecords: WarrantyRecord[] = [];
  private caseIndex = 0;
  private revision = 0;
  private seq = { lot: 0, purchase: 0, tx: 0, warranty: 0 };

  constructor(
    readonly catalogs: Catalogs,
    specs: readonly VehicleSpec[],
    private readonly content: SessionContent | null = null,
  ) {
    for (const spec of specs) this.addVehicle(spec);
    if (!content) return;
    const followUps = content.cases.flatMap((c) => (c.followUp ? [c.followUp] : []));
    validateDiagnosticData([...content.cases, ...followUps], content.diagnostics, catalogs);
    for (const c of content.customers) this.customers.set(c.id, c);
    for (const s of content.suppliers) this.suppliers.set(s.id, s);
    this.validateContent(content, followUps);
    this.cashValue = content.economy.startingCash;
    for (const s of content.initialStock) this.addLot(s.partId, s.qty, 0, 'Herdada do tio');
    for (const c of content.cases) this.registerCase(c, this.cases.length, null);
  }

  /** Muda a cada alteração: a UI usa para saber se precisa redesenhar. */
  get version(): number {
    return this.revision;
  }

  getVehicle(id: string): VehicleState {
    const v = this.vehicles.get(id);
    if (!v) throw new Error(`Carro não encontrado: "${id}"`);
    return v;
  }

  /** Aplica uma operação de domínio. Só grava se der certo. */
  apply<T extends VehicleState | { vehicle: VehicleState }>(id: string, operation: (v: VehicleState) => DomainResult<T>): DomainResult<T> {
    const result = operation(this.getVehicle(id));
    if (result.ok) {
      const next = 'vehicle' in result.value ? result.value.vehicle : result.value;
      this.vehicles.set(id, next as VehicleState);
      this.revision++;
    }
    return result;
  }

  // --- Ordens de serviço: navegação ------------------------------------------

  get caseCount(): number {
    return this.cases.length;
  }

  /** Posição da OS ativa, começando em 1. */
  get caseNumber(): number {
    return this.caseIndex + 1;
  }

  get activeCase(): DiagnosticCaseDef | null {
    return this.cases[this.caseIndex] ?? null;
  }

  getProgress(caseId: string): CaseProgress {
    const p = this.progress.get(caseId);
    if (!p) throw new Error(`Caso não encontrado: "${caseId}"`);
    return p;
  }

  getOrder(caseId: string): OrderState {
    const o = this.orders.get(caseId);
    if (!o) throw new Error(`OS não encontrada: "${caseId}"`);
    return o;
  }

  getCustomer(id: string): CustomerProfile {
    const c = this.customers.get(id);
    if (!c) throw new Error(`Cliente não encontrado: "${id}"`);
    return c;
  }

  get diagnoses(): readonly DiagnosisRecord[] {
    return this.records;
  }

  get pricingRules(): PricingRules {
    return this.need().pricing;
  }

  /** Passa para a próxima OS, se a atual estiver encerrada (entregue ou recusada). */
  advanceCase(): boolean {
    const c = this.activeCase;
    if (!c || !isOrderClosed(this.getOrder(c.id).status) || this.caseIndex >= this.cases.length - 1) return false;
    this.caseIndex++;
    this.revision++;
    return true;
  }

  // --- Diagnóstico ----------------------------------------------------------

  runDiagnosticTest(testId: string, ctx: EquipmentContext, when: GameMoment): DiagnosisResult<EvidenceEntry> {
    const c = this.activeCase;
    if (!c) return { ok: false, error: { code: 'exame-inexistente', message: 'Nenhuma ordem de serviço ativa.' } };
    const progress = this.getProgress(c.id);
    if (progress.conclusion) return { ok: false, error: { code: 'ja-concluido', message: 'Este diagnóstico já foi registrado.' } };
    const data = this.need().diagnostics;
    const test = testsForCase(c, this.catalogs, data).find((t) => t.id === testId);
    if (!test) return { ok: false, error: { code: 'exame-inexistente', message: `Exame indisponível: ${testId}` } };
    if (progress.evidence.some((e) => e.testId === testId)) {
      return { ok: false, error: { code: 'exame-repetido', message: 'Esse exame já foi feito: repetir não traz nada novo.' } };
    }
    const unmet = unmetRequirement(test.requires, ctx);
    if (unmet) return { ok: false, error: { code: 'requisito', message: REQUIREMENT_TEXT[unmet] } };

    const vehicle = this.getVehicle(c.vehicle.id);
    const outcome = runTest(testId, c, vehicle, this.catalogs, data);
    if (!outcome.ok) return outcome;
    const entry: EvidenceEntry = {
      testId,
      testName: test.name,
      kind: test.kind,
      text: outcome.value.text,
      effects: outcome.value.effects,
      minutes: test.minutes,
      day: when.day,
      time: when.time,
    };
    this.progress.set(c.id, { ...progress, evidence: [...progress.evidence, entry] });
    if (outcome.value.revealSlot) {
      const revealed = revealPartCondition(vehicle, outcome.value.revealSlot, 'inspecao', this.catalogs);
      if (revealed.ok) this.vehicles.set(vehicle.id, revealed.value);
    }
    this.revision++;
    return { ok: true, value: entry };
  }

  requestHint(): string | null {
    const c = this.activeCase;
    if (!c) return null;
    const progress = this.getProgress(c.id);
    if (progress.conclusion) return null;
    const hint = nextHint(c, progress);
    if (!hint) return null;
    this.progress.set(c.id, { ...progress, hintsShown: [...progress.hintsShown, hint] });
    this.revision++;
    return hint;
  }

  hasHint(): boolean {
    const c = this.activeCase;
    return c ? nextHint(c, this.getProgress(c.id)) !== null : false;
  }

  /**
   * Registra o diagnóstico. Se o serviço for coberto por garantia, a OS já sai
   * aprovada sem custo para o cliente; senão, vai para o orçamento.
   */
  concludeActiveCase(chosenSlot: string, when: GameMoment): DiagnosisResult<DiagnosisRecord> {
    const c = this.activeCase;
    if (!c) return { ok: false, error: { code: 'exame-inexistente', message: 'Nenhuma ordem de serviço ativa.' } };
    const progress = this.getProgress(c.id);
    const result = concludeDiagnosis(c, progress, chosenSlot, when);
    if (!result.ok) return result;
    this.progress.set(c.id, { ...progress, conclusion: result.value });
    this.records.push(result.value);
    const slotName = this.catalogs.slots.get(chosenSlot)?.name ?? chosenSlot;
    this.addHistory(c, when, `Diagnóstico registrado (OS #${c.orderNumber}): ${slotName}`);
    this.setStatus(c.id, 'orcamento');

    let order = this.getOrder(c.id);
    // Carro com garantia ativa: o mecânico confere se o novo defeito tem relação com o serviço.
    if (!order.warranty && this.warrantyRecords.some((w) => w.vehicleId === c.vehicle.id)) {
      const claim = evaluateClaim(this.warrantyRecords, { vehicleId: c.vehicle.id, at: when.at, sameComplaintOf: null, diagnosedSlot: chosenSlot });
      order = { ...order, warranty: { covered: claim.covered, reason: claim.reason, warrantyId: claim.warranty?.id ?? null } };
      this.orders.set(c.id, order);
      if (claim.covered) this.penalize(chosenSlot, `Retorno em garantia (OS #${c.orderNumber}): ${claim.reason}`, when);
    }
    if (order.warranty?.covered) this.approveUnderWarranty(c, when);
    this.revision++;
    return result;
  }

  // --- Orçamento e negociação ------------------------------------------------

  eligibleExtras(caseId: string): string[] {
    const c = this.findCase(caseId);
    const chosen = this.getProgress(caseId).conclusion?.chosenSlot;
    const v = this.getVehicle(c.vehicle.id);
    return Object.entries(v.knowledge)
      .filter(([slot, k]) => slot !== chosen && k.status === 'avaliado' && KNOWN_BAD.has(k.band) && compatiblePartsFor(v, slot, this.catalogs).length > 0)
      .map(([slot]) => slot);
  }

  quoteInput(caseId: string, negotiatedDiscount = 0, negotiatedLabel?: string): QuoteInput | null {
    const c = this.findCase(caseId);
    const chosen = this.getProgress(caseId).conclusion?.chosenSlot;
    if (!chosen) return null;
    const v = this.getVehicle(c.vehicle.id);
    const draft = this.getOrder(caseId).draft;
    const partFor = (slot: string) => compatiblePartsFor(v, slot, this.catalogs)[0]?.id ?? '';
    return {
      items: [{ slot: chosen, partId: partFor(chosen), mandatory: true }, ...draft.extras.map((slot) => ({ slot, partId: partFor(slot), mandatory: false }))],
      markupPct: draft.markupPct,
      discountPct: draft.discountPct,
      urgent: draft.urgent,
      warrantyDays: draft.warrantyDays,
      negotiatedDiscount,
      ...(negotiatedLabel ? { negotiatedLabel } : {}),
    };
  }

  previewQuote(caseId: string, negotiatedDiscount = 0, negotiatedLabel?: string): QuoteResult | null {
    const input = this.quoteInput(caseId, negotiatedDiscount, negotiatedLabel);
    if (!input) return null;
    const c = this.findCase(caseId);
    const category = this.catalogs.models.get(c.vehicle.modelId)!.category;
    return computeQuote(input, { catalogs: this.catalogs, category, rules: this.need().pricing });
  }

  updateDraft(caseId: string, patch: Partial<QuoteDraft>): ActionOutcome {
    const order = this.getOrder(caseId);
    if (order.status !== 'orcamento' && order.status !== 'contraproposta') return this.fail('O orçamento não pode mais ser alterado.');
    const rules = this.need().pricing;
    const next = { ...order.draft, ...patch };
    if (!rules.markupOptions.includes(next.markupPct)) return this.fail('Margem inválida.');
    if (!rules.discountOptions.includes(next.discountPct)) return this.fail('Desconto inválido.');
    if (!rules.warrantyOptions.includes(next.warrantyDays)) return this.fail('Garantia inválida.');
    const eligible = new Set(this.eligibleExtras(caseId));
    if (next.extras.some((s) => !eligible.has(s)) || new Set(next.extras).size !== next.extras.length) {
      return this.fail('Só dá para sugerir peças que você avaliou como gastas ou piores.');
    }
    this.orders.set(caseId, { ...order, draft: next });
    this.revision++;
    return { ok: true, message: '', minutes: 0 };
  }

  sendQuote(when: GameMoment): ActionOutcome {
    const c = this.activeCase;
    if (!c) return this.fail('Nenhuma ordem de serviço ativa.');
    const order = this.getOrder(c.id);
    if (order.status !== 'orcamento' && order.status !== 'contraproposta') return this.fail('Não há orçamento a enviar nesta etapa.');
    const quote = this.previewQuote(c.id);
    if (!quote || !quote.ok) return this.fail(quote && !quote.ok ? quote.error.message : 'Orçamento inválido.');
    const decision = decideOnQuote(quote.value, this.getCustomer(c.customerId), order.counters);
    const proposals = [...order.proposals, { round: order.proposals.length + 1, breakdown: quote.value, decision, day: when.day, time: when.time }];
    const totalText = formatBRL(quote.value.total);

    if (decision.kind === 'aceita') {
      this.approve(c, { ...order, proposals }, quote.value, when, `Orçamento aprovado: ${totalText}`);
    } else if (decision.kind === 'contraproposta') {
      this.orders.set(c.id, { ...order, proposals, counters: order.counters + 1, status: 'contraproposta' });
      this.addHistory(c, when, `Contraproposta do cliente ao orçamento de ${totalText}`);
    } else {
      this.orders.set(c.id, { ...order, proposals, status: 'recusada', closedReason: decision.message });
      this.addHistory(c, when, `Orçamento recusado: ${totalText}`);
    }
    this.revision++;
    const tone = decision.kind === 'aceita' ? 'ok' : decision.kind === 'contraproposta' ? 'warn' : 'blocked';
    return { ok: true, message: decision.message, minutes: 0, tone };
  }

  acceptCounter(when: GameMoment): ActionOutcome {
    const c = this.activeCase;
    if (!c) return this.fail('Nenhuma ordem de serviço ativa.');
    const order = this.getOrder(c.id);
    const last = order.proposals.at(-1);
    if (order.status !== 'contraproposta' || !last || !counterIsPriceOnly(last.decision) || last.decision.kind !== 'contraproposta') {
      return this.fail('Só dá para aceitar direto uma contraproposta de preço. Ajuste o orçamento e reenvie.');
    }
    const quote = this.previewQuote(c.id, Math.max(0, last.breakdown.total - last.decision.targetTotal!));
    if (!quote || !quote.ok || quote.value.total !== last.decision.targetTotal) return this.fail('O orçamento mudou desde a contraproposta. Reenvie ao cliente.');
    const message = `${this.getCustomer(c.customerId).name}: “Combinado, ${formatBRL(quote.value.total)}. Pode fazer.”`;
    const proposals = [
      ...order.proposals,
      { round: order.proposals.length + 1, breakdown: quote.value, decision: { kind: 'aceita' as const, message }, day: when.day, time: when.time },
    ];
    this.approve(c, { ...order, proposals }, quote.value, when, `Acordo fechado: ${formatBRL(quote.value.total)}`);
    this.revision++;
    return { ok: true, message, minutes: 0 };
  }

  dismissCustomer(when: GameMoment): ActionOutcome {
    const c = this.activeCase;
    if (!c) return this.fail('Nenhuma ordem de serviço ativa.');
    const order = this.getOrder(c.id);
    if (order.status !== 'orcamento' && order.status !== 'contraproposta') return this.fail('Esta OS não pode ser encerrada agora.');
    this.orders.set(c.id, { ...order, status: 'recusada', closedReason: 'A oficina encerrou a OS sem serviço.' });
    this.addHistory(c, when, 'OS encerrada sem serviço');
    this.revision++;
    return { ok: true, message: 'OS encerrada. O cliente levou o carro.', minutes: 0 };
  }

  // --- Caixa ------------------------------------------------------------------

  get cash(): Cents {
    return this.cashValue;
  }

  /** Confere o saldo guardado contra o livro-caixa (usado nos testes). */
  recomputeCash(): Cents {
    return balance(this.need().economy.startingCash, this.ledger);
  }

  get transactions(): readonly Transaction[] {
    return this.ledger;
  }

  get ledgerSummary(): LedgerSummary {
    return summarize(this.ledger);
  }

  get creditLimit(): Cents {
    return this.need().economy.creditLimit;
  }

  // --- Loja e estoque ------------------------------------------------------------

  get supplierList(): readonly Supplier[] {
    return [...this.suppliers.values()];
  }

  /** Preço unitário de uma peça num fornecedor (a mesma regra para a loja e para os testes). */
  priceOf(partId: string, supplierId: string): Cents | null {
    const part = this.catalogs.parts.get(partId);
    const supplier = this.suppliers.get(supplierId);
    return part && supplier ? Math.round(part.baseCost * supplier.priceFactor) : null;
  }

  get purchases(): readonly PurchaseOrder[] {
    return this.purchaseOrders;
  }

  /** Compra: o dinheiro sai agora; a peça só entra no estoque quando chegar. */
  buyPart(partId: string, supplierId: string, qty: number, when: GameMoment): ActionOutcome {
    const part = this.catalogs.parts.get(partId);
    const supplier = this.suppliers.get(supplierId);
    if (!part || !supplier) return this.fail('Peça ou fornecedor desconhecido.');
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_PURCHASE_QTY) return this.fail(`Quantidade inválida (1 a ${MAX_PURCHASE_QTY}).`);
    const unitPrice = this.priceOf(partId, supplierId)!;
    const total = unitPrice * qty;
    if (!canSpend(this.cash, total, this.creditLimit)) {
      return this.fail(`Caixa insuficiente: a compra custa ${formatBRL(total)} e há ${formatBRL(this.cash)} no caixa.`);
    }
    const id = `PED-${String(++this.seq.purchase).padStart(4, '0')}`;
    const order: PurchaseOrder = { id, partId, supplierId, qty, unitPrice, total, orderedAt: when.at, etaAt: when.at + supplier.deliveryMinutes, status: 'a-caminho' };
    this.purchaseOrders = [...this.purchaseOrders, order];
    this.record('despesa', 'compra-pecas', total, `${qty}× ${part.name} — ${supplier.name}`, id, when);
    this.revision++;
    return { ok: true, message: `Pedido ${id}: ${qty}× ${part.name} por ${formatBRL(total)}. Chega em ${supplier.deliveryMinutes} min.`, minutes: 0 };
  }

  /** Cancela um pedido ainda a caminho: estorno integral. */
  cancelPurchase(purchaseId: string, when: GameMoment): ActionOutcome {
    const order = this.purchaseOrders.find((p) => p.id === purchaseId);
    if (!order) return this.fail('Pedido não encontrado.');
    if (order.status !== 'a-caminho') return this.fail(order.status === 'recebido' ? 'O pedido já foi entregue: não dá mais para cancelar.' : 'O pedido já foi cancelado.');
    this.purchaseOrders = this.purchaseOrders.map((p) => (p.id === purchaseId ? { ...p, status: 'cancelado' as const } : p));
    this.record('receita', 'estorno-compra', order.total, `Cancelamento do pedido ${order.id}`, order.id, when);
    this.revision++;
    return { ok: true, message: `Pedido ${order.id} cancelado: ${formatBRL(order.total)} voltaram ao caixa.`, minutes: 0 };
  }

  /** Entrega os pedidos cujo prazo chegou. Retorna os entregues (para avisar o jogador). */
  deliverDue(at: number): PurchaseOrder[] {
    const due = this.purchaseOrders.filter((p) => p.status === 'a-caminho' && p.etaAt <= at);
    if (due.length === 0) return [];
    for (const p of due) this.addLot(p.partId, p.qty, p.unitPrice, `${this.suppliers.get(p.supplierId)?.name ?? p.supplierId} (${p.id})`);
    const ids = new Set(due.map((p) => p.id));
    this.purchaseOrders = this.purchaseOrders.map((p) => (ids.has(p.id) ? { ...p, status: 'recebido' as const } : p));
    this.revision++;
    return due;
  }

  /** Próximo minuto em que um pedido chega (null = nada a caminho). */
  nextDeliveryAt(): number | null {
    const pending = this.purchaseOrders.filter((p) => p.status === 'a-caminho').map((p) => p.etaAt);
    return pending.length ? Math.min(...pending) : null;
  }

  get stock(): readonly StockLot[] {
    return this.lots;
  }

  get heldPartId(): string | null {
    return this.held?.partId ?? null;
  }

  get scrap(): readonly string[] {
    return this.scrapped;
  }

  /** Quantidade de uma peça no estoque (incluindo a que está na mão) e a caminho. */
  availability(partId: string): { inStock: number; onTheWay: number; nextAt: number | null } {
    const inStock = this.lots.filter((l) => l.partId === partId).reduce((s, l) => s + l.qty, 0) + (this.held?.partId === partId ? 1 : 0);
    const pending = this.purchaseOrders.filter((p) => p.partId === partId && p.status === 'a-caminho');
    return { inStock, onTheWay: pending.reduce((s, p) => s + p.qty, 0), nextAt: pending.length ? Math.min(...pending.map((p) => p.etaAt)) : null };
  }

  takePart(lotId: string): ActionOutcome {
    if (this.held) return this.fail('Suas mãos estão ocupadas. Devolva a peça que está segurando.');
    const lot = this.lots.find((l) => l.lotId === lotId && l.qty > 0);
    if (!lot) return this.fail('Essa peça não está no estoque.');
    this.lots = this.lots.map((l) => (l === lot ? { ...l, qty: l.qty - 1 } : l)).filter((l) => l.qty > 0);
    this.held = { partId: lot.partId, unitCost: lot.unitCost, lotSource: lot.source };
    this.revision++;
    return { ok: true, message: `Em mãos: ${this.partName(lot.partId)}`, minutes: 0 };
  }

  returnHeldPart(): ActionOutcome {
    if (!this.held) return this.fail('Você não está segurando nenhuma peça.');
    const { partId, unitCost, lotSource } = this.held;
    this.addLot(partId, 1, unitCost, lotSource);
    this.held = null;
    this.revision++;
    return { ok: true, message: `${this.partName(partId)} devolvida à estante.`, minutes: 0 };
  }

  // --- Reparo ------------------------------------------------------------------

  removeOldPart(slot: string, ctx: EquipmentContext, when: GameMoment): ActionOutcome {
    const job = this.repairJob();
    if (!job.ok) return this.fail(job.message);
    const result = removeOldPart(job.order.repair!, this.getVehicle(job.c.vehicle.id), slot, ctx, this.catalogs);
    if (!result.ok) return this.repairFailure(job.c.id, result.error, when);
    this.vehicles.set(job.c.vehicle.id, result.value.vehicle);
    this.scrapped.push(result.value.removedPartId);
    return this.repairSuccess(job.c.id, result.value.repair, result.value.message, result.value.minutes, when);
  }

  installHeldPart(slot: string, ctx: EquipmentContext, when: GameMoment): ActionOutcome {
    const job = this.repairJob();
    if (!job.ok) return this.fail(job.message);
    const result = installHeldPart(job.order.repair!, this.getVehicle(job.c.vehicle.id), slot, this.heldPartId, ctx, this.catalogs);
    if (!result.ok) return this.repairFailure(job.c.id, result.error, when);
    const cost = this.held!.unitCost;
    const repair = { ...result.value.repair, items: result.value.repair.items.map((i) => (i.slot === slot ? { ...i, installedUnitCost: cost } : i)) };
    this.vehicles.set(job.c.vehicle.id, result.value.vehicle);
    this.held = null;
    return this.repairSuccess(job.c.id, repair, result.value.message, result.value.minutes, when);
  }

  runFinalTest(ctx: EquipmentContext, when: GameMoment): ActionOutcome {
    const job = this.repairJob();
    if (!job.ok) return this.fail(job.message);
    const result = runFinalTest(job.order.repair!, ctx, job.c.trueCause, job.c.finalTest);
    if (!result.ok) return this.repairFailure(job.c.id, result.error, when);
    return this.repairSuccess(job.c.id, result.value.repair, result.value.message, result.value.minutes, when);
  }

  completeOrder(when: GameMoment): ActionOutcome {
    const job = this.repairJob();
    if (!job.ok) return this.fail(job.message);
    const { c, order } = job;
    const pending = pendingTasks(order.repair!, this.catalogs);
    if (pending.length) return this.fail(`Ainda falta: ${pending.join('; ')}.`);
    const quality = computeQuality(order.repair!);
    this.orders.set(c.id, {
      ...order,
      status: 'concluida',
      completion: { qualityScore: quality.score, qualityLabel: quality.label, symptomResolved: quality.resolved, repairMinutes: order.repair!.minutes, day: when.day, time: when.time },
    });
    this.addHistory(c, when, `Serviço concluído (OS #${c.orderNumber})${quality.resolved ? '' : ': defeito não resolvido'}`);
    this.revision++;
    return {
      ok: true,
      message: quality.resolved ? 'Serviço concluído! Agora entregue o carro ao cliente.' : 'Serviço concluído, mas o defeito continua. Entregue o carro: o cliente vai voltar.',
      minutes: 0,
      tone: quality.resolved ? 'ok' : 'warn',
    };
  }

  // --- Entrega, pagamento, avaliação e garantia ----------------------------------

  /**
   * Entrega: recebe o restante (total − sinal), calcula custo e lucro bruto, o
   * cliente avalia, a reputação muda, a garantia é registrada e retornos são agendados.
   */
  deliverVehicle(when: GameMoment): ActionOutcome {
    const c = this.activeCase;
    if (!c) return this.fail('Nenhuma ordem de serviço ativa.');
    const order = this.getOrder(c.id);
    if (order.status !== 'concluida') return this.fail('Só dá para entregar um carro com o serviço concluído.');
    const approved = order.approved!;
    const covered = Boolean(order.warranty?.covered);
    const remainder = approved.total - order.depositPaid;
    if (remainder > 0) this.record('receita', 'servico', remainder, `Pagamento da OS #${c.orderNumber} (${c.customerName})`, `OS #${c.orderNumber}`, when);
    const revenue = approved.total;
    const partsCost = order.repair!.items.reduce((s, i) => s + (i.installedUnitCost ?? 0), 0);

    const customer = this.getCustomer(c.customerId);
    const promisedAt = (order.approvedAt ?? when.at) + approved.deadlineHours * 60;
    const review = evaluateService({
      promisedAt,
      deliveredAt: when.at,
      paidTotal: approved.total,
      maxBudget: customer.maxBudget,
      quality: order.completion!.qualityLabel,
      counters: order.counters,
      warrantyCovered: covered,
    });
    const mainSlot = approved.input.items.find((i) => i.mandatory)!.slot;
    const specialty = specialtyOf(this.catalogs.slots.get(mainSlot)!.system);
    this.rep = applyReview(this.rep, review.stars, specialty, `${customer.name} (OS #${c.orderNumber}): ${review.stars}★`, when);

    // Garantia do serviço (retornos já cobertos reaproveitam a garantia original).
    let warrantyId: string | null = order.warranty?.warrantyId ?? null;
    if (!covered) {
      const w = createWarranty(++this.seq.warranty, {
        caseId: c.id,
        orderNumber: c.orderNumber,
        vehicleId: c.vehicle.id,
        coveredSlots: approved.input.items.map((i) => i.slot),
        coveredComplaint: c.summary,
        days: approved.warrantyDays,
        startAt: when.at,
        startDay: when.day,
      });
      this.warrantyRecords = [...this.warrantyRecords, w];
      warrantyId = w.id;
    }

    this.orders.set(c.id, {
      ...order,
      status: 'entregue',
      delivery: { at: when.at, day: when.day, time: when.time, promisedAt, revenue, partsCost, grossProfit: revenue - partsCost, review, warrantyId },
    });
    this.addHistory(c, when, `Carro entregue (OS #${c.orderNumber}): ${formatBRL(revenue)}, avaliação ${review.stars}★`);
    this.scheduleReturns(c, order.completion!.symptomResolved, review.willReturn, when);
    this.revision++;
    return {
      ok: true,
      message: `${customer.name} pagou ${formatBRL(Math.max(0, remainder))} e deu ${review.stars}★.${review.complaint ? ' ' + review.complaint : ''}`,
      minutes: 0,
      tone: review.stars >= 3 ? 'ok' : 'warn',
    };
  }

  get reputation(): ReputationState {
    return this.rep;
  }

  // --- Save -------------------------------------------------------------------

  /** Foto do estado (cópia profunda): o que vai para o arquivo de save. */
  toSnapshot(): SessionSnapshot {
    return structuredClone({
      caseIds: this.cases.map((c) => c.id),
      caseIndex: this.caseIndex,
      vehicles: [...this.vehicles.values()],
      progress: this.cases.map((c) => this.getProgress(c.id)),
      orders: this.cases.map((c) => ({ caseId: c.id, order: this.getOrder(c.id) })),
      records: this.records,
      lots: this.lots,
      purchases: this.purchaseOrders,
      ledger: this.ledger,
      held: this.held,
      scrap: this.scrapped,
      reputation: this.rep,
      warranties: this.warrantyRecords,
      seq: this.seq,
    });
  }

  /** Acha a definição de uma OS pelo ID: conteúdo do jogo, retornos de cliente ou retorno em garantia. */
  static resolveCase(content: SessionContent, id: string): DiagnosticCaseDef | null {
    const all = [...content.cases, ...content.cases.flatMap((c) => (c.followUp ? [c.followUp] : []))];
    const direct = all.find((c) => c.id === id);
    if (direct) return direct;
    if (id.endsWith(WARRANTY_SUFFIX)) {
      const base = GameSession.resolveCase(content, id.slice(0, -WARRANTY_SUFFIX.length));
      return base ? warrantyReturnCase(base) : null;
    }
    return null;
  }

  /**
   * Recria uma sessão a partir de uma foto vinda de um save. Valida TUDO antes:
   * se algo estiver errado, devolve a lista de problemas e não cria nada.
   */
  static fromSnapshot(
    catalogs: Catalogs,
    content: SessionContent,
    raw: unknown,
  ): { ok: true; session: GameSession } | { ok: false; problems: string[] } {
    const problems = validateSessionSnapshot(raw, catalogs, (id) => GameSession.resolveCase(content, id));
    if (problems.length) return { ok: false, problems };
    const snap = structuredClone(raw as SessionSnapshot);
    const s = new GameSession(catalogs, [], content);
    s.cases.length = 0;
    for (const id of snap.caseIds) s.cases.push(GameSession.resolveCase(content, id)!);
    s.vehicles.clear();
    for (const v of snap.vehicles) s.vehicles.set(v.id, v);
    s.progress.clear();
    for (const p of snap.progress) s.progress.set(p.caseId, p);
    s.orders.clear();
    for (const { caseId, order } of snap.orders) s.orders.set(caseId, order);
    s.records.length = 0;
    s.records.push(...snap.records);
    s.lots = snap.lots;
    s.purchaseOrders = snap.purchases;
    s.ledger = snap.ledger;
    s.cashValue = s.recomputeCash();
    s.held = snap.held;
    s.scrapped.length = 0;
    s.scrapped.push(...snap.scrap);
    s.rep = snap.reputation;
    s.warrantyRecords = snap.warranties;
    s.caseIndex = snap.caseIndex;
    s.seq = snap.seq;
    s.revision = 0;
    return { ok: true, session: s };
  }

  /** Todas as OS registradas (inclui retornos). */
  allOrders(): OrderState[] {
    return this.cases.map((c) => this.getOrder(c.id));
  }

  /** OS entregues, na ordem em que aparecem. */
  deliveredOrders(): Array<{ c: DiagnosticCaseDef; order: OrderState }> {
    return this.cases.map((c) => ({ c, order: this.getOrder(c.id) })).filter((x) => x.order.delivery);
  }

  get warranties(): readonly WarrantyRecord[] {
    return this.warrantyRecords;
  }

  // --- Interno -----------------------------------------------------------------

  /** Retornos: reparo que não resolveu volta em garantia (logo em seguida); cliente satisfeito volta com o próximo problema. */
  private scheduleReturns(c: DiagnosticCaseDef, resolved: boolean, willReturn: boolean, when: GameMoment): void {
    if (!resolved) {
      const ret = warrantyReturnCase(c);
      const claim = evaluateClaim(this.warrantyRecords, { vehicleId: c.vehicle.id, at: when.at, sameComplaintOf: c.id, diagnosedSlot: null });
      this.registerCase(ret, this.caseIndex + 1, c.id, { covered: claim.covered, reason: claim.reason, warrantyId: claim.warranty?.id ?? null });
      if (claim.covered) this.penalize(c.trueCause, `Retorno em garantia da OS #${c.orderNumber}: o defeito não foi resolvido.`, when);
      return;
    }
    if (willReturn && c.followUp && !this.orders.has(c.followUp.id)) this.registerCase(c.followUp, this.cases.length, null);
  }

  private penalize(slot: string, text: string, when: GameMoment): void {
    const system = this.catalogs.slots.get(slot)?.system ?? 'motor';
    this.rep = applyWarrantyPenalty(this.rep, specialtyOf(system), text, when);
  }

  private registerCase(c: DiagnosticCaseDef, index: number, linkedTo: string | null, warranty: OrderState['warranty'] = null): void {
    if (this.orders.has(c.id)) throw new Error(`OS duplicada: "${c.id}"`);
    if (!this.vehicles.has(c.vehicle.id)) this.addVehicle(c.vehicle);
    this.cases.splice(index, 0, c);
    this.progress.set(c.id, { caseId: c.id, vehicleId: c.vehicle.id, evidence: [], hintsShown: [], conclusion: null });
    this.orders.set(c.id, {
      status: 'diagnostico',
      draft: { extras: [], ...this.need().defaultDraft },
      proposals: [],
      counters: 0,
      approved: null,
      repair: null,
      completion: null,
      closedReason: null,
      approvedAt: null,
      depositPaid: 0,
      delivery: null,
      warranty,
      linkedTo,
    });
  }

  private approve(c: DiagnosticCaseDef, order: OrderState, breakdown: QuoteBreakdown, when: GameMoment, historyText: string): void {
    // O sinal (se houver) entra no caixa na aprovação; o resto, na entrega.
    if (breakdown.deposit > 0) this.record('receita', 'sinal', breakdown.deposit, `Sinal da OS #${c.orderNumber} (${c.customerName})`, `OS #${c.orderNumber}`, when);
    this.orders.set(c.id, { ...order, status: 'aprovada', approved: breakdown, repair: startRepair(breakdown), approvedAt: when.at, depositPaid: breakdown.deposit });
    this.addHistory(c, when, historyText);
  }

  /** OS coberta por garantia: aprovada sem custo para o cliente (peças e mão de obra por conta da oficina). */
  private approveUnderWarranty(c: DiagnosticCaseDef, when: GameMoment): void {
    const full = this.previewQuote(c.id);
    if (!full || !full.ok) return;
    const free = this.previewQuote(c.id, full.value.total, 'Coberto pela garantia');
    if (!free || !free.ok) return;
    const order = this.getOrder(c.id);
    const breakdown = { ...free.value, deposit: 0 };
    this.orders.set(c.id, { ...order, status: 'aprovada', approved: breakdown, repair: startRepair(breakdown), approvedAt: when.at, depositPaid: 0 });
    this.addHistory(c, when, `OS #${c.orderNumber} coberta pela garantia: sem custo para o cliente`);
  }

  private repairJob(): { ok: true; c: DiagnosticCaseDef; order: OrderState } | { ok: false; message: string } {
    const c = this.activeCase;
    if (!c) return { ok: false, message: 'Nenhuma ordem de serviço ativa.' };
    const order = this.getOrder(c.id);
    if (order.status !== 'aprovada' && order.status !== 'em-reparo') {
      return {
        ok: false,
        message: order.status === 'concluida' || order.status === 'entregue' ? 'Esta OS já foi concluída.' : 'O reparo só começa depois que o cliente aprova o orçamento.',
      };
    }
    return { ok: true, c, order };
  }

  private repairSuccess(caseId: string, repair: RepairState, message: string, minutes: number, when: GameMoment): ActionOutcome {
    const order = this.getOrder(caseId);
    this.orders.set(caseId, { ...order, status: 'em-reparo', repair: { ...repair, log: [...repair.log, { kind: 'ok', text: message, day: when.day, time: when.time }] } });
    this.revision++;
    return { ok: true, message, minutes };
  }

  private repairFailure(caseId: string, error: RepairError, when: GameMoment): ActionOutcome {
    const order = this.getOrder(caseId);
    if (error.countsAgainstQuality && order.repair) {
      const r = order.repair;
      this.orders.set(caseId, {
        ...order,
        repair: { ...r, invalidAttempts: r.invalidAttempts + 1, log: [...r.log, { kind: 'erro', text: error.message, day: when.day, time: when.time }] },
      });
      this.revision++;
    }
    return { ok: false, message: error.message, minutes: 0 };
  }

  private record(kind: Transaction['kind'], category: TransactionCategory, amount: Cents, description: string, ref: string, when: GameMoment): void {
    const id = `T${String(++this.seq.tx).padStart(4, '0')}`;
    this.ledger = [...this.ledger, { id, kind, category, amount, description, ref, day: when.day, time: when.time, at: when.at }];
    this.cashValue += kind === 'receita' ? amount : -amount;
  }

  private addLot(partId: string, qty: number, unitCost: Cents, source: string): void {
    const same = this.lots.find((l) => l.partId === partId && l.unitCost === unitCost && l.source === source);
    if (same) {
      this.lots = this.lots.map((l) => (l === same ? { ...l, qty: l.qty + qty } : l));
      return;
    }
    this.lots = [...this.lots, { lotId: `L${++this.seq.lot}`, partId, qty, unitCost, source }];
  }

  private setStatus(caseId: string, status: OrderStatus): void {
    const order = this.getOrder(caseId);
    if (!canTransitionOrder(order.status, status)) throw new Error(`Transição de OS inválida: ${order.status} → ${status}`);
    this.orders.set(caseId, { ...order, status });
  }

  private addHistory(c: DiagnosticCaseDef, when: GameMoment, text: string): void {
    const v = this.getVehicle(c.vehicle.id);
    const entry: HistoryEntry = { kind: 'manutencao', atKm: v.mileageKm, day: when.day, text, disclosed: true };
    this.vehicles.set(v.id, { ...v, history: [...v.history, entry] });
  }

  private partName(partId: string): string {
    return this.catalogs.parts.get(partId)?.name ?? partId;
  }

  private findCase(caseId: string): DiagnosticCaseDef {
    const c = this.cases.find((x) => x.id === caseId);
    if (!c) throw new Error(`Caso não encontrado: "${caseId}"`);
    return c;
  }

  private need(): SessionContent {
    if (!this.content) throw new Error('Sessão sem conteúdo de jogo.');
    return this.content;
  }

  private fail(message: string): ActionOutcome {
    return { ok: false, message, minutes: 0 };
  }

  private validateContent(content: SessionContent, followUps: readonly DiagnosticCaseDef[]): void {
    const p: string[] = [];
    for (const c of [...content.cases, ...followUps]) if (!this.customers.has(c.customerId)) p.push(`caso "${c.id}": cliente desconhecido "${c.customerId}"`);
    for (const s of content.initialStock) {
      if (!this.catalogs.parts.has(s.partId)) p.push(`estoque: peça desconhecida "${s.partId}"`);
      if (!Number.isInteger(s.qty) || s.qty <= 0) p.push(`estoque: quantidade inválida para "${s.partId}"`);
    }
    for (const c of content.customers) {
      if (!Number.isSafeInteger(c.maxBudget) || c.maxBudget <= 0) p.push(`cliente "${c.id}": orçamento máximo inválido`);
      if (!(c.counterRatio >= 1)) p.push(`cliente "${c.id}": counterRatio deve ser >= 1`);
      if (!Number.isInteger(c.patience) || c.patience < 0) p.push(`cliente "${c.id}": paciência inválida`);
      if (!(c.maxDeadlineHours > 0)) p.push(`cliente "${c.id}": prazo máximo inválido`);
    }
    for (const s of content.suppliers) {
      if (!(s.priceFactor > 0)) p.push(`fornecedor "${s.id}": fator de preço inválido`);
      if (!Number.isInteger(s.deliveryMinutes) || s.deliveryMinutes < 0) p.push(`fornecedor "${s.id}": prazo inválido`);
    }
    if (content.suppliers.length === 0) p.push('nenhum fornecedor');
    const e = content.economy;
    if (!Number.isSafeInteger(e.startingCash) || !Number.isSafeInteger(e.creditLimit) || e.creditLimit < 0) p.push('economia: caixa inicial e crédito devem ser centavos (crédito >= 0)');
    const d = content.defaultDraft;
    const r = content.pricing;
    if (!r.markupOptions.includes(d.markupPct) || !r.discountOptions.includes(d.discountPct) || !r.warrantyOptions.includes(d.warrantyDays)) {
      p.push('orçamento padrão usa valores fora das opções de preço');
    }
    if (p.length) throw new DataValidationError('conteúdo da sessão', p);
  }

  private addVehicle(spec: VehicleSpec): void {
    if (this.vehicles.has(spec.id)) throw new Error(`Carro duplicado na sessão: "${spec.id}"`);
    this.vehicles.set(spec.id, createVehicleState(spec, this.catalogs, `carro "${spec.id}"`));
  }
}
