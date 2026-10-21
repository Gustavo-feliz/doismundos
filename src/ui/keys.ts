import { keyLabel } from '../core/bindings';
import { DEFAULT_BINDINGS, type Action, type KeyBindings } from '../data/controls';
import { h } from './dom';

/**
 * Teclas mostradas na interface (Prompt 24). A tela sempre mostra a tecla
 * ESCOLHIDA pelo jogador; ao remapear, `setUiBindings` atualiza tudo.
 */
let current: KeyBindings = DEFAULT_BINDINGS;
const ATTR = 'data-key-action';

export function setUiBindings(bindings: KeyBindings): void {
  current = bindings;
  for (const el of document.querySelectorAll<HTMLElement>(`[${ATTR}]`)) el.textContent = keyText(el.getAttribute(ATTR) as Action);
}

/** Nome da tecla principal de uma ação. */
export function keyText(action: Action): string {
  return keyLabel(current[action][0]!);
}

/** A tecla deste evento aciona a ação? (painéis que fecham com a tecla de interagir). */
export function isActionKey(action: Action, code: string): boolean {
  return current[action].includes(code);
}

/** <kbd> com a tecla da ação, que se atualiza sozinho ao remapear. */
export function kbd(action: Action): HTMLElement {
  return h('kbd', { [ATTR]: action, text: keyText(action) });
}

/** Lista da tela de controles, montada com as teclas atuais. */
export function controlHints(): ReadonlyArray<readonly [string, string]> {
  const k = keyText;
  return [
    [`${k('forward')} ${k('left')} ${k('backward')} ${k('right')} / setas`, 'Andar'],
    [k('run'), 'Correr'],
    ['Mouse', 'Olhar ao redor'],
    [`${k('interact')} / clique`, 'Interagir com o que está na mira'],
    [k('openMap'), 'Ir para o bairro / abrir o mapa de locais'],
    ['1 / 2 / 3', 'Escolher resposta num diálogo'],
    [k('skipLine'), 'Pular fala'],
    [k('toggleTips'), 'Mostrar ou ocultar dicas do tutorial'],
    [
      'Test drive',
      `${k('forward')}/${k('backward')} acelerar e frear (ré) · ${k('left')}/${k('right')} esterçar · ${k('handbrake')} freio de mão · ${k('resetCar')} recomeçar · ${k('exitDrive')} voltar à oficina`,
    ],
    ['Esc', 'Pausar e liberar o mouse'],
  ];
}
