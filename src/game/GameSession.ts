import { decideOnQuote, counterIsPriceOnly } from '../customers/decision';
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
import { formatBRL } from '../economy/money';
import { computeQuote, type PricingRules, type QuoteInput, type QuoteResult } from '../economy/quote';
import { canTransitionOrder, isOrderClosed, type OrderState, type OrderStatus, type QuoteDraft } from '../orders/types';
import { computeQuality, installHeldPart, pendingTasks, removeOldPart, runFinalTest, startRepair, type RepairError } from '../repairs/rules';
import type { Catalogs } from '../vehicles/catalogs';
import { compatiblePartsFor, revealPartCondition, type DomainResult } from '../vehicles/domain';
import { createVehicleState, type VehicleSpec } from '../vehicles/factory';
import type { HistoryEntry, VehicleState } from '../vehicles/state';
import { DataValidationError } from '../vehicles/types';

/** Momento do jogo, para registrar evidências, propostas e reparos. */
export interface GameMoment {
  day: number;
  time: string;
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

/** Conteúdo do jogo usado pela sessão (OS, exames, clientes, preços, estoque inicial). */
export interface SessionContent {
  cases: readonly DiagnosticCaseDef[];
  diagnostics: DiagnosticData;
  customers: readonly CustomerProfile[];
  pricing: PricingRules;
  initialStock: ReadonlyArray<{ partId: string; qty: number }>;
  defaultDraft: Omit<QuoteDraft, 'extras'>;
}

export interface StockEntry {
  partId: string;
  qty: number;
  /** Número da OS para a qual a peça foi comprada (null = estoque da oficina). */
  orderNumber: string | null;
}

const KNOWN_BAD = new Set(['gasta', 'critica', 'falhou']);

/**
 * Estado de jogo da sessão (em memória): carros, ordens de serviço, estoque.
 * Fica fora da cena: fechar o painel, pausar ou voltar ao jogo não perde nada.
 * "Iniciar jogo" no menu cria uma sessão nova. Save em disco: Prompt 9.
 */
export class GameSession {
  private readonly vehicles = new Map<string, VehicleState>();
  private readonly cases: readonly DiagnosticCaseDef[];
  private readonly progress = new Map<string, CaseProgress>();
  private readonly orders = new Map<string, OrderState>();
  private readonly customers = new Map<string, CustomerProfile>();
  private readonly records: DiagnosisRecord[] = [];
  private stockEntries: StockEntry[] = [];
  private held: { partId: string; orderNumber: string | null } | null = null;
  private readonly scrapped: string[] = [];
  private caseIndex = 0;
  private revision = 0;

  constructor(
    readonly catalogs: Catalogs,
    specs: readonly VehicleSpec[],
    private readonly content: SessionContent | null = null,
  ) {
    for (const spec of specs) this.addVehicle(spec);
    const cases = content?.cases ?? [];
    if (content) {
      validateDiagnosticData(cases, content.diagnostics, catalogs);
      for (const c of content.customers) this.customers.set(c.id, c);
      this.validateContent(content);
      this.stockEntries = content.initialStock.map((s) => ({ partId: s.partId, qty: s.qty, orderNumber: null }));
    }
    for (const c of cases) {
      if (!this.vehicles.has(c.vehicle.id)) this.addVehicle(c.vehicle);
      this.progress.set(c.id, { caseId: c.id, vehicleId: c.vehicle.id, evidence: [], hintsShown: [], conclusion: null });
      this.orders.set(c.id, {
        status: 'diagnostico',
        draft: { extras: [], ...content!.defaultDraft },
        proposals: [],
        counters: 0,
        approved: null,
        repair: null,
        completion: null,
        closedReason: null,
      });
    }
    this.cases = cases;
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

  /** Regras de preço em uso (opções de margem, desconto e garantia). */
  get pricingRules(): PricingRules {
    if (!this.content) throw new Error('Sessão sem conteúdo de jogo.');
    return this.content.pricing;
  }

  /** Passa para a próxima OS, se a atual estiver encerrada (concluída ou recusada). */
  advanceCase(): boolean {
    const c = this.activeCase;
    if (!c || !isOrderClosed(this.getOrder(c.id).status) || this.caseIndex >= this.cases.length - 1) return false;
    this.caseIndex++;
    this.revision++;
    return true;
  }

  // --- Diagnóstico ----------------------------------------------------------

  /** Faz um exame na OS ativa: valida, calcula o resultado e registra a evidência. */
  runDiagnosticTest(testId: string, ctx: EquipmentContext, when: GameMoment): DiagnosisResult<EvidenceEntry> {
    const c = this.activeCase;
    if (!c) return { ok: false, error: { code: 'exame-inexistente', message: 'Nenhuma ordem de serviço ativa.' } };
    const progress = this.getProgress(c.id);
    if (progress.conclusion) return { ok: false, error: { code: 'ja-concluido', message: 'Este diagnóstico já foi registrado.' } };
    const data = this.content!.diagnostics;
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
    // Inspeção visual que avaliou a peça: agora o jogador sabe o estado dela.
    if (outcome.value.revealSlot) {
      const revealed = revealPartCondition(vehicle, outcome.value.revealSlot, 'inspecao', this.catalogs);
      if (revealed.ok) this.vehicles.set(vehicle.id, revealed.value);
    }
    this.revision++;
    return { ok: true, value: entry };
  }

  /** Mostra a próxima dica útil (assistência). Retorna null se não houver. */
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

  /** Registra o diagnóstico da OS ativa (certo ou errado: o reparo dirá) e abre o orçamento. */
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
    this.revision++;
    return result;
  }

  // --- Orçamento e negociação ------------------------------------------------

  /** Serviços extras que a oficina pode sugerir: peças que o jogador SABE que estão ruins. */
  eligibleExtras(caseId: string): string[] {
    const c = this.findCase(caseId);
    const chosen = this.getProgress(caseId).conclusion?.chosenSlot;
    const v = this.getVehicle(c.vehicle.id);
    return Object.entries(v.knowledge)
      .filter(([slot, k]) => slot !== chosen && k.status === 'avaliado' && KNOWN_BAD.has(k.band) && compatiblePartsFor(v, slot, this.catalogs).length > 0)
      .map(([slot]) => slot);
  }

  /** Monta a entrada da fórmula a partir do rascunho. */
  quoteInput(caseId: string, negotiatedDiscount = 0): QuoteInput | null {
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
    };
  }

  /** Orçamento calculado pela fórmula central (o mesmo que a UI mostra). */
  previewQuote(caseId: string, negotiatedDiscount = 0): QuoteResult | null {
    const input = this.quoteInput(caseId, negotiatedDiscount);
    if (!input) return null;
    const c = this.findCase(caseId);
    const category = this.catalogs.models.get(c.vehicle.modelId)!.category;
    return computeQuote(input, { catalogs: this.catalogs, category, rules: this.content!.pricing });
  }

  /** Altera o rascunho (só valores permitidos pelas regras de preço). */
  updateDraft(caseId: string, patch: Partial<QuoteDraft>): ActionOutcome {
    const order = this.getOrder(caseId);
    if (order.status !== 'orcamento' && order.status !== 'contraproposta') return this.fail('O orçamento não pode mais ser alterado.');
    const rules = this.content!.pricing;
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

  /** Envia o orçamento ao cliente, que decide por regra. */
  sendQuote(when: GameMoment): ActionOutcome {
    const c = this.activeCase;
    if (!c) return this.fail('Nenhuma ordem de serviço ativa.');
    const order = this.getOrder(c.id);
    if (order.status !== 'orcamento' && order.status !== 'contraproposta') return this.fail('Não há orçamento a enviar nesta etapa.');
    const quote = this.previewQuote(c.id);
    if (!quote || !quote.ok) return this.fail(quote && !quote.ok ? quote.error.message : 'Orçamento inválido.');
    const customer = this.getCustomer(c.customerId);
    const decision = decideOnQuote(quote.value, customer, order.counters);
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

  /** Aceita a contraproposta de preço: vira "desconto negociado", na mesma fórmula. */
  acceptCounter(when: GameMoment): ActionOutcome {
    const c = this.activeCase;
    if (!c) return this.fail('Nenhuma ordem de serviço ativa.');
    const order = this.getOrder(c.id);
    const last = order.proposals.at(-1);
    if (order.status !== 'contraproposta' || !last || !counterIsPriceOnly(last.decision) || last.decision.kind !== 'contraproposta') {
      return this.fail('Só dá para aceitar direto uma contraproposta de preço. Ajuste o orçamento e reenvie.');
    }
    const negotiated = last.breakdown.total - last.decision.targetTotal!;
    const quote = this.previewQuote(c.id, Math.max(0, negotiated));
    if (!quote || !quote.ok) return this.fail('O orçamento mudou desde a contraproposta. Reenvie ao cliente.');
    if (quote.value.total !== last.decision.targetTotal) return this.fail('O orçamento mudou desde a contraproposta. Reenvie ao cliente.');
    const customer = this.getCustomer(c.customerId);
    const message = `${customer.name}: “Combinado, ${formatBRL(quote.value.total)}. Pode fazer.”`;
    const proposals = [
      ...order.proposals,
      { round: order.proposals.length + 1, breakdown: quote.value, decision: { kind: 'aceita' as const, message }, day: when.day, time: when.time },
    ];
    this.approve(c, { ...order, proposals }, quote.value, when, `Acordo fechado: ${formatBRL(quote.value.total)}`);
    this.revision++;
    return { ok: true, message, minutes: 0 };
  }

  /** A oficina desiste da OS (o cliente leva o carro). */
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

  // --- Estoque ---------------------------------------------------------------

  get stock(): readonly StockEntry[] {
    return this.stockEntries;
  }

  get heldPartId(): string | null {
    return this.held?.partId ?? null;
  }

  get scrap(): readonly string[] {
    return this.scrapped;
  }

  takePart(partId: string, orderNumber: string | null): ActionOutcome {
    if (this.held) return this.fail('Suas mãos estão ocupadas. Devolva a peça que está segurando.');
    const entry = this.stockEntries.find((e) => e.partId === partId && e.orderNumber === orderNumber && e.qty > 0);
    if (!entry) return this.fail('Essa peça não está no estoque.');
    this.stockEntries = this.stockEntries.map((e) => (e === entry ? { ...e, qty: e.qty - 1 } : e)).filter((e) => e.qty > 0);
    this.held = { partId, orderNumber };
    this.revision++;
    return { ok: true, message: `Em mãos: ${this.partName(partId)}`, minutes: 0 };
  }

  returnHeldPart(): ActionOutcome {
    if (!this.held) return this.fail('Você não está segurando nenhuma peça.');
    this.addStock(this.held.partId, this.held.orderNumber, 1);
    const name = this.partName(this.held.partId);
    this.held = null;
    this.revision++;
    return { ok: true, message: `${name} devolvida ao estoque.`, minutes: 0 };
  }

  // --- Reparo ------------------------------------------------------------------

  removeOldPart(slot: string, ctx: EquipmentContext, when: GameMoment): ActionOutcome {
    const job = this.repairJob();
    if (!job.ok) return this.fail(job.message);
    const { c, order } = job;
    const result = removeOldPart(order.repair!, this.getVehicle(c.vehicle.id), slot, ctx, this.catalogs);
    if (!result.ok) return this.repairFailure(c.id, result.error, when);
    this.vehicles.set(c.vehicle.id, result.value.vehicle);
    this.scrapped.push(result.value.removedPartId);
    return this.repairSuccess(c.id, result.value.repair, result.value.message, result.value.minutes, when);
  }

  installHeldPart(slot: string, ctx: EquipmentContext, when: GameMoment): ActionOutcome {
    const job = this.repairJob();
    if (!job.ok) return this.fail(job.message);
    const { c, order } = job;
    const result = installHeldPart(order.repair!, this.getVehicle(c.vehicle.id), slot, this.heldPartId, ctx, this.catalogs);
    if (!result.ok) return this.repairFailure(c.id, result.error, when);
    this.vehicles.set(c.vehicle.id, result.value.vehicle);
    this.held = null;
    return this.repairSuccess(c.id, result.value.repair, result.value.message, result.value.minutes, when);
  }

  runFinalTest(ctx: EquipmentContext, when: GameMoment): ActionOutcome {
    const job = this.repairJob();
    if (!job.ok) return this.fail(job.message);
    const { c, order } = job;
    const result = runFinalTest(order.repair!, ctx, c.trueCause, c.finalTest);
    if (!result.ok) return this.repairFailure(c.id, result.error, when);
    return this.repairSuccess(c.id, result.value.repair, result.value.message, result.value.minutes, when);
  }

  /** Conclui a OS: só com todos os itens resolvidos e o teste final feito. */
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
      completion: {
        qualityScore: quality.score,
        qualityLabel: quality.label,
        symptomResolved: quality.resolved,
        repairMinutes: order.repair!.minutes,
        day: when.day,
        time: when.time,
      },
    });
    this.addHistory(c, when, `Serviço concluído (OS #${c.orderNumber})${quality.resolved ? '' : ': defeito não resolvido'}`);
    this.revision++;
    return { ok: true, message: quality.resolved ? 'Serviço concluído! Carro pronto para entrega.' : 'Serviço concluído, mas o defeito continua: o cliente vai voltar.', minutes: 0 };
  }

  // --- Interno -----------------------------------------------------------------

  private approve(c: DiagnosticCaseDef, order: OrderState, breakdown: OrderState['approved'] & object, when: GameMoment, historyText: string): void {
    // Entrega imediata do fornecedor (protótipo): as peças orçadas chegam ao estoque.
    for (const item of breakdown.input.items) this.addStock(item.partId, c.orderNumber, 1);
    this.orders.set(c.id, { ...order, status: 'aprovada', approved: breakdown, repair: startRepair(breakdown) });
    this.addHistory(c, when, historyText);
  }

  private repairJob(): { ok: true; c: DiagnosticCaseDef; order: OrderState } | { ok: false; message: string } {
    const c = this.activeCase;
    if (!c) return { ok: false, message: 'Nenhuma ordem de serviço ativa.' };
    const order = this.getOrder(c.id);
    if (order.status !== 'aprovada' && order.status !== 'em-reparo') {
      return { ok: false, message: order.status === 'concluida' ? 'Esta OS já foi concluída.' : 'O reparo só começa depois que o cliente aprova o orçamento.' };
    }
    return { ok: true, c, order };
  }

  private repairSuccess(caseId: string, repair: NonNullable<OrderState['repair']>, message: string, minutes: number, when: GameMoment): ActionOutcome {
    const order = this.getOrder(caseId);
    const log = [...repair.log, { kind: 'ok' as const, text: message, day: when.day, time: when.time }];
    this.orders.set(caseId, { ...order, status: 'em-reparo', repair: { ...repair, log } });
    this.revision++;
    return { ok: true, message, minutes };
  }

  private repairFailure(caseId: string, error: RepairError, when: GameMoment): ActionOutcome {
    const order = this.getOrder(caseId);
    if (error.countsAgainstQuality && order.repair) {
      const repair = order.repair;
      this.orders.set(caseId, {
        ...order,
        repair: { ...repair, invalidAttempts: repair.invalidAttempts + 1, log: [...repair.log, { kind: 'erro', text: error.message, day: when.day, time: when.time }] },
      });
      this.revision++;
    }
    return { ok: false, message: error.message, minutes: 0 };
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

  private addStock(partId: string, orderNumber: string | null, qty: number): void {
    const existing = this.stockEntries.find((e) => e.partId === partId && e.orderNumber === orderNumber);
    this.stockEntries = existing
      ? this.stockEntries.map((e) => (e === existing ? { ...e, qty: e.qty + qty } : e))
      : [...this.stockEntries, { partId, orderNumber, qty }];
  }

  private partName(partId: string): string {
    return this.catalogs.parts.get(partId)?.name ?? partId;
  }

  private findCase(caseId: string): DiagnosticCaseDef {
    const c = this.cases.find((x) => x.id === caseId);
    if (!c) throw new Error(`Caso não encontrado: "${caseId}"`);
    return c;
  }

  private fail(message: string): ActionOutcome {
    return { ok: false, message, minutes: 0 };
  }

  private validateContent(content: SessionContent): void {
    const p: string[] = [];
    for (const c of content.cases) if (!this.customers.has(c.customerId)) p.push(`caso "${c.id}": cliente desconhecido "${c.customerId}"`);
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
