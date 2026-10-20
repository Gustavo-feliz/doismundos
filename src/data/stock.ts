/**
 * Peças que o tio deixou nas estantes (estoque inicial, custo zero para a oficina).
 * O resto se compra no computador do escritório (loja, Prompt 7).
 */
export const INITIAL_STOCK: ReadonlyArray<{ partId: string; qty: number }> = [
  { partId: 'bateria-60ah-brasaco', qty: 1 },
  { partId: 'filtro-oleo-ventura', qty: 2 },
  { partId: 'oleo-5w30-sintetico-4l', qty: 1 },
  { partId: 'vela-ignicao-brasaco-jogo4', qty: 1 },
];
