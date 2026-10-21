import type { FeedbackActionKind } from '../core/events';
import type { IconName } from './icons';

/**
 * Textos e variações do retorno das ações (Prompt 25), em funções puras.
 * As variações usam semente: o mesmo serviço sempre mostra o mesmo efeito,
 * e serviços seguidos não ficam idênticos.
 */

export interface ActionLabels {
  icon: IconName;
  /** Enquanto a barra enche. */
  running: string;
  /** Quando termina. */
  done: string;
}

export const ACTION_LABELS: Readonly<Record<FeedbackActionKind, ActionLabels>> = {
  remover: { icon: 'chave', running: 'Soltando a peça…', done: 'Peça removida' },
  instalar: { icon: 'chave', running: 'Apertando no torque…', done: 'Peça instalada' },
  exame: { icon: 'alvo', running: 'Fazendo o teste…', done: 'Teste feito' },
  compra: { icon: 'dinheiro', running: 'Fechando a compra…', done: 'Compra feita' },
  entrega: { icon: 'carro', running: 'Entregando as chaves…', done: 'Carro entregue' },
  erro: { icon: 'alerta', running: 'Não dá', done: 'Não dá' },
};

/** Agradecimento do cliente pela nota que ele deu (1–5 estrelas). */
export function thanksLine(stars: number, seed: number): string {
  const lines =
    stars >= 5
      ? ['Valeu demais, chefe! Ficou zero bala.', 'Serviço de primeira! Vou indicar pra geral.', 'Tá voando, irmão. Valeu mesmo!']
      : stars >= 4
        ? ['Valeu! Tá rodando lisinho.', 'Ficou bom, hein. Obrigado!', 'Beleza, chefe. Volto aqui.']
        : stars >= 3
          ? ['Tá, valeu. Vamos ver se aguenta.', 'Ok, obrigado. Saiu meio salgado.', 'Valeu. Demorou um pouco, mas tá aí.']
          : ['Hum… espero que tenha resolvido.', 'Não gostei muito, não.', 'Vou pensar se volto…'];
  return lines[pick(seed, lines.length)] ?? lines[0]!;
}

/** Moedas que sobem na entrega: deslocamento horizontal (px), atraso (ms) e giro (graus). */
export function coinBurst(seed: number, count: number): Array<{ dx: number; delay: number; spin: number }> {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => ({
    dx: Math.round((rnd() * 2 - 1) * 90),
    delay: Math.round(i * 55 + rnd() * 40),
    spin: Math.round((rnd() * 2 - 1) * 200),
  }));
}

function pick(seed: number, n: number): number {
  return Math.floor(mulberry32(seed)() * n) % n;
}

/** Gerador pequeno e determinístico (mesma semente, mesma sequência). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semente a partir de um texto (ex.: id da OS), FNV-1a de 32 bits. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
