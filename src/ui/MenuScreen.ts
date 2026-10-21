import { DEFAULT_PROFILE, PRONOUN_LABEL, type PlayerProfile } from '../cinematics/types';
import { GAME_VERSION, shortVersion } from '../core/version';
import { icon, type IconName } from './icons';
import { controlHints } from './keys';
import type { Settings } from '../save/settings';
import { h } from './dom';
import { SettingsPanel } from './SettingsPanel';

export type MenuMode = 'title' | 'pause';
type Panel = 'main' | 'controls' | 'settings' | 'saves' | 'setup';

export interface MenuCallbacks {
  /** Jogo novo com o perfil escolhido; `watchIntro` = ver a abertura. */
  onNewGame(name: string, pronoun: PlayerProfile['pronoun'], watchIntro: boolean): void;
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
  private readonly subtitle: HTMLElement;
  private readonly primaryLabel: HTMLElement;
  private readonly primaryIcon: HTMLElement;
  private readonly continueMeta: HTMLElement;
  private readonly tagline: HTMLElement;
  private readonly message: HTMLElement;
  private readonly mainPanel: HTMLElement;
  private readonly controlsPanel: HTMLElement;
  private readonly settingsPanel: HTMLElement;
  private readonly controlsList: HTMLElement;
  private readonly setupPanel: HTMLElement;
  private readonly setupName: HTMLInputElement;
  private readonly primary: HTMLButtonElement;
  private readonly quit: HTMLButtonElement;
  private readonly kicker: HTMLElement;
  private readonly continueSaved: HTMLButtonElement;
  private readonly saveBtn: HTMLButtonElement;
  private readonly savesPanel: HTMLElement;

  constructor(parent: HTMLElement, settings: Settings, callbacks: MenuCallbacks) {
    this.heading = h('h1', { class: 'menu-title' });
    this.kicker = h('p', { class: 'menu-kicker' }, h('span', { text: 'Oficina do Seu Zé · São Cristóvão, RJ' }));
    this.subtitle = h('p', { class: 'menu-subtitle', text: 'Simulador de Mecânico' });
    this.tagline = h('p', { class: 'menu-tagline' });
    this.message = h('p', { class: 'menu-message', role: 'alert', 'aria-live': 'assertive', hidden: true });

    // Botões do menu: ícone à esquerda e o texto (referência: docs/coordenacao/referencias/menu-repaginado.png).
    const menuBtn = (label: string, iconName: IconName, attrs: Record<string, string | boolean> = {}) =>
      h('button', { type: 'button', class: 'btn menu-btn', ...attrs }, h('span', { class: 'menu-btn-icon' }, icon(iconName)), h('span', { class: 'menu-btn-label', text: label }));
    this.primaryLabel = h('span', { class: 'menu-btn-label' });
    this.primaryIcon = h('span', { class: 'menu-btn-end' }, icon('seta'));
    this.primary = h('button', { type: 'button', class: 'btn btn-primary menu-btn menu-btn-primary', 'data-testid': 'menu-primary' }, this.primaryLabel, this.primaryIcon);
    this.primary.addEventListener('click', () => (this.mode === 'title' ? this.showPanel('setup') : callbacks.onResume()));
    const controlsBtn = menuBtn('Controles', 'teclado');
    controlsBtn.addEventListener('click', () => this.showPanel('controls'));
    const settingsBtn = menuBtn('Configurações', 'engrenagem');
    settingsBtn.addEventListener('click', () => this.showPanel('settings'));
    this.quit = menuBtn('Sair para o menu inicial', 'sair', { class: 'btn btn-ghost menu-btn' });
    this.quit.addEventListener('click', () => callbacks.onQuitToTitle());
    this.continueMeta = h('span', { class: 'menu-btn-meta' });
    this.continueSaved = menuBtn('Continuar', 'play', { 'data-testid': 'menu-continue', hidden: true });
    this.continueSaved.querySelector('.menu-btn-label')?.append(this.continueMeta);
    this.continueSaved.addEventListener('click', () => callbacks.onContinueSaved());
    this.saveBtn = menuBtn('Salvar jogo', 'salvar', { 'data-testid': 'menu-save' });
    this.saveBtn.addEventListener('click', () => callbacks.onOpenSaves('save'));
    const loadBtn = menuBtn('Carregar jogo', 'pasta', { 'data-testid': 'menu-load' });
    loadBtn.addEventListener('click', () => callbacks.onOpenSaves('load'));
    this.savesPanel = h('div', { hidden: true });

    this.mainPanel = h(
      'nav',
      { class: 'menu-buttons', 'aria-label': 'Menu principal' },
      this.primary,
      this.continueSaved,
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

    this.controlsList = h('dl', { class: 'controls-list' });
    this.controlsPanel = h(
      'section',
      { class: 'menu-panel', 'aria-label': 'Controles', hidden: true },
      h('h2', { text: 'Controles' }),
      this.controlsList,
      h('p', { class: 'menu-note', text: 'Clique em "Iniciar" para capturar o mouse. Pressione Esc a qualquer momento para pausar e liberá-lo.' }),
      back(),
    );

    // Jogo novo (Prompt 23): quem é você na história, e ver ou pular a abertura.
    this.setupName = h('input', { type: 'text', id: 'setup-name', maxlength: 20, autocomplete: 'off', placeholder: DEFAULT_PROFILE.name, 'data-testid': 'setup-name' });
    const pronounInputs = (Object.keys(PRONOUN_LABEL) as Array<PlayerProfile['pronoun']>).map((p) =>
      h('label', { class: 'setup-choice' }, h('input', { type: 'radio', name: 'setup-pronoun', value: p, checked: p === DEFAULT_PROFILE.pronoun, 'data-testid': `setup-pronoun-${p}` }), h('span', { text: PRONOUN_LABEL[p] })),
    );
    const pronoun = () => (this.setupPanel.querySelector<HTMLInputElement>('input[name="setup-pronoun"]:checked')?.value ?? DEFAULT_PROFILE.pronoun) as PlayerProfile['pronoun'];
    const watch = h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'start-story', text: 'Ver a história' });
    watch.addEventListener('click', () => callbacks.onNewGame(this.setupName.value, pronoun(), true));
    const skip = h('button', { type: 'button', class: 'btn', 'data-testid': 'skip-story', text: 'Pular a abertura' });
    skip.addEventListener('click', () => callbacks.onNewGame(this.setupName.value, pronoun(), false));
    this.setupPanel = h(
      'section',
      { class: 'menu-panel setup-panel', 'aria-label': 'Novo jogo', hidden: true },
      h('h2', { text: 'Novo jogo' }),
      h('label', { class: 'setup-label', for: 'setup-name', text: 'Seu nome' }),
      this.setupName,
      h('fieldset', { class: 'setup-fieldset' }, h('legend', { class: 'setup-label', text: 'Como o Seu Zé te chama' }), ...pronounInputs),
      h('div', { class: 'menu-buttons' }, watch, skip),
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
        h('div', { class: 'menu-brand' }, this.kicker, this.heading, this.subtitle, h('span', { class: 'menu-rule', 'aria-hidden': 'true' }), this.tagline),
        this.message,
        this.mainPanel,
        this.controlsPanel,
        this.settingsPanel,
        this.savesPanel,
        this.setupPanel,
        h('p', { class: 'menu-footer', title: 'Conteúdo, modelos e sons ainda temporários', text: `Protótipo · versão ${shortVersion(GAME_VERSION)}` }),
      ),
    );
    parent.append(this.element);
    this.element.addEventListener('keydown', this.handleKeyDown);
    this.setMode('title');
  }

  setMode(mode: MenuMode): void {
    // Recado da tela anterior (ex.: "Jogo salvo" na pausa) não vale na outra tela.
    if (mode !== this.mode) this.showMessage('');
    this.mode = mode;
    if (mode === 'title') {
      this.heading.replaceChildren(
        h('span', { class: 'menu-title-main', text: 'Oficina' }),
        h('span', { class: 'menu-title-main' }, 'do Seu ', h('span', { class: 'menu-title-accent', text: 'Zé' })),
      );
      this.heading.setAttribute('aria-label', 'Oficina do Seu Zé');
      this.kicker.hidden = false;
      this.subtitle.hidden = false;
      this.tagline.textContent = 'Sua oficina. Suas regras. Seu corre.';
      this.primaryLabel.textContent = 'Iniciar jogo';
      this.primaryIcon.hidden = false;
      this.quit.hidden = true;
      this.saveBtn.hidden = true;
    } else {
      this.heading.textContent = 'Pausado';
      this.heading.removeAttribute('aria-label');
      this.kicker.hidden = true;
      this.subtitle.hidden = true;
      this.tagline.textContent = 'O relógio da oficina está parado.';
      this.primaryLabel.textContent = 'Continuar';
      this.primaryIcon.hidden = true;
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
    this.continueMeta.textContent = label ?? '';
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
    // Com um painel interno aberto, o título encolhe e sobra espaço (CSS por data-panel).
    this.element.dataset.panel = panel;
    if (panel === 'controls') {
      // Montada na hora: mostra as teclas que o jogador escolheu.
      this.controlsList.replaceChildren(...controlHints().flatMap(([keys, action]) => [h('dt', {}, h('kbd', { text: keys })), h('dd', { text: action })]));
    }
    this.mainPanel.hidden = panel !== 'main';
    this.controlsPanel.hidden = panel !== 'controls';
    this.settingsPanel.hidden = panel !== 'settings';
    this.savesPanel.hidden = panel !== 'saves';
    this.setupPanel.hidden = panel !== 'setup';
    if (panel === 'setup') this.setupName.focus();
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
