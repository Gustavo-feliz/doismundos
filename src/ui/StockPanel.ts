import type { StockView } from '../orders/views';
import { h } from './dom';

export interface StockCallbacks {
  onTake(lotId: string): void;
  onReturn(): void;
  onClose(reason: 'resume' | 'pause'): void;
}

/**
 * Estoque de peças (estantes). O jogador pega UMA peça por vez e leva até o
 * carro. A lista mostra nome e posição — escolher a certa é com o jogador.
 */
export class StockPanel {
  readonly element: HTMLElement;
  private readonly body: HTMLElement;
  private readonly notice: HTMLElement;
  private noticeTimer = 0;

  constructor(
    parent: HTMLElement,
    private readonly callbacks: StockCallbacks,
  ) {
    this.body = h('div', { class: 'stock-body' });
    this.notice = h('p', { class: 'panel-notice', role: 'status', 'aria-live': 'polite', hidden: true });
    const close = h('button', { type: 'button', class: 'btn btn-primary panel-close', 'data-testid': 'stock-close' }, h('kbd', { text: 'E' }), ' Voltar ao trabalho');
    close.addEventListener('click', () => this.callbacks.onClose('resume'));
    this.element = h(
      'div',
      { class: 'panel-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'stock-title', 'data-testid': 'stock-panel', hidden: true },
      h(
        'div',
        { class: 'panel-card stock-card' },
        h(
          'div',
          { class: 'panel-top' },
          h('header', { class: 'panel-header' }, h('span', { class: 'hud-label', text: 'Estantes' }), h('h1', { id: 'stock-title', class: 'panel-title', text: 'Estoque de peças' })),
          close,
        ),
        this.notice,
        this.body,
      ),
    );
    parent.append(this.element);
    window.addEventListener('keydown', this.handleKeyDown, true);
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  open(view: StockView): void {
    this.render(view);
    this.element.hidden = false;
    this.element.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }

  refresh(view: StockView): void {
    if (this.isOpen) this.render(view);
  }

  notify(text: string, kind: 'ok' | 'warn' | 'blocked'): void {
    this.notice.textContent = text;
    this.notice.dataset.kind = kind;
    this.notice.hidden = false;
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => (this.notice.hidden = true), 3500);
  }

  close(): void {
    this.element.hidden = true;
    this.notice.hidden = true;
  }

  dispose(): void {
    window.clearTimeout(this.noticeTimer);
    window.removeEventListener('keydown', this.handleKeyDown, true);
    this.element.remove();
  }

  private render(view: StockView): void {
    const held = h(
      'div',
      { class: 'held-row' },
      h('span', {}, 'Em mãos: ', h('strong', { 'data-testid': 'stock-held', text: view.heldName ?? 'nada' })),
    );
    if (view.heldName) {
      const back = h('button', { type: 'button', class: 'btn btn-small', 'data-testid': 'return-part' }, 'Devolver à estante');
      back.addEventListener('click', () => this.callbacks.onReturn());
      held.append(back);
    }
    const rows = view.entries.map((e) => {
      const take = h('button', { type: 'button', class: 'btn btn-small', 'data-take': e.partId, 'data-lot': e.lotId }, 'Pegar');
      take.disabled = !view.canTake;
      take.addEventListener('click', () => this.callbacks.onTake(e.lotId));
      return h(
        'li',
        { class: 'test-item', 'data-part': e.partId },
        h(
          'div',
          { class: 'test-info' },
          h('strong', { text: `${e.name} ×${e.qty}` }),
          h('span', { class: 'muted', text: `${e.brand} · ${e.quality} · posição: ${e.slotName} · ${e.costText} · ${e.source}` }),
        ),
        take,
      );
    });
    this.body.replaceChildren(
      held,
      rows.length ? h('ul', { class: 'test-list', 'data-testid': 'stock-list' }, ...rows) : h('p', { class: 'muted', text: 'As estantes estão vazias.' }),
      h('p', { class: 'panel-footnote', text: view.onTheWay ? `${view.onTheWay} peça(s) a caminho. Compras e entregas: computador do escritório.` : 'Para comprar peças, use o computador do escritório.' }),
    );
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.isOpen) return;
    if (event.code === 'KeyE' || event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) this.callbacks.onClose(event.key === 'Escape' ? 'pause' : 'resume');
    }
  };
}
