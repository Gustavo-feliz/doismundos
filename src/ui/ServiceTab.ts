import type { ServiceView } from '../orders/views';
import { h } from './dom';
import { formatMinutes } from './format';

export interface ServiceCallbacks {
  onRemove(slot: string): void;
  onInstall(slot: string): void;
  onFinalTest(): void;
  onComplete(): void;
  onNextCase(): void;
}

/**
 * Aba "Serviço" (Prompt 6): passos do reparo com dependências claras.
 * Cada item: acesso (capô/elevador) → remover a antiga → instalar a nova (a peça
 * em mãos, pega no estoque). Depois, teste final e conclusão.
 */
export class ServiceTab {
  readonly element: HTMLElement;

  constructor(private readonly callbacks: ServiceCallbacks) {
    this.element = h('section', { class: 'service', 'data-testid': 'service-tab' });
  }

  render(view: ServiceView | null): void {
    if (!view) {
      this.element.replaceChildren(h('p', { class: 'muted', text: 'Nenhuma ordem de serviço ativa.' }));
      return;
    }
    const header = h(
      'header',
      { class: 'os-header' },
      h('span', { class: 'hud-label', text: view.statusLabel }),
      h('p', { class: 'os-customer' }, 'Em mãos: ', h('strong', { 'data-testid': 'held', text: view.heldName ?? 'nada' }), h('span', { class: 'muted', text: ' · as peças ficam nas estantes (estoque)' })),
    );
    if (view.inactiveText && !view.completion) {
      // OS recusada: o botão de próxima OS fica só na aba Orçamento.
      this.element.replaceChildren(header, h('p', { class: 'muted', text: view.inactiveText }));
      return;
    }
    this.element.replaceChildren(
      header,
      h('div', { class: 'quote-body' }, h('div', { class: 'diagnosis-col' }, this.items(view), this.finalTest(view)), h('div', { class: 'diagnosis-col' }, this.summary(view), this.log(view))),
    );
  }

  private items(view: ServiceView): HTMLElement {
    const block = h('section', { class: 'diag-block', 'aria-label': 'Itens do reparo' }, h('h3', { text: 'Itens do reparo' }));
    for (const item of view.items) {
      const steps = h('ol', { class: 'repair-steps' });
      // 1. Acesso (estado do equipamento, ao vivo)
      steps.append(h('li', { 'data-done': String(item.accessOk || item.installedName !== null) }, h('span', { text: '1. Acesso' }), h('span', { class: 'muted', text: item.accessText })));
      // 2. Remover
      const removeRow = h('li', { 'data-done': String(item.removed) }, h('span', { text: '2. Remover a peça antiga' }));
      if (item.removed) removeRow.append(h('span', { class: 'test-status', 'data-status': 'feito', text: '✓ Feito' }));
      else if (view.active) {
        const b = h('button', { type: 'button', class: 'btn btn-small', 'data-action': 'remove', 'data-slot': item.slot }, `Remover · ${formatMinutes(item.removeMinutes)}`);
        b.addEventListener('click', () => this.callbacks.onRemove(item.slot));
        removeRow.append(b);
      }
      steps.append(removeRow);
      // 3. Instalar
      const installRow = h('li', { 'data-done': String(Boolean(item.installedName)) }, h('span', { text: '3. Instalar a peça nova' }));
      if (item.installedName) installRow.append(h('span', { class: 'test-status', 'data-status': 'feito', text: `✓ ${item.installedName}` }));
      else if (view.active && item.removed) {
        const b = h('button', { type: 'button', class: 'btn btn-small', 'data-action': 'install', 'data-slot': item.slot }, view.heldName ? `Instalar a peça em mãos · ${formatMinutes(item.installMinutes)}` : 'Pegue a peça no estoque');
        b.disabled = !view.heldName;
        b.addEventListener('click', () => this.callbacks.onInstall(item.slot));
        installRow.append(b);
      } else {
        installRow.append(h('span', { class: 'muted small', text: 'depois de remover a antiga' }));
      }
      steps.append(installRow);
      block.append(h('div', { class: 'repair-item', 'data-slot': item.slot }, h('strong', { text: item.name }), h('span', { class: 'muted small', text: `Peça orçada: ${item.plannedPart}` }), steps));
    }
    return block;
  }

  private finalTest(view: ServiceView): HTMLElement {
    const t = view.finalTest;
    const block = h('section', { class: 'diag-block', 'aria-label': 'Teste final' }, h('h3', { text: 'Teste final' }));
    if (t.done) {
      block.append(h('p', { class: t.resolved ? 'test-ok' : 'os-closed', 'data-testid': 'final-test', text: t.text ?? '' }));
    } else {
      block.append(h('p', { class: 'muted small', text: `Requer: carro no chão e capô fechado. Agora: ${t.requirementOk ? 'pronto' : t.requirementText.toLowerCase()}.` }));
      if (view.active) {
        const b = h('button', { type: 'button', class: 'btn btn-small', 'data-testid': 'final-test-btn' }, 'Fazer o teste final · 10 min');
        b.disabled = !t.ready;
        b.addEventListener('click', () => this.callbacks.onFinalTest());
        block.append(b);
        if (!t.ready) block.append(h('span', { class: 'muted small', text: 'Termine todos os itens primeiro.' }));
      }
    }
    return block;
  }

  private summary(view: ServiceView): HTMLElement {
    const block = h('section', { class: 'diag-block', 'aria-label': 'Conclusão' }, h('h3', { text: 'Conclusão' }));
    if (view.completion) {
      const c = view.completion;
      block.append(
        h(
          'div',
          { class: 'os-result', 'data-testid': 'completion' },
          h('strong', { text: `Qualidade: ${c.qualityText} (${c.score}/100)` }),
          h('span', { class: 'muted', text: c.minutesText }),
          h('span', { class: 'muted', text: c.resolved ? 'Carro pronto. Entrega e pagamento: próxima etapa do jogo.' : 'O defeito continua: o cliente vai voltar (retrabalho).' }),
          this.nextCase(view),
        ),
      );
      return block;
    }
    if (view.pending.length) {
      block.append(h('ul', { class: 'pending-list', 'data-testid': 'pending' }, ...view.pending.map((p) => h('li', { text: p }))));
    }
    const done = h('button', { type: 'button', class: 'btn btn-primary btn-small', 'data-testid': 'complete' }, 'Concluir serviço');
    done.disabled = !view.canComplete;
    done.addEventListener('click', () => this.callbacks.onComplete());
    block.append(done);
    return block;
  }

  private log(view: ServiceView): HTMLElement {
    return h(
      'section',
      { class: 'diag-block', 'aria-label': 'Registro do serviço' },
      h('h3', { text: 'Registro do serviço' }),
      view.log.length
        ? h('ol', { class: 'evidence-list', 'data-testid': 'repair-log' }, ...view.log.map((l) => h('li', { 'data-kind': l.kind }, h('span', { text: l.text }), h('span', { class: 'muted', text: l.when }))))
        : h('p', { class: 'muted', text: 'Nenhuma ação ainda.' }),
    );
  }

  private nextCase(view: ServiceView): HTMLElement {
    if (!view.hasNextCase) return h('span', { class: 'os-done', text: view.completion ? 'Era a última ordem de serviço de demonstração.' : '' });
    const next = h('button', { type: 'button', class: 'btn btn-primary btn-small', 'data-testid': 'next-case' }, 'Próxima ordem de serviço →');
    next.addEventListener('click', () => this.callbacks.onNextCase());
    return next;
  }
}
