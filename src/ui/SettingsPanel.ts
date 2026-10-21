import { keyLabel, rebind, REBINDABLE, resolveBindings } from '../core/bindings';
import type { Action } from '../data/controls';
import {
  COLOR_VISIONS,
  DEFAULT_SETTINGS,
  FPS_LIMITS,
  SETTINGS_LIMITS,
  TIME_SPEEDS,
  type ColorVision,
  type GraphicsQuality,
  type Settings,
} from '../save/settings';
import { h } from './dom';

const COLOR_VISION_LABEL: Readonly<Record<ColorVision, string>> = {
  normal: 'Desligado',
  protanopia: 'Protanopia (vermelho)',
  deuteranopia: 'Deuteranopia (verde)',
  tritanopia: 'Tritanopia (azul)',
};

/**
 * Configurações (GDD §20.4, Prompt 24): controles com remapeamento, vídeo,
 * som, acessibilidade e jogo. Só monta o formulário e devolve Settings novas;
 * quem aplica é o Game.
 */
export class SettingsPanel {
  readonly element: HTMLElement;
  private settings: Settings;
  private readonly inputs: {
    sensitivity: HTMLInputElement;
    fov: HTMLInputElement;
    invertY: HTMLInputElement;
    reduceMotion: HTMLInputElement;
    quality: HTMLSelectElement;
    assist: HTMLInputElement;
    volume: HTMLInputElement;
    textScale: HTMLInputElement;
    colorVision: HTMLSelectElement;
    fpsLimit: HTMLSelectElement;
    timeSpeed: HTMLSelectElement;
  };
  private readonly outputs: { sensitivity: HTMLOutputElement; fov: HTMLOutputElement; volume: HTMLOutputElement; textScale: HTMLOutputElement };
  private readonly keyButtons = new Map<Action, HTMLButtonElement>();
  private readonly keyMessage: HTMLElement;
  /** Ação esperando a tecla nova (null = nenhuma). */
  private waiting: Action | null = null;

  constructor(
    initial: Settings,
    private readonly onChange: (settings: Settings) => void,
  ) {
    this.settings = { ...initial };
    const L = SETTINGS_LIMITS;
    const range = (id: string, min: number, max: number, step: number) => h('input', { type: 'range', id, min, max, step });
    const select = (id: string, options: ReadonlyArray<readonly [string, string]>) => h('select', { id }, ...options.map(([value, text]) => h('option', { value, text })));

    this.inputs = {
      sensitivity: range('set-sensitivity', L.mouseSensitivity.min, L.mouseSensitivity.max, L.mouseSensitivity.step),
      fov: range('set-fov', L.fov.min, L.fov.max, L.fov.step),
      invertY: h('input', { type: 'checkbox', id: 'set-invert' }),
      reduceMotion: h('input', { type: 'checkbox', id: 'set-motion' }),
      quality: select('set-quality', [
        ['baixa', 'Baixa (sem sombras)'],
        ['media', 'Média'],
        ['alta', 'Alta'],
      ]),
      assist: h('input', { type: 'checkbox', id: 'set-assist' }),
      volume: range('set-volume', 0, 1, L.sfxVolume.step),
      textScale: range('set-text', L.textScale.min, L.textScale.max, L.textScale.step),
      colorVision: select('set-color', COLOR_VISIONS.map((c) => [c, COLOR_VISION_LABEL[c]] as const)),
      fpsLimit: select('set-fps', FPS_LIMITS.map((f) => [String(f), f === 0 ? 'Sem limite (segue o monitor)' : `${f} quadros por segundo`] as const)),
      timeSpeed: select('set-time', TIME_SPEEDS.map((t) => [String(t), t === 1 ? 'Normal (1 min de jogo por segundo)' : t < 1 ? 'Devagar (metade)' : 'Rápido (o dobro)'] as const)),
    };
    this.outputs = {
      sensitivity: h('output', { for: 'set-sensitivity' }),
      fov: h('output', { for: 'set-fov' }),
      volume: h('output', { for: 'set-volume' }),
      textScale: h('output', { for: 'set-text' }),
    };
    this.keyMessage = h('p', { class: 'settings-key-message', role: 'status', 'aria-live': 'polite', 'data-testid': 'rebind-message' });

    const row = (label: string, forId: string, ...controls: Node[]) =>
      h('div', { class: 'settings-row' }, h('label', { for: forId, text: label }), h('div', { class: 'settings-control' }, ...controls));
    const section = (title: string, ...rows: Node[]) => h('fieldset', { class: 'settings-section' }, h('legend', { text: title }), ...rows);

    const keyRows = REBINDABLE.map(({ action, label }) => {
      const btn = h('button', { type: 'button', class: 'btn btn-key', 'data-rebind': action, 'aria-label': `Tecla de ${label}` });
      btn.addEventListener('click', () => this.startRebind(action));
      this.keyButtons.set(action, btn);
      return h('div', { class: 'settings-row' }, h('span', { class: 'settings-label', text: label }), h('div', { class: 'settings-control' }, btn));
    });
    const resetKeys = h('button', { type: 'button', class: 'btn btn-ghost', 'data-testid': 'reset-keys', text: 'Restaurar teclas' });
    resetKeys.addEventListener('click', () => {
      this.commit({ keyBindings: {} });
      this.keyMessage.textContent = 'Teclas de fábrica restauradas.';
    });
    const reset = h('button', { type: 'button', class: 'btn btn-ghost', text: 'Restaurar tudo' });
    reset.addEventListener('click', () => {
      this.settings = { ...DEFAULT_SETTINGS };
      this.sync();
      this.onChange({ ...this.settings });
    });

    this.element = h(
      'div',
      { class: 'settings' },
      section(
        'Controles',
        row('Sensibilidade do mouse', 'set-sensitivity', this.inputs.sensitivity, this.outputs.sensitivity),
        row('Inverter eixo vertical', 'set-invert', this.inputs.invertY),
        h('p', { class: 'settings-hint', text: 'Clique numa ação e aperte a tecla nova. Se a tecla já for de outra ação, as duas trocam. Esc cancela.' }),
        ...keyRows,
        this.keyMessage,
        h('div', { class: 'settings-actions' }, resetKeys),
      ),
      section(
        'Vídeo',
        row('Qualidade gráfica', 'set-quality', this.inputs.quality),
        row('Campo de visão', 'set-fov', this.inputs.fov, this.outputs.fov),
        row('Limite de FPS', 'set-fps', this.inputs.fpsLimit),
      ),
      section('Som', row('Volume dos efeitos', 'set-volume', this.inputs.volume, this.outputs.volume)),
      section(
        'Acessibilidade',
        row('Tamanho do texto', 'set-text', this.inputs.textScale, this.outputs.textScale),
        row('Modo para daltonismo', 'set-color', this.inputs.colorVision),
        row('Reduzir movimento e tremidas', 'set-motion', this.inputs.reduceMotion),
      ),
      section('Jogo', row('Dicas no diagnóstico', 'set-assist', this.inputs.assist), row('Velocidade do tempo', 'set-time', this.inputs.timeSpeed)),
      h('div', { class: 'settings-actions' }, reset),
    );

    const i = this.inputs;
    i.sensitivity.addEventListener('input', () => this.commit({ mouseSensitivity: Number(i.sensitivity.value) }));
    i.fov.addEventListener('input', () => this.commit({ fov: Number(i.fov.value) }));
    i.invertY.addEventListener('change', () => this.commit({ invertY: i.invertY.checked }));
    i.reduceMotion.addEventListener('change', () => this.commit({ reduceMotion: i.reduceMotion.checked }));
    i.quality.addEventListener('change', () => this.commit({ quality: i.quality.value as GraphicsQuality }));
    i.assist.addEventListener('change', () => this.commit({ diagnosisAssist: i.assist.checked }));
    i.volume.addEventListener('input', () => this.commit({ sfxVolume: Number(i.volume.value) }));
    i.textScale.addEventListener('change', () => this.commit({ textScale: Number(i.textScale.value) }));
    i.textScale.addEventListener('input', () => (this.outputs.textScale.value = this.percent(Number(i.textScale.value))));
    i.colorVision.addEventListener('change', () => this.commit({ colorVision: i.colorVision.value as ColorVision }));
    i.fpsLimit.addEventListener('change', () => this.commit({ fpsLimit: Number(i.fpsLimit.value) as Settings['fpsLimit'] }));
    i.timeSpeed.addEventListener('change', () => this.commit({ timeSpeed: Number(i.timeSpeed.value) as Settings['timeSpeed'] }));
    window.addEventListener('keydown', this.handleRebindKey, true);
    this.sync();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleRebindKey, true);
  }

  private startRebind(action: Action): void {
    this.waiting = action;
    for (const [a, btn] of this.keyButtons) btn.dataset.waiting = String(a === action);
    const btn = this.keyButtons.get(action)!;
    btn.textContent = 'Aperte uma tecla…';
    btn.focus();
  }

  /** Captura a próxima tecla enquanto espera um remapeamento (antes do resto do jogo). */
  private readonly handleRebindKey = (event: KeyboardEvent): void => {
    const action = this.waiting;
    if (!action) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.waiting = null;
    for (const btn of this.keyButtons.values()) btn.dataset.waiting = 'false';
    if (event.code === 'Escape') {
      this.keyMessage.textContent = 'Troca cancelada.';
      this.syncKeys();
      return;
    }
    const result = rebind(this.settings.keyBindings, action, event.code);
    if (!result.ok) {
      this.keyMessage.textContent = result.reason;
      this.syncKeys();
      return;
    }
    const label = REBINDABLE.find((r) => r.action === action)!.label;
    const swapped = result.swappedWith ? REBINDABLE.find((r) => r.action === result.swappedWith)!.label : null;
    this.commit({ keyBindings: result.overrides });
    this.keyMessage.textContent = swapped
      ? `${label}: ${keyLabel(event.code)}. "${swapped}" ficou com a tecla antiga.`
      : `${label}: ${keyLabel(event.code)}.`;
  };

  private commit(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.syncOutputs();
    this.syncKeys();
    this.onChange({ ...this.settings });
  }

  private sync(): void {
    const s = this.settings;
    const i = this.inputs;
    i.sensitivity.value = String(s.mouseSensitivity);
    i.fov.value = String(s.fov);
    i.invertY.checked = s.invertY;
    i.reduceMotion.checked = s.reduceMotion;
    i.quality.value = s.quality;
    i.assist.checked = s.diagnosisAssist;
    i.volume.value = String(s.sfxVolume);
    i.textScale.value = String(s.textScale);
    i.colorVision.value = s.colorVision;
    i.fpsLimit.value = String(s.fpsLimit);
    i.timeSpeed.value = String(s.timeSpeed);
    this.syncOutputs();
    this.syncKeys();
  }

  private syncKeys(): void {
    const bindings = resolveBindings(this.settings.keyBindings);
    for (const [action, btn] of this.keyButtons) {
      if (this.waiting === action) continue;
      btn.textContent = keyLabel(bindings[action][0]!);
    }
  }

  private syncOutputs(): void {
    const s = this.settings;
    this.outputs.sensitivity.value = `${s.mouseSensitivity.toFixed(2).replace('.', ',')}×`;
    this.outputs.fov.value = `${s.fov}°`;
    this.outputs.volume.value = `${Math.round(s.sfxVolume * 100)}%`;
    this.outputs.textScale.value = this.percent(s.textScale);
  }

  private percent(n: number): string {
    return `${Math.round(n * 100)}%`;
  }
}
