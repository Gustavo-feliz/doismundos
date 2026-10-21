import * as THREE from 'three';
import { createSeededRandom, range, type Rng } from './random';

/**
 * Texturas procedurais desenhadas em canvas.
 * ASSET TEMPORÁRIO: substituem texturas reais até a direção de arte ser
 * definida (GDD §20.2). Determinísticas por causa da semente.
 */

function createHeadlessCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const noop = () => {};
  const grad = { addColorStop: noop };
  const ctx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    font: '12px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillRect: noop,
    strokeRect: noop,
    clearRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    ellipse: noop,
    rect: noop,
    roundRect: noop,
    fill: noop,
    stroke: noop,
    clip: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    fillText: noop,
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
  } as unknown as CanvasRenderingContext2D;
  const canvas = { width, height, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return [canvas, ctx];
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return createHeadlessCanvas(width, height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return createHeadlessCanvas(width, height);
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
 * Mapa de rugosidade (roughnessMap) do piso de concreto (GDD §20.2 — Direção Híbrida).
 * Onde há manchas de óleo (mesma semente), a rugosidade cai para refletir a luz do galpão/sol.
 */
export function concreteFloorRoughnessTexture(seed = 11): THREE.CanvasTexture {
  const size = 1024;
  const [canvas, ctx] = makeCanvas(size, size);
  const rng = createSeededRandom(seed);
  // Base áspera (~0.84)
  ctx.fillStyle = 'rgb(214,214,214)';
  ctx.fillRect(0, 0, size, size);
  blotches(ctx, rng, size, size, 80, '185,185,185', 0.35, 25, 120);
  // Poças/manchas de óleo têm baixa rugosidade (escuras no mapa = reflexo úmido).
  blotches(ctx, rng, size, size, 26, '55,55,55', 0.75, 12, 55);
  return toTexture(canvas, { srgb: false });
}

/**
 * Parede: reboco claro quente em cima, barra verde-oficina embaixo e faixa de
 * segurança listrada amarelo/preto na transição (Direção Híbrida A+B).
 */
export function wallTexture(wallHeight: number, bandHeight: number, seed = 23): THREE.CanvasTexture {
  const w = 1024;
  const h = 1024;
  const [canvas, ctx] = makeCanvas(w, h);
  const rng = createSeededRandom(seed);
  const bandPx = (bandHeight / wallHeight) * h;

  ctx.fillStyle = '#d6cab4';
  ctx.fillRect(0, 0, w, h - bandPx);
  ctx.fillStyle = '#2b5852';
  ctx.fillRect(0, h - bandPx, w, bandPx);

  // Faixa de segurança listrada amarelo/preto separando as duas cores.
  const stripeH = 18;
  const stripeY = h - bandPx - stripeH;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, stripeY, w, stripeH);
  ctx.clip();
  ctx.fillStyle = '#ebb424';
  ctx.fillRect(0, stripeY, w, stripeH);
  ctx.fillStyle = '#1b1d1e';
  const step = 32;
  for (let x = -h; x < w + h; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, stripeY + stripeH);
    ctx.lineTo(x + step * 0.5, stripeY + stripeH);
    ctx.lineTo(x + step * 0.5 + stripeH, stripeY);
    ctx.lineTo(x + stripeH, stripeY);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = '#162220';
  ctx.fillRect(0, stripeY - 3, w, 3);
  ctx.fillRect(0, stripeY + stripeH, w, 3);

  blotches(ctx, rng, w, h - bandPx, 40, '120,105,85', 0.1, 30, 140);
  speckle(ctx, rng, w, h, 20_000, 0.06);
  // Escorrido suave de uso e rodapé sombreado.
  for (let i = 0; i < 32; i++) {
    const x = rng() * w;
    const len = range(rng, 20, 140);
    const g = ctx.createLinearGradient(0, stripeY - len, 0, stripeY);
    g.addColorStop(0, 'rgba(90,80,65,0)');
    g.addColorStop(1, `rgba(90,80,65,${range(rng, 0.06, 0.16)})`);
    ctx.fillStyle = g;
    ctx.fillRect(x, stripeY - len, range(rng, 3, 10), len);
  }
  const foot = ctx.createLinearGradient(0, h - 90, 0, h);
  foot.addColorStop(0, 'rgba(20,18,15,0)');
  foot.addColorStop(1, 'rgba(20,18,15,0.42)');
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

/** Letreiro clássico de oficina brasileira na parede (texto fictício). */
export function signTexture(title: string, subtitle: string): THREE.CanvasTexture {
  const w = 2048;
  const h = 512;
  const [canvas, ctx] = makeCanvas(w, h);
  const rng = createSeededRandom(77);
  ctx.fillStyle = '#eee8d8';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1d3c6a';
  ctx.fillRect(20, 20, w - 40, 14);
  ctx.fillRect(20, h - 34, w - 40, 14);
  ctx.strokeStyle = '#1b2838';
  ctx.lineWidth = 14;
  ctx.strokeRect(24, 24, w - 48, h - 48);
  // Rebites nos cantos
  ctx.fillStyle = '#4a5562';
  for (const [rx, ry] of [[52, 52], [w - 52, 52], [52, h - 52], [w - 52, h - 52]] as const) {
    ctx.beginPath();
    ctx.arc(rx, ry, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#172330';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 184px "Arial Black", Impact, sans-serif';
  ctx.fillText(title, w / 2, h * 0.41);
  // Traços laterais no subtítulo
  ctx.fillStyle = '#b3261e';
  ctx.fillRect(w * 0.12, h * 0.77 - 4, 180, 8);
  ctx.fillRect(w * 0.88 - 180, h * 0.77 - 4, 180, 8);
  ctx.fillStyle = '#243447';
  ctx.font = '700 66px Arial, sans-serif';
  ctx.fillText(subtitle, w / 2, h * 0.77);
  // Desgaste sutil da pintura.
  blotches(ctx, rng, w, h, 40, '110,95,70', 0.16, 20, 110);
  speckle(ctx, rng, w, h, 10_000, 0.08);
  return toTexture(canvas);
}

/** Cartazes de parede 100% fictícios do universo do jogo. */
export function posterTexture(kind: 'lubrimax' | 'trovao' | 'tabela'): THREE.CanvasTexture {
  const w = 512;
  const h = 680;
  const [canvas, ctx] = makeCanvas(w, h);
  const rng = createSeededRandom(kind === 'lubrimax' ? 41 : kind === 'trovao' ? 52 : 63);
  if (kind === 'lubrimax') {
    ctx.fillStyle = '#1f5e3b';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f2c230';
    ctx.fillRect(20, 20, w - 40, 170);
    ctx.fillStyle = '#143824';
    ctx.textAlign = 'center';
    ctx.font = '900 74px "Arial Black", Impact, sans-serif';
    ctx.fillText('LUBRIMAX', w / 2, 118);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 38px Arial, sans-serif';
    ctx.fillText('ÓLEO MOTOR 20W-50', w / 2, 260);
    // Galão estilizado
    ctx.fillStyle = '#e8b923';
    ctx.beginPath();
    ctx.roundRect(160, 320, 192, 240, 22);
    ctx.fill();
    ctx.fillStyle = '#b3261e';
    ctx.fillRect(190, 290, 52, 30);
    ctx.fillStyle = '#1f5e3b';
    ctx.font = '700 32px Arial, sans-serif';
    ctx.fillText('ALTA KM', w / 2, 445);
    ctx.fillStyle = '#d9eadf';
    ctx.font = '700 28px Arial, sans-serif';
    ctx.fillText('PROTEÇÃO NO CALOR DO RIO', w / 2, 625);
  } else if (kind === 'trovao') {
    ctx.fillStyle = '#1b3b6f';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(20, 20, w - 40, 150);
    ctx.fillStyle = '#112240';
    ctx.textAlign = 'center';
    ctx.font = '900 64px "Arial Black", Impact, sans-serif';
    ctx.fillText('TROVÃO 60Ah', w / 2, 112);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 36px Arial, sans-serif';
    ctx.fillText('BATERIAS AUTOMOTIVAS', w / 2, 240);
    // Desenho da bateria
    ctx.fillStyle = '#1e2229';
    ctx.fillRect(136, 310, 240, 190);
    ctx.fillStyle = '#d63a2f';
    ctx.fillRect(166, 286, 36, 24);
    ctx.fillStyle = '#6c757d';
    ctx.fillRect(310, 286, 36, 24);
    ctx.fillStyle = '#f59e0b';
    ctx.font = '900 44px Arial, sans-serif';
    ctx.fillText('PARTIDA FORTE', w / 2, 585);
  } else {
    ctx.fillStyle = '#f4f1e8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#24518a';
    ctx.fillRect(0, 0, w, 120);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = '900 44px Arial, sans-serif';
    ctx.fillText('TABELA DE REVISÃO', w / 2, 75);
    ctx.fillStyle = '#222';
    ctx.textAlign = 'left';
    ctx.font = '700 28px monospace';
    const lines = [
      'VELAS IGNIÇÃO .... 25 N·m',
      'BUJÃO CÁRTER ..... 32 N·m',
      'RODAS (PARAF.) .. 110 N·m',
      'BATERIA .......... 12,6 V',
      'ALTERNADOR ....... 14,1 V',
      'ARREFECIMENTO .... 90 °C',
    ];
    lines.forEach((l, i) => {
      ctx.fillText(l, 42, 195 + i * 68);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(40, 212 + i * 68, w - 80, 3);
      ctx.fillStyle = '#222';
    });
    ctx.fillStyle = '#b3261e';
    ctx.textAlign = 'center';
    ctx.font = '700 30px Arial, sans-serif';
    ctx.fillText('USE SEMPRE EPI · SEU ZÉ', w / 2, 635);
  }
  ctx.strokeStyle = 'rgba(20,20,20,0.45)';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, w - 10, h - 10);
  blotches(ctx, rng, w, h, 18, '90,75,55', 0.14, 15, 70);
  return toTexture(canvas);
}

/** Tampo de madeira envernizada da bancada com marcas de oficina. */
export function woodWorkbenchTexture(seed = 89): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const [canvas, ctx] = makeCanvas(w, h);
  const rng = createSeededRandom(seed);
  ctx.fillStyle = '#8d6238';
  ctx.fillRect(0, 0, w, h);
  const planks = 6;
  const plankH = h / planks;
  for (let i = 0; i < planks; i++) {
    const shade = range(rng, -12, 12);
    ctx.fillStyle = `rgb(${141 + shade},${98 + shade * 0.7},${56 + shade * 0.5})`;
    ctx.fillRect(0, i * plankH, w, plankH - 2);
    ctx.fillStyle = 'rgba(35,22,12,0.55)';
    ctx.fillRect(0, (i + 1) * plankH - 3, w, 3);
  }
  blotches(ctx, rng, w, h, 35, '40,26,14', 0.22, 15, 90);
  speckle(ctx, rng, w, h, 12_000, 0.06);
  return toTexture(canvas);
}

/** Calçada carioca de pedras/blocos claros. */
export function sidewalkTexture(seed = 103): THREE.CanvasTexture {
  const size = 512;
  const [canvas, ctx] = makeCanvas(size, size);
  const rng = createSeededRandom(seed);
  ctx.fillStyle = '#bfb8a8';
  ctx.fillRect(0, 0, size, size);
  const step = 64;
  ctx.strokeStyle = 'rgba(70,66,58,0.45)';
  ctx.lineWidth = 3;
  for (let y = 0; y < size; y += step) {
    const offset = (y / step) % 2 === 0 ? 0 : step / 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
    for (let x = offset; x < size; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + step);
      ctx.stroke();
    }
  }
  blotches(ctx, rng, size, size, 24, '95,90,80', 0.16, 16, 70);
  speckle(ctx, rng, size, size, 8000, 0.08);
  return toTexture(canvas, { repeat: [12, 2] });
}

/** Céu/fachadas vistos pela porta: degradê dourado de fim de tarde no Rio. */
export function skyTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(16, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#5a94c9');
  g.addColorStop(0.55, '#b8d4e8');
  g.addColorStop(0.85, '#f5dec0');
  g.addColorStop(1, '#f7cba1');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  return toTexture(canvas);
}

/** Placa de carro brasileira fictícia no estilo Mercosul/Rio. */
export function plateTexture(text: string): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 160);
  ctx.fillStyle = '#f6f6f2';
  ctx.fillRect(0, 0, 512, 160);
  ctx.fillStyle = '#163d8a';
  ctx.fillRect(0, 0, 512, 40);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 20px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BRASIL · RIO DE JANEIRO', 256, 21);
  ctx.strokeStyle = '#1e2226';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 504, 152);
  ctx.fillStyle = '#121417';
  ctx.font = '900 88px "Courier New", monospace';
  ctx.fillText(text, 256, 104);
  return toTexture(canvas);
}

/** Azulejo de meia-parede da oficina / lanchonete com rejunte escuro e sinais de uso. */
export function tileWallTexture(baseHex = '#2b5852', groutHex = '#19322f', size = 512, seed = 131): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(size, size);
  const rng = createSeededRandom(seed);
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);
  const step = Math.max(32, Math.floor(size / 8));
  ctx.strokeStyle = groutHex;
  ctx.lineWidth = Math.max(2, Math.floor(size / 170));
  for (let i = 0; i <= size; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  blotches(ctx, rng, size, size, 24, '20,30,28', 0.16, 12, 64);
  speckle(ctx, rng, size, size, 3000, 0.06);
  return toTexture(canvas, { repeat: [4, 2] });
}

/** Asfalto urbano carioca com granulação mineral e remendos sutis. */
export function asphaltRoadTexture(size = 512, seed = 149): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(size, size);
  const rng = createSeededRandom(seed);
  ctx.fillStyle = '#33363a';
  ctx.fillRect(0, 0, size, size);
  blotches(ctx, rng, size, size, 36, '24,26,29', 0.25, 20, 95);
  blotches(ctx, rng, size, size, 18, '72,76,82', 0.14, 16, 70);
  speckle(ctx, rng, size, size, 14_000, 0.11);
  return toTexture(canvas, { repeat: [6, 6] });
}

/** Calçada tradicional de pedra portuguesa do Rio de Janeiro (mosaico claro/escuro). */
export function portugueseStoneTexture(size = 512, seed = 163): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(size, size);
  const rng = createSeededRandom(seed);
  ctx.fillStyle = '#bfb8a8';
  ctx.fillRect(0, 0, size, size);
  const cell = Math.max(16, Math.floor(size / 16));
  ctx.strokeStyle = 'rgba(55,52,46,0.42)';
  ctx.lineWidth = 2;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const jitter = range(rng, -8, 8);
      ctx.fillStyle = `rgb(${191 + jitter},${184 + jitter},${168 + jitter})`;
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      ctx.strokeRect(x, y, cell, cell);
    }
  }
  // Faixa decorativa tradicional em ondas escuras (#232528)
  ctx.fillStyle = '#232528';
  for (let x = 0; x < size; x += cell) {
    const waveY = Math.floor((Math.sin((x / size) * Math.PI * 2) * 0.18 + 0.5) * (size / cell)) * cell;
    ctx.fillRect(x + 1, waveY + 1, cell - 2, cell - 2);
  }
  blotches(ctx, rng, size, size, 20, '80,75,65', 0.14, 14, 60);
  return toTexture(canvas, { repeat: [8, 2] });
}

/** Mapa de micro-relevo (bumpMap) e rugosidade compartilhado para níveis 'media' e 'alta'. */
export function microGrainMapTexture(size = 256, baseGray = 180, contrast = 0.2, seed = 181): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(size, size);
  const rng = createSeededRandom(seed);
  ctx.fillStyle = `rgb(${baseGray},${baseGray},${baseGray})`;
  ctx.fillRect(0, 0, size, size);
  blotches(ctx, rng, size, size, 28, '90,90,90', contrast, 10, 48);
  speckle(ctx, rng, size, size, 4000, contrast * 0.65);
  return toTexture(canvas, { repeat: [2, 2], srgb: false });
}

