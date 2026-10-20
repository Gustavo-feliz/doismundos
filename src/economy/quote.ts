import type { PartQuality } from '../parts/types';
import type { Catalogs } from '../vehicles/catalogs';
import type { VehicleCategory } from '../vehicles/types';
import type { Cents } from './money';

/**
 * Fórmula de orçamento CENTRALIZADA (GDD §14.2 e Prompt 5). Única fonte dos
 * valores mostrados na interface. Cada multiplicador é aplicado uma vez só:
 *
 *   peças       = Σ arredonda(custo-base × (1 + margem))
 *   mão de obra = arredonda(horas × valor/hora × ajuste da categoria)
 *   urgência    = arredonda(mão de obra × taxa de urgência)        (só se urgente)
 *   taxas       = taxa de descarte × itens
 *   desconto    = arredonda((peças + mão de obra + urgência) × desconto%)   (taxas não têm desconto)
 *   total       = peças + mão de obra + urgência + taxas − desconto − desconto negociado
 */
export interface PricingRules {
  hourlyRate: Cents;
  laborBlockMinutes: number;
  categoryLaborMultiplier: Readonly<Record<VehicleCategory, number>>;
  urgencyRate: number;
  disposalFeePerItem: Cents;
  queueHours: number;
  urgentQueueHours: number;
  markupOptions: readonly number[];
  discountOptions: readonly number[];
  warrantyOptions: readonly number[];
  depositThreshold: Cents;
  depositRate: number;
}

export interface QuoteItemInput {
  slot: string;
  partId: string;
  /** Item do diagnóstico (obrigatório) ou serviço extra sugerido. */
  mandatory: boolean;
}

export interface QuoteInput {
  items: readonly QuoteItemInput[];
  markupPct: number;
  discountPct: number;
  urgent: boolean;
  warrantyDays: number;
  /** Desconto em reais combinado numa contraproposta (opcional). */
  negotiatedDiscount?: Cents;
  /** Rótulo da linha do desconto negociado (ex.: "Coberto pela garantia"). */
  negotiatedLabel?: string;
}

export type QuoteLineKind = 'peca' | 'mao-de-obra' | 'urgencia' | 'taxa' | 'desconto';

export interface QuoteLine {
  kind: QuoteLineKind;
  label: string;
  detail: string;
  /** Desconto vem negativo. */
  amount: Cents;
}

export interface QuoteBreakdown {
  input: QuoteInput;
  lines: QuoteLine[];
  partsSubtotal: Cents;
  laborMinutes: number;
  laborHours: number;
  categoryMultiplier: number;
  laborSubtotal: Cents;
  urgencyFee: Cents;
  fees: Cents;
  discount: Cents;
  negotiatedDiscount: Cents;
  total: Cents;
  deadlineHours: number;
  warrantyDays: number;
  deposit: Cents;
  partQualities: PartQuality[];
  extrasCount: number;
}

export type QuoteErrorCode = 'sem-itens' | 'item-obrigatorio' | 'peca-invalida' | 'valor-invalido' | 'item-repetido';
export type QuoteResult = { ok: true; value: QuoteBreakdown } | { ok: false; error: { code: QuoteErrorCode; message: string } };

const fail = (code: QuoteErrorCode, message: string): QuoteResult => ({ ok: false, error: { code, message } });
const pct = (n: number) => `${Math.round(n * 100)}%`;

export interface QuoteContext {
  catalogs: Catalogs;
  category: VehicleCategory;
  rules: PricingRules;
}

export function computeQuote(input: QuoteInput, ctx: QuoteContext): QuoteResult {
  const { rules, catalogs } = ctx;
  if (input.items.length === 0) return fail('sem-itens', 'O orçamento precisa de pelo menos um item.');
  if (!input.items.some((i) => i.mandatory)) return fail('item-obrigatorio', 'Falta o item do diagnóstico.');
  if (new Set(input.items.map((i) => i.slot)).size !== input.items.length) return fail('item-repetido', 'Cada peça só pode entrar uma vez.');
  if (!rules.markupOptions.includes(input.markupPct)) return fail('valor-invalido', `Margem inválida: ${input.markupPct}`);
  if (!rules.discountOptions.includes(input.discountPct)) return fail('valor-invalido', `Desconto inválido: ${input.discountPct}`);
  if (!rules.warrantyOptions.includes(input.warrantyDays)) return fail('valor-invalido', `Garantia inválida: ${input.warrantyDays}`);
  const negotiated = input.negotiatedDiscount ?? 0;
  if (!Number.isSafeInteger(negotiated) || negotiated < 0) return fail('valor-invalido', 'Desconto negociado deve ser um valor em centavos >= 0.');
  const catMult = rules.categoryLaborMultiplier[ctx.category];
  if (!(catMult > 0)) return fail('valor-invalido', `Categoria sem ajuste de mão de obra: ${ctx.category}`);

  const lines: QuoteLine[] = [];
  let partsSubtotal = 0;
  let laborMinutes = 0;
  const partQualities: PartQuality[] = [];
  for (const item of input.items) {
    const part = catalogs.parts.get(item.partId);
    if (!part || part.slot !== item.slot) return fail('peca-invalida', `Peça inválida para o item: ${item.partId}`);
    const price = Math.round(part.baseCost * (1 + input.markupPct));
    partsSubtotal += price;
    laborMinutes += part.replaceMinutes;
    partQualities.push(part.quality);
    lines.push({ kind: 'peca', label: part.name, detail: `${part.brand}${item.mandatory ? '' : ' · extra sugerido'}`, amount: price });
  }

  const block = rules.laborBlockMinutes;
  const laborHours = (Math.ceil(laborMinutes / block) * block) / 60;
  const laborSubtotal = Math.round(laborHours * rules.hourlyRate * catMult);
  lines.push({
    kind: 'mao-de-obra',
    label: 'Mão de obra',
    detail: `${formatHours(laborHours)} × valor/hora${catMult !== 1 ? ` × ${catMult.toFixed(2).replace('.', ',')} (categoria)` : ''}`,
    amount: laborSubtotal,
  });

  const urgencyFee = input.urgent ? Math.round(laborSubtotal * rules.urgencyRate) : 0;
  if (urgencyFee) lines.push({ kind: 'urgencia', label: 'Taxa de urgência', detail: `${pct(rules.urgencyRate)} sobre a mão de obra`, amount: urgencyFee });

  const fees = rules.disposalFeePerItem * input.items.length;
  lines.push({ kind: 'taxa', label: 'Taxa de descarte', detail: `${input.items.length} item(ns)`, amount: fees });

  const discount = Math.round((partsSubtotal + laborSubtotal + urgencyFee) * input.discountPct);
  if (discount) lines.push({ kind: 'desconto', label: 'Desconto', detail: `${pct(input.discountPct)} sobre peças e serviço`, amount: -discount });

  const beforeNegotiation = partsSubtotal + laborSubtotal + urgencyFee + fees - discount;
  if (negotiated > beforeNegotiation) return fail('valor-invalido', 'Desconto negociado maior que o total.');
  if (negotiated) {
    const label = input.negotiatedLabel ?? 'Desconto negociado';
    lines.push({ kind: 'desconto', label, detail: input.negotiatedLabel ? 'sem custo para o cliente' : 'combinado com o cliente', amount: -negotiated });
  }
  const total = beforeNegotiation - negotiated;

  const deadlineHours = Math.ceil(laborHours + (input.urgent ? rules.urgentQueueHours : rules.queueHours));
  const deposit = total > rules.depositThreshold ? Math.round(total * rules.depositRate) : 0;

  return {
    ok: true,
    value: {
      input,
      lines,
      partsSubtotal,
      laborMinutes,
      laborHours,
      categoryMultiplier: catMult,
      laborSubtotal,
      urgencyFee,
      fees,
      discount,
      negotiatedDiscount: negotiated,
      total,
      deadlineHours,
      warrantyDays: input.warrantyDays,
      deposit,
      partQualities,
      extrasCount: input.items.filter((i) => !i.mandatory).length,
    },
  };
}

/** 1.5 → "1,5 h" */
export function formatHours(hours: number): string {
  return `${String(hours).replace('.', ',')} h`;
}
