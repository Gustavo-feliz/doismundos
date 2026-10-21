/**
 * Mapa de teclas por ação. Usa KeyboardEvent.code (posição física da tecla),
 * então WASD funciona igual em teclado ABNT2, US etc.
 * Remapeamento pelo jogador fica para depois (GDD §20.4).
 */
export type Action = 'forward' | 'backward' | 'left' | 'right' | 'run' | 'interact' | 'choice1' | 'choice2' | 'choice3' | 'skipLine' | 'toggleTips' | 'handbrake' | 'resetCar' | 'exitDrive' | 'openMap';

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
  choice1: ['Digit1', 'Numpad1'],
  choice2: ['Digit2', 'Numpad2'],
  choice3: ['Digit3', 'Numpad3'],
  skipLine: ['Enter', 'NumpadEnter'],
  toggleTips: ['KeyH'],
  handbrake: ['Space'],
  resetCar: ['KeyR'],
  exitDrive: ['KeyF'],
  openMap: ['KeyM'],
};

/** Texto exibido na tela de controles. */
export const CONTROL_HINTS: ReadonlyArray<readonly [string, string]> = [
  ['W A S D / setas', 'Andar'],
  ['Shift', 'Correr'],
  ['Mouse', 'Olhar ao redor'],
  ['E / clique', 'Interagir com o que está na mira'],
  ['M', 'Ir para o bairro / abrir mapa de locais'],
  ['1 / 2 / 3', 'Escolher resposta num diálogo'],
  ['Enter', 'Pular fala'],
  ['H', 'Mostrar ou ocultar dicas do tutorial'],
  ['Test drive', 'W/S acelerar e frear (ré) · A/D esterçar · Espaço freio de mão · R recomeçar · F voltar à oficina'],
  ['Esc', 'Pausar e liberar o mouse'],
];
