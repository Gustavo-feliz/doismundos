import { h, setText } from './dom';
import { kbd } from './keys';

export interface CinematicView {
  /** Fundo preto cobrindo a cena 3D (tomadas no escuro). */
  dark: boolean;
  title: string | null;
  speaker: string;
  speakerId: string;
  text: string | null;
  options: readonly string[] | null;
  /** 0–1: quanto do "segurar Esc" já foi. */
  skipProgress: number;
}

/**
 * Tela da cena de cinema (Prompt 23): faixas de cinema, letreiro, legenda
 * sempre ligada, escolhas (clique ou 1/2/3), "segure Esc para pular" e o
 * cartão final com o botão que entra no jogo (o clique captura o mouse).
 */
export class CinematicOverlay {
  readonly element: HTMLElement;
  private readonly darkLayer: HTMLElement;
  private readonly title: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly speaker: HTMLElement;
  private readonly text: HTMLElement;
  private readonly options: HTMLElement;
  private readonly skipFill: HTMLElement;
  private readonly endCard: HTMLElement;
  private readonly skipHint: HTMLElement;
  private optionsKey = '';

  constructor(
    parent: HTMLElement,
    private readonly callbacks: { onChoose(number: number): void; onStart(): void },
  ) {
    this.darkLayer = h('div', { class: 'cine-dark' });
    this.title = h('div', { class: 'cine-title', 'data-testid': 'cine-title', hidden: true });
    this.speaker = h('div', { class: 'cine-speaker' });
    this.text = h('p', { class: 'cine-text', 'data-testid': 'cine-text' });
    this.options = h('ol', { class: 'cine-options', 'data-testid': 'cine-options', hidden: true });
    this.subtitle = h('div', { class: 'cine-subtitle', role: 'log', 'aria-live': 'polite', hidden: true }, this.speaker, this.text, this.options);
    this.skipFill = h('span', { class: 'cine-skip-fill' });
    const start = h('button', { type: 'button', class: 'btn btn-primary cine-start', 'data-testid': 'intro-start' }, 'Começar a trabalhar');
    start.addEventListener('click', () => this.callbacks.onStart());
    this.endCard = h(
      'div',
      { class: 'cine-end', hidden: true, 'data-testid': 'intro-end' },
      h('p', { class: 'cine-end-kicker', text: 'Oficina do Seu Zé · São Cristóvão, RJ' }),
      h('p', { class: 'cine-end-text', text: 'Primeiro dia de trabalho.' }),
      start,
    );
    this.element = h(
      'div',
      { class: 'cine', 'data-testid': 'cinematic', hidden: true },
      this.darkLayer,
      h('div', { class: 'cine-bar cine-bar-top' }),
      h('div', { class: 'cine-bar cine-bar-bottom' }),
      this.title,
      this.subtitle,
      (this.skipHint = h('div', { class: 'cine-skip' }, 'Segure ', h('kbd', { text: 'Esc' }), ' para pular · ', kbd('skipLine'), ' avança a fala', h('span', { class: 'cine-skip-bar' }, this.skipFill))),
      this.endCard,
    );
    parent.append(this.element);
  }

  show(): void {
    this.element.hidden = false;
    this.endCard.hidden = true;
    this.skipHint.hidden = false;
  }

  hide(): void {
    this.element.hidden = true;
  }

  get isVisible(): boolean {
    return !this.element.hidden;
  }

  render(v: CinematicView): void {
    this.darkLayer.dataset.on = String(v.dark);
    this.title.hidden = !v.title;
    if (v.title) setText(this.title, v.title);
    this.subtitle.hidden = !v.text;
    if (v.text) {
      setText(this.speaker, v.speaker);
      this.speaker.hidden = !v.speaker;
      this.subtitle.dataset.speaker = v.speakerId;
      setText(this.text, v.text);
    }
    const key = v.options?.join('|') ?? '';
    if (key !== this.optionsKey) {
      this.optionsKey = key;
      this.options.hidden = !v.options;
      this.options.replaceChildren(
        ...(v.options ?? []).map((label, i) => {
          const b = h('button', { type: 'button', class: 'btn cine-option', 'data-choice': String(i + 1) }, h('kbd', { text: String(i + 1) }), ` ${label}`);
          b.addEventListener('click', () => this.callbacks.onChoose(i + 1));
          return h('li', {}, b);
        }),
      );
    }
    this.skipFill.style.width = `${Math.round(v.skipProgress * 100)}%`;
  }

  /** Fim da cena: só o cartão com o botão que entra no jogo. */
  showEnd(): void {
    this.subtitle.hidden = true;
    this.title.hidden = true;
    this.darkLayer.dataset.on = 'false';
    this.endCard.hidden = false;
    this.skipHint.hidden = true;
    this.endCard.querySelector('button')?.focus();
  }

  dispose(): void {
    this.element.remove();
  }
}
