import * as THREE from 'three';
import { createSeededRandom, range, type Rng } from './random';

/**
 * Texturas procedurais desenhadas em canvas.
 * ASSET TEMPORÁRIO: substituem texturas reais até a direção de arte ser
 * definida (GDD §20.2). Determinísticas por causa da semente.
 */

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para gerar texturas.');
  return [canvas, ctx];
}

function toTexture(canvas: HTMLCanvasElement, options: { repeat?: [number, number]; srgb?: boolean } = {}): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  if (options.srgb !== false) texture.colorSpace = THREE.SRGBColorSpace;
  if (options.repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(options.repeat[0], options.repeat[1]);
  }
  texture.anisotropy = 8;
  return texture;
}

/** Pontilhado fino (grão). */
function speckle(ctx: CanvasRenderingContext2D, rng: Rng, w: number, h: number, count: number, alpha: number): void {
  for (let i = 0; i < count; i++) {
    const v = rng() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${range(rng, 0.2, 1) * alpha})`;
    const s = range(rng, 1, 2.6);
    ctx.fillRect(rng() * w, rng() * h, s, s);
  }
}

/** Manchas suaves (sujeira, óleo). */
function blotches(ctx: CanvasRenderingContext2D, rng: Rng, w: number, h: number, count: number, color: string, maxAlpha: number, minR: number, maxR: number): void {
  for (let i = 0; i < count; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = range(rng, minR, maxR);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${color},${range(rng, 0.3, 1) * maxAlpha})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * range(rng, 0.5, 1), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Piso de concreto da oficina inteira (não repete, para as manchas não se
 * repetirem). `metersX/Z` = tamanho real, usado para desenhar as juntas.
 */
export function concreteFloorTexture(metersX: number, metersZ: number, seed = 11): THREE.CanvasTexture {
  const size = 2048;
  const [canvas, ctx] = makeCanvas(size, size);
  const rng = createSeededRandom(seed);
  ctx.fillStyle = '#7a766f';
  ctx.fillRect(0, 0, size, size);
  blotches(ctx, rng, size, size, 140, '70,66,60', 0.18, 40, 220);
  blotches(ctx, rng, size, size, 60, '200,196,188', 0.12, 60, 260);
  speckle(ctx, rng, size, size, 60_000, 0.12);
  // Manchas de óleo (mais escuras e concentradas).
  blotches(ctx, rng, size, size, 26, '28,24,20', 0.45, 18, 90);

  // Juntas de dilatação a cada 3 m.
  ctx.strokeStyle = 'rgba(40,38,35,0.55)';
  ctx.lineWidth = 3;
  const pxPerMX = size / metersX;
  const pxPerMZ = size / metersZ;
  for (let m = 3; m < metersX; m += 3) {
    ctx.beginPath();
    ctx.moveTo(m * pxPerMX, 0);
    ctx.lineTo(m * pxPerMX, size);
    ctx.stroke();
  }
  for (let m = 3; m < metersZ; m += 3) {
    ctx.beginPath();
    ctx.moveTo(0, m * pxPerMZ);
    ctx.lineTo(size, m * pxPerMZ);
    ctx.stroke();
  }
  // Marcas de pneu (faixas largas e bem suaves) indo do portão para os boxes.
  for (let i = 0; i < 6; i++) {
    const x = range(rng, size * 0.25, size * 0.7);
    const g = ctx.createLinearGradient(0, size, 0, size * 0.35);
    g.addColorStop(0, 'rgba(25,22,20,0.10)');
    g.addColorStop(1, 'rgba(25,22,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, size * 0.35, range(rng, 18, 28), size * 0.65);
  }
  return toTexture(canvas);
}

/**
 * Parede: reboco claro em cima e barra pintada embaixo (típico de oficina).
 * A textura cobre a altura toda da parede e repete na horizontal.
 */
export function wallTexture(wallHeight: number, bandHeight: number, seed = 23): THREE.CanvasTexture {
  const w = 1024;
  const h = 1024;
  const [canvas, ctx] = makeCanvas(w, h);
  const rng = createSeededRandom(seed);
  const bandPx = (bandHeight / wallHeight) * h;

  ctx.fillStyle = '#c8c0ad';
  ctx.fillRect(0, 0, w, h - bandPx);
  ctx.fillStyle = '#2f5d57';
  ctx.fillRect(0, h - bandPx, w, bandPx);
  // Filete escuro separando as duas cores.
  ctx.fillStyle = '#1d2b28';
  ctx.fillRect(0, h - bandPx - 6, w, 6);

  blotches(ctx, rng, w, h - bandPx, 40, '120,105,85', 0.12, 30, 140);
  speckle(ctx, rng, w, h, 20_000, 0.07);
  // Escorrido de sujeira descendo da barra e encardido no rodapé.
  for (let i = 0; i < 40; i++) {
    const x = rng() * w;
    const len = range(rng, 20, 160);
    const g = ctx.createLinearGradient(0, h - bandPx - len, 0, h - bandPx);
    g.addColorStop(0, 'rgba(90,80,65,0)');
    g.addColorStop(1, `rgba(90,80,65,${range(rng, 0.08, 0.22)})`);
    ctx.fillStyle = g;
    ctx.fillRect(x, h - bandPx - len, range(rng, 3, 12), len);
  }
  const foot = ctx.createLinearGradient(0, h - 90, 0, h);
  foot.addColorStop(0, 'rgba(20,18,15,0)');
  foot.addColorStop(1, 'rgba(20,18,15,0.45)');
  ctx.fillStyle = foot;
  ctx.fillRect(0, h - 90, w, 90);
  return toTexture(canvas, { repeat: [1, 1] });
}

/** Lâminas do portão de enrolar (repete na vertical). */
export function rollingDoorTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  const rng = createSeededRandom(5);
  ctx.fillStyle = '#9aa0a3';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    const g = ctx.createLinearGradient(0, y, 0, y + 32);
    g.addColorStop(0, '#b9bfc2');
    g.addColorStop(0.45, '#9aa0a3');
    g.addColorStop(0.9, '#6d7275');
    g.addColorStop(1, '#4a4e50');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, 256, 32);
  }
  blotches(ctx, rng, 256, 256, 10, '120,80,50', 0.25, 6, 30);
  speckle(ctx, rng, 256, 256, 2500, 0.08);
  return toTexture(canvas, { repeat: [4, 6] });
}

/** Painel de ferramentas (pegboard) com silhuetas pintadas. */
export function pegboardTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const [canvas, ctx] = makeCanvas(w, h);
  ctx.fillStyle = '#b08d5b';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(40,28,15,0.75)';
  for (let y = 16; y < h; y += 32) {
    for (let x = 16; x < w; x += 32) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Silhuetas de ferramentas (contorno) — mostram onde cada uma "mora".
  ctx.strokeStyle = '#1f1a14';
  ctx.fillStyle = 'rgba(30,25,20,0.55)';
  ctx.lineWidth = 4;
  const wrench = (x: number, y: number, len: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.roundRect(-9, 0, 18, len, 6);
    ctx.arc(0, -10, 20, Math.PI * 0.25, Math.PI * 2.75);
    ctx.fill();
    ctx.restore();
  };
  [130, 190, 250, 310, 370].forEach((x, i) => wrench(x, 120, 160 + i * 25));
  // Martelo
  ctx.fillRect(520, 110, 120, 34);
  ctx.fillRect(568, 144, 22, 200);
  // Chaves de fenda
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(720 + i * 50, 110, 22, 80);
    ctx.fillRect(728 + i * 50, 190, 6, 140 + i * 10);
  }
  return toTexture(canvas);
}

/** Letreiro pintado na parede (texto fictício). */
export function signTexture(title: string, subtitle: string): THREE.CanvasTexture {
  const w = 2048;
  const h = 512;
  const [canvas, ctx] = makeCanvas(w, h);
  const rng = createSeededRandom(77);
  ctx.fillStyle = '#f2c230';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#1b1b1b';
  ctx.lineWidth = 18;
  ctx.strokeRect(24, 24, w - 48, h - 48);
  ctx.fillStyle = '#1b1b1b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 210px "Arial Black", Impact, sans-serif';
  ctx.fillText(title, w / 2, h * 0.42);
  ctx.font = '700 72px Arial, sans-serif';
  ctx.fillText(subtitle, w / 2, h * 0.78);
  // Desgaste da pintura.
  blotches(ctx, rng, w, h, 50, '120,100,60', 0.22, 20, 120);
  speckle(ctx, rng, w, h, 12_000, 0.1);
  return toTexture(canvas);
}

/** Céu/fachadas vistos pela porta: degradê simples (temporário). */
export function skyTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(16, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#6fa6d6');
  g.addColorStop(0.6, '#b9d6ea');
  g.addColorStop(1, '#f1ead8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  return toTexture(canvas);
}

/** Placa de carro fictícia, claramente provisória. */
export function plateTexture(text: string): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 160);
  ctx.fillStyle = '#f4f4f0';
  ctx.fillRect(0, 0, 512, 160);
  ctx.fillStyle = '#1f3f8f';
  ctx.fillRect(0, 0, 512, 36);
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 506, 154);
  ctx.fillStyle = '#111';
  ctx.font = '700 92px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 102);
  return toTexture(canvas);
}
