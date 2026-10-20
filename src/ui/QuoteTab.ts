import type { QuoteDraft } from '../orders/types';
import type { Option, QuoteView } from '../orders/views';
import { h } from './dom';

export interface QuoteCallbacks {
  onDraftChange(patch: Partial<QuoteDraft>): void;
  onSend(): void;
  onAcceptCounter(): void;
  onDismiss(): void;
  onNextCase(): void;
}

/**
 * Aba "Orçamento" (GDD §14.2–14.3, Prompt 5). Mostra o detalhamento que vem
 * da fórmula central: nenhum valor é calculado aqui.
 */
export class QuoteTab {
  readonly element: HTMLElement;

  constructor(private readonly callbacks: QuoteCallbacks) {
    this.element = h('section', { class: 'quote', 'data-testid': 'quote-tab' });
  }

  render(view: QuoteView | null): void {
    if (!view) {
      this.element.replaceChildren(h('p', { class: 'muted', text: 'Nenhuma ordem de serviço ativa.' }));
      return;
    }
    if (view.status === 'diagnostico') {
      this.element.replaceChildren(this.customerCard(view), h('p', { class: 'muted', text: 'Primeiro registre o diagnóstico: o orçamento é montado a partir dele.' }));
      return;
    }
    this.element.replaceChildren(
      this.customerCard(view),
      ...(view.warrantyNote ? [h('p', { class: view.warrantyNote.covered ? 'test-ok' : 'os-closed', 'data-testid': 'warranty-note', text: view.warrantyNote.text })] : []),
      h('div', { class: 'quote-body' }, h('div', { class: 'diagnosis-col' }, this.editor(view)), h('div', { class: 'diagnosis-col' }, this.breakdown(view), this.history(view))),
    );
  }

  private customerCard(view: QuoteView): HTMLElement {
    return h(
      'header',
      { class: 'os-header' },
      h('span', { class: 'hud-label', 'data-testid': 'order-status', text: view.statusLabel }),
      h('p', { class: 'os-customer' }, 'Cliente: ', h('strong', { text: view.customer.name }), h('span', { class: 'muted', text: ` · ${view.customer.typeLabel}` })),
      h('p', { class: 'muted persona', text: view.customer.persona }),
    );
  }

  private editor(view: QuoteView): HTMLElement {
    const block = h('section', { class: 'diag-block', 'aria-label': 'Itens e condições' }, h('h3', { text: 'Itens e condições' }));
    if (view.mandatory) {
      block.append(
        h(
          'div',
          { class: 'quote-item' },
          h('strong', { text: view.mandatory.slotName }),
          h('span', { class: 'muted', text: `${view.mandatory.partName} · ${view.mandatory.quality} · item do diagnóstico` }),
        ),
      );
    }
    if (view.extras.length) {
      block.append(h('p', { class: 'muted small', text: 'Serviços extras (peças que você avaliou como ruins):' }));
      for (const extra of view.extras) {
        const box = h('input', { type: 'checkbox', id: `extra-${extra.slot}`, 'data-extra': extra.slot });
        box.checked = extra.checked;
        box.disabled = !view.editable;
        box.addEventListener('change', () => {
          const current = view.extras.filter((e) => e.checked).map((e) => e.slot);
          this.callbacks.onDraftChange({ extras: box.checked ? [...current, extra.slot] : current.filter((s) => s !== extra.slot) });
        });
        block.append(
          h(
            'label',
            { class: 'quote-extra', for: `extra-${extra.slot}` },
            box,
            h('span', {}, h('strong', { text: extra.name }), h('span', { class: 'muted', text: ` · avaliada: ${extra.bandLabel} · ${extra.partName}` })),
          ),
        );
      }
    }

    const select = <T extends number>(id: string, label: string, options: Option<T>[], key: 'markupPct' | 'discountPct' | 'warrantyDays') => {
      const el = h('select', { id, 'data-field': key }, ...options.map((o) => h('option', { value: String(o.value), text: o.label })));
      el.value = String(options.find((o) => o.selected)?.value ?? '');
      el.disabled = !view.editable;
      el.addEventListener('change', () => this.callbacks.onDraftChange({ [key]: Number(el.value) }));
      return h('div', { class: 'settings-row' }, h('label', { for: id, text: label }), el);
    };
    const urgent = h('input', { type: 'checkbox', id: 'quote-urgent' });
    urgent.checked = view.urgent;
    urgent.disabled = !view.editable;
    urgent.addEventListener('change', () => this.callbacks.onDraftChange({ urgent: urgent.checked }));

    block.append(
      select('quote-markup', 'Margem sobre peças', view.markup, 'markupPct'),
      select('quote-discount', 'Desconto', view.discount, 'discountPct'),
      select('quote-warranty', 'Garantia', view.warranty, 'warrantyDays'),
      h('div', { class: 'settings-row' }, h('label', { for: 'quote-urgent', text: 'Serviço urgente (fura a fila)' }), urgent),
    );

    if (view.editable) {
      const send = h('button', { type: 'button', class: 'btn btn-primary btn-small', 'data-testid': 'send-quote' }, 'Enviar orçamento ao cliente');
      send.disabled = !view.canSend;
      send.addEventListener('click', () => this.callbacks.onSend());
      const actions = h('div', { class: 'conclude-row' }, send);
      if (view.canAcceptCounter) {
        const accept = h('button', { type: 'button', class: 'btn btn-small', 'data-testid': 'accept-counter' }, `Aceitar ${view.counterTargetText}`);
        accept.addEventListener('click', () => this.callbacks.onAcceptCounter());
        actions.append(accept);
      }
      const dismiss = h('button', { type: 'button', class: 'btn btn-ghost btn-small', 'data-testid': 'dismiss' }, 'Dispensar cliente');
      dismiss.addEventListener('click', () => this.callbacks.onDismiss());
      actions.append(dismiss);
      block.append(actions);
    } else if (view.status === 'recusada') {
      block.append(h('p', { class: 'os-closed', text: view.closedReason ?? 'OS encerrada.' }));
      block.append(this.nextCaseButton(view));
    } else {
      block.append(h('p', { class: 'muted small', text: 'Orçamento aprovado. Continue na aba Serviço.' }));
    }
    return block;
  }

  private breakdown(view: QuoteView): HTMLElement {
    const block = h('section', { class: 'diag-block', 'aria-label': 'Detalhamento' }, h('h3', { text: view.editable ? 'Prévia do orçamento' : 'Orçamento' }));
    if (view.previewError) block.append(h('p', { class: 'os-closed', text: view.previewError }));
    if (!view.preview) return block;
    const p = view.preview;
    block.append(
      h(
        'table',
        { class: 'quote-table', 'data-testid': 'quote-lines' },
        h(
          'tbody',
          {},
          ...p.lines.map((l) =>
            h('tr', { 'data-kind': l.kind }, h('td', {}, h('span', { text: l.label }), h('small', { class: 'muted', text: l.detail })), h('td', { class: 'num', text: l.amountText })),
          ),
        ),
        h('tfoot', {}, h('tr', {}, h('th', { text: 'Total' }), h('th', { class: 'num', 'data-testid': 'quote-total', text: p.totalText }))),
      ),
      h(
        'dl',
        { class: 'detail-list quote-terms' },
        h('dt', { text: 'Prazo' }),
        h('dd', { 'data-testid': 'quote-deadline', text: p.deadlineText }),
        h('dt', { text: 'Garantia' }),
        h('dd', { text: p.warrantyText }),
        ...(p.depositText ? [h('dt', { text: 'Sinal' }), h('dd', { text: p.depositText })] : []),
        h('dt', { text: 'Validade' }),
        h('dd', { text: p.validityText }),
      ),
    );
    return block;
  }

  private history(view: QuoteView): HTMLElement {
    return h(
      'section',
      { class: 'diag-block', 'aria-label': 'Negociação' },
      h('h3', { text: `Negociação (${view.proposals.length})` }),
      view.proposals.length
        ? h(
            'ol',
            { class: 'evidence-list', 'data-testid': 'proposals' },
            ...view.proposals.map((p) =>
              h(
                'li',
                { 'data-decision': p.decision },
                h('strong', { text: `Proposta ${p.round}: ${p.totalText} — ${p.decisionLabel}` }),
                h('span', { text: p.message }),
                h('span', { class: 'muted', text: p.when }),
              ),
            ),
          )
        : h('p', { class: 'muted', text: 'Nada enviado ainda. Ajuste as condições e envie.' }),
    );
  }

  private nextCaseButton(view: QuoteView): HTMLElement {
    if (!view.hasNextCase) return h('span', { class: 'os-done', text: 'Era a última ordem de serviço de demonstração.' });
    const next = h('button', { type: 'button', class: 'btn btn-primary btn-small', 'data-testid': 'next-case' }, 'Próxima ordem de serviço →');
    next.addEventListener('click', () => this.callbacks.onNextCase());
    return next;
  }
}
