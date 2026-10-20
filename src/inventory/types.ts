import type { Cents } from '../economy/money';

export interface Supplier {
  id: string;
  name: string;
  /** Preço cobrado = custo-base da peça × fator. */
  priceFactor: number;
  /** Prazo de entrega, em minutos de jogo. */
  deliveryMinutes: number;
}

/** Lote no estoque: peças iguais com o mesmo custo de compra. */
export interface StockLot {
  lotId: string;
  partId: string;
  qty: number;
  /** Quanto a oficina pagou por unidade (0 = herdada do tio). */
  unitCost: Cents;
  source: string;
}

export type PurchaseStatus = 'a-caminho' | 'recebido' | 'cancelado';

export interface PurchaseOrder {
  id: string;
  partId: string;
  supplierId: string;
  qty: number;
  unitPrice: Cents;
  total: Cents;
  /** Minuto absoluto do jogo em que foi feito e em que chega. */
  orderedAt: number;
  etaAt: number;
  status: PurchaseStatus;
}

/** Peça na mão do jogador (sabe de qual lote veio, para devolver e para custear o serviço). */
export interface HeldPart {
  partId: string;
  unitCost: Cents;
  lotSource: string;
}
