import { DEFAULT_BINDINGS, MOUSE_LEFT, type Action, type KeyBindings } from '../data/controls';

/**
 * Remapeamento de teclas (GDD §20.4, Prompt 24). Regras puras.
 * O jogador troca a tecla PRINCIPAL de uma ação; as alternativas de fábrica
 * (setas, Shift direito, clique do mouse) continuam valendo.
 */

/** Ações que o jogador pode remapear, na ordem da tela, com o nome mostrado. */
export const REBINDABLE: ReadonlyArray<{ action: Action; label: string; group: 'andar' | 'oficina' | 'dialogo' | 'direcao' }> = [
  { action: 'forward', label: 'Andar para a frente / acelerar', group: 'andar' },
  { action: 'backward', label: 'Andar para trás / frear e ré', group: 'andar' },
  { action: 'left', label: 'Andar para a esquerda / esterçar', group: 'andar' },
  { action: 'right', label: 'Andar para a direita / esterçar', group: 'andar' },
  { action: 'run', label: 'Correr', group: 'andar' },
  { action: 'interact', label: 'Interagir', group: 'oficina' },
  { action: 'openMap', label: 'Bairro / mapa', group: 'oficina' },
  { action: 'toggleTips', label: 'Mostrar/ocultar dicas', group: 'oficina' },
  { action: 'skipLine', label: 'Pular fala', group: 'dialogo' },
  { action: 'handbrake', label: 'Freio de mão', group: 'direcao' },
  { action: 'resetCar', label: 'Recomeçar o test drive', group: 'direcao' },
  { action: 'exitDrive', label: 'Voltar à oficina', group: 'direcao' },
];

/** Teclas que não podem ser usadas: pausa, abas do computador e respostas de diálogo. */
export const RESERVED_KEYS: ReadonlySet<string> = new Set(['Escape', 'Tab', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'F5', 'F11', 'F12', 'MetaLeft', 'MetaRight']);

/** Troca escolhida pelo jogador: ação → código da tecla principal. */
export type BindingOverrides = Partial<Record<Action, string>>;

const REBINDABLE_ACTIONS = new Set(REBINDABLE.map((r) => r.action));

/** Mapa final: a tecla trocada vira a principal; as alternativas de fábrica continuam. */
export function resolveBindings(overrides: BindingOverrides): KeyBindings {
  const out = {} as Record<Action, string[]>;
  for (const action of Object.keys(DEFAULT_BINDINGS) as Action[]) {
    const defaults = DEFAULT_BINDINGS[action];
    const chosen = REBINDABLE_ACTIONS.has(action) ? overrides[action] : undefined;
    out[action] = chosen ? [chosen, ...defaults.slice(1).filter((c) => c !== chosen)] : [...defaults];
  }
  return out;
}

/** Tecla principal de uma ação. */
export function primaryKey(bindings: KeyBindings, action: Action): string {
  return bindings[action][0]!;
}

export type RebindResult =
  | { ok: true; overrides: BindingOverrides; swappedWith: Action | null }
  | { ok: false; reason: string };

/**
 * Põe `code` como tecla principal de `action`. Se outra ação já usava essa
 * tecla como principal, as duas trocam (nada fica sem tecla).
 */
export function rebind(overrides: BindingOverrides, action: Action, code: string): RebindResult {
  if (!REBINDABLE_ACTIONS.has(action)) return { ok: false, reason: 'Essa ação não pode ser trocada.' };
  if (RESERVED_KEYS.has(code) || code === MOUSE_LEFT) return { ok: false, reason: `${keyLabel(code)} é reservada pelo jogo.` };
  const current = resolveBindings(overrides);
  const previous = primaryKey(current, action);
  if (previous === code) return { ok: true, overrides, swappedWith: null };
  const other = REBINDABLE.map((r) => r.action).find((a) => a !== action && primaryKey(current, a) === code) ?? null;
  const next: BindingOverrides = { ...overrides, [action]: code };
  if (other) next[other] = previous;
  return { ok: true, overrides: clean(next), swappedWith: other };
}

/** Tira trocas que são iguais à tecla de fábrica (o save fica limpo). */
function clean(overrides: BindingOverrides): BindingOverrides {
  const out: BindingOverrides = {};
  for (const [action, code] of Object.entries(overrides) as Array<[Action, string]>) {
    if (code && code !== DEFAULT_BINDINGS[action][0]) out[action] = code;
  }
  return out;
}

/** Confere trocas vindas do armazenamento: descarta as inválidas e as duplicadas. */
export function sanitizeOverrides(raw: unknown): BindingOverrides {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  let result: BindingOverrides = {};
  for (const [action, code] of Object.entries(raw as Record<string, unknown>)) {
    if (!REBINDABLE_ACTIONS.has(action as Action) || typeof code !== 'string' || !/^[A-Za-z0-9]+$/.test(code)) continue;
    const r = rebind(result, action as Action, code);
    if (r.ok) result = r.overrides;
  }
  return result;
}

const NAMED: Readonly<Record<string, string>> = {
  Space: 'Espaço',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift dir.',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl dir.',
  AltLeft: 'Alt',
  AltRight: 'Alt Gr',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Backspace: 'Backspace',
  CapsLock: 'Caps Lock',
  Escape: 'Esc',
  Tab: 'Tab',
  Mouse0: 'Clique',
  Semicolon: 'Ç',
  Quote: '~',
  BracketLeft: '´',
  BracketRight: '[',
  Backslash: ']',
  Comma: ',',
  Period: '.',
  Slash: ';',
  IntlRo: '/',
  Minus: '-',
  Equal: '=',
  Backquote: "'",
};

/** Nome curto de uma tecla para mostrar na tela (teclado ABNT2). */
export function keyLabel(code: string): string {
  if (NAMED[code]) return NAMED[code]!;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  if (/^F\d{1,2}$/.test(code)) return code;
  return code;
}
