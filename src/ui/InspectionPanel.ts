import type { DiagnosisView } from '../diagnostics/view';
import { formatBRL } from '../economy/money';
import type { OrderStatus } from '../orders/types';
import type { QuoteView, ServiceView } from '../orders/views';
import type { InspectionRow, InspectionView, KnownState } from '../vehicles/inspectionView';
import { DiagnosisTab, type DiagnosisCallbacks } from './DiagnosisTab';
import { h } from './dom';
import { formatKm, formatKmAgo, formatMinutes } from './format';
import { QuoteTab, type QuoteCallbacks } from './QuoteTab';
import { ServiceTab, type ServiceCallbacks } from './ServiceTab';
import { isActionKey, kbd } from './keys';

export type PanelCloseReason = 'resume' | 'pause';
export type PanelTab = 'diagnostico' | 'orcamento' | 'servico' | 'pecas';
const TAB_ORDER: readonly PanelTab[] = ['diagnostico', 'orcamento', 'servico', 'pecas'];

/** Tudo que o painel mostra. Nenhuma visão contém o estado real das peças. */
export interface PanelViews {
  inspection: InspectionView;
  diagnosis: DiagnosisView | null;
  quote: QuoteView | null;
  service: ServiceView | null;
  /** Etapa da OS: define a aba que abre primeiro. */
  orderStatus: OrderStatus | null;
}

export interface PanelCallbacks {
  diagnosis: Omit<DiagnosisCallbacks, 'onGoToQuote'>;
  quote: QuoteCallbacks;
  service: ServiceCallbacks;
}

/** Aba mais útil para cada etapa da OS. */
function tabForStatus(status: OrderStatus | null): PanelTab {
  switch (status) {
    case 'diagnostico':
      return 'diagnostico';
    case 'orcamento':
    case 'contraproposta':
    case 'recusada':
      return 'orcamento';
    case 'aprovada':
    case 'em-reparo':
    case 'concluida':
      return 'servico';
    default:
      return 'pecas';
  }
}

/**
 * Painel do veículo: abas Diagnóstico (Prompt 4), Orçamento (5), Serviço (6) e Peças (3).
 * Só recebe visões montadas a partir do que o jogador sabe: nada aqui pode vazar segredo.
 * Teclado: 1–4 trocam de aba; setas ↑/↓ na lista de peças; E ou "Voltar ao trabalho" fecha; Esc pausa.
 */
export class InspectionPanel {
  readonly element: HTMLElement;
  private readonly header: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly diagnosisTab: DiagnosisTab;
  private readonly quoteTab: QuoteTab;
  private readonly serviceTab: ServiceTab;
  private readonly partsSection: HTMLElement;
  private readonly tabButtons: Record<PanelTab, HTMLButtonElement>;
  private tab: PanelTab = 'diagnostico';
  private readonly available = new Set<PanelTab>(['pecas']);
  private noticeTimer = 0;
  private readonly history: HTMLElement;
  private readonly list: HTMLElement;
  private readonly detail: HTMLElement;
  private view: InspectionView | null = null;
  private selected: string | null = null;
  private rowButtons: HTMLButtonElement[] = [];

  constructor(
    parent: HTMLElement,
    private readonly onClose: (reason: PanelCloseReason) => void,
    callbacks: PanelCallbacks,
  ) {
    this.header = h('header', { class: 'panel-header' });
    this.notice = h('p', { class: 'panel-notice', role: 'status', 'aria-live': 'polite', 'data-testid': 'panel-notice', hidden: true });
    this.diagnosisTab = new DiagnosisTab({ ...callbacks.diagnosis, onGoToQuote: () => this.setTab('orcamento') });
    this.quoteTab = new QuoteTab(callbacks.quote);
    this.serviceTab = new ServiceTab(callbacks.service);
    const tabButton = (tab: PanelTab, label: string, key: string) => {
      const b = h('button', { type: 'button', class: 'panel-tab', role: 'tab', 'data-tab': tab, 'aria-selected': 'false' }, label, h('kbd', { text: key }));
      b.addEventListener('click', () => this.setTab(tab));
      return b;
    };
    this.tabButtons = {
      diagnostico: tabButton('diagnostico', 'Diagnóstico', '1'),
      orcamento: tabButton('orcamento', 'Orçamento', '2'),
      servico: tabButton('servico', 'Serviço', '3'),
      pecas: tabButton('pecas', 'Peças', '4'),
    };
    this.history = h('section', { class: 'panel-history', 'aria-label': 'Histórico conhecido' });
    this.list = h('div', { class: 'parts-list', role: 'listbox', 'aria-label': 'Peças do veículo', 'data-testid': 'parts-list' });
    this.detail = h('section', { class: 'part-detail', 'aria-live': 'polite', 'data-testid': 'part-detail' });

    const close = h('button', { type: 'button', class: 'btn btn-primary panel-close', 'data-testid': 'panel-close' }, kbd('interact'), ' Voltar ao trabalho');
    close.addEventListener('click', () => this.onClose('resume'));

    this.element = h(
      'div',
      { class: 'panel-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'inspection-title', 'data-testid': 'inspection-panel', hidden: true },
      h(
        'div',
        { class: 'panel-card' },
        h('div', { class: 'panel-top' }, this.header, close),
        h('nav', { class: 'panel-tabs', role: 'tablist', 'aria-label': 'Seções do painel' }, ...TAB_ORDER.map((t) => this.tabButtons[t])),
        this.notice,
        this.diagnosisTab.element,
        this.quoteTab.element,
        this.serviceTab.element,
        (this.partsSection = h(
          'div',
          { class: 'parts-section', 'data-testid': 'parts-section' },
          this.history,
          h('div', { class: 'panel-body' }, this.list, this.detail),
          h('p', { class: 'panel-footnote', text: 'Peças "não avaliadas" têm estado desconhecido até serem examinadas. Os exames ficam na aba Diagnóstico.' }),
        )),
      ),
    );
    parent.append(this.element);
    // Captura na janela (antes de qualquer outro ouvinte): funciona mesmo se o
    // foco cair fora do painel, e impede que E/Esc cheguem ao jogo.
    window.addEventListener('keydown', this.handleKeyDown, true);
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  get activeTab(): PanelTab {
    return this.tab;
  }

  open(views: PanelViews): void {
    this.render(views);
    // Abre na aba da etapa atual da OS.
    this.setTab(tabForStatus(views.orderStatus));
    this.element.hidden = false;
    this.restoreFocus();
  }

  /** Redesenha com dados novos mantendo aba e seleção (estado mudou com o painel aberto). */
  refresh(views: PanelViews): void {
    if (!this.isOpen) return;
    const hadFocus = this.element.contains(document.activeElement) || document.activeElement === document.body;
    this.render(views);
    // Os botões foram recriados: devolve o foco para não perder o teclado.
    if (hadFocus && !this.element.contains(document.activeElement)) this.restoreFocus();
  }

  /** Aviso curto dentro do painel (resultado de exame, bloqueio...). */
  notify(text: string, kind: 'ok' | 'warn' | 'blocked'): void {
    this.notice.textContent = text;
    this.notice.dataset.kind = kind;
    this.notice.hidden = false;
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => {
      this.notice.hidden = true;
    }, 3500);
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

  // ---------------------------------------------------------------------------

  /** Troca de aba (também usada pela UI: "Montar orçamento →"). */
  setTab(tab: PanelTab): void {
    if (!this.available.has(tab)) tab = 'pecas';
    this.tab = tab;
    for (const [name, button] of Object.entries(this.tabButtons)) button.setAttribute('aria-selected', String(name === tab));
    this.diagnosisTab.element.hidden = tab !== 'diagnostico';
    this.quoteTab.element.hidden = tab !== 'orcamento';
    this.serviceTab.element.hidden = tab !== 'servico';
    this.partsSection.hidden = tab !== 'pecas';
  }

  private restoreFocus(): void {
    if (this.tab === 'pecas') {
      const target = this.rowButtons.find((b) => b.dataset.slot === this.selected) ?? this.rowButtons[0];
      target?.focus({ preventScroll: true });
    } else {
      this.tabButtons[this.tab].focus({ preventScroll: true });
    }
  }

  private render(views: PanelViews): void {
    const present: Record<PanelTab, boolean> = { diagnostico: views.diagnosis !== null, orcamento: views.quote !== null, servico: views.service !== null, pecas: true };
    for (const t of TAB_ORDER) {
      if (present[t]) this.available.add(t);
      else this.available.delete(t);
      this.tabButtons[t].hidden = !present[t];
    }
    this.diagnosisTab.render(views.diagnosis);
    this.quoteTab.render(views.quote);
    this.serviceTab.render(views.service);
    this.renderParts(views.inspection);
    this.setTab(this.tab);
  }

  private renderParts(view: InspectionView): void {
    this.view = view;
    const allRows = view.groups.flatMap((g) => g.rows);
    if (!this.selected || !allRows.some((r) => r.slotId === this.selected)) this.selected = allRows[0]?.slotId ?? null;

    this.header.replaceChildren(
      h('span', { class: 'hud-label', text: 'Inspeção do veículo' }),
      h('h1', { id: 'inspection-title', class: 'panel-title', text: view.title }),
      h(
        'p',
        { class: 'panel-meta' },
        `${view.subtitle} · Placa `,
        h('strong', { text: view.plate }),
        ` · ${formatKm(view.mileageKm)} · `,
        h('span', { class: 'swatch', style: `background:${view.color}`, 'aria-hidden': 'true' }),
        ` ${view.colorName}`,
      ),
      h('p', { class: 'panel-progress', 'data-testid': 'panel-progress', text: `${view.totals.evaluated} de ${view.totals.slots} peças com estado conhecido` }),
    );

    this.history.replaceChildren(
      h('h2', { text: 'Histórico conhecido' }),
      view.history.length
        ? h('ul', {}, ...view.history.map((e) => h('li', {}, e.text, h('span', { class: 'muted', text: ` · ${formatKmAgo(e.kmAgo)}` }))))
        : h('p', { class: 'muted', text: 'Nenhum registro.' }),
    );

    this.rowButtons = [];
    this.list.replaceChildren(
      ...view.groups.map((group) =>
        h(
          'div',
          { class: 'parts-group', role: 'group', 'aria-label': group.label },
          h('h3', { text: group.label }),
          ...group.rows.map((row) => this.renderRow(row)),
        ),
      ),
    );
    this.renderDetail();
  }

  private renderRow(row: InspectionRow): HTMLButtonElement {
    const button = h(
      'button',
      {
        type: 'button',
        class: 'part-row',
        role: 'option',
        'data-slot': row.slotId,
        'aria-selected': String(row.slotId === this.selected),
      },
      h('span', { class: 'part-name', text: row.name }),
      stateBadge(row.known),
    );
    button.addEventListener('click', () => this.select(row.slotId));
    button.addEventListener('focus', () => this.select(row.slotId));
    this.rowButtons.push(button);
    return button;
  }

  private select(slotId: string): void {
    if (this.selected === slotId) return;
    this.selected = slotId;
    for (const b of this.rowButtons) b.setAttribute('aria-selected', String(b.dataset.slot === slotId));
    this.renderDetail();
  }

  private renderDetail(): void {
    const row = this.view?.groups.flatMap((g) => g.rows).find((r) => r.slotId === this.selected);
    if (!row) {
      this.detail.replaceChildren();
      return;
    }
    const k = row.known;
    const knownBlock =
      k.kind === 'avaliado'
        ? [
            h('dt', { text: 'Estado conhecido' }),
            h('dd', {}, stateBadge(k), h('span', { class: 'muted', text: ` ${k.sourceLabel}, ${formatKmAgo(k.kmSince)}` })),
            h('dt', { text: 'Peça instalada' }),
            h('dd', { text: `${k.partName} — ${k.partBrand} (${k.quality})` }),
          ]
        : k.kind === 'removida'
          ? [h('dt', { text: 'Estado conhecido' }), h('dd', { text: 'Sem peça: foi removida nesta oficina.' })]
          : [
              h('dt', { text: 'Estado conhecido' }),
              h('dd', { text: 'Não avaliado. É preciso examinar a peça para saber o estado.' }),
              h('dt', { text: 'Peça instalada' }),
              h('dd', { text: 'Não identificada' }),
            ];

    this.detail.replaceChildren(
      h('h2', { text: row.name }),
      h('dl', { class: 'detail-list' }, ...knownBlock, h('dt', { text: 'Acesso' }), h('dd', { text: row.accessLabel })),
      h('h3', { text: 'Peças compatíveis no catálogo' }),
      row.compatible.length
        ? h(
            'ul',
            { class: 'catalog-list' },
            ...row.compatible.map((c) =>
              h(
                'li',
                {},
                h('strong', { text: c.name }),
                h('span', { class: 'muted', text: `${c.brand} · ${c.quality}` }),
                h('span', { text: `${formatBRL(c.baseCost)} · troca em ${formatMinutes(c.replaceMinutes)}` }),
              ),
            ),
          )
        : h('p', { class: 'muted', text: 'Nenhuma peça compatível no catálogo.' }),
    );
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.isOpen) return;
    // Teclas tratadas aqui não seguem para o jogo: senão o mesmo E que fecha
    // o painel seria lido como "interagir" e o reabriria no quadro seguinte.
    if (isActionKey('interact', event.code)) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) this.onClose('resume');
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.onClose('pause');
      return;
    }
    const digit = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(event.code);
    if (digit >= 0 && !(event.target instanceof HTMLSelectElement)) {
      event.preventDefault();
      event.stopPropagation();
      this.setTab(TAB_ORDER[digit]!);
      this.restoreFocus();
      return;
    }
    if (this.tab === 'pecas' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      event.stopPropagation();
      const index = this.rowButtons.findIndex((b) => b.dataset.slot === this.selected);
      const next = this.rowButtons[Math.min(this.rowButtons.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))];
      next?.focus();
    }
  };
}

function stateBadge(k: KnownState): HTMLElement {
  if (k.kind === 'avaliado') return h('span', { class: 'badge', 'data-band': k.band, text: k.bandLabel });
  if (k.kind === 'removida') return h('span', { class: 'badge', 'data-band': 'removida', text: 'Removida' });
  return h('span', { class: 'badge', 'data-band': 'desconhecido', text: '? Não avaliada' });
}
