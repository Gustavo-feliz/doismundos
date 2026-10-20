/**
 * Gerador aleatório determinístico (mulberry32). Use sempre um gerador com
 * semente em vez de Math.random na lógica e no conteúdo procedural: o mesmo
 * seed gera o mesmo resultado, o que deixa testes e saves reproduzíveis.
 */
export type Rng = () => number;

export function createSeededRandom(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Número em [min, max). */
export function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}
