/**
 * Ícones da interface (Prompt 24): desenho próprio em SVG de traço, 24×24,
 * que herdam a cor do texto (currentColor). Sem dependência nem licença externa.
 */
const PATHS = {
  dinheiro: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9.5v5M18 9.5v5"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  estrela: '<path d="M12 3.2l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z"/>',
  chave: '<path d="M14.7 6.3a4 4 0 0 0-5.2 5.2L3.5 17.5a1.4 1.4 0 0 0 2 2l6-6a4 4 0 0 0 5.2-5.2l-2.4 2.4-2.2-.6-.6-2.2z"/>',
  alvo: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  alerta: '<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  ok: '<circle cx="12" cy="12" r="9"/><path d="M7.5 12.3l3 3 6-6.3"/>',
  dica: '<path d="M9 17.5h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  mao: '<path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V10m0-.5V4a1.5 1.5 0 0 1 3 0v6m0-1.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L3.6 16a1.6 1.6 0 0 1 2.4-2L8 15.5V11z"/>',
  carro: '<path d="M4 16v-3.5L6 7.5A2 2 0 0 1 7.8 6h8.4A2 2 0 0 1 18 7.5l2 5V16"/><path d="M3 16h18v2.5H3z"/><circle cx="7.5" cy="16" r="1.5"/><circle cx="16.5" cy="16" r="1.5"/>',
  mapa: '<path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  salvar: '<path d="M5 3.5h11l3.5 3.5v13.5h-14.5z"/><path d="M8 3.5v5h7v-5M8 20.5v-6h8v6"/>',
} as const;

export type IconName = keyof typeof PATHS;

/** Cria o ícone (decorativo: o texto ao lado é que dá o significado). */
export function icon(name: IconName, extraClass = ''): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `icon icon-${name}${extraClass ? ` ${extraClass}` : ''}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  // PATHS são constantes deste arquivo (nunca entrada do jogador).
  svg.innerHTML = PATHS[name];
  return svg;
}
