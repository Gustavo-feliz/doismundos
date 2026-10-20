import { CONTROL_HINTS } from '../data/controls';
import type { Settings } from '../save/settings';
import { h } from './dom';
import { SettingsPanel } from './SettingsPanel';

export type MenuMode = 'title' | 'pause';
type Panel = 'main' | 'controls' | 'settings' | 'saves';

export interface MenuCallbacks {
  onStart(): void;
  onResume(): void;
  onQuitToTitle(): void;
  onSettingsChange(settings: Settings): void;
  /** Abrir a lista de saves para salvar ou carregar. */
  onOpenSaves(mode: 'save' | 'load'): void;
  /** Tela inicial: continuar do save mais recente. */
  onContinueSaved(): void;
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
  private readonly continueSaved: HTMLButtonElement;
  private readonly saveBtn: HTMLButtonElement;
  private readonly savesPanel: HTMLElement;

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
    this.continueSaved = h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'menu-continue', hidden: true }, 'Continuar jogo salvo');
    this.continueSaved.addEventListener('click', () => callbacks.onContinueSaved());
    this.saveBtn = h('button', { type: 'button', class: 'btn', 'data-testid': 'menu-save', text: 'Salvar jogo' });
    this.saveBtn.addEventListener('click', () => callbacks.onOpenSaves('save'));
    const loadBtn = h('button', { type: 'button', class: 'btn', 'data-testid': 'menu-load', text: 'Carregar jogo' });
    loadBtn.addEventListener('click', () => callbacks.onOpenSaves('load'));
    this.savesPanel = h('div', { hidden: true });

    this.mainPanel = h(
      'nav',
      { class: 'menu-buttons', 'aria-label': 'Menu principal' },
      this.continueSaved,
      this.primary,
      this.saveBtn,
      loadBtn,
      controlsBtn,
      settingsBtn,
      this.quit,
    );

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
        this.savesPanel,
        h('p', { class: 'menu-footer', text: 'Protótipo · conteúdo, modelos e sons temporários' }),
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
      this.saveBtn.hidden = true;
    } else {
      this.heading.textContent = 'Pausado';
      this.tagline.textContent = 'O relógio da oficina está parado.';
      this.primary.textContent = 'Continuar';
      this.quit.hidden = false;
      this.saveBtn.hidden = false;
      this.continueSaved.hidden = true;
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
    this.continueSaved.disabled = busy;
  }

  /** Tela inicial: mostra "Continuar jogo salvo" quando há um save carregável. */
  setContinueAvailable(label: string | null): void {
    this.continueSaved.hidden = this.mode !== 'title' || label === null;
    this.continueSaved.title = label ?? '';
  }

  /** Mostra a lista de saves (o conteúdo vem pronto de fora). */
  showSaves(content: HTMLElement): void {
    if (content.parentElement !== this.savesPanel) this.savesPanel.replaceChildren(content);
    this.showPanel('saves');
  }

  showMain(): void {
    this.showPanel('main');
    this.primary.focus({ preventScroll: true });
  }

  showMessage(text: string, kind: 'ok' | 'erro' = 'erro'): void {
    this.message.textContent = text;
    this.message.dataset.kind = kind;
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
    this.savesPanel.hidden = panel !== 'saves';
    if (panel !== 'main') {
      const target = panel === 'controls' ? this.controlsPanel : panel === 'settings' ? this.settingsPanel : this.savesPanel;
      target.querySelector<HTMLElement>('input, select, button')?.focus({ preventScroll: true });
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
