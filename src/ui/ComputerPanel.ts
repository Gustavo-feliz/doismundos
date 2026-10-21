import type { ComputerView } from '../orders/views';
import { h } from './dom';

export interface ComputerCallbacks {
  onBuy(partId: string, supplierId: string): void;
  onCancel(purchaseId: string): void;
  /** Avança o relógio até a próxima entrega. */
  onWait(): void;
  /** Paga a próxima parcela do empréstimo. */
  onPayDebt(): void;
  /** Compra o próximo nível de uma ferramenta/upgrade. */
  onBuyUpgrade(id: string): void;
  /** Contrata um candidato a funcionário (Prompt 15). */
  onHire?(candidateId: string): void;
  /** Pausa ou retoma o trabalho de um funcionário (Prompt 15). */
  onTogglePause?(employeeId: string): void;
  /** Demite um funcionário (Prompt 15). */
  onFire?(employeeId: string): void;
  /** Paga a folha salarial diária (Prompt 15). */
  onPayPayroll?(): void;
  /** Adiciona uma tarefa padrão à fila da equipe (Prompt 15). */
  onEnqueueTask?(standardTaskId: string): void;
  /** Avança o trabalho da equipe em andamento (+15 min) (Prompt 15). */
  onAdvanceStaff?(): void;
  /** Atende ou inicia um evento de fiscalização / pressão local (Prompt 16). */
  onTriggerEvent?(eventId: string): void;
  /** Escolhe uma alternativa para o evento ativo (Prompt 16). */
  onResolveEvent?(optionId: string): void;
  /** O jogador trocou de aba (o tutorial usa para saber que ele viu o caixa). */
  onTab?(tab: string): void;
  onClose(reason: 'resume' | 'pause'): void;
}

type Tab = 'loja' | 'pedidos' | 'caixa' | 'reputacao' | 'oficina' | 'catalogo' | 'equipe';
const TABS: ReadonlyArray<readonly [Tab, string]> = [
  ['loja', 'Loja'],
  ['pedidos', 'Pedidos'],
  ['caixa', 'Caixa'],
  ['reputacao', 'Reputação'],
  ['oficina', 'Oficina'],
  ['catalogo', 'Catálogo'],
  ['equipe', 'Equipe'],
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
  /** Modelo aberto na enciclopédia. */
  private catalogModel: string | null = null;
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

  openAtTab(view: ComputerView, tab: Tab): void {
    this.tab = tab;
    this.open(view);
    this.callbacks.onTab?.(tab);
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
    const content =
      this.tab === 'loja'
        ? this.shop(v)
        : this.tab === 'pedidos'
          ? this.purchases(v)
          : this.tab === 'caixa'
            ? this.ledger(v)
            : this.tab === 'oficina'
              ? this.workshop(v)
              : this.tab === 'catalogo'
                ? this.catalog(v)
                : this.tab === 'equipe'
                  ? this.staff(v)
                  : this.reputation(v);
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

  /** Enciclopédia: modelos (à esquerda), peças por posição do modelo escolhido e serviços conhecidos. */
  private catalog(v: ComputerView): HTMLElement[] {
    const models = v.catalog.models;
    const selected = models.find((m) => m.id === this.catalogModel) ?? models[0];
    if (!selected) return [h('p', { class: 'muted', text: 'Catálogo vazio.' })];
    const list = h(
      'nav',
      { class: 'catalog-models', 'aria-label': 'Modelos' },
      ...models.map((m) => {
        const b = h('button', { type: 'button', class: 'catalog-model', 'data-model': m.id, 'aria-pressed': String(m.id === selected.id) }, h('strong', { text: m.name }), h('small', { text: `${m.categoryLabel} · ${m.yearsText}` }));
        b.addEventListener('click', () => {
          this.catalogModel = m.id;
          this.render();
        });
        return b;
      }),
    );
    const detail = h(
      'section',
      { class: 'catalog-detail', 'data-testid': 'catalog-detail' },
      h('h3', { text: selected.name }),
      h('p', { class: 'small' }, h('strong', { text: `${selected.categoryLabel} · ${selected.yearsText} · ${selected.valueText}` })),
      h('p', { class: 'small', text: selected.blurb }),
      h(
        'table',
        { class: 'quote-table catalog-parts', 'data-testid': 'catalog-parts' },
        h(
          'tbody',
          {},
          ...selected.slots.map((s) =>
            h(
              'tr',
              {},
              h('td', { text: s.slotName }),
              h('td', {}, ...s.parts.map((p) => h('div', { class: 'small' }, `${p.name} · ${p.qualityLabel} · `, h('span', { class: 'muted', text: `${p.yearsText} · ${p.costText}` })))),
            ),
          ),
        ),
      ),
    );
    const services = h(
      'section',
      { class: 'catalog-services', 'data-testid': 'catalog-services' },
      h('h3', { text: 'Serviços que chegam à oficina' }),
      h('ul', { class: 'small' }, ...v.catalog.services.map((s) => h('li', {}, h('strong', { text: s.title }), ` — causa típica: ${s.causeName}${s.toolsText ? ` · exige ${s.toolsText}` : ''}`))),
    );
    return [h('div', { class: 'catalog-layout', 'data-testid': 'catalog' }, list, detail), services];
  }

  /** Ferramentas e melhorias: nível atual, efeito e o antes/depois do próximo nível. */
  private workshop(v: ComputerView): HTMLElement[] {
    return [
      h('p', { class: 'muted small', text: 'Investimentos deixam o trabalho mais rápido. Tempos de exemplo; o efeito vale em todos os serviços.' }),
      h(
        'div',
        { class: 'upgrade-grid', 'data-testid': 'upgrades' },
        ...v.upgrades.map((u) => {
          const pips = h('span', { class: 'upgrade-pips', 'aria-label': `Nível ${u.level} de ${u.maxLevel}` }, ...Array.from({ length: u.maxLevel }, (_, i) => h('span', { class: i < u.level ? 'pip is-on' : 'pip' })));
          let footer: HTMLElement;
          if (!u.next) footer = h('p', { class: 'upgrade-max', text: 'Nível máximo' });
          else {
            const buy = h('button', { type: 'button', class: 'btn btn-small', 'data-upgrade': u.id, disabled: Boolean(u.next.blockedReason) }, `Comprar nível ${u.next.level} · ${u.next.costText}`);
            buy.addEventListener('click', () => this.callbacks.onBuyUpgrade(u.id));
            footer = h(
              'div',
              { class: 'upgrade-next' },
              h('p', { class: 'upgrade-compare', 'data-testid': `upgrade-compare-${u.id}` }, `${u.effectLabel}: `, h('s', { text: u.next.beforeText }), ' → ', h('strong', { text: u.next.afterText })),
              buy,
              u.next.blockedReason ? h('p', { class: 'muted small', 'data-testid': `upgrade-blocked-${u.id}`, text: u.next.blockedReason }) : null,
            );
          }
          return h(
            'article',
            { class: 'upgrade-card', 'data-upgrade-card': u.id, 'data-level': String(u.level) },
            h('header', {}, h('span', { class: 'hud-label', text: u.kindLabel }), h('h3', { text: u.name }), pips),
            h('p', { class: 'small', text: u.description }),
            h('p', { class: 'small' }, 'Agora: ', h('strong', { text: `${u.effectLabel} ${u.currentText}` })),
            footer,
          );
        }),
      ),
      ...this.eventsSection(v),
    ];
  }

  /** Fiscalização municipal, pressão local no bairro e histórico de decisões (Prompt 16). */
  private eventsSection(v: ComputerView): HTMLElement[] {
    const ev = v.events;
    const activeCard = ev.active
      ? h(
          'section',
          {
            class: 'debt-card',
            'data-testid': 'active-event',
            'data-event-id': ev.active.id,
            'data-event-category': ev.active.category,
          },
          h('span', { class: 'hud-label', text: ev.active.categoryLabel }),
          h('h3', { text: `${ev.active.title} — ${ev.active.speaker}` }),
          h('p', { class: 'small', text: ev.active.message }),
          h(
            'ul',
            { class: 'test-list', 'data-testid': 'active-event-options' },
            ...ev.active.options.map((opt) => {
              const btn = h(
                'button',
                {
                  type: 'button',
                  class: 'btn btn-small',
                  'data-event-option': opt.id,
                  disabled: !opt.affordable,
                },
                `Escolher (${opt.costText} · ${opt.reputationText} · ${opt.timeText})`,
              );
              btn.addEventListener('click', () => this.callbacks.onResolveEvent?.(opt.id));
              return h(
                'li',
                { class: 'test-item', 'data-option': opt.id },
                h(
                  'div',
                  { class: 'test-info' },
                  h('strong', { text: opt.label }),
                  h('span', { class: 'muted', text: opt.description }),
                  opt.blockedReason ? h('span', { class: 'muted small', text: opt.blockedReason }) : null,
                ),
                btn,
              );
            }),
          ),
        )
      : null;

    const catalogList = h(
      'section',
      { 'data-testid': 'event-catalog' },
      h('h3', { class: 'section-title', text: 'Fiscalização e Ocorrências do Bairro' }),
      h(
        'ul',
        { class: 'test-list' },
        ...ev.catalog.map((c) => {
          const triggerBtn = h(
            'button',
            {
              type: 'button',
              class: 'btn btn-small',
              'data-trigger-event': c.id,
              disabled: !c.canTriggerNow,
            },
            'Atender agora',
          );
          triggerBtn.addEventListener('click', () => this.callbacks.onTriggerEvent?.(c.id));
          return h(
            'li',
            { class: 'test-item', 'data-event-def': c.id },
            h(
              'div',
              { class: 'test-info' },
              h('strong', { text: `${c.title} (${c.categoryLabel})` }),
              h('span', { class: 'muted', text: `${c.speaker} · ${c.triggerText}` }),
            ),
            triggerBtn,
          );
        }),
      ),
    );

    const historySection = h(
      'section',
      { 'data-testid': 'event-history-section' },
      h('h3', { class: 'section-title', text: 'Histórico de Eventos e Fiscalizações' }),
      ev.history.length
        ? h(
            'ul',
            { class: 'evidence-list', 'data-testid': 'event-history' },
            ...ev.history.map((item) =>
              h(
                'li',
                { 'data-event-record': item.id },
                h(
                  'strong',
                  {
                    text: `${item.id} · ${item.title} (${item.categoryLabel}) — ${item.optionLabel}`,
                  },
                ),
                h('span', { class: 'small', text: item.outcomeText }),
                h(
                  'span',
                  {
                    class: 'muted',
                    text: `${item.when} · Custo: ${item.costText} · Reputação: ${item.reputationText}`,
                  },
                ),
              ),
            ),
          )
        : h('p', { class: 'muted small', text: 'Nenhum evento ou fiscalização registrado até o momento.' }),
    );

    return [...(activeCard ? [activeCard] : []), catalogList, historySection];
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

  /** Equipe e automação básica (Prompt 15): folha salarial, funcionários, fila de tarefas e contratação. */
  private staff(v: ComputerView): HTMLElement[] {
    const s = v.staff;
    const payBtn = h(
      'button',
      {
        type: 'button',
        class: 'btn btn-primary btn-small',
        'data-testid': 'staff-pay-payroll',
        disabled: !s.payroll.canPay,
      },
      `Pagar folha do dia (${s.payroll.totalText})`,
    );
    payBtn.addEventListener('click', () => this.callbacks.onPayPayroll?.());

    const payrollCard = h(
      'section',
      { class: 'debt-card', 'data-testid': 'staff-payroll' },
      h('h3', { text: 'Folha salarial da equipe' }),
      h(
        'p',
        { class: 'small' },
        `Funcionários ativos/pausados: ${s.payroll.employeeCount} · Total diário: `,
        h('strong', { 'data-testid': 'staff-payroll-total', text: s.payroll.totalText }),
      ),
      h(
        'div',
        { class: 'panel-actions' },
        payBtn,
        s.payroll.blockedReason
          ? h('span', { class: 'muted small', 'data-testid': 'staff-payroll-reason', text: s.payroll.blockedReason })
          : null,
      ),
    );

    const employeesSection = h(
      'section',
      { 'data-testid': 'staff-employees' },
      h('h3', { class: 'section-title', text: 'Equipe contratada' }),
      s.employees.length
        ? h(
            'ul',
            { class: 'test-list', 'data-testid': 'staff-employee-list' },
            ...s.employees.map((e) => {
              const pauseBtn = h(
                'button',
                { type: 'button', class: 'btn btn-small', 'data-staff-pause': e.id },
                e.paused ? 'Retomar' : 'Pausar',
              );
              pauseBtn.addEventListener('click', () => this.callbacks.onTogglePause?.(e.id));

              const fireBtn = h(
                'button',
                { type: 'button', class: 'btn btn-ghost btn-small', 'data-staff-fire': e.id },
                'Demitir',
              );
              fireBtn.addEventListener('click', () => this.callbacks.onFire?.(e.id));

              return h(
                'li',
                { class: 'test-item', 'data-employee': e.id, 'data-state': e.state },
                h(
                  'div',
                  { class: 'test-info' },
                  h('strong', { text: `${e.name} · ${e.roleLabel}` }),
                  h(
                    'span',
                    {
                      class: 'muted',
                      text: `Hab. ${e.skill}/100 · Vel. ${e.speedText} · Salário ${e.salaryText} · Estado: ${e.stateLabel} · Concluídas: ${e.completedTasks}`,
                    },
                  ),
                  e.currentTaskText
                    ? h('span', { class: 'needed-tag', 'data-testid': `emp-task-${e.id}`, text: `Em execução: ${e.currentTaskText}` })
                    : null,
                ),
                h('div', { class: 'shop-offers' }, pauseBtn, fireBtn),
              );
            }),
          )
        : h('p', { class: 'muted small', text: 'Nenhum funcionário contratado ainda. Contrate abaixo.' }),
    );

    const advanceBtn = s.hasActiveTasks
      ? (() => {
          const b = h(
            'button',
            { type: 'button', class: 'btn btn-primary btn-small', 'data-testid': 'staff-advance-work' },
            'Acompanhar turno (+15 min)',
          );
          b.addEventListener('click', () => this.callbacks.onAdvanceStaff?.());
          return b;
        })()
      : null;

    const tasksSection = h(
      'section',
      { 'data-testid': 'staff-tasks' },
      h('h3', { class: 'section-title', text: 'Fila de tarefas da oficina' }),
      h(
        'div',
        { class: 'upgrade-grid' },
        ...s.standardTasks.map((std) => {
          const enqueueBtn = h(
            'button',
            { type: 'button', class: 'btn btn-small', 'data-enqueue-task': std.id },
            'Adicionar à fila',
          );
          enqueueBtn.addEventListener('click', () => this.callbacks.onEnqueueTask?.(std.id));
          return h(
            'article',
            { class: 'upgrade-card', 'data-std-task': std.id },
            h('header', {}, h('span', { class: 'hud-label', text: std.roleText }), h('h3', { text: std.title })),
            h('p', { class: 'small', text: std.description }),
            h('p', { class: 'muted small', text: `Hab. mín. ${std.minSkill} · Tempo base: ${std.minutes} min` }),
            enqueueBtn,
          );
        }),
      ),
      advanceBtn ? h('div', { class: 'panel-actions' }, advanceBtn) : null,
      s.tasks.length
        ? h(
            'ul',
            { class: 'test-list', 'data-testid': 'staff-task-list' },
            ...s.tasks.map((t) =>
              h(
                'li',
                { class: 'test-item', 'data-task': t.id, 'data-status': t.status },
                h(
                  'div',
                  { class: 'test-info' },
                  h('strong', { text: `${t.id} · ${t.title}` }),
                  h(
                    'span',
                    {
                      class: 'muted',
                      text: `${t.statusLabel} · Progresso: ${t.progressText}${t.assignedName ? ` · Responsável: ${t.assignedName}` : ''}`,
                    },
                  ),
                  t.resultText ? h('span', { class: 'small', text: t.resultText }) : null,
                ),
              ),
            ),
          )
        : h('p', { class: 'muted small', text: 'Fila vazia. Adicione tarefas acima para a equipe executar.' }),
    );

    const candidatesSection = h(
      'section',
      { 'data-testid': 'staff-candidates' },
      h('h3', { class: 'section-title', text: 'Candidatos disponíveis para contratação' }),
      s.candidates.length
        ? h(
            'ul',
            { class: 'test-list', 'data-testid': 'staff-candidate-list' },
            ...s.candidates.map((c) => {
              const hireBtn = h(
                'button',
                {
                  type: 'button',
                  class: 'btn btn-small',
                  'data-staff-hire': c.id,
                  disabled: !c.affordable,
                },
                `Contratar · ${c.salaryText}`,
              );
              hireBtn.addEventListener('click', () => this.callbacks.onHire?.(c.id));
              return h(
                'li',
                { class: 'test-item', 'data-candidate': c.id, 'data-role': c.role },
                h(
                  'div',
                  { class: 'test-info' },
                  h('strong', { text: `${c.name} · ${c.roleLabel}` }),
                  h('span', { class: 'muted', text: `Hab. ${c.skill}/100 · Vel. ${c.speedText} · Salário: ${c.salaryText}` }),
                  h('span', { class: 'small', text: c.blurb }),
                  c.blockedReason ? h('span', { class: 'muted small', text: c.blockedReason }) : null,
                ),
                hireBtn,
              );
            }),
          )
        : h('p', { class: 'muted small', text: 'Todos os candidatos disponíveis já foram contratados.' }),
    );

    return [payrollCard, employeesSection, tasksSection, candidatesSection];
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.isOpen) return;
    if (event.code === 'KeyE' || event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) this.callbacks.onClose(event.key === 'Escape' ? 'pause' : 'resume');
      return;
    }
    const digit = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'].indexOf(event.code);
    if (digit >= 0 && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault();
      event.stopPropagation();
      this.setTab(TABS[digit]![0]);
      this.tabButtons.get(this.tab)?.focus({ preventScroll: true });
    }
  };
}
