import * as THREE from 'three';
import { createSeededRandom, range } from '../../utils/random';

/**
 * Letreiro da parede do fundo: "OFICINA DO SEU ZÉ — MECÂNICA GERAL · DESDE 1987"
 * (referência aprovada: docs/coordenacao/referencias/menu-repaginado.png).
 *
 * O subtítulo ficou bem maior que no letreiro antigo para ser legível do plano
 * fixo do menu (~14 m de distância). Usa a fonte do jogo (Barlow Condensed) e
 * redesenha quando ela termina de carregar; até lá, cai numa fonte do sistema.
 * Texto e marca 100% fictícios.
 */
export const WORKSHOP_SIGN_TITLE = 'OFICINA DO SEU ZÉ';
export const WORKSHOP_SIGN_SUBTITLE = 'MECÂNICA GERAL  ·  DESDE 1987';

const SIGN_W = 2048;
const SIGN_H = 512;
const DISPLAY_FONT = '"Barlow Condensed", "Arial Narrow", "Arial Black", Impact, sans-serif';

function drawSign(ctx: CanvasRenderingContext2D): void {
  const w = SIGN_W;
  const h = SIGN_H;
  const rng = createSeededRandom(77);

  // Chapa creme envelhecida.
  ctx.fillStyle = '#eee8d8';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 46; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = range(rng, 24, 120);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(120,100,70,${range(rng, 0.04, 0.14)})`);
    g.addColorStop(1, 'rgba(120,100,70,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Moldura azul-marinho dupla e rebites.
  ctx.strokeStyle = '#1b2838';
  ctx.lineWidth = 16;
  ctx.strokeRect(22, 22, w - 44, h - 44);
  ctx.strokeStyle = '#1d3c6a';
  ctx.lineWidth = 5;
  ctx.strokeRect(46, 46, w - 92, h - 92);
  ctx.fillStyle = '#4a5562';
  for (const [rx, ry] of [[64, 64], [w - 64, 64], [64, h - 64], [w - 64, h - 64]] as const) {
    ctx.beginPath();
    ctx.arc(rx, ry, 11, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Título grande (comprime na horizontal se a fonte de reserva for larga demais).
  ctx.fillStyle = '#172330';
  ctx.font = `800 236px ${DISPLAY_FONT}`;
  ctx.fillText(WORKSHOP_SIGN_TITLE, w / 2, h * 0.4, w * 0.84);

  // Subtítulo legível de longe, com os traços vermelhos dos lados.
  const subY = h * 0.77;
  ctx.font = `700 104px ${DISPLAY_FONT}`;
  const subMax = w * 0.62;
  const measured = typeof ctx.measureText === 'function' ? ctx.measureText(WORKSHOP_SIGN_SUBTITLE).width : subMax;
  const subW = Math.min(subMax, measured || subMax);
  ctx.fillStyle = '#b3261e';
  const gap = 44;
  const lineLen = 170;
  ctx.fillRect(w / 2 - subW / 2 - gap - lineLen, subY - 5, lineLen, 10);
  ctx.fillRect(w / 2 + subW / 2 + gap, subY - 5, lineLen, 10);
  ctx.fillStyle = '#243447';
  ctx.fillText(WORKSHOP_SIGN_SUBTITLE, w / 2, subY, subMax);

  // Granulado leve de pintura gasta.
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(60,50,35,${range(rng, 0.02, 0.07)})`;
    ctx.fillRect(rng() * w, rng() * h, 2, 2);
  }
}

/** Textura do letreiro (funciona também sem DOM, nos testes de regra). */
export function workshopSignTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    const tex = new THREE.CanvasTexture({ width: SIGN_W, height: SIGN_H } as unknown as HTMLCanvasElement);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const canvas = document.createElement('canvas');
  canvas.width = SIGN_W;
  canvas.height = SIGN_H;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const ctx = canvas.getContext('2d');
  if (!ctx) return tex;
  drawSign(ctx);

  // Redesenha com a fonte do jogo assim que ela estiver disponível.
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts && typeof fonts.load === 'function') {
    Promise.all([fonts.load(`800 236px "Barlow Condensed"`), fonts.load(`700 104px "Barlow Condensed"`)])
      .then((loaded) => {
        if (loaded.some((list) => list.length > 0)) {
          drawSign(ctx);
          tex.needsUpdate = true;
        }
      })
      .catch(() => {
        // Sem a fonte do jogo: fica a fonte do sistema, que já é legível.
      });
  }
  return tex;
}

