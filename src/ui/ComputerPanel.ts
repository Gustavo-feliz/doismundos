import type { ComputerView } from '../orders/views';
import { h } from './dom';

export interface ComputerCallbacks {
  onBuy(partId: string, supplierId: string): void;
  onCancel(purchaseId: string): void;
  /** Avança o relógio até a próxima entrega. */
  onWait(): void;
  /** Paga a próxima parcela do empréstimo. */
  onPayDebt(): void;
  /** O jogador trocou de aba (o tutorial usa para saber que ele viu o caixa). */
  onTab?(tab: string): void;
  onClose(reason: 'resume' | 'pause'): void;
}

type Tab = 'loja' | 'pedidos' | 'caixa' | 'reputacao';
const TABS: ReadonlyArray<readonly [Tab, string]> = [
  ['loja', 'Loja'],
  ['pedidos', 'Pedidos'],
  ['caixa', 'Caixa'],
  ['reputacao', 'Reputação'],
];

/**
 * Computador de gestão do escritório (GDD §17.2, versão do Prompt 7/8):
 * loja de peças, pedidos, livro-caixa e reputação. Só desenha a ComputerView.
 */
export class ComputerPanel {
  readonly element: HTMLElement;
  private readonly body: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly cash: HTMLElement;
  private readonly tabButtons = new Map<Tab, HTMLButtonElement>();
  private tab: Tab = 'loja';
  private onlyFits = true;
  private view: ComputerView | null = null;
  private noticeTimer = 0;

  constructor(
    parent: HTMLElement,
    private readonly callbacks: ComputerCallbacks,
  ) {
    this.body = h('div', { class: 'computer-body', 'data-testid': 'computer-body' });
    this.notice = h('p', { class: 'panel-notice', role: 'status', 'aria-live': 'polite', 'data-testid': 'computer-notice', hidden: true });
    this.cash = h('strong', { 'data-testid': 'computer-cash' });
    const close = h('button', { type: 'button', class: 'btn btn-primary panel-close' }, h('kbd', { text: 'E' }), ' Voltar ao trabalho');
    close.addEventListener('click', () => this.callbacks.onClose('resume'));
    const nav = h('nav', { class: 'panel-tabs', role: 'tablist', 'aria-label': 'Computador' });
    TABS.forEach(([tab, label], i) => {
      const b = h('button', { type: 'button', class: 'panel-tab', role: 'tab', 'data-tab': tab, 'aria-selected': 'false' }, label, h('kbd', { text: String(i + 1) }));
      b.addEventListener('click', () => this.setTab(tab));
      this.tabButtons.set(tab, b);
      nav.append(b);
    });
    this.element = h(
      'div',
      { class: 'panel-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'computer-title', 'data-testid': 'computer-panel', hidden: true },
      h(
        'div',
        { class: 'panel-card computer-card' },
        h(
          'div',
          { class: 'panel-top' },
          h(
            'header',
            { class: 'panel-header' },
            h('span', { class: 'hud-label', text: 'Escritório' }),
            h('h1', { id: 'computer-title', class: 'panel-title', text: 'Computador de gestão' }),
            h('p', { class: 'panel-meta' }, 'Caixa da oficina: ', this.cash),
          ),
          close,
        ),
        nav,
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

  open(view: ComputerView): void {
    this.view = view;
    this.render();
    this.element.hidden = false;
    this.tabButtons.get(this.tab)?.focus({ preventScroll: true });
  }

  refresh(view: ComputerView): void {
    if (!this.isOpen) return;
    this.view = view;
    const hadFocus = this.element.contains(document.activeElement);
    this.render();
    if (hadFocus && !this.element.contains(document.activeElement)) this.tabButtons.get(this.tab)?.focus({ preventScroll: true });
  }

  notify(text: string, kind: 'ok' | 'warn' | 'blocked'): void {
    this.notice.textContent = text;
    this.notice.dataset.kind = kind;
    this.notice.hidden = false;
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => (this.notice.hidden = true), 4000);
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

  private setTab(tab: Tab): void {
    this.tab = tab;
    this.render();
    this.callbacks.onTab?.(tab);
  }

  private render(): void {
    const v = this.view;
    if (!v) return;
    this.cash.textContent = v.cashText;
    for (const [tab, b] of this.tabButtons) b.setAttribute('aria-selected', String(tab === this.tab));
    const content = this.tab === 'loja' ? this.shop(v) : this.tab === 'pedidos' ? this.purchases(v) : this.tab === 'caixa' ? this.ledger(v) : this.reputation(v);
    this.body.replaceChildren(...content);
  }

  private shop(v: ComputerView): HTMLElement[] {
    const filter = h('input', { type: 'checkbox', id: 'shop-filter' });
    filter.checked = this.onlyFits;
    filter.addEventListener('change', () => {
      this.onlyFits = filter.checked;
      this.render();
    });
    const items = v.shop.filter((p) => !this.onlyFits || p.fitsActiveCar);
    return [
      h('label', { class: 'quote-extra', for: 'shop-filter' }, filter, h('span', { text: 'Só peças que servem no carro do box' })),
      ...(v.creditText ? [h('p', { class: 'muted small', text: v.creditText })] : []),
      h(
        'ul',
        { class: 'test-list', 'data-testid': 'shop-list' },
        ...items.map((p) =>
          h(
            'li',
            { class: 'shop-row', 'data-part': p.partId, 'data-fits': String(p.fitsActiveCar) },
            h(
              'div',
              { class: 'test-info' },
              h('strong', { text: p.name }),
              ...(p.neededFor ? [h('span', { class: 'needed-tag', text: `Necessária para a ${p.neededFor}` })] : []),
              h('span', { class: 'muted', text: `${p.brand} · ${p.quality} · posição: ${p.slotName}${p.inStock ? ` · ${p.inStock} no estoque` : ''}` }),
            ),
            h(
              'div',
              { class: 'shop-offers' },
              ...p.offers.map((o) => {
                const buy = h('button', { type: 'button', class: 'btn btn-small', 'data-buy': p.partId, 'data-supplier': o.supplierId }, `Comprar · ${o.priceText}`);
                buy.disabled = !o.affordable;
                buy.addEventListener('click', () => this.callbacks.onBuy(p.partId, o.supplierId));
                return h('div', { class: 'offer' }, h('span', { class: 'muted', text: `${o.supplierName} · chega em ${o.minutes} min` }), buy);
              }),
            ),
          ),
        ),
      ),
    ];
  }

  private purchases(v: ComputerView): HTMLElement[] {
    const header = h('div', { class: 'held-row' }, h('span', { text: v.nextDeliveryText ?? 'Nenhum pedido a caminho.' }));
    if (v.canWait) {
      const wait = h('button', { type: 'button', class: 'btn btn-small', 'data-testid': 'wait-delivery' }, 'Esperar a entrega');
      wait.addEventListener('click', () => this.callbacks.onWait());
      header.append(wait);
    }
    return [
      header,
      v.purchases.length
        ? h(
            'ul',
            { class: 'test-list', 'data-testid': 'purchase-list' },
            ...v.purchases.map((o) => {
              const row = h(
                'li',
                { class: 'test-item', 'data-purchase': o.id, 'data-status': o.status },
                h('div', { class: 'test-info' }, h('strong', { text: `${o.id} · ${o.qty}× ${o.partName} · ${o.totalText}` }), h('span', { class: 'muted', text: `${o.supplierName} · ${o.statusLabel} · ${o.etaText}` })),
              );
              if (o.canCancel) {
                const cancel = h('button', { type: 'button', class: 'btn btn-ghost btn-small', 'data-cancel': o.id }, 'Cancelar');
                cancel.addEventListener('click', () => this.callbacks.onCancel(o.id));
                row.append(cancel);
              }
              return row;
            }),
          )
        : h('p', { class: 'muted', text: 'Nenhum pedido ainda. Compre na aba Loja.' }),
    ];
  }

  private ledger(v: ComputerView): HTMLElement[] {
    const tile = (label: string, value: string, testid?: string) =>
      h('div', { class: 'money-tile' }, h('span', { class: 'hud-label', text: label }), h('strong', { text: value, ...(testid ? { 'data-testid': testid } : {}) }));
    const s = v.summary;
    return [
      h(
        'div',
        { class: 'money-row' },
        tile('Caixa atual', v.cashText, 'ledger-cash'),
        tile('Receita de serviços', s.revenueText, 'ledger-revenue'),
        tile('Compras de peças (líquidas)', s.netPurchasesText),
        tile('Lucro bruto (OS entregues)', s.grossProfitText, 'ledger-profit'),
      ),
      h('p', { class: 'muted small', text: `OS entregues: receita ${s.deliveredRevenueText} − custo das peças usadas ${s.deliveredCostText}. Compras ${s.purchasesText}, estornos ${s.refundsText}.` }),
      this.debtCard(v),
      v.ledger.length
        ? h(
            'table',
            { class: 'quote-table', 'data-testid': 'ledger' },
            h(
              'tbody',
              {},
              ...v.ledger.map((t) =>
                h(
                  'tr',
                  { 'data-tx': t.id },
                  h('td', {}, h('span', { text: `${t.id} · ${t.category}: ${t.description}` }), h('small', { class: 'muted', text: `${t.when} · ${t.ref}` })),
                  h('td', { class: 'num ledger-amount', 'data-kind': t.kind, text: t.amountText }),
                ),
              ),
            ),
          )
        : h('p', { class: 'muted', text: 'Nenhuma movimentação ainda.' }),
    ];
  }

  /** Internet banking: empréstimo herdado do tio. */
  private debtCard(v: ComputerView): HTMLElement {
    const d = v.debt;
    if (!d.next) {
      return h('section', { class: 'debt-card', 'data-testid': 'debt' }, h('h3', { text: 'Empréstimo do banco' }), h('p', { text: `Quitado! ${d.paidCount} parcela(s) paga(s).` }));
    }
    const n = d.next;
    const pay = h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'debt-pay', disabled: !n.affordable }, `Pagar parcela (${n.totalText})`);
    pay.addEventListener('click', () => this.callbacks.onPayDebt());
    return h(
      'section',
      { class: 'debt-card', 'data-testid': 'debt', 'data-overdue': String(n.overdue) },
      h('h3', { text: 'Empréstimo do banco' }),
      h('p', {}, 'Saldo devedor: ', h('strong', { 'data-testid': 'debt-balance', text: d.balanceText }), ` · ${d.paidCount} parcela(s) paga(s)`),
      h('p', { class: n.overdue ? 'debt-due is-overdue' : 'debt-due', 'data-testid': 'debt-due' }, n.overdue ? `ATRASADA desde o dia ${n.dueDay + 1}: ` : `Próxima parcela vence no fim do dia ${n.dueDay}: `, h('strong', { text: n.totalText }), n.detail ? ` (${n.detail})` : ''),
      h('div', { class: 'panel-actions' }, pay),
      n.affordable ? null : h('p', { class: 'muted small', text: 'Caixa insuficiente para a parcela: entregue mais serviços.' }),
    );
  }

  private reputation(v: ComputerView): HTMLElement[] {
    const r = v.reputation;
    return [
      h(
        'div',
        { class: 'money-row' },
        h('div', { class: 'money-tile' }, h('span', { class: 'hud-label', text: 'Reputação geral' }), h('span', { class: 'rep-score', 'data-testid': 'rep-general', text: String(r.generalScore) }), h('span', { class: 'muted', text: r.generalStars })),
        ...r.specialties.map((s) =>
          h('div', { class: 'money-tile', 'data-specialty': s.label }, h('span', { class: 'hud-label', text: s.label }), h('strong', { text: `${s.score}/100` }), h('span', { class: 'muted', text: `${s.stars} · ${s.reviews} avaliação(ões)` })),
        ),
      ),
      h('h3', { class: 'section-title', text: 'Avaliações dos clientes' }),
      r.reviews.length
        ? h(
            'ol',
            { class: 'evidence-list', 'data-testid': 'reviews' },
            ...r.reviews.map((rv) =>
              h(
                'li',
                {},
                h('strong', { text: `OS #${rv.orderNumber} · ${rv.customer} · ${'★'.repeat(rv.stars)}${'☆'.repeat(5 - rv.stars)}` }),
                h('ul', { class: 'review-reasons' }, ...rv.reasons.map((x) => h('li', { 'data-effect': x.effect, text: x.text }))),
                ...(rv.complaint ? [h('span', { class: 'os-closed', text: rv.complaint })] : []),
              ),
            ),
          )
        : h('p', { class: 'muted', text: 'Nenhuma avaliação ainda: entregue um carro.' }),
      h('h3', { class: 'section-title', text: 'Garantias' }),
      r.warranties.length
        ? h('ul', { class: 'evidence-list', 'data-testid': 'warranties' }, ...r.warranties.map((w) => h('li', {}, h('strong', { text: `${w.id} · OS #${w.orderNumber} · ${w.active ? 'ativa' : 'vencida'}` }), h('span', { class: 'muted', text: `Cobre: ${w.covered} · ${w.validity}` }))))
        : h('p', { class: 'muted', text: 'Nenhuma garantia emitida.' }),
      ...(r.events.length
        ? [
            h('h3', { class: 'section-title', text: 'Mudanças de reputação' }),
            h('ul', { class: 'evidence-list' }, ...r.events.map((e) => h('li', { 'data-kind': e.delta < 0 ? 'erro' : 'ok' }, h('span', { text: `${e.delta > 0 ? '+' : ''}${e.delta} · ${e.text}` }), h('span', { class: 'muted', text: e.when })))),
          ]
        : []),
    ];
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.isOpen) return;
    if (event.code === 'KeyE' || event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) this.callbacks.onClose(event.key === 'Escape' ? 'pause' : 'resume');
      return;
    }
    const digit = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(event.code);
    if (digit >= 0 && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault();
      event.stopPropagation();
      this.setTab(TABS[digit]![0]);
      this.tabButtons.get(this.tab)?.focus({ preventScroll: true });
    }
  };
}
