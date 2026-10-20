import type { InteractionPrompt } from '../interaction/types';
import { h, setText } from './dom';

export interface HudData {
  money: string;
  day: number;
  time: string;
  objective: string;
  tool: string;
}

const STATUS_LABEL = { busy: 'Em uso', unavailable: 'Indisponível' } as const;
const NOTIFY_MS = 2600;

/**
 * HUD do GDD §20.3: dinheiro, hora, objetivo e ferramenta ativa; ao mirar,
 * nome, estado conhecido e ação disponível. Mais mira e avisos.
 */
export class Hud {
  readonly element: HTMLElement;
  private readonly money: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly tool: HTMLElement;
  private readonly crosshair: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly promptName: HTMLElement;
  private readonly promptDetail: HTMLElement;
  private readonly promptAction: HTMLElement;
  private readonly notice: HTMLElement;
  private promptKey = '';
  private noticeTimer = 0;
  private savedTimer = 0;
  private readonly saved: HTMLElement;

  constructor(parent: HTMLElement) {
    this.money = h('strong', { class: 'hud-value', 'data-testid': 'hud-money' });
    this.clock = h('strong', { class: 'hud-value', 'data-testid': 'hud-clock' });
    this.objective = h('span', { class: 'hud-objective-text', 'data-testid': 'hud-objective' });
    this.tool = h('strong', { class: 'hud-value', 'data-testid': 'hud-held' });
    this.crosshair = h('div', { class: 'crosshair', 'aria-hidden': 'true' });

    this.promptName = h('div', { class: 'prompt-name' });
    this.promptDetail = h('div', { class: 'prompt-detail' });
    this.promptAction = h('div', { class: 'prompt-action' });
    this.prompt = h('div', { class: 'interact-prompt', 'data-testid': 'interact-prompt', hidden: true }, this.promptName, this.promptDetail, this.promptAction);

    this.notice = h('div', { class: 'hud-notice', role: 'status', 'aria-live': 'polite', 'data-testid': 'hud-notice', hidden: true });
    this.saved = h('div', { class: 'hud-saved', 'data-testid': 'hud-saved', hidden: true });

    this.element = h(
      'div',
      { id: 'hud', class: 'hud', hidden: true },
      h(
        'div',
        { class: 'hud-panel hud-top-left' },
        h('div', { class: 'hud-metric' }, h('span', { class: 'hud-label', text: 'Caixa' }), this.money),
        h('div', { class: 'hud-metric' }, h('span', { class: 'hud-label', text: 'Hora' }), this.clock),
      ),
      h('div', { class: 'hud-panel hud-objective', role: 'status', 'aria-live': 'polite' }, h('span', { class: 'hud-label', text: 'Objetivo' }), this.objective),
      h('div', { class: 'hud-panel hud-bottom-right' }, h('span', { class: 'hud-label', text: 'Em mãos' }), this.tool),
      this.crosshair,
      this.prompt,
      this.notice,
      this.saved,
      h('div', { class: 'prototype-badge', text: 'Protótipo · modelos e texturas temporários' }),
    );
    parent.append(this.element);
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
  }

  update(data: HudData): void {
    setText(this.money, data.money);
    setText(this.clock, `Dia ${data.day} · ${data.time}`);
    setText(this.objective, data.objective);
    setText(this.tool, data.tool);
  }

  /** Mostra o que está na mira (ou esconde, com null). Só mexe no DOM se mudou. */
  setPrompt(prompt: InteractionPrompt | null): void {
    const key = prompt ? `${prompt.name}|${prompt.status}|${prompt.action}|${prompt.reason}|${prompt.detail}` : '';
    if (key === this.promptKey) return;
    this.promptKey = key;

    if (!prompt) {
      this.prompt.hidden = true;
      delete this.crosshair.dataset.status;
      return;
    }
    this.prompt.hidden = false;
    this.prompt.dataset.status = prompt.status;
    this.crosshair.dataset.status = prompt.status;
    this.promptName.textContent = prompt.name;
    this.promptDetail.textContent = prompt.detail ?? '';
    this.promptDetail.hidden = !prompt.detail;
    this.promptAction.replaceChildren(
      ...(prompt.status === 'available'
        ? [h('kbd', { text: 'E' }), ` ${prompt.action ?? ''}`]
        : [h('span', { class: 'prompt-status', text: STATUS_LABEL[prompt.status] }), ` · ${prompt.reason ?? ''}`]),
    );
  }

  /** Aviso curto de retorno de uma ação. */
  notify(text: string, kind: 'ok' | 'blocked'): void {
    if (!text) return;
    this.notice.textContent = text;
    this.notice.dataset.kind = kind;
    this.notice.hidden = false;
    // Reinicia a animação mesmo se a mesma mensagem se repetir.
    this.notice.classList.remove('is-fresh');
    void this.notice.offsetWidth;
    this.notice.classList.add('is-fresh');
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => {
      this.notice.hidden = true;
    }, NOTIFY_MS);
  }

  /** Indicador discreto de save (canto da tela). */
  flashSaved(text: string): void {
    this.saved.textContent = text;
    this.saved.hidden = false;
    window.clearTimeout(this.savedTimer);
    this.savedTimer = window.setTimeout(() => (this.saved.hidden = true), 1800);
  }

  dispose(): void {
    window.clearTimeout(this.savedTimer);
    window.clearTimeout(this.noticeTimer);
    this.element.remove();
  }
}
