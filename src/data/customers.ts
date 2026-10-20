import type { CustomerProfile } from '../customers/types';

/**
 * Os 3 perfis de cliente do Prompt 5 (GDD §14.1).
 * PROVISÓRIO: limites ajustados para os 3 casos de demonstração.
 */
export const CUSTOMERS: readonly CustomerProfile[] = [
  {
    id: 'marcao',
    name: 'Marcão',
    typeLabel: 'Motorista de aplicativo',
    persona: 'Vive do carro: cada hora parado é corrida perdida. Quer o essencial, e rápido.',
    maxBudget: 450_00,
    counterRatio: 1.25,
    patience: 2,
    requiresOriginal: false,
    minWarrantyDays: 90,
    maxDeadlineHours: 4,
    acceptsExtras: false,
  },
  {
    id: 'jorge',
    name: 'Seu Jorge',
    typeLabel: 'Econômico',
    persona: 'Pesquisa preço em tudo e adora pechinchar. Pressa, nenhuma.',
    maxBudget: 180_00,
    counterRatio: 1.3,
    patience: 3,
    requiresOriginal: false,
    minWarrantyDays: 90,
    maxDeadlineHours: 48,
    acceptsExtras: false,
  },
  {
    id: 'cida',
    name: 'Dona Cida',
    typeLabel: 'Exigente e desconfiada',
    persona: 'Já foi enganada em outra oficina. Quer peça boa, garantia longa e tudo explicado.',
    maxBudget: 1_300_00,
    counterRatio: 1.15,
    patience: 1,
    requiresOriginal: true,
    minWarrantyDays: 180,
    maxDeadlineHours: 72,
    acceptsExtras: true,
  },
];
