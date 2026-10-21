import { h, setText } from './dom';

/** Dicas do Seu Zé mostradas enquanto algo carrega (sem relação com o progresso). */
const TIPS: readonly string[] = [
  'Sintoma não é diagnóstico: escuta o cliente, faz o exame e só depois aponta a peça.',
  'Peça boa e prazo cumprido rendem mais que margem alta. Cliente satisfeito volta.',
  'Fornecedor mais barato demora mais. Se o cliente tem pressa, paga o rápido.',
  'Antes de entregar, faz o teste final. Retrabalho custa reputação.',
  'Parcela do banco em dia: atrasou, vem multa.',
];

/**
 * Tela de carregamento (Prompt 24). Honesta: o carregamento sob demanda não
 * informa progresso, então mostra o que está carregando e um indicador
 * contínuo, nunca uma barra falsa. Só aparece se demorar mais de 150 ms.
 */
export class LoadingOverlay {
  readonly element: HTMLElement;
  private readonly text: HTMLElement;
  private readonly tip: HTMLElement;
  private timer = 0;
  private tipIndex = 0;

  constructor(parent: HTMLElement) {
    this.text = h('p', { class: 'loading-overlay-text' });
    this.tip = h('p', { class: 'loading-overlay-tip' });
    this.element = h(
      'div',
      { class: 'loading-overlay', role: 'status', 'aria-live': 'polite', 'data-testid': 'loading-overlay', hidden: true },
      h('div', { class: 'loading-overlay-card' }, h('div', { class: 'loading-spinner', 'aria-hidden': 'true' }), this.text, this.tip),
    );
    parent.append(this.element);
  }

  show(text: string): void {
    setText(this.text, text);
    setText(this.tip, `Seu Zé: “${TIPS[this.tipIndex++ % TIPS.length]}”`);
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => (this.element.hidden = false), 150);
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.element.hidden = true;
  }

  dispose(): void {
    window.clearTimeout(this.timer);
    this.element.remove();
  }
}
