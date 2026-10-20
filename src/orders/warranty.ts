/**
 * Garantia (GDD §14.4, Prompt 8): registra validade e serviços cobertos.
 * Uma falha só é coberta (e só penaliza a oficina) se estiver RELACIONADA ao
 * serviço: mesma queixa que o reparo deveria ter resolvido, ou peça trocada no serviço.
 */
export const MINUTES_PER_DAY = 24 * 60;

export interface WarrantyRecord {
  id: string;
  caseId: string;
  orderNumber: string;
  vehicleId: string;
  /** Posições trocadas no serviço. */
  coveredSlots: readonly string[];
  /** A queixa que o serviço resolveu (o que a garantia promete). */
  coveredComplaint: string;
  days: number;
  startAt: number;
  expiresAt: number;
  startDay: number;
}

export function createWarranty(
  seq: number,
  data: Omit<WarrantyRecord, 'id' | 'expiresAt'>,
): WarrantyRecord {
  return { ...data, id: `GAR-${String(seq).padStart(3, '0')}`, expiresAt: data.startAt + data.days * MINUTES_PER_DAY };
}

export interface ClaimInput {
  vehicleId: string;
  at: number;
  /** A OS nova é retorno da mesma queixa (reparo não resolveu). */
  sameComplaintOf: string | null;
  /** Peça que o mecânico apontou como causa do novo problema. */
  diagnosedSlot: string | null;
}

export type ClaimResult =
  | { covered: true; warranty: WarrantyRecord; reason: string }
  | { covered: false; warranty: WarrantyRecord | null; reason: string };

export function evaluateClaim(warranties: readonly WarrantyRecord[], claim: ClaimInput): ClaimResult {
  const active = warranties.filter((w) => w.vehicleId === claim.vehicleId && claim.at <= w.expiresAt);
  if (active.length === 0) {
    const expired = warranties.find((w) => w.vehicleId === claim.vehicleId) ?? null;
    return { covered: false, warranty: expired, reason: expired ? `Garantia ${expired.id} vencida.` : 'Carro sem garantia ativa nesta oficina.' };
  }
  for (const w of active) {
    if (claim.sameComplaintOf === w.caseId) {
      return { covered: true, warranty: w, reason: `Coberto pela garantia ${w.id}: o defeito da OS #${w.orderNumber} não foi resolvido.` };
    }
    if (claim.diagnosedSlot && w.coveredSlots.includes(claim.diagnosedSlot)) {
      return { covered: true, warranty: w, reason: `Coberto pela garantia ${w.id}: a peça trocada na OS #${w.orderNumber} falhou.` };
    }
  }
  const w = active[0]!;
  return { covered: false, warranty: w, reason: `Fora da garantia ${w.id}: o defeito não tem relação com o serviço da OS #${w.orderNumber}. Cobrança normal.` };
}
