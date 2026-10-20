import { MOUSE_LEFT, type Action, type KeyBindings } from '../data/controls';

export interface MoveIntent {
  /** -1 (trás) a 1 (frente) */
  forward: number;
  /** -1 (esquerda) a 1 (direita) */
  right: number;
  run: boolean;
}

export type PointerLockResult = { ok: true } | { ok: false; reason: string };

/**
 * Alguns navegadores mandam um movementX/Y gigante no primeiro evento após
 * capturar o ponteiro. Descartamos saltos acima disso para a câmera não "pular".
 */
const MAX_MOUSE_DELTA_PER_EVENT = 250;

type LockableElement = HTMLElement & {
  requestPointerLock(options?: { unadjustedMovement?: boolean }): Promise<void> | void;
};

/**
 * Teclado + mouse com captura de ponteiro (Pointer Lock).
 * Só guarda estado; quem consome decide o que fazer em cada estado do jogo.
 */
export class Input {
  private readonly pressed = new Set<string>();
  /** Teclas apertadas neste quadro (sem repetição automática). Limpo em endFrame(). */
  private readonly justPressed = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  /** Só para testes automatizados: aceita mouse sem capturar o ponteiro. */
  private lockBypass = false;
  private readonly cleanups: Array<() => void> = [];

  constructor(
    private readonly lockTarget: HTMLElement,
    private readonly bindings: KeyBindings,
    private readonly onLockChange: (locked: boolean) => void,
  ) {
    this.listen(window, 'keydown', this.handleKeyDown);
    this.listen(window, 'keyup', this.handleKeyUp);
    this.listen(window, 'blur', this.clearState);
    this.listen(document, 'visibilitychange', this.clearState);
    this.listen(document, 'mousemove', this.handleMouseMove);
    this.listen(document, 'mousedown', this.handleMouseDown);
    this.listen(document, 'mouseup', this.handleMouseUp);
    this.listen(document, 'pointerlockchange', this.handleLockChange);
  }

  /** true se a ação foi acionada neste quadro (borda de subida). */
  wasActionPressed(action: Action): boolean {
    return this.bindings[action].some((code) => this.justPressed.has(code));
  }

  /** Chamar uma vez ao fim de cada quadro. */
  endFrame(): void {
    this.justPressed.clear();
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.lockTarget;
  }

  setLockBypass(enabled: boolean): void {
    this.lockBypass = enabled;
  }

  /** true em testes automatizados (mouse sem captura). */
  get lockBypassEnabled(): boolean {
    return this.lockBypass;
  }

  isActionDown(action: Action): boolean {
    return this.bindings[action].some((code) => this.pressed.has(code));
  }

  getMoveIntent(): MoveIntent {
    const forward = (this.isActionDown('forward') ? 1 : 0) - (this.isActionDown('backward') ? 1 : 0);
    const right = (this.isActionDown('right') ? 1 : 0) - (this.isActionDown('left') ? 1 : 0);
    return { forward, right, run: this.isActionDown('run') };
  }

  /** Devolve o movimento do mouse acumulado desde a última chamada e zera. */
  consumeMouseDelta(): { x: number; y: number } {
    const delta = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return delta;
  }

  /** Solta todas as teclas e descarta o mouse acumulado. */
  reset(): void {
    this.clearState();
  }

  /**
   * Pede a captura do ponteiro. Precisa ser chamado dentro de um gesto do
   * usuário (clique). Tenta entrada "crua" (sem aceleração do sistema) e cai
   * para o modo normal se o navegador não suportar.
   */
  async requestPointerLock(): Promise<PointerLockResult> {
    if (this.pointerLocked) return { ok: true };
    if (typeof (this.lockTarget as Partial<LockableElement>).requestPointerLock !== 'function') {
      return { ok: false, reason: 'Este navegador não suporta captura do mouse.' };
    }
    try {
      await this.callRequestLock({ unadjustedMovement: true });
      return { ok: true };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotSupportedError') {
        try {
          await this.callRequestLock();
          return { ok: true };
        } catch (fallbackError) {
          return { ok: false, reason: describeLockError(fallbackError) };
        }
      }
      return { ok: false, reason: describeLockError(error) };
    }
  }

  exitPointerLock(): void {
    if (this.pointerLocked) document.exitPointerLock();
  }

  dispose(): void {
    this.exitPointerLock();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.clearState();
  }

  private callRequestLock(options?: { unadjustedMovement: boolean }): Promise<void> {
    const target = this.lockTarget as LockableElement;
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        document.removeEventListener('pointerlockerror', onError);
        document.removeEventListener('pointerlockchange', onChange);
        if (error === undefined) resolve();
        else reject(error);
      };
      const onError = () => finish(new DOMException('pointerlockerror', 'SecurityError'));
      const onChange = () => {
        if (this.pointerLocked) finish();
      };
      document.addEventListener('pointerlockerror', onError);
      document.addEventListener('pointerlockchange', onChange);
      try {
        // Navegadores novos retornam Promise; os antigos só disparam eventos.
        const result = target.requestPointerLock(options);
        if (result instanceof Promise) result.then(() => finish(), (error: unknown) => finish(error ?? new Error('pointer lock')));
      } catch (error) {
        finish(error);
      }
    });
  }

  private listen(target: EventTarget, type: string, handler: (event: Event) => void): void {
    target.addEventListener(type, handler);
    this.cleanups.push(() => target.removeEventListener(type, handler));
  }

  private readonly handleKeyDown = (event: Event): void => {
    const e = event as KeyboardEvent;
    if (isTypingTarget(e.target)) return;
    if (!e.repeat) this.justPressed.add(e.code);
    this.pressed.add(e.code);
    // Evita rolar a página com setas/espaço enquanto joga.
    if (this.pointerLocked && (e.code.startsWith('Arrow') || e.code === 'Space')) e.preventDefault();
  };

  private readonly handleKeyUp = (event: Event): void => {
    this.pressed.delete((event as KeyboardEvent).code);
  };

  private readonly handleMouseMove = (event: Event): void => {
    if (!this.pointerLocked && !this.lockBypass) return;
    const e = event as MouseEvent;
    if (Math.abs(e.movementX) > MAX_MOUSE_DELTA_PER_EVENT || Math.abs(e.movementY) > MAX_MOUSE_DELTA_PER_EVENT) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  private readonly handleMouseDown = (event: Event): void => {
    // Só conta clique dentro do jogo (com o mouse capturado), não nos menus.
    if ((event as MouseEvent).button !== 0 || (!this.pointerLocked && !this.lockBypass)) return;
    if (this.lockBypass && event.target !== this.lockTarget) return;
    this.justPressed.add(MOUSE_LEFT);
    this.pressed.add(MOUSE_LEFT);
  };

  private readonly handleMouseUp = (event: Event): void => {
    if ((event as MouseEvent).button === 0) this.pressed.delete(MOUSE_LEFT);
  };

  private readonly handleLockChange = (): void => {
    // Ao perder a captura, solta todas as teclas para o jogador não sair andando sozinho.
    if (!this.pointerLocked) this.clearState();
    this.onLockChange(this.pointerLocked);
  };

  private readonly clearState = (): void => {
    this.pressed.clear();
    this.justPressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function describeLockError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'SecurityError') {
    // O Chrome bloqueia recapturar o mouse por ~1 s depois do Esc.
    return 'O navegador ainda não liberou o mouse. Aguarde um instante e clique de novo.';
  }
  return 'Não foi possível capturar o mouse. Clique em "Continuar" para tentar de novo.';
}
