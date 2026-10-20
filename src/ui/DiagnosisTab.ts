import type { DiagnosisView } from '../diagnostics/view';
import { h } from './dom';
import { formatMinutes } from './format';

export interface DiagnosisCallbacks {
  onRunTest(testId: string): void;
  onHint(): void;
  onConclude(slot: string): void;
  /** Depois do diagnóstico, ir para a aba de orçamento. */
  onGoToQuote(): void;
}

/**
 * Aba "Diagnóstico" do painel do veículo. Só desenha a DiagnosisView, que não
 * tem a causa real: a interface não consegue vazar o defeito.
 */
export class DiagnosisTab {
  readonly element: HTMLElement;
  private chosen: string | null = null;
  private caseId: string | null = null;

  constructor(private readonly callbacks: DiagnosisCallbacks) {
    this.element = h('section', { class: 'diagnosis', 'data-testid': 'diagnosis-tab' });
  }

  render(view: DiagnosisView | null): void {
    if (!view) {
      this.element.replaceChildren(h('p', { class: 'muted', text: 'Nenhuma ordem de serviço para este carro.' }));
      return;
    }
    if (view.caseId !== this.caseId) {
      this.caseId = view.caseId;
      this.chosen = null;
    }
    if (this.chosen && !view.hypotheses.some((x) => x.slot === this.chosen)) this.chosen = null;

    this.element.replaceChildren(
      h(
        'header',
        { class: 'os-header' },
        h('span', { class: 'hud-label', text: `${view.orderLabel} · ${view.caseNumber} de ${view.totalCases}` }),
        h('p', { class: 'os-customer' }, 'Cliente: ', h('strong', { text: view.customer })),
        h('blockquote', { class: 'os-complaint', 'data-testid': 'complaint', text: `“${view.complaint}”` }),
      ),
      h(
        'div',
        { class: 'diagnosis-body' },
        h('div', { class: 'diagnosis-col' }, this.renderTests(view)),
        h('div', { class: 'diagnosis-col' }, this.renderHypotheses(view), this.renderHints(view), this.renderEvidence(view)),
      ),
    );
  }

  private renderTests(view: DiagnosisView): HTMLElement {
    return h(
      'section',
      { class: 'diag-block', 'aria-label': 'Exames' },
      h('h3', { text: 'Exames' }),
      h(
        'ul',
        { class: 'test-list', 'data-testid': 'test-list' },
        ...view.tests.map((t) => {
          let action: HTMLElement;
          if (t.status === 'disponivel') {
            const btn = h('button', { type: 'button', class: 'btn btn-small', 'data-test': t.id }, `Fazer · ${formatMinutes(t.minutes)}`);
            btn.addEventListener('click', () => this.callbacks.onRunTest(t.id));
            action = btn;
          } else if (t.status === 'feito') {
            action = h('span', { class: 'test-status', 'data-status': 'feito', text: '✓ Feito' });
          } else if (t.status === 'bloqueado') {
            action = h('span', { class: 'test-status', 'data-status': 'bloqueado', text: t.reason ?? 'Indisponível' });
          } else {
            action = h('span', { class: 'test-status', 'data-status': 'encerrado', text: '—' });
          }
          return h(
            'li',
            { class: 'test-item', 'data-test-id': t.id, 'data-status': t.status },
            h('div', { class: 'test-info' }, h('strong', { text: t.name }), h('span', { class: 'muted', text: `${t.kindLabel} · ${formatMinutes(t.minutes)} · ${t.description}` })),
            action,
          );
        }),
      ),
    );
  }

  private renderHypotheses(view: DiagnosisView): HTMLElement {
    const closed = view.concluded !== null;
    const confirm = h('button', { type: 'button', class: 'btn btn-primary btn-small', 'data-testid': 'conclude' }, 'Registrar diagnóstico');
    confirm.disabled = !view.canConclude || !this.chosen;
    confirm.addEventListener('click', () => {
      if (this.chosen) this.callbacks.onConclude(this.chosen);
    });

    const rows = view.hypotheses.map((hyp) => {
      const radio = h('input', { type: 'radio', name: 'hipotese', value: hyp.slot, id: `hip-${hyp.slot}`, 'aria-label': `Causa: ${hyp.name}` });
      radio.checked = this.chosen === hyp.slot;
      radio.disabled = closed;
      radio.addEventListener('change', () => {
        this.chosen = hyp.slot;
        confirm.disabled = !view.canConclude;
      });
      return h(
        'li',
        { class: 'hyp-row', 'data-slot': hyp.slot },
        h('label', { for: `hip-${hyp.slot}`, class: 'hyp-label' }, radio, h('span', { text: hyp.name })),
        h(
          'div',
          { class: 'hyp-meter', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': hyp.confidencePct, 'aria-label': `${hyp.name}: ${hyp.labelText}` },
          h('span', { class: 'hyp-fill', 'data-label': hyp.label, style: `width:${hyp.confidencePct}%` }),
        ),
        h('span', { class: 'hyp-value', 'data-label': hyp.label, text: `${hyp.confidencePct}% · ${hyp.labelText}` }),
      );
    });

    let footer: HTMLElement;
    if (view.concluded) {
      const c = view.concluded;
      footer = h(
        'div',
        { class: 'os-result', 'data-testid': 'os-result' },
        h('strong', { text: `Diagnóstico registrado: ${c.chosenName}` }),
        h('span', { class: 'muted', text: `Confiança ${c.confidencePct}% · ${c.evidenceCount} exame(s) · ${formatMinutes(c.minutesSpent)} de serviço` }),
        h('span', { class: 'muted', text: 'Se a causa estava certa, o teste final do reparo vai confirmar.' }),
      );
      const toQuote = h('button', { type: 'button', class: 'btn btn-primary btn-small', 'data-testid': 'go-quote' }, 'Montar orçamento →');
      toQuote.addEventListener('click', () => this.callbacks.onGoToQuote());
      footer.append(toQuote);
    } else {
      footer = h('div', { class: 'conclude-row' }, confirm, h('span', { class: 'muted', text: view.concludeHelp }));
    }

    return h(
      'section',
      { class: 'diag-block', 'aria-label': 'Hipóteses' },
      h('h3', { text: 'Hipóteses' }),
      h('ul', { class: 'hyp-list', 'data-testid': 'hypotheses' }, ...rows),
      footer,
    );
  }

  private renderHints(view: DiagnosisView): HTMLElement | null {
    if (view.hints.length === 0 && !view.hintAvailable) return null;
    const block = h('section', { class: 'diag-block hints', 'aria-label': 'Dicas' });
    for (const hint of view.hints) block.append(h('p', { class: 'hint', text: hint }));
    if (view.hintAvailable) {
      const btn = h('button', { type: 'button', class: 'btn btn-ghost btn-small', 'data-testid': 'hint' }, 'Pedir dica ao Seu Zé');
      btn.addEventListener('click', () => this.callbacks.onHint());
      block.append(btn);
    }
    return block;
  }

  private renderEvidence(view: DiagnosisView): HTMLElement {
    return h(
      'section',
      { class: 'diag-block', 'aria-label': 'Evidências' },
      h('h3', { text: `Evidências (${view.evidence.length})` }),
      view.evidence.length
        ? h(
            'ol',
            { class: 'evidence-list', 'data-testid': 'evidence' },
            ...view.evidence.map((e) => h('li', {}, h('strong', { text: e.testName }), h('span', { text: e.text }), h('span', { class: 'muted', text: `${e.when} · ${formatMinutes(e.minutes)}` }))),
          )
        : h('p', { class: 'muted', text: 'Nenhum exame feito ainda. O sintoma sozinho não é diagnóstico.' }),
    );
  }
}
