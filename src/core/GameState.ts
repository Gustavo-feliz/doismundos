/**
 * 'panel' = painel aberto (ex.: inspeção): cursor livre, jogador parado, relógio parado.
 * 'driving' = test drive no pátio (Prompt 13): atividade separada da oficina.
 * 'cutscene' = cena de cinema (Prompt 23): a abertura, antes do jogo.
 */
export type GameStateName = 'loading' | 'menu' | 'playing' | 'paused' | 'panel' | 'driving' | 'cutscene' | 'error';

/** Transições permitidas. Qualquer estado pode ir para 'error'. */
const TRANSITIONS: Readonly<Record<GameStateName, readonly GameStateName[]>> = {
  loading: ['menu', 'error'],
  menu: ['playing', 'cutscene', 'error'],
  playing: ['paused', 'panel', 'driving', 'error'],
  paused: ['playing', 'driving', 'menu', 'error'],
  driving: ['playing', 'paused', 'error'],
  cutscene: ['playing', 'menu', 'error'],
  panel: ['playing', 'paused', 'error'],
  error: [],
};

export class GameStateMachine {
  private state: GameStateName = 'loading';

  constructor(private readonly onChange?: (from: GameStateName, to: GameStateName) => void) {}

  get current(): GameStateName {
    return this.state;
  }

  is(...names: GameStateName[]): boolean {
    return names.includes(this.state);
  }

  canTransition(to: GameStateName): boolean {
    return TRANSITIONS[this.state].includes(to);
  }

  /** Faz a transição se ela for válida. Retorna false (sem lançar erro) se não for. */
  transition(to: GameStateName): boolean {
    if (!this.canTransition(to)) return false;
    const from = this.state;
    this.state = to;
    this.onChange?.(from, to);
    return true;
  }
}
