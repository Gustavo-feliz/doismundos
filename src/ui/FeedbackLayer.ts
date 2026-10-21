import type { FeedbackActionKind } from '../core/events';
import { formatBRL, type Cents } from '../economy/money';
import { h } from './dom';
import { icon } from './icons';
import { ACTION_LABELS, coinBurst, thanksLine } from './feedbackText';

/** Quanto tempo (ms) cada efeito fica na tela. */
const DURATION = { action: 1500, actionFill: 650, reward: 3200, stamp: 2600 } as const;

export interface RewardView {
  /** Quanto entrou no caixa (centavos). */
  cash: Cents;
  /** Nota do cliente (1–5) ou null se não houve avaliação. */
  stars: number | null;
  /** Variação da reputação geral (pode ser negativa). */
  reputationDelta: number;
  customerName: string | null;
  /** Semente das variações (ex.: número da OS). */
  seed: number;
}

/**
 * Retorno visual das ações (Prompt 25): começo, meio e fim de cada ação,
 * recompensas (moedas, estrelas, cliente agradecendo, reputação) e o
 * carimbo de missão concluída. Só aparência: as regras já rodaram antes.
 *
 * Tudo fica numa camada que não recebe clique (pointer-events: none).
 * Com "reduzir movimento", o CSS tira o movimento e deixa só o aparecer/sumir.
 */
export class FeedbackLayer {
  readonly element: HTMLElement;
  private readonly timers = new Set<number>();
  private actionEl: HTMLElement | null = null;
  private rewardEl: HTMLElement | null = null;
  private stampEl: HTMLElement | null = null;

  constructor(parent: HTMLElement) {
    this.element = h('div', { class: 'fx-layer', 'aria-hidden': 'true' });
    parent.append(this.element);
  }

  /** Ação com começo (ícone e "fazendo…"), meio (barra enchendo) e fim (feito, +min). */
  action(kind: FeedbackActionKind, minutes: number): void {
    this.actionEl?.remove();
    const labels = ACTION_LABELS[kind];
    const text = h('span', { class: 'fx-action-text', text: labels.running });
    const fill = h('span', { class: 'fx-action-fill' });
    const time = h('span', { class: 'fx-action-time', text: minutes > 0 ? `+${minutes} min` : '' });
    const el = h(
      'div',
      { class: 'fx-action', 'data-kind': kind, 'data-phase': kind === 'erro' ? 'erro' : 'andamento', 'data-testid': 'fx-action' },
      h('span', { class: 'fx-action-icon' }, icon(labels.icon)),
      h('span', { class: 'fx-action-body' }, text, h('span', { class: 'fx-action-bar' }, fill)),
      time,
    );
    fill.style.animationDuration = `${DURATION.actionFill}ms`;
    this.element.append(el);
    this.actionEl = el;
    if (kind !== 'erro') {
      this.later(DURATION.actionFill, () => {
        el.dataset.phase = 'feito';
        text.textContent = labels.done;
        el.querySelector('.fx-action-icon')?.replaceChildren(icon('ok'));
      });
    }
    this.later(DURATION.action, () => this.drop(el, 'actionEl'));
  }

  /** Entrega do carro: valor com moedas subindo, estrelas uma a uma, o cliente agradecendo e a reputação. */
  reward(v: RewardView): void {
    this.rewardEl?.remove();
    const coins = coinBurst(v.seed, 7).map((c) => {
      const coin = h('span', { class: 'fx-coin' });
      coin.style.setProperty('--dx', `${c.dx}px`);
      coin.style.setProperty('--spin', `${c.spin}deg`);
      coin.style.animationDelay = `${c.delay}ms`;
      return coin;
    });
    const stars =
      v.stars === null
        ? null
        : h(
            'div',
            { class: 'fx-stars', 'data-stars': String(v.stars) },
            ...Array.from({ length: 5 }, (_, i) => {
              const s = h('span', { class: `fx-star${i < v.stars! ? ' is-on' : ''}` }, icon('estrela'));
              s.style.animationDelay = `${250 + i * 120}ms`;
              return s;
            }),
          );
    const rep =
      v.reputationDelta !== 0
        ? h(
            'div',
            { class: 'fx-rep', 'data-sign': v.reputationDelta > 0 ? 'up' : 'down' },
            icon('estrela'),
            `${v.reputationDelta > 0 ? '+' : '−'}${Math.abs(v.reputationDelta)} de reputação`,
          )
        : null;
    const thanks = v.stars !== null && v.customerName ? h('p', { class: 'fx-thanks' }, h('strong', { text: `${v.customerName}: ` }), `“${thanksLine(v.stars, v.seed)}”`) : null;
    const el = h(
      'div',
      { class: 'fx-reward', 'data-testid': 'fx-reward' },
      h('div', { class: 'fx-coins' }, ...coins),
      h('div', { class: 'fx-cash', text: `+${formatBRL(v.cash)}` }),
      stars,
      thanks,
      rep,
    );
    this.element.append(el);
    this.rewardEl = el;
    this.later(DURATION.reward, () => this.drop(el, 'rewardEl'));
  }

  /** Carimbo de missão concluída. */
  stamp(title: string, cash: Cents): void {
    this.stampEl?.remove();
    const el = h(
      'div',
      { class: 'fx-stamp', 'data-testid': 'fx-stamp' },
      h('div', { class: 'fx-stamp-mark', text: 'Missão concluída' }),
      h('div', { class: 'fx-stamp-title', text: title }),
      cash > 0 ? h('div', { class: 'fx-stamp-cash', text: `+${formatBRL(cash)}` }) : null,
    );
    this.element.append(el);
    this.stampEl = el;
    this.later(DURATION.stamp, () => this.drop(el, 'stampEl'));
  }

  /** O que está na tela agora (diagnóstico dos testes). */
  get snapshot(): { action: string | null; phase: string | null; reward: boolean; stamp: boolean } {
    return {
      action: this.actionEl?.dataset.kind ?? null,
      phase: this.actionEl?.dataset.phase ?? null,
      reward: this.rewardEl !== null,
      stamp: this.stampEl !== null,
    };
  }

  /** Some com tudo (ao sair para o menu ou começar outro jogo). */
  clear(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers.clear();
    this.element.replaceChildren();
    this.actionEl = this.rewardEl = this.stampEl = null;
  }

  dispose(): void {
    this.clear();
    this.element.remove();
  }

  private drop(el: HTMLElement, slot: 'actionEl' | 'rewardEl' | 'stampEl'): void {
    el.remove();
    if (this[slot] === el) this[slot] = null;
  }

  private later(ms: number, fn: () => void): void {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
  }
}
