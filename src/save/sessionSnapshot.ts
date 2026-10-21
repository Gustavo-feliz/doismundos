import type { ReputationState } from '../customers/reputation';
import { GAME_EVENTS } from '../data/events';
import { STAFF_CANDIDATES } from '../data/staff';
import type { CaseProgress, DiagnosisRecord, DiagnosticCaseDef } from '../diagnostics/types';
import { debtProblems, type DebtState } from '../economy/debt';
import { eventStateProblems } from '../events/rules';
import type { EventState, GameEventDef } from '../events/types';
import { upgradeLevelsProblems, type UpgradeDef } from '../upgrades/rules';
import { CATEGORY_LABEL, type Transaction } from '../economy/ledger';
import type { HeldPart, PurchaseOrder, StockLot } from '../inventory/types';
import { ORDER_STATUS_LABEL, type OrderState } from '../orders/types';
import type { WarrantyRecord } from '../orders/warranty';
import { staffStateProblems } from '../staff/rules';
import type { StaffCandidateDef, StaffState } from '../staff/types';
import type { Catalogs } from '../vehicles/catalogs';
import { findVehicleStateProblems, type VehicleState } from '../vehicles/state';

/**
 * Foto do estado da sessão (o que vai para o save). Só dados puros (JSON).
 * OS são guardadas pelo ID: a definição vem do conteúdo do jogo (ou é
 * recriada, no caso de retornos em garantia), nunca do arquivo de save.
 */
export interface SessionSnapshot {
  caseIds: string[];
  caseIndex: number;
  vehicles: VehicleState[];
  progress: CaseProgress[];
  orders: Array<{ caseId: string; order: OrderState }>;
  records: DiagnosisRecord[];
  lots: StockLot[];
  purchases: PurchaseOrder[];
  ledger: Transaction[];
  held: HeldPart | null;
  scrap: string[];
  reputation: ReputationState;
  warranties: WarrantyRecord[];
  seq: { lot: number; purchase: number; tx: number; warranty: number };
  /** Dívida bancária (desde o save versão 2). */
  debt: DebtState;
  /** Nível de cada ferramenta/upgrade comprado (desde o save versão 3). */
  upgrades: Record<string, number>;
  /** Semente das OS geradas (desde o save versão 4). */
  seed: number;
  /** Funcionários e fila de tarefas da oficina (desde o save versão 5). */
  staff: StaffState;
  /** Eventos, fiscalização e histórico de decisões (desde o save versão 5). */
  events: EventState;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);
const isCents = (v: unknown): v is number => isInt(v) && (v as number) >= 0;
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const STATUSES = new Set(Object.keys(ORDER_STATUS_LABEL));
const CATEGORIES = new Set(Object.keys(CATEGORY_LABEL));
const PURCHASE_STATUS = new Set(['a-caminho', 'recebido', 'cancelado']);

/**
 * Confere uma foto vinda de fora (save). Lista vazia = válida.
 * Checa forma, valores e referências cruzadas (peças, OS, carros).
 */
export function validateSessionSnapshot(
  raw: unknown,
  catalogs: Catalogs,
  resolveCase: (id: string) => DiagnosticCaseDef | null,
  upgrades: readonly UpgradeDef[] = [],
  staffCandidates: readonly StaffCandidateDef[] = STAFF_CANDIDATES,
  gameEvents: readonly GameEventDef[] = GAME_EVENTS,
): string[] {
  const p: string[] = [];
  if (!isObj(raw)) return ['estado da sessão ausente'];
  const s = raw as Partial<SessionSnapshot>;
  const arrays = ['caseIds', 'vehicles', 'progress', 'orders', 'records', 'lots', 'purchases', 'ledger', 'scrap', 'warranties'] as const;
  for (const key of arrays) if (!Array.isArray(s[key])) p.push(`campo "${key}" ausente ou inválido`);
  if (p.length) return p;

  // OS
  const caseIds = s.caseIds!;
  if (caseIds.length === 0) p.push('nenhuma ordem de serviço');
  if (new Set(caseIds).size !== caseIds.length) p.push('OS repetida');
  const cases = new Map<string, DiagnosticCaseDef>();
  for (const id of caseIds) {
    const c = isStr(id) ? resolveCase(id) : null;
    if (!c) p.push(`OS desconhecida: "${String(id)}"`);
    else cases.set(id, c);
  }
  if (!isInt(s.caseIndex) || s.caseIndex! < 0 || s.caseIndex! >= caseIds.length) p.push('OS ativa fora da lista');

  // Carros
  const vehicleIds = new Set<string>();
  for (const v of s.vehicles!) {
    if (!isObj(v) || !isStr((v as Partial<VehicleState>).id)) {
      p.push('carro sem id');
      continue;
    }
    const vs = v as unknown as VehicleState;
    if (!isObj(vs.parts) || !isObj(vs.knowledge) || !Array.isArray(vs.history)) {
      p.push(`carro "${vs.id}": estrutura incompleta`);
      continue;
    }
    vehicleIds.add(vs.id);
    p.push(...findVehicleStateProblems(vs, catalogs));
  }
  for (const c of cases.values()) if (!vehicleIds.has(c.vehicle.id)) p.push(`OS "${c.id}": carro "${c.vehicle.id}" ausente`);

  // Progresso e OS: uma de cada por caso
  const progressIds = new Set(s.progress!.map((x) => (isObj(x) ? x.caseId : null)));
  const orderIds = new Set(s.orders!.map((x) => (isObj(x) ? x.caseId : null)));
  for (const id of caseIds) {
    if (!progressIds.has(id)) p.push(`OS "${id}": progresso do diagnóstico ausente`);
    if (!orderIds.has(id)) p.push(`OS "${id}": dados da ordem ausentes`);
  }
  for (const entry of s.orders!) {
    const o = isObj(entry) ? (entry.order as Partial<OrderState> | undefined) : undefined;
    if (!o || !isObj(o)) {
      p.push('ordem de serviço inválida');
      continue;
    }
    if (!STATUSES.has(String(o.status))) p.push(`OS "${String(entry.caseId)}": status desconhecido "${String(o.status)}"`);
    if (!isObj(o.draft) || !Array.isArray(o.proposals) || !isInt(o.counters) || !isCents(o.depositPaid)) p.push(`OS "${String(entry.caseId)}": campos obrigatórios inválidos`);
    if ((o.status === 'aprovada' || o.status === 'em-reparo' || o.status === 'concluida' || o.status === 'entregue') && (!o.approved || !o.repair)) {
      p.push(`OS "${String(entry.caseId)}": aprovada sem orçamento ou reparo`);
    }
    if (o.approved && !isCents(o.approved.total)) p.push(`OS "${String(entry.caseId)}": total do orçamento inválido`);
  }

  // Estoque, pedidos e caixa
  for (const l of s.lots!) {
    if (!isObj(l) || !catalogs.parts.has(String(l.partId)) || !isInt(l.qty) || (l.qty as number) <= 0 || !isCents(l.unitCost) || !isStr(l.lotId)) {
      p.push(`lote de estoque inválido: ${JSON.stringify(l).slice(0, 80)}`);
    }
  }
  for (const o of s.purchases!) {
    if (!isObj(o) || !catalogs.parts.has(String(o.partId)) || !PURCHASE_STATUS.has(String(o.status)) || !isCents(o.total) || !isInt(o.qty) || !isInt(o.etaAt)) {
      p.push(`pedido de compra inválido: ${isObj(o) ? String(o.id) : '?'}`);
    }
  }
  for (const t of s.ledger!) {
    if (!isObj(t) || !isStr(t.id) || (t.kind !== 'receita' && t.kind !== 'despesa') || !CATEGORIES.has(String(t.category)) || !isCents(t.amount)) {
      p.push(`transação inválida: ${isObj(t) ? String(t.id) : '?'}`);
    }
  }
  if (s.held !== null && (!isObj(s.held) || !catalogs.parts.has(String(s.held.partId)) || !isCents(s.held.unitCost))) p.push('peça em mãos inválida');
  for (const id of s.scrap!) if (!catalogs.parts.has(String(id))) p.push(`sucata com peça desconhecida "${String(id)}"`);

  // Reputação e garantias
  const rep = s.reputation;
  const scoreOk = (x: unknown) => isObj(x) && typeof x.score === 'number' && x.score >= 0 && x.score <= 100 && isInt(x.reviews) && x.reviews >= 0;
  if (!isObj(rep) || !scoreOk(rep.general) || !isObj(rep.bySpecialty) || !Object.values(rep.bySpecialty).every(scoreOk) || !Array.isArray(rep.events)) {
    p.push('reputação inválida');
  }
  for (const w of s.warranties!) {
    if (!isObj(w) || !isStr(w.id) || !vehicleIds.has(String(w.vehicleId)) || !isInt(w.expiresAt) || !Array.isArray(w.coveredSlots)) p.push(`garantia inválida: ${isObj(w) ? String(w.id) : '?'}`);
  }
  const seq: unknown = s.seq;
  if (!isObj(seq) || !['lot', 'purchase', 'tx', 'warranty'].every((k) => isInt(seq[k]) && (seq[k] as number) >= 0)) p.push('contadores internos inválidos');
  p.push(...debtProblems(s.debt));
  p.push(...upgradeLevelsProblems(s.upgrades, upgrades));
  if (!isInt(s.seed) || s.seed! < 0 || s.seed! > 0xffffffff) p.push('semente inválida');
  p.push(...staffStateProblems(s.staff, staffCandidates));
  p.push(...eventStateProblems(s.events, gameEvents));
  return p;
}
