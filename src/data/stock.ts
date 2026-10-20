/**
 * Peças que o tio deixou nas estantes (estoque inicial do protótipo).
 * As peças de cada OS aprovada chegam do fornecedor na hora (entrega
 * imediata no protótipo; prazo e fornecedores reais: Prompt 7).
 */
export const INITIAL_STOCK: ReadonlyArray<{ partId: string; qty: number }> = [
  { partId: 'bateria-60ah-brasaco', qty: 1 },
  { partId: 'filtro-oleo-ventura', qty: 2 },
  { partId: 'oleo-5w30-sintetico-4l', qty: 1 },
  { partId: 'vela-ignicao-brasaco-jogo4', qty: 1 },
];
