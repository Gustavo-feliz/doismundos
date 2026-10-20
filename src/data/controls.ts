/**
 * Mapa de teclas por ação. Usa KeyboardEvent.code (posição física da tecla),
 * então WASD funciona igual em teclado ABNT2, US etc.
 * Remapeamento pelo jogador fica para depois (GDD §20.4).
 */
export type Action = 'forward' | 'backward' | 'left' | 'right' | 'run' | 'interact';

/** Código usado para o botão esquerdo do mouse no mapa de teclas. */
export const MOUSE_LEFT = 'Mouse0';

export type KeyBindings = Readonly<Record<Action, readonly string[]>>;

export const DEFAULT_BINDINGS: KeyBindings = {
  forward: ['KeyW', 'ArrowUp'],
  backward: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyE', MOUSE_LEFT],
};

/** Texto exibido na tela de controles. */
export const CONTROL_HINTS: ReadonlyArray<readonly [string, string]> = [
  ['W A S D / setas', 'Andar'],
  ['Shift', 'Correr'],
  ['Mouse', 'Olhar ao redor'],
  ['E / clique', 'Interagir com o que está na mira'],
  ['Esc', 'Pausar e liberar o mouse'],
];
