import { CONTROL_HINTS } from '../data/controls';
import type { Settings } from '../save/settings';
import { h } from './dom';
import { SettingsPanel } from './SettingsPanel';

export type MenuMode = 'title' | 'pause';
type Panel = 'main' | 'controls' | 'settings';

export interface MenuCallbacks {
  onStart(): void;
  onResume(): void;
  onQuitToTitle(): void;
  onSettingsChange(settings: Settings): void;
}

/**
 * Tela inicial e tela de pausa (mesmo componente, modos diferentes).
 * Botões de verdade (<button>), então funcionam com Tab/Enter também.
 */
export class MenuScreen {
  readonly element: HTMLElement;
  private mode: MenuMode = 'title';
  private panel: Panel = 'main';
  private readonly heading: HTMLElement;
  private readonly tagline: HTMLElement;
  private readonly message: HTMLElement;
  private readonly mainPanel: HTMLElement;
  private readonly controlsPanel: HTMLElement;
  private readonly settingsPanel: HTMLElement;
  private readonly primary: HTMLButtonElement;
  private readonly quit: HTMLButtonElement;

  constructor(parent: HTMLElement, settings: Settings, callbacks: MenuCallbacks) {
    this.heading = h('h1', { class: 'menu-title' });
    this.tagline = h('p', { class: 'menu-tagline' });
    this.message = h('p', { class: 'menu-message', role: 'alert', 'aria-live': 'assertive', hidden: true });

    this.primary = h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'menu-primary' });
    this.primary.addEventListener('click', () => (this.mode === 'title' ? callbacks.onStart() : callbacks.onResume()));
    const controlsBtn = h('button', { type: 'button', class: 'btn', text: 'Controles' });
    controlsBtn.addEventListener('click', () => this.showPanel('controls'));
    const settingsBtn = h('button', { type: 'button', class: 'btn', text: 'Configurações' });
    settingsBtn.addEventListener('click', () => this.showPanel('settings'));
    this.quit = h('button', { type: 'button', class: 'btn btn-ghost', text: 'Sair para o menu inicial' });
    this.quit.addEventListener('click', () => callbacks.onQuitToTitle());

    this.mainPanel = h('nav', { class: 'menu-buttons', 'aria-label': 'Menu principal' }, this.primary, controlsBtn, settingsBtn, this.quit);

    const back = () => {
      const btn = h('button', { type: 'button', class: 'btn btn-ghost', text: '← Voltar' });
      btn.addEventListener('click', () => this.showPanel('main'));
      return btn;
    };

    this.controlsPanel = h(
      'section',
      { class: 'menu-panel', 'aria-label': 'Controles', hidden: true },
      h('h2', { text: 'Controles' }),
      h(
        'dl',
        { class: 'controls-list' },
        ...CONTROL_HINTS.flatMap(([keys, action]) => [h('dt', {}, h('kbd', { text: keys })), h('dd', { text: action })]),
      ),
      h('p', { class: 'menu-note', text: 'Clique em "Iniciar" para capturar o mouse. Pressione Esc a qualquer momento para pausar e liberá-lo.' }),
      back(),
    );

    const settingsForm = new SettingsPanel(settings, (s) => callbacks.onSettingsChange(s));
    this.settingsPanel = h('section', { class: 'menu-panel', 'aria-label': 'Configurações', hidden: true }, h('h2', { text: 'Configurações' }), settingsForm.element, back());

    this.element = h(
      'div',
      { id: 'menu', class: 'menu-overlay', 'data-testid': 'menu' },
      h(
        'div',
        { class: 'menu-card' },
        h('div', { class: 'menu-brand' }, this.heading, this.tagline),
        this.message,
        this.mainPanel,
        this.controlsPanel,
        this.settingsPanel,
        h('p', { class: 'menu-footer', text: 'Protótipo técnico (fundação) · conteúdo e modelos temporários' }),
      ),
    );
    parent.append(this.element);
    this.element.addEventListener('keydown', this.handleKeyDown);
    this.setMode('title');
  }

  setMode(mode: MenuMode): void {
    this.mode = mode;
    if (mode === 'title') {
      this.heading.textContent = 'Simulador de Mecânico';
      this.tagline.textContent = 'Seu tio deixou a oficina — e uma dívida no banco. Hora de pôr a mão na graxa.';
      this.primary.textContent = 'Iniciar jogo';
      this.quit.hidden = true;
    } else {
      this.heading.textContent = 'Pausado';
      this.tagline.textContent = 'O relógio da oficina está parado.';
      this.primary.textContent = 'Continuar';
      this.quit.hidden = false;
    }
    this.showPanel('main');
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
    if (visible) {
      this.showPanel('main');
      // Foco no botão principal para Enter já funcionar.
      requestAnimationFrame(() => this.primary.focus({ preventScroll: true }));
    }
  }

  setBusy(busy: boolean): void {
    this.primary.disabled = busy;
  }

  showMessage(text: string): void {
    this.message.textContent = text;
    this.message.hidden = text.length === 0;
  }

  dispose(): void {
    this.element.removeEventListener('keydown', this.handleKeyDown);
    this.element.remove();
  }

  private showPanel(panel: Panel): void {
    this.panel = panel;
    this.mainPanel.hidden = panel !== 'main';
    this.controlsPanel.hidden = panel !== 'controls';
    this.settingsPanel.hidden = panel !== 'settings';
    if (panel !== 'main') {
      const first = (panel === 'controls' ? this.controlsPanel : this.settingsPanel).querySelector<HTMLElement>('input, select, button');
      first?.focus({ preventScroll: true });
    }
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.panel !== 'main') {
      event.preventDefault();
      this.showPanel('main');
      this.primary.focus({ preventScroll: true });
    }
  };
}
