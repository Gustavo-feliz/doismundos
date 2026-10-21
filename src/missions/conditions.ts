import type { OrderStatus } from '../orders/types';
import type { MissionCondition, MissionFacts, OrderStage } from './types';
import { ORDER_STAGES } from './types';

/** Até onde cada status de OS chegou. Recusada = passou pelo orçamento. */
const STATUS_RANK: Readonly<Record<OrderStatus, number>> = {
  diagnostico: 0,
  orcamento: 1,
  contraproposta: 1,
  recusada: 1,
  aprovada: 2,
  'em-reparo': 3,
  concluida: 4,
  entregue: 5,
};

/** Fonte mínima dos fatos (a sessão do jogo cumpre esta forma). */
export interface MissionWorld {
  orderStatuses: readonly OrderStatus[];
  activeOrderStatus: OrderStatus | null;
  purchases: number;
  installmentsPaid: number;
  installmentOverdue: boolean;
}

export function buildFacts(world: MissionWorld, flags: ReadonlySet<string>): MissionFacts {
  const ordersReached = Object.fromEntries(ORDER_STAGES.map((s) => [s, 0])) as Record<OrderStage, number>;
  for (const status of world.orderStatuses) {
    const rank = STATUS_RANK[status];
    for (const stage of ORDER_STAGES) if (STATUS_RANK[stage] <= rank) ordersReached[stage]++;
  }
  return {
    flags,
    ordersReached,
    activeOrderStatus: world.activeOrderStatus,
    purchases: world.purchases,
    installmentsPaid: world.installmentsPaid,
    installmentOverdue: world.installmentOverdue,
  };
}

export function checkCondition(c: MissionCondition, f: MissionFacts): boolean {
  switch (c.kind) {
    case 'flag':
      return f.flags.has(c.flag);
    case 'orders-reached':
      return f.ordersReached[c.stage] >= c.count;
    case 'active-order':
      return f.activeOrderStatus === c.status;
    case 'purchases':
      return f.purchases >= c.count;
    case 'installments-paid':
      return f.installmentsPaid >= c.count;
    case 'installment-overdue':
      return f.installmentOverdue;
    case 'any':
      return c.of.some((x) => checkCondition(x, f));
  }
}
