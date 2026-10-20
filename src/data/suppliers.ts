import type { Supplier } from '../inventory/types';

/**
 * Fornecedores fictícios (GDD §10.3, simplificado para o Prompt 7).
 * Preço = custo-base × fator. Prazo em minutos de jogo.
 * PROVISÓRIO: valores do protótipo.
 */
export const SUPPLIERS: readonly Supplier[] = [
  { id: 'autopecas-bairro', name: 'Autopeças do Bairro', priceFactor: 1, deliveryMinutes: 30 },
  { id: 'rio-pecas', name: 'Distribuidora Rio Peças', priceFactor: 0.82, deliveryMinutes: 180 },
];
